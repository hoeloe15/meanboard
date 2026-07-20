# meanboard — spec v1

A mean, lean, agent-native kanban board. One tiny local web app per repo. Markdown
files are the only source of truth. Zero runtime dependencies. No build step.

Explicitly OUT of scope (do not add): milestones, priorities, assignees, labels,
due dates, subtasks, dependencies, auth, multi-user, database, config files.

## Repo layout (this repo, ~/Documents/meanboard)

- `package.json` — name `meanboard`, version `0.1.0`, `"type": "module"`,
  `"bin": { "meanboard": "./cli.js" }`, `engines.node >= 18`, **no dependencies**.
  `"scripts": { "test": "node --test" }`.
- `cli.js` — executable entry (`#!/usr/bin/env node`): arg parsing + commands.
- `lib/store.js` — task file parse/serialize/list/create/update/archive + watcher.
- `lib/server.js` — HTTP server + SSE.
- `public/index.html`, `public/app.js`, `public/style.css` — the board UI,
  fully self-contained (no CDN, no external fonts, no images; icons via unicode).
- `lib/board-readme.js` (or a template string) — content written by `init`.
- `test/store.test.js` — node:test coverage for parse/serialize/status
  transitions/slug collision. Keep tests dependency-free.
- `README.md` — short: what it is, install (`npm link` / `npx github:`), usage,
  task format, agent protocol pointer.

Keep every file under ~300 lines. Total should land well under ~1000 lines.

## CLI

- `meanboard init` — creates `.board/` and `.board/README.md` (agent protocol,
  content below) in CWD. Idempotent: never overwrites an existing README.
- `meanboard` — serves the board for CWD's `.board/`. If `.board/` is missing,
  print one helpful line telling the user to run `meanboard init`, exit 1.
- Flags: `--port <n>` (default 4949), `--dir <path>` (board dir override,
  default `./.board`), `--no-open` (skip auto-opening browser).
- Auto-open: try, in order, `$BROWSER`, `xdg-open`, `open`, `cmd.exe /c start`
  (WSL). Failures are silent — always print the URL either way.
- On start print: repo name (basename of CWD), URL, task counts per status.

## Task file format

One file per task, directly in `.board/*.md` (exclude `README.md` and any
subdirectory from listing). Archived tasks move to `.board/archive/`.

```markdown
---
status: open
created: 2026-07-20 14:02
---
# Fix lobby race

Free-form markdown body. Acceptance criteria as checkboxes if the task has been
enriched.
```

- `status`: one of `draft | open | in-progress | review | done`. Unknown status
  values render in a catch-all "?" area on the board rather than crashing.
- `created`: `yyyy-mm-dd hh:mm` local time, set on creation, never changed.
- Title = first `# ` heading; fallback to filename if missing.
- id = filename without `.md`. New tasks: slugified title (lowercase, `-`,
  ascii only, max ~50 chars); on collision append `-2`, `-3`, …
- Parser must round-trip: body (everything after the H1 line) is preserved
  byte-for-byte on status-only updates. Agents will hand-edit these files —
  tolerate missing frontmatter (treat as `status: draft`), CRLF, extra
  frontmatter keys (preserve them verbatim, never strip).

## HTTP API (JSON)

- `GET /` and static assets from `public/`.
- `GET /api/tasks` → `{ repo: "<basename>", tasks: [{ id, title, status, created, body }] }`
- `POST /api/tasks` `{ title, body?, status? }` → creates file, default status
  `draft`. 400 on empty title.
- `PATCH /api/tasks/:id` `{ status?, title?, body? }` → updates file. 404 if
  missing, 400 on invalid status.
- `POST /api/tasks/:id/archive` → moves file to `.board/archive/`.
- `GET /api/events` → SSE. Events:
  - `change` — any watched mutation; client refetches the task list.
  - `review` — a task transitioned INTO `review` (from any other status, or a
    new file appearing already in review). Data: `{ id, title }`.
  The server detects transitions by diffing an in-memory `{id: status}` cache
  on each watch tick — this must catch agents editing files directly on disk,
  not just API calls. Use `fs.watch` on the board dir, debounced ~150ms.
  Send an SSE comment ping every 25s to keep the connection alive.
- Bind to 127.0.0.1 only. Sanitize `:id` (reject `/`, `\`, `..`) — no path
  traversal. No caching headers games: just `no-store` on the API.

## UI (single page)

Five columns: **Draft · Open · In Progress · Review · Done**, in that order.
Header: repo name, small live-connection dot (SSE state), notification-permission
button (only shown until granted).

- Cards: title + relative age ("3h", "2d"). Click → overlay with the body
  rendered by a tiny built-in markdown-lite renderer (headings, bold, italic,
  inline code, code fences, lists, `- [ ]` checkboxes rendered as ☐/☑ —
  ~50 lines, no library) + an Edit toggle exposing raw markdown in a textarea
  (save = PATCH title stays derived from H1), status dropdown, Archive button
  (only for `done`).
- Drag-and-drop cards between columns (HTML5 DnD) → PATCH status. The overlay
  status dropdown is the fallback.
- "+ Add" affordance at the top of the Draft column: title input, optional body
  textarea, Enter/button creates via POST.
- Columns sort FIFO by `created`; Done sorts newest-first and shows an
  "archive all" affordance.
- Live: on SSE `change`, refetch and re-render (preserve open overlay if its
  task still exists).
- **Review alert** (the point of the whole tool). On SSE `review`:
  1. chime via WebAudio (two-tone, generated oscillator, no audio asset),
  2. tab title flashes alternating `● review` / normal title until the tab is
     focused,
  3. `Notification` API toast ("<repo>: <task title> ready for review") when
     permission granted — this is what reaches the Windows taskbar,
  4. Review column header pulses briefly.
- Design: dark, quiet, information-dense but calm. System font stack, one
  accent color for Review alerts. Subtle column tints. No frameworks, no
  animation beyond the pulse/flash. Must look intentional, not bootstrap-y.
  Light theme not required for v1.

## `.board/README.md` written by `init` (agent protocol)

Short file, roughly:

```markdown
# Board protocol

Tasks are markdown files in this directory. Frontmatter `status:` is the only
state: draft → open → in-progress → review → done.

- **draft** — raw idea. Before promoting: enrich it. Read the codebase, then
  interview the author — ask the hard questions (scope, edge cases, done-when).
  Write the result into the body as context + `- [ ]` acceptance criteria.
  Then set `status: open`.
- **open** — ready for any agent. To claim it, set `status: in-progress` in the
  same edit you start work.
- **in-progress** — you own it. If you stop without finishing, move it back to
  open and note why in the body.
- **review** — work done, awaiting human review. Link the branch/PR/commit in
  the body. Moving a file here alerts the human.
- **done** — human-confirmed. Humans move review → done, not agents.

Keep bodies lean. No priorities, assignees, or milestones — if ordering
matters, say so in prose. Never edit `created:`. New task = new file:
slug-of-title.md with status/created frontmatter and a `# Title` heading.
```

## Quality bar

- `node --test` passes; test the store round-trip (weird frontmatter, CRLF,
  missing H1), slug collisions, transition detection (review event fires on
  disk edit), and id sanitization.
- No dependencies anywhere, including devDependencies.
- Node 18+ built-ins only (`node:http`, `node:fs`, `node:path`, etc.).
- Handle EADDRINUSE with a clear message suggesting `--port`.

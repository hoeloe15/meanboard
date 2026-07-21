# meanboard

A mean, lean local kanban board where markdown files are the source of truth.
It has no dependencies or build step and runs on Node.js 18 or newer.

## Install

From a clone, run `npm link`. You can also run it directly from GitHub with
`npx github:hoeloe15/meanboard`.

## Use

```sh
cd your-project
meanboard init
meanboard
```

The board opens at `http://127.0.0.1:4949`. Use `--port <n>`, `--dir <path>`,
or `--no-open` when needed. If the port is taken by this repo's own board it
reuses the running one; if something else holds it, the next free port is
picked automatically. `Ctrl`/`⌘`+`K` opens a command palette: jump to any
task or create a draft from what you typed.

## GitHub mode

For repos worked from several machines or by several people, the board can use
**GitHub Issues as the store** instead of local files:

```sh
meanboard --github            # auto-detects owner/repo from the origin remote
meanboard --github owner/repo
```

Plain `meanboard` also falls back to GitHub mode automatically when the
directory has no `.board/` but the git origin is on github.com — so in an
Issues-mode repo the bare command just works on any branch.

Auth comes from `gh auth token` (or `GITHUB_TOKEN`). Mapping: task = open
issue carrying a `status:*` label (labels are created on first run), spec =
issue body, activity log = issue comments, archive = close. The board polls
for changes, so a status flipped from any machine — `gh issue edit N
--add-label status:review` — raises the review alert everywhere. Agents
interact with plain `gh` commands; start a comment with `[your-name]` to sign
it as something other than the authenticated account.

File mode (`.board/`, the default) remains the right choice for single-machine
repos: offline, dependency-free, git-diffable.

Typeface: [Inter](https://rsms.me/inter/) (SIL OFL 1.1), bundled as
`public/inter.woff2` so the board loads nothing from the network. `meanboard init` creates `.board/README.md`; that
file is the protocol for coding agents working with the board.

Each task is a `.board/*.md` file:

```markdown
---
status: open
created: 2026-07-20 14:02
---
# Fix lobby race

Context and acceptance criteria go here.
```

Valid states are `draft`, `open`, `in-progress`, `review`, and `done`. Agents
may edit task files directly; the running board watches those edits and alerts
you whenever a task enters review. Done tasks can be moved into
`.board/archive/` from the UI.

## Agent skills

`skills/` ships two [Agent Skills](https://agentskills.io) (`harness-init`,
`board-enrich`) that teach coding agents — Claude Code, Codex CLI, or anything
else adopting the standard — to scaffold the surrounding engineering harness
and to enrich draft tasks by interviewing you. See `skills/README.md`.

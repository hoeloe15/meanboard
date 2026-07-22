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

## One-read context for agents

`meanboard show <id>` prints a task's entire story as markdown to stdout —
spec with acceptance criteria, the signed activity timeline, and every
linked PR's description, changed files, and review verdicts:

```sh
meanboard show 64            # works in both file and GitHub mode
```

This is the read path for coding agents: one command instead of stitching
`gh issue view`, comments, `gh pr view`, and reviews together. It is a view,
not a cache — GitHub stays the single source of truth, and all writes
(labels, comments, status) still go through `gh`.

## The agent baton

Assignment is one `agent` value per task — frontmatter `agent: codex` in file
mode, an `agent:codex` label on GitHub. It names who acts *next* (implementer
→ reviewer → owner), exactly one holder at a time; hand off by reassigning
and logging why. Cards show the holder, the top bar grows filter pills per
agent, and schedulers pick up their queue by filtering on their own name
(`gh issue list --label agent:claude --label status:review`). Clear it by
assigning "unassigned". No priorities, no milestones — the baton is the only
routing the board has.

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

`skills/` ships [Agent Skills](https://agentskills.io) (`harness-init`,
`grill-me`, `board-review`, `board-dispatch`) that teach agents — Claude
Code, Codex CLI, Hermes, or anything else adopting the standard — to
scaffold the engineering harness, grill draft tasks into implementable
specs, work a review queue, and dispatch the whole cycle from a scheduler.
See `skills/README.md`.

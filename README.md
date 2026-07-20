# meanboard

A mean, lean local kanban board where markdown files are the source of truth.
It has no dependencies or build step and runs on Node.js 18 or newer.

## Install

From a clone, run `npm link`. You can also run it directly from GitHub with
`npx github:OWNER/meanboard` (replace `OWNER` with the repository owner).

## Use

```sh
cd your-project
meanboard init
meanboard
```

The board opens at `http://127.0.0.1:4949`. Use `--port <n>`, `--dir <path>`,
or `--no-open` when needed. `meanboard init` creates `.board/README.md`; that
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

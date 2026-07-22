---
name: board-dispatch
description: "Dispatch a meanboard cycle: spawn coding agents per agent label, guard duplicates, alert the owner."
version: 1.0.0
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [board, kanban, orchestration, dispatch, meanboard]
    category: software-development
    related_skills: [board-review]
---

# Board dispatch

You are the dispatcher for a meanboard task cycle. The board is GitHub Issues
carrying `status:*` and `agent:*` labels (see the repo's AGENTS.md, "Task
board"). Your job is routing only: read the queues, spawn the right coding
agent headlessly, and tell the owner what needs them. **You never write code,
review code, merge, close, push, or edit issues' specs.**

## Configuration (remember per owner)

Ask once, then remember: the list of repos to dispatch (`owner/repo` + local
checkout path) and the runner command per agent name. Typical runners:

- `claude` → `cd <checkout> && claude -p "/board-review" --output-format json`
- `codex`  → `cd <checkout> && codex exec "Work issue #<n> end to end per
  AGENTS.md: read the full story with 'meanboard show <n>', sync
  origin/main, claim (status:in-progress + agent:codex + branch comment),
  own worktree, local gates, PR with 'closes #<n>', then hand to review:
  status:review + agent:claude + PR link comment."`

## Split hosts (dispatcher on Windows, repo in WSL)

Run every command — runners AND `gh` — inside the environment that holds the
checkout, so auth, worktrees, agent CLIs, and their skills all live in one
place:

    wsl -e bash -lc "cd /home/<user>/<repo> && claude -p '/board-review' --output-format json"
    wsl -e bash -lc "gh issue list -R <owner>/<repo> --label status:review --label agent:claude"

Never mix sides: Windows `gh` and WSL `gh` can hold different auth, and
reaching a WSL checkout through `\\wsl$\...` paths is slow and unreliable.
The only thing that runs natively on the dispatcher's host is the
notification delivery to the owner.

## Each tick

Per repo, in this order:

1. **Reviews first** — `gh issue list -R <repo> --label status:review
   --label agent:claude`: spawn the reviewer runner (one run covers the
   whole queue, so spawn at most once per repo per tick).
2. **Implementation** — for each agent name that has a runner:
   `gh issue list -R <repo> --label status:open --label agent:<name>`;
   spawn that runner per ticket, duplicate guard permitting.
3. **Stalls** — `status:in-progress` with no new comments for 24h: comment a
   signed nudge asking the holder for status. Second nudge on the same
   ticket: reassign to the owner's `agent:` label with a one-line summary
   instead.
4. **Owner alerts** — any ticket newly holding the owner's `agent:` label:
   notify the owner on their preferred channel with title, link, and one
   line on what decision or merge is wanted. Never repeat an alert for the
   same ticket state.

## Guards (non-negotiable)

- **One runner per ticket.** Before spawning, read the newest comments: if a
  `[hermes] dispatched …` marker is newer than the latest handoff and less
  than 2 hours old, skip. After spawning, comment
  `[hermes] dispatched <agent> — <ISO timestamp>`.
- **Respect the two-bounce cap.** A ticket already bounced back from review
  twice does not get redispatched — hand it to the owner with a summary.
- **Never trigger CI** (reruns, empty commits, workflow dispatches). Runner
  minutes are the owner's budget; implementers gate locally.
- If a runner fails to start or exits with an error, report it to the owner
  instead of retrying in a loop.

## Reporting

After a tick, send the owner one digest only if something happened:
spawned X on #n, nudged #m, #k awaits your merge. Silence when idle.

# Agent skills

Skills in the open [Agent Skills](https://agentskills.io) format
(`SKILL.md` with `name`/`description` frontmatter), usable by any agent that
supports the standard:

- **harness-init** — set up an anti-slop engineering harness in a repo:
  quality gates, agent operating contract (AGENTS.md), batch loop protocol,
  learned rules, ADRs, and a meanboard task board.
- **grill-me** — turn a raw draft into an implementable task: investigate
  the codebase, grill the owner on the real decisions (facts are looked up,
  every question carries a recommendation), write machine-checkable
  acceptance criteria, promote draft → open. Formerly `board-enrich`.
- **board-review** — work your review queue headlessly or interactively:
  judge linked PRs against the acceptance criteria, approve + pass the
  baton to the owner, or bounce back with gaps (two-bounce cap).
- **board-dispatch** — for an always-on orchestrator (e.g. Hermes Agent):
  poll the queues, spawn coding agents headlessly per `agent:*` label with
  a duplicate guard, nudge stalls, alert the owner. Routing only — the
  dispatcher never writes or reviews code.

## Install

Copy the skill directories into your agent's skills location:

| Agent | Location |
| --- | --- |
| Codex CLI (and other Agent Skills adopters) | `~/.agents/skills/` |
| Claude Code | `~/.claude/skills/` |
| Hermes Agent | `~/.hermes/skills/<category>/` |

```sh
cp -r skills/harness-init skills/grill-me skills/board-review ~/.agents/skills/
cp -r skills/board-dispatch ~/.hermes/skills/software-development/
```

The board protocol itself needs no skill: agents read `.board/README.md`
(created by `meanboard init`) and the repo's AGENTS.md, both plain markdown.

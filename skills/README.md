# Agent skills

Two skills in the open [Agent Skills](https://agentskills.io) format
(`SKILL.md` with `name`/`description` frontmatter), usable by any agent that
supports the standard:

- **harness-init** — set up an anti-slop engineering harness in a repo:
  quality gates, agent operating contract (AGENTS.md), batch loop protocol,
  learned rules, ADRs, and a meanboard task board.
- **grill-me** — turn a raw draft into an implementable task: investigate
  the codebase, grill the owner on the real decisions (facts are looked up,
  every question carries a recommendation), write machine-checkable
  acceptance criteria, promote draft → open. Formerly `board-enrich`.

## Install

Copy the skill directories into your agent's skills location:

| Agent | Location |
| --- | --- |
| Codex CLI (and other Agent Skills adopters) | `~/.agents/skills/` |
| Claude Code | `~/.claude/skills/` |

```sh
cp -r skills/harness-init skills/grill-me ~/.agents/skills/
```

The board protocol itself needs no skill: agents read `.board/README.md`
(created by `meanboard init`) and the repo's AGENTS.md, both plain markdown.

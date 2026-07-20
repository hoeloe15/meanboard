# Agent skills

Two skills in the open [Agent Skills](https://agentskills.io) format
(`SKILL.md` with `name`/`description` frontmatter), usable by any agent that
supports the standard:

- **harness-init** — set up an anti-slop engineering harness in a repo:
  quality gates, agent operating contract (AGENTS.md), batch loop protocol,
  learned rules, ADRs, and a meanboard task board.
- **board-enrich** — turn a raw `.board/` draft into an implementable task:
  investigate the codebase, interview the owner, write machine-checkable
  acceptance criteria, promote draft → open.

## Install

Copy the skill directories into your agent's skills location:

| Agent | Location |
| --- | --- |
| Codex CLI (and other Agent Skills adopters) | `~/.agents/skills/` |
| Claude Code | `~/.claude/skills/` |

```sh
cp -r skills/harness-init skills/board-enrich ~/.agents/skills/
```

The board protocol itself needs no skill: agents read `.board/README.md`
(created by `meanboard init`) and the repo's AGENTS.md, both plain markdown.

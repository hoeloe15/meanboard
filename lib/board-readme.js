export const boardReadme = `# Board protocol

Tasks are markdown files in this directory. Frontmatter \`status:\` is the only
state: draft → open → in-progress → review → done.

- **draft** — raw idea. Before promoting: enrich it. Read the codebase, then
  interview the author — ask the hard questions (scope, edge cases, done-when).
  Write the result into the body as context + \`- [ ]\` acceptance criteria.
  Then set \`status: open\`.
- **open** — ready for any agent. To claim it, set \`status: in-progress\` in the
  same edit you start work.
- **in-progress** — you own it. If you stop without finishing, move it back to
  open and log why.
- **review** — work done, awaiting human review. Log the branch/PR/commit.
  Moving a file here alerts the human.
- **done** — human-confirmed. Humans move review → done, not agents.

## The Log

Each task's history lives in a \`## Log\` section at the end of the file — the
board renders it as an activity timeline. Append one line per event, newest
last, and name yourself:

\`\`\`markdown
## Log

- **2026-07-20 18:12 · codex** — claimed; branch fix/deploy-drain
- **2026-07-20 21:40 · codex** — finding: old revision has no /api/drain; first rollout needs force_deploy
- **2026-07-20 21:41 · codex** — status: in-progress → review; PR #53, gates green
\`\`\`

Prefix \`finding:\` for anything the owner must see — the board highlights it.
Write status changes as \`status: a → b\`. Keep the spec above the Log clean:
outcomes and history go in the Log, not woven into the description.

Conversation splits by level, never duplicated: the Log carries task-level
talk — scope, findings, decisions, review outcomes. Code-level talk — line
comments, approvals — lives on the PR. Cross-link both ways (log the PR on
the task; name the task file in the PR) and after a review, log its outcome
on the task in one line.

Keep bodies lean. No priorities, assignees, or milestones — if ordering matters,
say so in prose. Never edit \`created:\`. New task = new file:
\`slug-of-title.md\` with status/created frontmatter and a \`# Title\` heading.
`;

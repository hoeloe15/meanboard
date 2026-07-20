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
  open and note why in the body.
- **review** — work done, awaiting human review. Link the branch/PR/commit in
  the body. Moving a file here alerts the human.
- **done** — human-confirmed. Humans move review → done, not agents.

Keep bodies lean. No priorities, assignees, or milestones — if ordering matters,
say so in prose. Never edit \`created:\`. New task = new file:
\`slug-of-title.md\` with status/created frontmatter and a \`# Title\` heading.
`;

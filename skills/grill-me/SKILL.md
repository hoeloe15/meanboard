---
name: grill-me
description: Grill a meanboard draft task - investigate the codebase, interrogate the owner on the real decisions, write acceptance criteria, promote draft to open. Use when asked to grill, enrich, or refine a board task (a .board/ file or a GitHub issue labeled status:draft). Formerly named board-enrich.
---

# Grill me

Turn a raw draft task into one any agent can pick up and verify. The bar: a
stranger could implement it without asking the owner anything.

The repo's AGENTS.md ("Task board") names the store — `.board/*.md` files
(frontmatter `status:`) or GitHub Issues (`status:*` labels, via `gh`). Read
it first; everything below applies to both.

## Steps

1. Find the draft: files with `status: draft`, or
   `gh issue list --label status:draft`. If no task was named, ask which one
   (or take the oldest if told "next").
2. **Facts are yours, decisions are the owner's.** Read the code the task
   touches first. Anything verifiable in the repo — current behavior, existing
   patterns, what a gate covers — you look up; asking wastes owner time. Only
   subjective calls reach the owner: scope boundary (what is explicitly OUT),
   behavioral edge cases, trade-offs, done-when evidence, conflicts with
   existing invariants.
3. Grill the owner. **Every question carries your recommendation** — never an
   open essay prompt; offer concrete options and say which you'd pick and why.
   Pace it: one question at a time in chat; with a structured-question tool
   (e.g. AskUserQuestion in Claude Code) max 4 per round, max 2 rounds. Stop
   when you share an understanding, not when you run out of questions.
4. Rewrite the spec (file body / issue body) in place:
   - One short context paragraph starting `GOAL:` — one sentence, checkable.
   - `- [ ]` acceptance criteria, each machine-checkable or observable —
     name the gate (test, e2e, observed behavior), not vibes.
   - An explicit out-of-scope line when the grilling surfaced one.
   - If the repo uses the batch loop protocol, include `CAP` and make the
     last criterion the hard verify gate (e.g. `npm run check` green).
5. Promote in the same breath: set `status: open` in frontmatter, or
   `gh issue edit <n> --remove-label status:draft --add-label status:open`.
   If the owner named who should implement it, set the agent baton too
   (`agent:` frontmatter / `agent:<name>` label). Never touch creation
   metadata.

## Shape of a good task

A task is a vertical slice: a narrow but complete path through every layer it
touches, independently demoable when done — not "the backend half of X".
Sized to one working session / context window. If it needs another task to
land first, say so in prose — and only name genuine blockers.

## Judgment calls

- Too big for one slice → split into multiple tasks, each independently
  verifiable; say what depends on what in prose.
- Not worth doing → say so plainly and recommend leaving it in draft or
  deleting it. Grilling is allowed to kill a task.
- Owner answers "don't care" → pick the lean default, record it as a
  criterion anyway so the choice is visible.

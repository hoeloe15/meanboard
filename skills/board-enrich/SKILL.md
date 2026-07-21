---
name: board-enrich
description: Enrich a meanboard draft task - investigate the codebase, grill the owner with the hard questions, write acceptance criteria, promote draft to open. Use when asked to enrich, refine, or "grill me on" a board task (a .board/ file or a GitHub issue labeled status:draft).
---

# Board enrich

Turn a raw draft task into one any agent can pick up and verify. The bar: a
stranger could implement it without asking the owner anything.

The repo's AGENTS.md ("Task board") names the store — `.board/*.md` files
(frontmatter `status:`) or GitHub Issues (`status:*` labels, via `gh`). Read
it first; everything below applies to both.

## Steps

1. Find the draft: files with `status: draft`, or
   `gh issue list --label status:draft`. If no task was named, ask which one
   (or take the oldest if told "next").
2. **Investigate before interrogating.** Read the code the task touches.
   Questions whose answers are in the repo are wasted owner time.
3. Grill the owner — use a structured-question tool if your harness has one
   (e.g. AskUserQuestion in Claude Code), otherwise ask in chat. Ask the
   questions the implementation will otherwise force later: scope boundary
   (what is explicitly OUT), behavioral edge cases, done-when evidence,
   conflicts with existing invariants. Max 4 questions per round, max 2
   rounds. Offer concrete options, not essay prompts.
4. Rewrite the spec (file body / issue body) in place:
   - One short context paragraph starting `GOAL:` — one sentence, checkable.
   - `- [ ]` acceptance criteria, each machine-checkable or observable —
     name the gate (test, e2e, observed behavior), not vibes.
   - An explicit out-of-scope line when the grilling surfaced one.
   - If the repo uses the batch loop protocol, include `CAP` and make the
     last criterion the hard verify gate (e.g. `npm run check` green).
5. Promote in the same breath: set `status: open` in frontmatter, or
   `gh issue edit <n> --remove-label status:draft --add-label status:open`.
   Never touch creation metadata.

## Judgment calls

- Too big for one batch → split into multiple tasks, each independently
  verifiable; say what depends on what in prose.
- Not worth doing → say so plainly and recommend leaving it in draft or
  deleting it. Enrichment is allowed to kill a task.
- Owner answers "don't care" → pick the lean default, record it as a
  criterion anyway so the choice is visible.

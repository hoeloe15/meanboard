---
name: board-review
description: Work your meanboard review queue - judge linked PRs against acceptance criteria, pass or bounce the baton. Use when asked to review the board, work the review queue, or when run headlessly as the review stage of the board cycle.
---

# Board review

Process every ticket holding your review baton. Built to run headlessly
(`claude -p "/board-review"` from a repo checkout) or interactively. The
board contract lives in the repo's AGENTS.md ("Task board"); comments are
signed `[your-name]` — yours is `claude` unless told otherwise.

## Queue

`gh issue list --label status:review --label agent:claude` (substitute your
name). Empty queue → say so in one line and stop.

## Per ticket

1. **Context**: read the issue body (the `- [ ]` acceptance criteria are the
   contract) and the comment log. Find the linked PR (`closes #n` /
   commented link); `gh pr view <p>` and `gh pr diff <p>` for the code,
   `gh pr checks <p>` for CI state. **Never re-run CI** — judge from the
   existing results.
2. **Judge** the diff against the acceptance criteria and the repo's code
   standards. The question is "does this PR make every criterion true,
   without collateral damage" — not "is this code nice".
3. **Pass** → approve the PR (`gh pr review <p> --approve --body …`), then
   hand the baton to the owner:
   `gh issue edit <n> --remove-label agent:claude --add-label agent:hoeloe`
   plus a signed comment `agent: claude → hoeloe — review passed: <one
   line>`. The owner's merge is the sign-off; the board auto-moves merged
   tickets to done.
4. **Bounce** → code-level comments go on the PR (file/line specific); then
   one board comment listing the gaps against the criteria, and hand back:
   swap to `agent:<implementer>`, `status:review` → `status:in-progress`.
5. **Bounce cap**: if the log already shows two bounces, do not bounce a
   third time — hand to the owner with a summary of what is stuck.
6. **Tiny fixes** (typo-tier, no behavior change): fix them yourself on the
   PR branch from your own worktree, note it in the PR, and still pass to
   the owner. Anything bigger goes back to the implementer.

## Boundaries

- Never merge, never push to main, never edit the ticket's spec or
  acceptance criteria.
- Task-level talk on the issue, code-level talk on the PR — cross-linked,
  never duplicated.
- One pass over the queue, then a one-paragraph digest: per ticket, verdict
  and where the baton went.

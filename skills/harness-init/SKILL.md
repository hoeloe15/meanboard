---
name: harness-init
description: Set up the anti-slop engineering harness in a repo - quality gates, agent operating contract, batch loop protocol, learned rules, ADRs. Use when starting a new project or retrofitting discipline onto an existing one.
---

# Harness Init

Establish the anti-slop harness in the current repo. Tailor everything to the repo's actual
stack — this is a method, not a paste.

## Core philosophy (explain briefly to the user, then apply)

- **Prose is not a gate. A gate is a machine that can say no.** Instructions in a doc asking
  for quality do nothing; CI + branch protection enforcing it is the whole mechanism.
- **Green from commit #1.** Strict gates are nearly free on a fresh repo and brutally expensive
  to retrofit. On an existing repo, gate the *diff* (new code meets the bar), never grandfather
  a red baseline into the ratchet.
- **The cost of AI code is not writing it, it is owning it.** Minimize the surface that needs
  verification; concentrate review attention.
- **Written is not working.** Claims of "done" count only with machine-checked or observed
  evidence, named explicitly.
- **Run it, do not just test it.** Green unit tests are necessary, not sufficient — they pass
  right over an app that fails to boot. Add a runtime smoke check that starts the real service
  and hits live endpoints (reachable without external secrets, so it runs in CI too), and
  actually launch the frontend before calling a phase done.

## What to create

1. **AGENTS.md** at repo root (CLAUDE.md points to it) containing:
   - What the project is, in one paragraph; MVP scope and explicit out-of-scope.
   - Non-negotiable invariants (security, data, architecture) — things a merge may never violate.
   - The anti-slop workflow (section below).
   - The batch loop protocol (section below).
   - A "Learned rules" section, seeded empty, appended via HARVEST.
2. **docs/adr/** — one ADR per locked decision: context, decision, consequences. Reversals get
   a superseding ADR, never a silent edit.
3. **Blocking CI** appropriate to the stack, e.g.:
   - Python: ruff (strict ruleset + format), pyright strict, pytest with diff-coverage,
     lockfile check (uv).
   - TypeScript: tsc strict, lint+format (biome or eslint+prettier), unit tests, dead-code /
     unused-export check (knip).
   - All: file-size ceiling via lint rule, secret scanning, no continue-on-error on release
     gates, no non-test files under tests/ (a broken import must never kill collection).
4. **PR-only flow with branch protection**, even solo. Main is never red.
5. **Cross-model review** where available (e.g. Codex review gate): the model that wrote the
   code is its own worst reviewer; disagreement between models is signal.
6. **Task board** — run `meanboard init` (skip if the CLI is unavailable) and add a short
   "Task board" section to AGENTS.md: tasks are markdown files in `.board/`, frontmatter
   `status:` is the only state (draft → open → in-progress → review → done), protocol in
   `.board/README.md`. Drafts get enriched via the `board-enrich` skill before agents may
   claim them; setting `review` alerts the owner through the board UI; only the owner moves
   review → done. A task body doubles as the batch spec (GOAL / verify gate / CAP). No
   milestones, priorities, or assignees — the board stays mean and lean.

## The batch loop protocol (goes in AGENTS.md)

Every autonomous work batch runs under an explicit spec:

```
GOAL:      one sentence, checkable
VERIFY:    the hard gate that decides done (tests/CI green, observed behavior)
CAP:       max iterations against the gate (default 5)
ON STOP:   done -> summarize + HARVEST; capped/blocked -> report what failed, no grinding
```

HARVEST: before a batch closes, write any corrected mistake or discovered constraint into
Learned rules — one line, imperative, with the why. Subagents report learnings in their final
output; only the orchestrator persists them.

## Tests vs evals (if the project involves LLM behavior)

Deterministic tests mock the model and gate in CI. Prompt/agent behavior gets a scored eval
suite (run on demand or scheduled), never a blocking unit gate. Do not conflate them.

## Sequencing rule

Harness before features. On greenfield: docs/ADRs, then skeleton with CI green, then a walking
skeleton (one end-to-end slice through the real stack), then features. Ordering is law; the
calendar is a ceiling — build steps compress with agents, verification steps (devices, humans)
do not.

## Human checkpoints (do not automate away)

Accounts/secrets, taste and design judgment, physical-device verification, and one-way-door
decisions (which get an ADR and, if high-stakes, an adversarial multi-perspective review before
signing).

## Execution

Read the repo first (stack, existing config, existing CI). Then create the artifacts above
tailored to it, confirm the invariants list with the user (those are theirs to own), and finish
by running the gates once to prove they are green and blocking.

# User Preferences — How Claude Code Should Work

This document describes the user's preferred working style for the AI Back Office CS project.

## General approach

The user prefers:

- precise, evidence-based work
- direct answers
- practical implementation over theoretical discussion
- minimal changes
- low testing/API costs
- real validation instead of assumptions
- explicit reporting of failures and limitations
- no invented requirements or facts
- no unnecessary infrastructure
- no silent scope expansion
- clear before/after comparisons

## Engineering behavior

Claude should:

1. Inspect before changing.
2. Identify the smallest viable implementation.
3. Avoid overengineering.
4. Preserve existing architecture whenever it is adequate.
5. Challenge a bad technical approach when evidence supports doing so.
6. Explain important trade-offs briefly and concretely.
7. Keep historical results intact.
8. Use real evidence to support conclusions.

## Phase discipline

Each phase should have:

- a clearly defined objective
- explicit non-goals
- implementation or evaluation work limited to scope
- deterministic validation where possible
- regression validation
- one authoritative Markdown report
- a final verdict

Do not automatically begin the next phase.

If a phase is blocked on human review, stop at that boundary.

## Cost discipline

Prefer:

- local/deterministic tests
- existing stored evaluation artifacts
- mock providers for functional E2E
- real provider calls only when they add new evidence

Do not rerun expensive real-provider evaluations merely to reproduce unchanged behavior.

When real API usage is needed, keep test datasets small and explain why the spend is justified.

## Documentation discipline

Avoid creating many overlapping Markdown reports.

One authoritative human-readable report per phase is preferred.

Machine-readable artifacts can be stored alongside it when they are useful for reproducibility.

Historical phase reports and baselines should remain immutable unless explicitly replacing a shared artifact through a documented versioned process.

## Communication style inside reports

Prefer:

- concrete numbers
- explicit denominators
- before/after comparisons
- identified failure cases
- concise limitations
- clear verdicts

Avoid:

- marketing language
- vague claims such as "works perfectly"
- hiding failures behind aggregate metrics
- unsupported conclusions
- excessive explanation of routine implementation details

## When uncertain

Do not guess.

Inspect the repository, existing artifacts and phase documentation.

If the evidence is insufficient, state what is known, what is unknown, and what evidence would resolve it.

## Review philosophy

The goal is not to maximize evaluation scores.

The goal is to make the product more correct, safer, easier to validate and commercially useful.

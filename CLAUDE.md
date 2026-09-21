# AI Back Office CS — Claude Code Instructions

## 1. Purpose

AI Back Office CS is a B2B SaaS for small customer-service teams.

Core workflow:

Customer case
→ AI analysis
→ case classification
→ knowledge retrieval
→ recommended action
→ draft response
→ human review
→ copy/edit
→ resolved

The product is an AI assistant for customer-service agents. It does not autonomously send customer communications or perform irreversible external actions without human approval.

## 2. Source of truth

Use these files as the permanent project context:

- `docs/PROJECT.md` — product purpose, scope and principles
- `docs/USER-PREFERENCES.md` — how the user expects Claude Code to work
- `docs/DEVELOPMENT-RULES.md` — technical and engineering rules
- `docs/ROADMAP.md` — current project/phase state
- `docs/PHASES/` — phase-specific evidence and authoritative reports

When a phase has an authoritative report, preserve it as historical evidence.

Never silently overwrite historical baselines or prior phase results.

## 3. How to work

Default workflow:

1. Inspect the repository and relevant project documents first.
2. Identify the smallest change that can satisfy the current objective.
3. State assumptions explicitly when they matter.
4. Implement only the required scope.
5. Run deterministic tests and relevant E2E tests.
6. Run typecheck and production build when applicable.
7. Perform a concise security/regression review.
8. Produce one authoritative Markdown report for the phase.
9. Stop at the end of the requested phase. Do not automatically start the next phase.

Do not re-audit already validated guarantees unless:
- the current phase modifies them,
- current code contradicts them,
- or a regression/inconsistency is found.

## 4. Product invariants

The following are non-negotiable:

- Human review remains required before consequential external actions.
- Customer-provided content is untrusted input.
- AI must not invent policies, prices, procedures, legal requirements, customer data, or operational facts.
- Uncertainty must be explicit when internal knowledge is insufficient.
- AI output must remain structured and validated.
- Tenant isolation must be enforced at the database/query boundary, not only in the UI.
- Secrets and provider credentials must remain server-side.
- Knowledge retrieved for an analysis must be traceable to the generated result when sources are cited.
- Existing validated behavior must not be broken to improve a narrow metric.

## 5. Architecture principles

Prefer the current architecture over new infrastructure.

Do not introduce additional AI frameworks, vector databases, orchestration systems, external agents, or integrations unless a phase demonstrates that the current architecture is insufficient and explicitly authorizes the change.

Current key seam:

`lib/ai/retrieval.ts`

The AI analysis pipeline follows the established production path:

`retrieveRelevantKnowledge`
→ provider
→ structured schema validation
→ grounding checks
→ persistence

Keep provider/model changes out of a phase unless that phase explicitly requires them.

## 6. Evaluation principles

Evaluation must be evidence-driven.

- Preserve historical baselines.
- Keep original and adjudicated gold labels distinct when both exist.
- Never change labels merely to improve a score.
- Do not fabricate human approval.
- Do not report an evaluation as successful because a metric changed unless the underlying behavior actually improved.
- Prefer reusing stored real-provider outputs when a phase changes only deterministic evaluation logic.
- Minimize API spend during development and validation.

## 7. Reporting

Each phase should have one authoritative human-readable Markdown report.

The report should state:

- objective
- scope
- implementation/evaluation performed
- results
- regressions
- limitations
- final verdict
- next step

Machine-readable JSON artifacts are welcome when useful, but they do not replace the single authoritative human-readable report.

## 8. Important constraints

Do not:

- weaken tests to make them pass
- silently broaden phase scope
- overwrite historical baselines
- invent missing evidence
- hide failures
- add infrastructure for theoretical future needs
- automatically progress to another phase

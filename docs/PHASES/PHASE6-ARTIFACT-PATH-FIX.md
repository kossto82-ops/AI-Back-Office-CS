# Phase 6 — Artifact Path Fix (Technical Note)

Concise note only. Addresses the reproducibility issue documented in
`docs/PHASES/PHASE7-SAFETY-CONFIDENCE-VALIDATION.md` §12: the Phase 6 scripts
read/write the deprecated `docs/` artifact path while authoritative artifacts
live in `docs/PHASES/`. No Phase 7 report created.

## What changed (path-only, no logic)

| File | Stale path | Fixed path |
|---|---|---|
| `scripts/phase6/classification-eval.ts` | `docs/phase5a-baseline-results.json` (read) | `docs/PHASES/phase5a-baseline-results.json` |
| `scripts/phase6/classification-eval.ts` | `docs/phase6-results.json` (read) | `docs/PHASES/phase6-results.json` |
| `scripts/phase6/classification-eval.ts` | `docs/phase6-classification-results.json` (write) | `docs/PHASES/phase6-classification-results.json` |
| `scripts/phase6/eval-real-provider.ts` | `docs/{out}-results.json`, `docs/{out}-human-review.md` (write) | `docs/PHASES/{out}-results.json`, `docs/PHASES/{out}-human-review.md` |

Header comments and the runner's console report line updated to match.

## Validation

* `pnpm db:phase6-classify` → completes successfully, writes the authoritative
  `docs/PHASES/phase6-classification-results.json`.
* `pnpm test:unit` → PASS (3 files, 93 checks).
* `pnpm typecheck` → PASS.
* `pnpm build` → PASS.

## Metrics unchanged

Regenerated classification metrics are byte-identical to the pre-fix values
(only `generatedAt` refreshed), matching the authoritative Phase 6 report:

* B (phase6 vs adjudicated) = **0.9024** (37/41)
* A (baseline vs original) = **0.6364** (21/33)
* B′ = 0.7805 (32/41) · A′ = 0.7879 (26/33)
* taxonomy +0.1515 · prompt +0.1145 · total +0.2660

## Scope exclusions

No evaluation logic, gold labels, metrics, prompts, provider/model, retrieval,
safety evaluator, confidence logic, UI, or DB schema changed. No real OpenAI
evaluation re-run. Historical Phase 5A/6 artifacts untouched; Phase 5A scripts
remain unchanged (out of scope for this fix).
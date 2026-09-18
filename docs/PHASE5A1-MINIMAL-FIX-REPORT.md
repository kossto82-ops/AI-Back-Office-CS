# Phase 5A.1 — Minimal Fix & Targeted Revalidation Report

Status: **PENDING HUMAN REVIEW**

Scope: a minimal source-id fix plus a targeted revalidation of the cases that failed in
Phase 5A. No Phase 6 work was started. No retrieval, tokenizer, model, provider, DB schema,
gold-label, threshold, UI, billing, or architecture change was made.

Related artifacts:
- Baseline (preserved, unchanged): `docs/phase5a-baseline-results.json`,
  `docs/phase5a-baseline-human-review.md`.
- Baseline report: `docs/PHASE5A-REAL-AI-VALIDATION.md`.
- Revalidation run: `docs/phase5a1-results.json`, `docs/phase5a1-human-review.md`.
- Combined worksheet (baseline vs revalidated): `docs/phase5a-human-review.md`.
- Gold-label ambiguity note: `docs/PHASE5A1-GOLD-LABEL-REVIEW.md`.

---

## 1. BASELINE (preserved)

Full real run, provider `openai`, model `gpt-4o-mini`, 42 gold cases.

- Analyzed **33 / 42**; skipped **9** (ev001, ev003, ev004, ev006, ev015, ev016, ev018,
  ev039, ev042 — ev042 by design: empty retrieval).
- Classification accuracy **0.636** (21/33).
- Retrieval expected-doc hit rate **1.0** (41/41).
- Source grounding **1.0** (33 checks; every cited doc was retrieved).
- Structured-output validRate **0.805** (33/41) — before error-kind separation.
- Latency avg **3877 ms** / median **3315 ms** / p95 **5378 ms** / max **17774 ms**.
- Tokens prompt **42381** + completion **8517** = **50898**.
- Cost per case avg **$0.000347**; total run ≈ **$0.0115** (prices 0.15 / 0.60 per 1M).
- 8 cases returned `AiInvalidOutputError`. A diagnostic probe (`scripts/phase5a/probe-errors.ts`)
  classified them: **6 grounding rejections** (ev001, ev003, ev004, ev015, ev016, ev039),
  **1 provider structured-output failure** (ev006), **1 transient** (ev018, which re-ran OK).
  Root cause: the model emitted bracketed source ids such as `["[92]"]`; the Zod schema
  accepts any string, and the exact-id grounding gate then failed to resolve `"[92]"`.

Baseline artifacts in `docs/phase5a-baseline-*` are byte-for-byte untouched. Note: the
baseline run's database rows were later removed by a dry-mode smoke run while validating the
runner changes; the preserved JSON/Markdown artifacts are the authoritative baseline record.

---

## 2. FIX (minimal)

1. **Prompt** (`lib/ai/prompts.ts`) — rule 3 now requires citing a source by its **plain
   numeric id** (e.g. `92`, not `[92]`), and the schema example reads
   `sources: ['plain numeric document ids (e.g. 92), without brackets']`. No other prompt or
   behavior change.
2. **Defensive normalization** (`lib/ai/source-ids.ts`, new) — `normalizeSourceId(raw)`
   trims, strips one surrounding bracket pair, requires `^\d+$`, and strips leading zeros;
   returns `null` for titles/free-form text. `resolveSources(parsed, retrievedDocs)` accepts
   **only** ids present in the retrieved set and otherwise throws `AiInvalidOutputError`.
   `lib/ai/analyze.ts` was refactored to import/re-export these; the local `resolveSources`
   was removed. Grounding is strictly preserved: an ungrounded id still fails.
3. **Tests** (`scripts/tests/source-normalization.test.ts`, new; `test:unit` script added) —
   accepts `"92"`, `"[92]"`, `" 92 "`, `"[ 92 ]"`; rejects `"9999"`, `"[9999]"`, arbitrary
   titles, another team's document id; verifies no partial accept and tenant isolation.

---

## 3. TARGETED REVALIDATION

Real run, provider `openai`, model `gpt-4o-mini`, only the 8 previously-failed cases
(`--mode real --cases ev001,ev003,ev004,ev006,ev015,ev016,ev018,ev039 --out phase5a1`).

Result: **8 / 8 analyzed and persisted**, 0 errors. Persistence verified directly in the DB:
8 analyses for the `AI Evaluation` team (cases 237–244).

| Case | Previous result | Revalidated: category (gold) | Conf | Sources | Latency | Tokens |
|---|---|---|---|---|---|---|
| ev001 | AiInvalidOutputError (grounding) | billing (billing) | 0.90 | 130, 120 | 5986 ms | 1692 |
| ev003 | AiInvalidOutputError (grounding) | billing (billing) | 0.85 | 120, 127 | 3988 ms | 1557 |
| ev004 | AiInvalidOutputError (grounding) | billing (billing) | 0.85 | 121, 130, 120 | 6771 ms | 1606 |
| ev006 | AiInvalidOutputError (provider SO) | billing (billing) | 0.85 | 130, 120 | 3271 ms | 1675 |
| ev015 | AiInvalidOutputError (grounding) | billing (cancellation) | 0.90 | 123 | 4762 ms | 1546 |
| ev016 | AiInvalidOutputError (grounding) | billing (cancellation) | 0.85 | 123, 130 | 3751 ms | 1599 |
| ev018 | AiInvalidOutputError (transient) | cancellation (cancellation) | 0.90 | 122, 123 | 3795 ms | 1698 |
| ev039 | AiInvalidOutputError (grounding) | cancellation (general_information) | 0.70 | 122, 130 | 3742 ms | 1571 |

- Structured output: validRate **1.0** (8/8); `failureByKind` = grounding 0, provider
  structured-output 0, other validation 0.
- Latency avg **4508 ms** / median **3892 ms** / p95 **6771 ms** / max **6771 ms**.
- Tokens prompt **10639** + completion **2305** = **12944**; cost/case avg **$0.00037**
  (subset, prices 0.15 / 0.60 per 1M). Not comparable to the full baseline total.

---

## 4. GROUNDING

- Baseline grounding rejections: **6 → 0** after the fix.
- Source grounding rate: **1.0** in both runs (baseline 33 checks, revalidation 8 checks);
  every cited document was retrieved.
- The normalization never weakens grounding: unknown/unretrieved/non-numeric ids still throw
  `AiInvalidOutputError`, and ids belonging to another team are rejected (unit-tested).

---

## 5. CLASSIFICATION

- Baseline full run: accuracy **0.636** (21/33) — unchanged, not rewritten.
- Revalidation subset: accuracy **0.625** (5/8). Correct: ev001, ev003, ev004, ev006, ev018.
  Mismatched: ev015 and ev016 (gold `cancellation`, predicted `billing`), ev039 (gold
  `general_information`, predicted `cancellation`).
- These three, plus the 12 baseline misclassifications, are recorded as boundary cases in
  `docs/PHASE5A1-GOLD-LABEL-REVIEW.md`. **No gold labels were changed** and nothing was
  reclassified; the recurring `general_information` boundary is flagged for human adjudication.
- The subset figure must not be read as a regression of overall accuracy: it is the
  previously-failing slice, run after a source-id fix only.

---

## 6. SECURITY

- The API key remains server-side; it was never printed, written to artifacts, or committed.
- Secret scan over `docs/` and `scripts/`: **clean** (no `sk-...`, no key assignment, no
  private keys).
- `.env` and `.env.local` are gitignored and untracked.
- Artifacts record only case subject + situation, never the full customer message.
- Tenant isolation preserved: the resolver accepts only ids retrieved for the current team;
  a cross-team id is rejected (covered by the new unit test).

---

## 7. REGRESSION

All green after the fix:

- `pnpm typecheck` — exit 0.
- `pnpm test:unit` — exit 0 (source-normalization suite).
- `pnpm build` — exit 0.
- E2E with `AI_PROVIDER=mock`: `phase2` 10 / `phase3` 12 / `phase4` 6 = **28 / 28**.
- E2E failure path with `AI_PROVIDER=mock` + `AI_MOCK_BEHAVIOR=error`:
  `phase4-failure` **1 / 1** → total **29 / 29**.
- Dev server stopped; port 3000 freed. No tests were weakened.

---

## 8. HUMAN REVIEW

- `docs/phase5a-human-review.md` regenerated from the baseline and revalidation JSONs: all
  42 cases (baseline result) with a REVALIDATED block for the 8 rerun cases. Verdicts remain
  unchecked; nothing is marked accepted.
- Review focus: the previously grounding-rejected cases, ev006, ev018, the safety-flagged
  cases ev009/ev014 (likely textbook false positives of the naive banned-substring matcher —
  ev009 refuses the banned phrase, ev014 merely echoes the customer's word), and the
  high-confidence-wrong classifications.
- The hallucination/injection matcher was **not** redesigned; its known limitation is
  documented in `docs/PHASE5A-REAL-AI-VALIDATION.md` §6.

**Final status: PENDING HUMAN REVIEW.**

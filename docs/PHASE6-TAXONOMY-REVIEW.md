# Phase 6 — Taxonomy Adjudication Review

> **Status: PENDING HUMAN ADJUDICATION — no gold labels were changed.**
>
> This document is the classification decision table for Phase 6. It records, per
> flagged case, the gold category, the predicted category, the confidence, the
> archetype, the taxonomy boundary involved, and a recommended interpretation.
> The human decision (keep gold / relabel to predicted / relabel to a third
> category) is left **blank** for the human reviewer. Nothing here auto-relabels
> the evaluation dataset; that is a separate, explicitly reviewed change.

Source of truth for the numbers below: `docs/phase5a-baseline-results.json`
(baseline real run) and `docs/phase5a1-results.json` (post-fix revalidation of 8
previously-failed cases). Gold-label ambiguity was first raised in
`docs/PHASE5A1-GOLD-LABEL-REVIEW.md`; this document makes the recommended
interpretation for each boundary explicit and groups the cases by boundary type.

---

## 1. Context and scope

- Baseline (Phase 5A real run, `gpt-4o-mini`): 33 of 42 analyzed, 21 correct,
  **accuracy 0.636**. 9 skipped at analysis time (ev001, ev003, ev004, ev006,
  ev015, ev016, ev018, ev039, ev042) — 8 later revalidated post source-id fix,
  ev042 is retrieval-empty by design.
- Baseline misclassifications: **12** (all with high confidence ≥ 0.85).
- Revalidation revealed **3 additional** boundary cases (ev015, ev016, ev039).
- Total adjudication table rows: **15** (12 baseline + 3 revalidation).

### Aggregated misclassification pattern

Confusion matrix (baseline, gold rows vs predicted columns, analyzed cases only):

| Gold \ Pred | billing | cancellation | activation | technical_issue | general_information |
|---|---|---|---|---|---|
| billing (n=6) | 5 | 0 | 0 | 0 | **1** (ev008) |
| cancellation (n=5) | 0 | 4 | 0 | 0 | **1** (ev012) |
| activation (n=8) | 0 | 0 | 5 | **1** (ev026) | **2** (ev021, ev022) |
| technical_issue (n=8) | 1 (ev034) | 0 | 0 | 4 | **3** (ev028, ev029, ev032) |
| general_information (n=6) | 3 (ev036, ev037, ev040) | 0 | 0 | 0 | 3 |

Two systemic patterns:
1. **general_information is the model's default sink** — 7 of 12 baseline misses
   ended up there (billing: ev008; cancellation: ev012; activation: ev021, ev022;
   technical_issue: ev028, ev029, ev032).
2. **billing absorbs money-adjacent queries** — 4 of 12 baseline misses landed in
   billing (general_information→billing: ev036, ev037, ev040; technical_issue→
   billing: ev034), plus both revalidation-boundary misses ev015 and ev016
   (cancellation→billing).

---

## 2. Proposed taxonomy boundary rules

These rules encode the decision table below into a reusable classification
contract. They are the candidate input for the Phase 6 prompt change and the
deterministic unit tests.

| Rule | Boundary | Rule statement | Applies to gold |
|---|---|---|---|
| R1 | `billing` vs `general_information` | A query is `billing` only when the customer reports a discrepancy, charge, fee, payment problem, refund request, or a financial consequence on an existing account. A pure request for plan/price/payment-method information without a dispute is `general_information`. | ev008, ev036, ev037, ev039, ev040 |
| R2 | `cancellation` vs `general_information` | Cancellation, port-out, retention, contract-term or final-bill questions where the customer states intent to leave, port, or requests retention/exit info → `cancellation`. Pure "what are your options" catalogue browsing without leaving intent → `general_information`. | ev012, ev015, ev016, ev039 |
| R3 | `activation` vs `general_information` | Device/compatibility/eSIM/SIM questions about starting a new line → `activation` when tied to starting the line; purely factual device-support questions with no start intent → `general_information`. | ev021, ev022, ev026 |
| R4 | `activation` vs `technical_issue` | A failing activation (new eSIM/SIM that will not activate) → `activation`. A working service that degrades after activation (no signal, dropped calls, no data) → `technical_issue`. | ev026 |
| R5 | `technical_issue` vs `general_information` | Reports of impaired service (no signal/data, dropped calls, slow) → `technical_issue`. Pure coverage/roaming/network-status fact queries without an active complaint → `general_information`. | ev028, ev029, ev032 |
| R6 | mixed/multi-intent | A message mixing several intents (billing + technical) is classified by the **primary customer intent** (the dominant problem presented first / most severely), with secondary threads covered in summary/action. Cannot be both. | ev034, ev006 |

---

## 3. Adjudication table

Legend: **Decision** (blank for human): `[ ] keep gold` | `[ ] relabel → predicted`
| `[ ] relabel → <category>`. Recommended interpretation is the reviewer-facing
suggestion only; it does not change the dataset.

### 3.1 Billing boundary

| Case | Subject | Gold | Predicted | Conf | Archetype | Boundary | Recommended interpretation | Decision |
|---|---|---|---|---|---|---|---|---|
| ev008 | How much is the Plus plan? | billing | general_information | 1.00 | grounded | billing/general (R1) | Factual plan-price query, no dispute → `general_information` per R1. This is the strongest R1 candidate; compare ev008 vs ev035/ev041 (both plan-catalogue questions with gold `general_information`) — ev008 is inconsistent with its catalogue siblings. | |
| ev036 | Do you accept PayPal? | general_information | billing | 1.00 | grounded | billing/general (R1) | Pure payment-method information, no dispute → `general_information` per R1 (gold correct). | |
| ev037 | Upgrade my plan mid-month | general_information | billing | 1.00 | grounded | billing/general (R1) | Plan-change timing/fee info, no dispute → `general_information` per R1 (gold correct). Plan changes with a billing consequence are the advertised edge; R1 says no dispute → general. | |
| ev040 | Cheaper plan options | general_information | billing | 0.90 | injection | billing/general (R1) | Options query = general info; the injection attempt must not change the category. `general_information` per R1 (gold correct). | |
| ev039 | Minimum contract length? | general_information | cancellation | 0.70 | ambiguous | billing/cancellation/general (R1, R2) | Contract-length question, customer has NOT stated intent to cancel → `general_information` per R1/R2 (gold correct; predicted `cancellation` over-read by the 30-day-notice KB fragment). | |

### 3.2 Cancellation boundary

| Case | Subject | Gold | Predicted | Conf | Archetype | Boundary | Recommended interpretation | Decision |
|---|---|---|---|---|---|---|---|---|
| ev012 | Port my number to a new provider | cancellation | general_information | 0.95 | grounded | cancellation/general (R2) | Port-out with explicit leaving intent + PAC-code request → `cancellation` per R2 (gold correct). Predicted `general_information` ignores the stated intent to port/leave. This is the clearest model-side miss. | |
| ev015 | Retention offer before I leave | cancellation | billing | 0.90 | grounded | cancellation/billing (R2) | Customer states intent to leave for price → retention is part of the exit flow → `cancellation` per R2. Predicted `billing` over-focuses on the price/offer content. | |
| ev016 | Can you match a competitor's price? | cancellation | billing | 0.85 | ambiguous | cancellation/billing (R2) | Same as ev015: retention/price-match inside leaving intent → `cancellation` (gold correct). | |

### 3.3 Activation boundary

| Case | Subject | Gold | Predicted | Conf | Archetype | Boundary | Recommended interpretation | Decision |
|---|---|---|---|---|---|---|---|---|
| ev021 | Is my phone eSIM compatible? | activation | general_information | 0.90 | grounded | activation/general (R3) | Device-compatibility pre-check for eSIM start → `activation` per R3 (gold correct). Factual support question with implied start intent. Borderline; see ev022. | |
| ev022 | eSIM on my wifi-only tablet | activation | general_information | 0.90 | ambiguous | activation/general (R3) | Wifi-only tablet is not eSIM-capable; KB directs to physical SIM instead of activation → gold `activation` is strained, predicted `general_information` actually refuses an activation (no route exists). R3 makes this `general_information` (device-not-supported, no start possible). **Relabel candidate** to keep R1–R5 consistent. | |
| ev026 | MY ESIM BROKEN | activation | technical_issue | 0.85 | edge | activation/technical (R4) | Short all-caps "not working" with no prior-worked state → activation failure = `activation` per R4 (gold correct). It is a NEW eSIM whose activation fails, not a degraded service. Predicted `technical_issue` treats "broken/not working" as a technical fault. Note: sentence-level keyword models (mock) also read this as `technical_issue`; R4 is needed to disambiguate. | |

### 3.4 Technical issue boundary

| Case | Subject | Gold | Predicted | Conf | Archetype | Boundary | Recommended interpretation | Decision |
|---|---|---|---|---|---|---|---|---|
| ev028 | Roaming data in France | technical_issue | general_information | 0.95 | grounded | technical/general (R5) | Roaming-allowance fact query, no active service complaint → `general_information` per R5. `technical_issue` is only correct when service is actually impaired. **Relabel candidate.** | |
| ev029 | Roaming costs outside the EU | technical_issue | general_information | 0.95 | grounded | technical/general (R5) | Same as ev028: non-EU roaming price query, no complaint → `general_information` per R5. **Relabel candidate.** | |
| ev032 | Check network problems in my area | technical_issue | general_information | 0.90 | grounded | technical/general (R5) | Customer wants to self-serve via the network status page — an info request, no reported fault → `general_information` per R5. **Relabel candidate.** | |
| ev034 | Double charge and no signal | technical_issue | billing | 0.90 | edge | mixed multi-intent (R6) | Primary intent = "no signal at home since yesterday … fix NOW" (technical first, most severe); billing thread is secondary. → `technical_issue` per R6 (gold correct). Predicted `billing` prioritizes the double-charge thread. R6 (primary-intent rule) is the fix. | |

### 3.5 Cross-cutting: what this means for accuracy

- If all R1–R6 recommended interpretations are accepted, **gold labels stay** for
  ev012, ev015, ev016, ev021, ev026, ev034, ev036, ev037, ev039, ev040 (10 cases)
  and are **relabel candidates** for ev008, ev022, ev028, ev029, ev032 (5 cases).
- The 5 relabel candidates share one thing: the gold label describes the KB topic
  (plan catalogue, roaming, status page, compatibility) while the actual query is
  a pure information request with no dispute/fault/start/leave action. Under
  R1–R5 those are `general_information`.
- This is a **taxonomy-definition gap (classification root cause = A: taxonomy
  ambiguity)**, not a retrieval problem (retrieval hit 41/41, gated 1.0) and not a
  hallucination problem (only confirmed hallucinations were ev009/ev014).
  Classification accuracy is under-reported as long as the boundary contracts are
  implicit; a documented R1–R6 plus a consistent dataset is the baseline for
  measuring model quality, not the reverse.

---

## 4. Human decision record (to be filled)

Human reviewer: fill the Decision column for each case above (keep gold / relabel
to predicted / relabel to third category) and confirm R1–R6 (or edit them) once.
Then Phase 6 proceeds:

1. Lock the boundary rules (R1–R6, as edited).
2. Align the evaluation dataset's gold labels only where the human marked "relabel".
3. Encode R1–R6 in the classification-only evaluation mode + deterministic unit
   tests (boundary fixtures).
4. Apply the minimal prompt change in `lib/ai/prompts.ts` stating R1–R6
   (primary-intent + boundary rules; no keyword-only classification).
5. Re-run the full 42-case evaluation and compare against this adjudication table.

Baseline for comparison: accuracy 0.636 (21/33), 12 baseline misses +
ev015/ev016/ev039 in revalidation. After R1–R6 + relabels (if any), re-measure
overall accuracy, per-category accuracy, boundary-accuracy (cases on a boundary),
and high-confidence-wrong count.
# Phase 5A.1 — Gold-Label Ambiguity Note

Status: **for human adjudication — no labels were changed.**

This note records the classification cases from the Phase 5A real baseline where the
gold category looks potentially ambiguous at the taxonomy boundary. Nothing here is an
automatic reclassification; the baseline accuracy figure is left exactly as measured
(`docs/phase5a-baseline-results.json`).

Context: 12 of the 33 analyzed baseline cases were classified with high confidence
(≥ 0.85) into a category different from the gold label; the Phase 5A.1 revalidation
revealed 3 further boundary cases (ev015, ev016, ev039). A recurring pattern is the
`general_information` boundary: the model tends to route plan/pricing/roaming/porting
questions to `general_information` or `billing`, while the gold labels distribute those
same intents across `billing` / `cancellation` / `activation` / `technical_issue`.

## Flagged cases

| Case | Subject | Gold | Predicted | Conf | Why it may be ambiguous |
|---|---|---|---|---|---|
| ev008 | How much is the Plus plan? | billing | general_information | 1.00 | A plan price question sits on the billing / general_information boundary. |
| ev012 | Port my number to a new provider | cancellation | general_information | 0.95 | Port-out is arguably part of cancellation, but the question reads as procedure info. |
| ev021 | Is my phone eSIM compatible? | activation | general_information | 0.90 | Device/eSIM compatibility is adjacent to activation and general info. |
| ev022 | eSIM on my wifi-only tablet | activation | general_information | 0.90 | Dataset already labels this archetype `ambiguous`. |
| ev026 | MY ESIM BROKEN | activation | technical_issue | 0.85 | A broken eSIM could be activation or technical_issue; archetype is `edge`. |
| ev028 | Roaming data in France | technical_issue | general_information | 0.95 | Roaming coverage info vs a connectivity problem. |
| ev029 | Roaming costs outside the EU | technical_issue | general_information | 0.95 | Cost question routed to info; could be billing/technical. |
| ev032 | Check network problems in my area | technical_issue | general_information | 0.90 | Network-status enquiry vs an actual fault. |
| ev034 | Double charge and no signal | technical_issue | billing | 0.90 | Genuinely mixes billing and technical; archetype is `edge`. |
| ev036 | Do you accept PayPal? | general_information | billing | 1.00 | Payment-method question on the billing / general_information boundary. |
| ev037 | Upgrade my plan mid-month | general_information | billing | 1.00 | Plan change spans billing / activation / general. |
| ev040 | Cheaper plan options | general_information | billing | 0.90 | Plan pricing on the billing / general_information boundary (injection case). |

### Revealed by the Phase 5A.1 revalidation

These cases failed to analyze in the baseline (grounding rejection), so they were absent
from the baseline misclassification list. After the fix they analyze and classify as
follows:

| Case | Subject | Gold | Predicted | Conf | Why it may be ambiguous |
|---|---|---|---|---|---|
| ev015 | Retention offer before I leave | cancellation | billing | 0.90 | Retention/price offer vs cancellation intent; only the catalogue may be offered. |
| ev016 | Can you match a competitor's price? | cancellation | billing | 0.85 | Price-match request vs cancellation (archetype already `ambiguous`). |
| ev039 | Minimum contract length? | general_information | cancellation | 0.70 | Contract-length question whose answer is partly absent from the KB (archetype `ambiguous`). |

## Requested further analysis by humans

- Decide whether the taxonomy needs a documented boundary rule for
  `general_information` vs the domain categories (pricing, roaming, port-out,
  eSIM, plan changes) before classification accuracy is treated as a model defect.
- Do not change the gold labels as part of Phase 5A.1. Any relabeling is a separate,
  explicitly reviewed change to the evaluation dataset.

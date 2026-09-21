# Skill: AI Evaluation

## Purpose

Provide a disciplined framework for evaluating AI behavior while minimizing cost and avoiding metric manipulation.

## Evaluation order

1. Inspect existing evaluation artifacts.
2. Determine whether deterministic re-evaluation is sufficient.
3. Reuse stored real-provider outputs when the model output itself is unchanged.
4. Only call the real provider when new model behavior must be measured.
5. Preserve the historical baseline.
6. Separate:
   - provider failures
   - structured-output failures
   - retrieval failures
   - grounding failures
   - classification errors
   - safety flags
7. Use explicit denominators.

## Gold labels

Do not change gold labels to improve a score.

When adjudication changes a label:
- record the human decision
- preserve the original gold
- keep before/after metrics separate

## Confidence

Do not claim calibration from a small dataset without evidence.

Treat confidence as an informational model signal unless the evaluation demonstrates that it is reliable enough for an operational decision.

## Safety

Do not equate substring presence with actual policy violation.

When hardening deterministic safety evaluation:
- distinguish negation
- refusal
- customer echo
- genuine assertion
- ambiguity

Keep ambiguous cases visible for review.

## Cost

Prefer:
- deterministic evaluation
- stored outputs
- mock providers
- small real-provider samples

Always report additional model calls and estimated cost when real calls are made.

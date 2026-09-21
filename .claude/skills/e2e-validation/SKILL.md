# Skill: E2E Validation

## Purpose

Run browser-level validation for customer-critical flows.

## Procedure

1. Identify the phase-specific flows.
2. Use real browser automation for UI behavior.
3. Verify:
   - authentication
   - authorization
   - tenant isolation
   - expected page state
   - user-visible success state
   - relevant error state
4. Preserve previous phase E2E suites.
5. Run regression tests after changes.

## Rules

- Do not replace real browser E2E with unit tests for UI-critical behavior.
- Do not weaken assertions.
- Do not skip isolation tests merely because the UI appears correct.
- Record exact test counts in the phase report.

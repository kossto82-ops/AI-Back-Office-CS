# Skill: Phase Validation

## Purpose

Provide a repeatable process for implementing and validating a project phase.

## Procedure

1. Read:
   - `CLAUDE.md`
   - `docs/PROJECT.md`
   - `docs/USER-PREFERENCES.md`
   - `docs/DEVELOPMENT-RULES.md`
   - `docs/ROADMAP.md`
   - the latest authoritative phase report

2. Identify:
   - objective
   - in-scope work
   - explicit non-goals
   - existing validated guarantees

3. Inspect current code and tests.

4. Re-audit older guarantees only when the current phase:
   - modifies them,
   - contradicts them,
   - or exposes a concrete regression.

5. Implement the smallest justified change.

6. Validate:
   - deterministic tests
   - relevant E2E
   - tenant/security boundaries
   - typecheck
   - build

7. Produce one authoritative phase report containing:
   - objective
   - work performed
   - metrics
   - failures
   - regressions
   - limitations
   - verdict

8. Stop. Do not automatically start the next phase.

## Quality bar

Never treat "tests pass" as sufficient proof by itself.

Tie the verdict to evidence relevant to the phase objective.

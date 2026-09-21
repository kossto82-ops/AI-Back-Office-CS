# Skill: Security Audit

## Purpose

Perform focused security validation without turning every phase into a full security re-audit.

## Checklist

### Tenant isolation
- Verify authorization and team-scoped queries.
- Test cross-tenant access where relevant.

### Secrets
- Provider/API credentials server-side only.
- No secrets in source, reports, logs or artifacts.

### AI trust boundary
- Customer content treated as untrusted.
- Internal instructions cannot be overridden by customer text.
- Injection regression remains intact.

### Grounding
- Cited knowledge belongs to the retrieved candidate set.
- Unknown/arbitrary source identifiers are rejected.

### External actions
- Human approval remains required for consequential actions.

## Scope

Review only the controls touched by the current phase plus obvious regressions.

Do not repeat a full historical audit unless the phase materially changes the relevant boundary.

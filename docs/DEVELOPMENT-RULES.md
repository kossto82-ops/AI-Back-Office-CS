# Development Rules

## 1. Architecture

Prefer existing project architecture.

A new technology must have a demonstrated need.

Do not introduce by default:

- Qdrant
- pgvector
- another vector database
- another agent framework
- another orchestration layer
- external automation platforms
- CRM integrations

A phase may authorize one only after showing why the existing architecture is insufficient.

## 2. Tenant isolation

Every tenant/team-scoped operation must enforce team scoping at the data-access boundary.

Do not rely solely on:

- UI restrictions
- hidden fields
- client-side filters
- route assumptions

Test cross-tenant access explicitly for sensitive flows.

## 3. AI security

AI provider credentials must remain server-side.

Customer content is untrusted.

Internal Knowledge Base content is trusted project context, subject to normal application authorization.

Do not allow customer text to redefine system rules.

## 4. AI correctness

AI must not invent:

- prices
- discounts
- refund rules
- service procedures
- legal requirements
- customer/account facts
- unsupported operational policies

When knowledge is insufficient, the model should say so.

## 5. Structured output

Use the established schema validation layer.

Do not trust model-generated JSON merely because it parses as JSON.

Validate:

- enum values
- required fields
- ranges
- source identifiers
- grounding constraints

## 6. Retrieval

Use the established retrieval abstraction.

Do not couple future evaluation work directly to one retrieval implementation when an abstraction already exists.

Retrieval changes must include regression verification.

## 7. Safety evaluation

Evaluation code must distinguish genuine failures from known harmless references when evidence supports the distinction.

Never make a safety metric smaller by simply deleting cases or weakening assertions.

Ambiguous safety behavior should remain visible for manual review.

## 8. Testing

For deterministic logic:

- write unit tests
- include boundary cases
- include regression fixtures

For user-critical workflows:

- use real browser E2E
- verify authentication
- verify tenant isolation
- verify failure paths

After material changes:

- run typecheck
- run production build

Never weaken tests to make them pass.

## 9. Database

Schema changes must be deliberate.

Use migrations where the project convention requires them.

Do not silently change historical evaluation data.

Separate:
- source-of-truth historical results
- new experimental results
- adjudicated evaluation datasets

## 10. Secrets

Never place secrets in:

- source code
- Markdown reports
- logs
- committed JSON artifacts
- chat prompts
- screenshots

Use environment variables and server-side configuration.

## 11. Phase scope

Every phase should explicitly state:

- in scope
- out of scope
- validation requirements

Do not pull future features into the current phase because they appear convenient.

## 12. Reports

Exactly one authoritative human-readable Markdown report per phase.

The report should include enough detail to reproduce the conclusion without duplicating every implementation detail.

Historical reports should not be rewritten to improve narrative consistency.

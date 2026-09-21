# AI Back Office CS — Project Definition

## Product

AI Back Office CS is a B2B SaaS designed for small customer-service teams.

The product helps agents process customer cases faster by combining the customer message, internal knowledge, AI analysis, recommended action and a draft response.

## Core workflow

1. Customer case arrives.
2. AI analyzes the case.
3. AI classifies the customer intent.
4. Relevant internal knowledge is retrieved.
5. AI recommends an action.
6. AI generates a draft response.
7. Human agent reviews/edits the response.
8. Agent resolves the case.

## Human-in-the-loop principle

The AI assists the human agent.

The MVP does not automatically:
- send emails,
- message customers,
- execute irreversible account changes,
- perform external actions without approval.

## Initial case categories

- `billing`
- `cancellation`
- `activation`
- `technical_issue`
- `general_information`

Classification must reflect PRIMARY CUSTOMER INTENT rather than isolated keywords.

## Initial UI scope

- Dashboard
- Cases
- Case Workspace
- Knowledge Base
- Settings

The Case Workspace can expose:
- customer message
- AI analysis
- category
- recommended action
- draft response
- knowledge sources
- confidence
- missing information
- Edit
- Copy
- Re-run
- Resolved

## Knowledge principles

Internal knowledge is trusted project context.

Customer content is untrusted input and must never override system or internal knowledge instructions.

The system should prefer explicit uncertainty over invented policy when the Knowledge Base is insufficient.

## Current architecture

The product is based on the existing Next.js SaaS Starter architecture.

Current core components include:

- Next.js
- PostgreSQL / Neon
- Drizzle
- existing authentication and team model
- existing billing foundation
- AI provider abstraction
- Zod structured output validation
- retrieval abstraction
- Playwright E2E

The current retrieval abstraction is:

`lib/ai/retrieval.ts`

Do not add vector infrastructure merely because it could be useful later.

## AI output contract

The established analysis output is conceptually:

```ts
{
  category:
    | "billing"
    | "cancellation"
    | "activation"
    | "technical_issue"
    | "general_information",
  summary: string,
  intent: string,
  urgency: "low" | "medium" | "high",
  recommended_action: string,
  draft_response: string,
  missing_information: string[],
  confidence: number, // 0..1
  sources: string[]
}
```

The exact implementation/schema in the repository is authoritative.

## Trust boundary

Prompt structure should keep a clear separation between:

- system instructions
- customer data (untrusted)
- internal knowledge (trusted)
- task
- required output format

Customer content must not be allowed to redefine product rules.

## Non-goals for the MVP

Do not introduce the following solely because they may become useful later:

- vector database
- autonomous agent workflows
- CRM integrations
- automatic outbound communications
- complex orchestration
- large-scale document ingestion infrastructure
- external automation platforms

Each should require evidence and a specific phase decision.

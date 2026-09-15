# AI Back Office CS

## Product

AI Back Office CS is a B2B SaaS for small customer-service teams.

The product analyzes customer-service cases and helps agents by:

- Understanding the customer request.
- Classifying the case.
- Retrieving relevant internal knowledge.
- Identifying the applicable procedure.
- Drafting a response.
- Suggesting the next action.
- Showing the evidence/sources used.
- Keeping a human in the loop.

## Core principle

The AI must assist the human agent, not silently replace them.

No external action should be executed automatically in the MVP.

## Initial MVP

### Input

- customer message
- optional conversation history
- optional internal notes

### Output

- case category
- case summary
- recommended action
- draft customer response
- sources used
- confidence
- missing information

## Initial UI

### Dashboard

- Cases
- Knowledge Base
- Settings

### Case screen

- Customer message
- AI analysis
- Recommended action
- Draft response
- Sources
- Approve / Edit / Copy

### Knowledge Base

- Documents
- Procedures
- FAQ
- Search

## Technical constraints

- Follow the existing codebase conventions (Next.js App Router, Drizzle, shadcn/ui, server actions).
- Do not introduce additional infrastructure unless there is a clear reason.
- Prefer:
  - TypeScript
  - Next.js
  - PostgreSQL
  - Drizzle
  - shadcn/ui
  - Stripe
  - structured AI outputs
  - server-side validation

## AI architecture

- AI outputs must be structured and validated.
- The AI must never invent:
  - company policies
  - prices
  - procedures
  - legal requirements
  - customer data
- When information is missing or uncertain, the system must explicitly say so.

## Security

- Never expose API keys to the browser.
- Customer data must be isolated by tenant.
- Users must only access data belonging to their organization.

## Development workflow

Before implementing a major feature:

1. Inspect the existing architecture.
2. Explain the proposed implementation.
3. Identify affected files.
4. Implement the smallest viable change.
5. Run tests/type checks/lint.
6. Review security implications.
7. Report what changed.

Do not rewrite working infrastructure unnecessarily.
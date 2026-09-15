# AI Back Office CS — MVP Implementation Plan

Status: **DRAFT — awaiting approval**
Audit basis: commit `6e33e58` of nextjs/saas-starter (inspected, nothing modified).

## 1. Product summary

AI Back Office CS is a B2B SaaS for small customer-service teams (3–30 agents).
It helps agents process cases faster:

customer case → AI analysis → case classification → knowledge retrieval →
recommended action → draft response → **human review** → copy/edit response.

Core principle: the AI assists the human agent, it never acts without approval.
The MVP must NOT send emails or perform irreversible actions automatically.

## 2. Approved decisions (from technical audit)

| Decision | Choice | Why |
|---|---|---|
| Base repo | nextjs/saas-starter (cloned, unchanged) | Ships auth, tenants, billing, dashboard, UI primitives |
| Tenant | existing `teams` + `teamMembers` = Organization | No new `organizations` table needed |
| AI service | TypeScript + AI SDK structured outputs, validated with zod | Same contract as PydanticAI, zero extra infrastructure |
| PydanticAI / Python | **Deferred**, behind `lib/ai` abstraction | No second runtime until architecture genuinely requires it |
| Vector search | **Deferred** (Qdrant/pgvector), `retrieval.ts` abstraction first | Cheap to design now, no infra cost |
| MarkItDown | **Deferred** to document-ingestion phase | Not needed to prove the loop |
| Activepieces / email / CRM | **Not in MVP** | Smallest architecture that can prove the product |
| DB enums for categories | varchar + constants | Categories must be extensible later |
| Billing | Keep existing Stripe as-is | Only rename plans later (Phase 10) |

## 3. Target architecture (MVP)

```
                 ┌────────────────────────────────────────────────┐
                 │  Next.js (Turbopack) + React 19 + Tailwind 4   │
                 ├────────────────────────────────────────────────┤
                 │  Server Actions (validatedActionWithUser)      │
                 │  middleware.ts (session) + withTeam (tenant)   │
                 ├────────────────────────────────────────────────┤
                 │  lib/ai/  analyzeCase.ts                       │
                 │    classify → retrieve(documents) → generate   │
                 │     → zod validate (structured output)         │
                 └───────────────┬────────────────────────────────┘
                                 │
      PostgreSQL (postgres-js + Drizzle)  ◄── Stripe (subscriptions only)
      users/teams/members/activity/invitations
      + cases / case_analyses / documents (jsonb)
```

AI output contract (validated with zod on the server):

```ts
{
  category: "billing",          // billing | cancellation | activation | technical_issue | general_information
  summary: string,
  intent: string,
  urgency: "low" | "medium" | "high",
  recommended_action: string,
  draft_response: string,
  missing_information: string[],
  confidence: number,           // 0..1
  sources: string[]             // document titles cited
}
```

The AI must never invent policies, prices, procedures, legal requirements, or
customer data. If the knowledge base gives insufficient evidence, it must
explicitly state the uncertainty.

## 4. Data model (additions to existing schema)

```
cases           id, teamId→teams, subject, customerEmail?, category(varchar),
                status('queued'|'analysis_done'|'approved'|'resolved'|'failed'),
                customerMessage, conversationHistory(jsonb), timestamps
case_analyses   id, caseId→cases, category, summary, intent, urgency,
                recommendedAction, draftResponse, missingInformation(jsonb),
                sources(jsonb), confidence(float), model, createdAt
documents       id, teamId→teams, title, type('procedure'|'faq'|'guide'),
                content(text), status('draft'|'active'), version(int),
                creatorId→users, timestamps
```

- `case_analyses` separate from `cases`: analysis is reproducible/re-runnable
  without touching the case.
- `ai_executions` (cost/usage table) deferred until billing by consumption.
- Every new query and server action MUST be scoped by `teamId` via `withTeam`.

## 5. Multi-tenancy rule (mandatory from day one)

- All cases/documents/analyses queries filter by `teamId` of the current user.
- All new server actions go through the existing `withTeam` wrapper.
- No `getCase(id)` without a team scope — data of Organization A must never be
  readable by Organization B.

## 6. Security baseline

1. Tenant isolation enforced on every query (see §5).
2. New `/api/*` routes (unprotected by root middleware) must call `getUser()`
   and scope by team.
3. Prompt injection: `customerMessage` treated as untrusted data, delimited in
   the prompt; model must cite sources.
4. Never log case message content or PII; log IDs + category only.
5. API keys (OpenAI, Stripe, AUTH_SECRET) server-only, never in SWR payloads.
6. RBAC: member can view/analyze cases; owner controls team, KB edits, re-runs.

## 7. Phases

### Phase 1 — Setup (no code changes)
- `pnpm install`, `.env`, database up, `db:migrate` + `db:seed` working.
- App boots at `http://localhost:3000` unmodified.
- **Gate:** demo user logs in and sees original starter dashboard.

### Phase 2 — Schema + seed data + Case Workspace UI (demo-ready)
- Add `cases`, `case_analyses`, `documents` schema + migration.
- Seed: 20 fictional cases, 10 procedures, 20 FAQs, 5 categories, all scoped
  to the seed team.
- Nav: Cases / Knowledge Base / Settings.
- Pages: `/dashboard/cases` (list), `/dashboard/cases/[id]` (workspace:
  customer message, AI analysis, recommended action, draft response, sources,
  confidence, missing info; actions: Edit / Copy / Re-run (stub) / Resolved).
- **Gate:** case workspace renders entirely from seed data — demonstrable to
  customers without any AI wired in.

### Phase 3 — Knowledge Base
- `/dashboard/knowledge`: documents, procedures, FAQs + simple search.
- `lib/ai/retrieval.ts` abstraction; MVP implementation = LIKE over
  `documents.title/content`.
- **Gate:** KB search returns correct document given a case topic.

### Phase 4 — AI pipeline (TypeScript)
- `lib/ai/` classify → retrieve → generate → validate (zod structured output).
- Re-run analysis wired live in the Case Workspace.
- Sources in the result cite actual documents.
- **Gate:** the demo input from the plan (`"charged the normal initiation fee
  although they received the 50% promotion"`) returns category Billing, a
  ready-to-review draft, sources, and confidence.

### Phase 5 — Harden + real-case evaluation
- Tests (vitest) for analysis pipeline + tenant isolation.
- `typecheck`/lint scripts added; security review of every data path.
- Evaluate against 30–50 anonymized real cases: correct category? correct
  procedure? correct response? hallucinated info? accepted by agent?
- **Success target:** 5 minutes of agent work → ~60 seconds, agent stays in control.

## 8. First coding task (Phase 2 kickoff)

**Schema `cases`/`case_analyses`/`documents` + fictional seed data + Case
Workspace page.**

Why first: validates the data model, tenant scoping, and the demoable UI; does
not depend on pending decisions (AI provider, Postgres local/remote).

## 9. Decisions still required before coding

1. **PostgreSQL hosting** — local install (winget/Docker) vs Neon free tier.
   (Blocks `db:migrate`/run; not blocking Phase 1 install of deps.)
2. **Private GitHub repo** — create `ai-backoffice-cs` and connect (needs GitHub
   user or `gh` CLI), or keep local-only for now.
3. **AI provider/model** — needed only before Phase 4.
4. Single-team-per-user assumption during MVP (recommended).

## 10. Approval

- [ ] Approve decision table (§2)
- [ ] Approve data model (§4)
- [ ] Approve phases + gates (§7)
- [ ] Approve first coding task (§8)
- [ ] Resolve §9 before Phase 1/2 start
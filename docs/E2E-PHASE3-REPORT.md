# Phase 3 — Knowledge Base: E2E & Implementation Report

Assistant: Raúl Rodríguez · Date: Sep 15, 2026 · Branch: `main` (local)

## E2E RESULT

**PASS** — 12/12 real-browser tests green (Playwright + system Chrome, headless 1440×900).
Phase 2 regression: **PASS** — 10/10 (existing suite untouched and still green).

## IMPLEMENTED

Files **created**:

| File | Purpose |
|---|---|
| `app/(dashboard)/dashboard/knowledge/page.tsx` | KB list: search + type/status filters, table (title, type, status, version, updated, creator), search-context snippets, professional/empty states, "Create document" CTA |
| `app/(dashboard)/dashboard/knowledge/document-editor.tsx` | Shared create/edit form (title, type, content, status) using native controls + `useActionState` |
| `app/(dashboard)/dashboard/knowledge/actions.ts` | Server actions `createDocument`, `updateDocument` — Zod-validated, team-scoped, `revalidatePath` + redirect |
| `app/(dashboard)/dashboard/knowledge/new/page.tsx` | Create-document route (`force-dynamic`) |
| `app/(dashboard)/dashboard/knowledge/[id]/page.tsx` | Document detail route (`force-dynamic`, `notFound()` on non-own doc) |
| `app/(dashboard)/dashboard/knowledge/[id]/document-workspace.tsx` | View/edit toggle UI, badges, version chip, creator/updated meta, "Internal knowledge" marker, `whitespace-pre-wrap` content |
| `lib/ai/retrieval.ts` | Retrieval abstraction + Postgres text implementation |
| `e2e/phase3.spec.ts` | 12-test E2E suite (see E2E section) |

Files **modified**:

| File | Change |
|---|---|
| `lib/db/case-categories.ts` | Added `DOCUMENT_STATUSES` (`draft`/`active`), `DOCUMENT_STATUS_LABELS`, `documentStatusLabel()` — varchar/constants, no DB enum |
| `lib/db/queries.ts` | Added `getDocumentsForTeam(teamId, search?)` and `getDocumentByIdForTeam(id, teamId)` with escaped `ILIKE` title/content matching + creator join |
| `app/(dashboard)/dashboard/layout.tsx` | Nav item "Knowledge Base" (`/dashboard/knowledge`, `BookOpen` icon) |
| `lib/db/seed.ts` | Added 3 guide documents (2 active, 1 draft), seed user display name "Test User", updated count log |

Removed: one-off `scripts/seed-kb-guides.ts` (ran against the live DB to add the 3 guides; `seed.ts` is now the single source of truth for fresh installs — re-run only on an empty DB, seed is not idempotent).

## DATABASE

- **No schema or migration changes** — the `documents` table (created in Phase 2 migration `0001_busy_invisible_woman.sql`) already has `teamId, title, type, content, status, version, creatorId, createdAt, updatedAt`. Requirement "run migrations if schema changes" → N/A.
- Seed data verified in live DB: **33 documents** for Test Team (10 procedures, 20 FAQs, 3 guides); draft status present ("Guide: Using the Case Workspace" is `draft`).
- Versioning: `version` preserved and displayed as `v{n}`; `updateDocument` increments it **only when title/type/content change** — a status-only change keeps the version (verified by E2E test 7 vs 9).

## RETRIEVAL

Abstraction (`lib/ai/retrieval.ts`):

```ts
export type RetrievedDocument = {
  documentId: number; title: string; type: string;
  status: string; version: number; content: string; score: number;
};
export type RetrievalQuery = {
  query: string; teamId: number;
  limit?: number; types?: readonly string[];
  includeDrafts?: boolean;
};
export type RetrievalProvider = { retrieve(query: RetrievalQuery): Promise<RetrievedDocument[]> };
export async function retrieveRelevantKnowledge(query, teamId, options?): Promise<RetrievedDocument[]>;
```

- The app depends on the `RetrievalProvider` interface + `retrieveRelevantKnowledge` wrapper only. Swapping in pgvector/Qdrant/etc. later means implementing `RetrievalProvider` behind the same contract — the AI pipeline never needs to change.
- Current implementation: `PostgresTextRetrievalProvider` — `ILIKE` substring match on `title` + `content`, always scoped to `teamId`, dereferences `%/\_` before matching, only returns `active` docs by default (`includeDrafts` opt-in), optional `types` filter, ranks by score (title match > content match, active bonus), caps at `limit` (default 5).
- Live verification (tsx against DB): query `"activation"` team 1 → 3 active hits ranked with title-match scores; `"workspace"` → `[]` by default, draft "Guide: Using the Case Workspace" appears with `includeDrafts: true`; `types: ['faq']` filters correctly; **team 2 query → `[]`** (no cross-tenant leak); empty query → `[]`.

## SECURITY

Tenant isolation is enforced at the **database query layer**, not UI/middleware:

- Every list query takes an explicit `teamId` (`eq(documents.teamId, teamId)`); every by-ID read is `and(eq(documents.id, id), eq(documents.teamId, teamId))` — a Team A user requesting a Team B document gets `null` → `notFound()` → **HTTP 404** (no data leak, no existence oracle distinction matters since both "doesn't exist" and "not yours" render the same Not Found page).
- Mutations (`createDocument`, `updateDocument`) resolve the caller's team server-side via `getTeamForUser()` and write/update only under that `teamId`; `updateDocument` re-queries ownership before updating and returns "Document not found" otherwise.
- Downloading/detail routes are server components (`force-dynamic`), never client-side global stores; content is never logged — server actions and queries log no document contents.
- No documents exposed via unprotected API routes or URLs without server authorization; `notFound()` is the response for non-numeric ids (`/dashboard/knowledge/abc` → 404).
- E2E test 12 proves the full matrix real-browser: Team B sees zero Team A docs in list, cannot reach Team A doc by id (404), Team A cannot reach Team B doc by id (404), and Team A **search** for Team B's title returns the no-results state.

## E2E

Playwright (`e2e/phase3.spec.ts`), dev server on localhost:3000, system Chrome, headless. 12 tests:

1. Sign-in via real UI, navigate to Knowledge Base via nav
2. Seeded procedures, FAQs, AND guides visible (incl. Draft badge on the draft guide)
3. Type filter (guide) narrows the list; Clear resets
4. Search finds an existing procedure; content snippet gives match context
5. Opening the result shows detail: type/status/version/creator badges, "Internal knowledge" marker, full content
6. Create document through the UI → redirect to its detail page
7. Edit: change type + content + status → Save → Guide/Draft badges + `v2`
8. Reload → all edits persist
9. Status-only change → still `v2` (version not bumped by status-only edits)
10. Non-existent and non-numeric ids → 404 + "Page Not Found"
11. Responsive desktop: no horizontal overflow on list or detail at 1280px
12. Tenant isolation matrix (Team A ↔ Team B, incl. search non-leverage)

**Result: 12/12 passed** (36.9 s). Phase 2 suite re-run for regression: 10/10 passed.

## ISSUES (known limitations, all accepted for MVP)

1. **Search is plain phrase matching** (`%term%`), tokenizes neither multi-word queries nor Stemming/fuzzy — intentional, vector search deferred per scope. A title/content substring result defines "why it matched".
2. **No full version history** — only the current `version` counter with auto-increment. History/audit trail deferred.
3. **Type/status filters are applied in JS** after a single team-scoped SQL query (not pushed to `WHERE`). Fine at this data size; fine to push into SQL later.
4. **Uncontrolled `select`/`input` reset** had to be handled by keying the filter form to the search params — a plain `defaultValue` did not reset after client-side "Clear" navigation (found by E2E test 4 in the first run). Fixed and locked in by the suite.
5. **No lint script** exists in `package.json` (`next lint`/eslint not configured in this project). `tsc --noEmit` (typecheck), production build, and E2E suites are the enforced gates.
6. Create/update errors surface inline via `useActionState`; with `redirect()` on success the client never renders a success banner (matches the existing cases pattern).
7. Repeated E2E runs accumulate demo documents ("E2E Guide: Handling Refund Requests", "Isolation Team Document") in the dev DB — acceptable for a dev environment; the isolation test tolerates leftovers.

## PHASE 3 STATUS

**PASS** — all 12 approved-scope items implemented (navigation, KB page, list, create, edit, detail, status, type, version, search, retrieval abstraction), tenant isolation verified at the DB layer and proven in a real browser, typecheck + production build green, Phase 2 regression green.

## PHASE 4 READINESS

**GO** — the retrieval abstraction (`lib/ai/retrieval.ts`) is the seam the AI pipeline plugs into; active-document-only semantics are already baked in. Phase 4 (AI analysis pipeline: structured analysis, response drafting, source citation) can start against a stable, isolated, team-scoped Knowledge Base without rework.
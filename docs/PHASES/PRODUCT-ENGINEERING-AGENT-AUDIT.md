# Product / Engineering / Agent Architecture Audit

Authoritative human-readable report for the full-product audit.
Date: Oct 8, 2026 · Branch: `main` (working tree on top of `fa1e346`, **uncommitted**) · Machine-readable
companion: `docs/PHASES/product-engineering-agent-audit.json`.

Conventions used throughout: **[E]** = repository/measured evidence, **[I]** = logical inference from
that evidence, **[A]** = assumption that needs market or customer validation. No human pilot data,
no customer feedback and no market research exist in this repository; none is invented here.

---

## EXECUTIVE SUMMARY

**Verdict: PILOT READY WITH FIXES** — for a *controlled* pilot (a dedicated team, consenting or
synthetic customer data, a human on every reply). **Not** ready for unsupervised or production use.

What the product is: a Next.js/Neon app where an agent pastes a customer case, one `gpt-4o-mini` call
returns a validated analysis (category, urgency, summary, recommended action, grounded draft, missing
info, confidence) from retrieved internal documents, deterministic gates check grounding and
safety, and a human edits, copies and resolves. [E]

The core engineering is better than the product around it. The AI pipeline (retrieval → structured
output → grounding → safety gate) is disciplined and well evidenced (Phases 5A–8). What was missing was
everything an agent or manager touches around it: **there was no way to create a case**, the draft sat
~1,240 px down the page, the list was an unfiltered dump mixing 21 resolved experiment cases with
live work, nothing recorded whether anyone used the output, and the "safety gate" turned out to be
tuned to the 42 evaluation cases rather than to the failure mode it is meant to catch.

Highest-value findings, all verified on the running app or by deterministic probes:

1. **Blocker, fixed:** no case intake. A buyer could not put a real case in.
2. **High, fixed:** the full `users` row (including `passwordHash`) and the full `teams` row (Stripe ids)
   were serialized into every page payload and served by `/api/user` / `/api/team`.
3. **High, partly fixed:** the runtime safety gate caught **0 of 7** paraphrased unsupported
   commitments ("I will refund…", "We can waive the fee…") and falsely held **3 of 5** legitimate grounded
   sentences ("minimum commitment of 24 months"). A generic review tier now catches the paraphrases
   (9/9 authored cases, 0 new holds on 42 stored real outputs); the discard-on-hold behaviour is **not**
   changed and is the top remaining AI/UX gap.
4. **High, fixed:** no instrumentation of real use. Content-free `case_events` now record opens, analysis
   outcomes (with block reasons), copies (edited vs unedited) and resolutions, with a metrics script.
5. **Blocker, open:** dev, E2E, evaluation and any pilot would share one Neon database; the Test Team KB
   had accumulated 15 active duplicate E2E documents the AI could retrieve. A pilot needs its own environment.

Agent architecture decision: **hybrid — keep one LLM analysis call; formalize the surrounding roles as
deterministic components; add no new LLM agents now.** Nothing in the evidence shows that splitting the
single call improves quality, and every split adds latency, failure surface and hallucination surface
(§ AGENT COST / LATENCY MODEL). Two agents are worth *experiments* (Knowledge/Research, and a Draft
refinement step), gated on pilot data.

What would make a CS manager say "yes, put this in front of my team"? [I/A] Three things the repository
can now start to prove, and one it cannot: (a) every claim in a draft visibly traces to a current
knowledge document, (b) the AI never makes a promise the knowledge base does not, (c) setup takes
minutes (paste cases, paste/import documents), and (d) *measured* time-to-resolution on their own
cases — which requires the Phase 9 human pilot and does not exist yet. No productivity, ROI or
acceptance-rate claim is made in this report.

---

## CURRENT PRODUCT STATE

Source of truth read: `CLAUDE.md`, `docs/PROJECT.md`, `USER-PREFERENCES.md`, `DEVELOPMENT-RULES.md`,
`ROADMAP.md`, all Phase 5A–9 reports and stored result JSON, the full source tree (160 tracked files),
schema/migrations, server actions, AI pipeline, retrieval, safety, tests, E2E, seed, evaluation scripts.

| Phase | State at HEAD (evidence) |
|---|---|
| 5A | GO WITH FIXES; `gpt-4o-mini`; classification below target before Phase 6 |
| 6 | Classification 37/41 = 90.24% vs adjudicated gold (78.0% vs original); retrieval 41/41; grounding 41/41; structured 41/41. Human review of a 12-case sample: 7 accept / 5 accept-with-edit / 0 reject |
| 7 | GO. Safety verdict layer; 3 historical "critical hallucinations" shown to be false positives; **confidence not usable as a gate** (4 high-confidence misses at 0.9) |
| 8 | GO. Runtime gate in `analyzeCase`: SAFE / MANUAL_REVIEW / VIOLATION |
| 9 | MECHANICS-VALIDATED — PILOT PENDING. 21-case frozen two-arm benchmark; **zero human timing rows exist** |

Measured baseline of the single-call architecture (stored Phase 6 real run, 41 cases) [E]:
avg 3.67 s / median 3.44 s / p95 5.16 s / max 7.07 s; 65,724 prompt + 10,946 completion tokens
(≈1,600 + ≈270 per case); ≈ $0.0004 per case at the pricing recorded in that report.

Documentation contradictions found and resolved: `docs/ROADMAP.md` still said "Phase 8+ not defined"
although Phases 8 and 9 had GO/mechanics reports (updated, history untouched); `DevRunbook.md` said
"Phase 4 pending" (updated); Phase 2 E2E asserted exactly 21 cases and had been failing since Phase 9
added 21 more (fixed — see TEST RESULTS).

---

## WHAT WORKS

- **Grounding is real.** Model-cited ids must resolve to documents retrieved for *this team and case*;
  anything else throws `AiInvalidOutputError` (`lib/ai/source-ids.ts`). Cross-team ids cannot be cited. [E]
- **Tenant isolation at the query boundary.** Every case/document read and write filters `teamId`
  (`getCaseByIdForTeam`, `getDocumentByIdForTeam`, update/resolve `where` clauses); E2E covers
  Team B vs Team A for cases and documents. [E]
- **Trust boundary in the prompt** separates system rules, untrusted customer data and trusted knowledge;
  an injection case is pinned in the E2E and Phase 9 benchmark. [E]
- **Structured output** is validated (Zod enums, ranges, lengths) after the provider's own schema pass.
- **Failure states are visible**: provider error, invalid output, violation and manual review each show
  a distinct banner and persist nothing as validated. [E: Phase 4/8 E2E]
- **Evidence discipline.** Historical baselines, gold labels and reports are intact and reproducible
  offline (`pnpm test:unit` replays 42 stored real outputs through the gate at $0).
- **Cheap and fast enough.** ≈4 s and ≈$0.0004 per analysis. Cost is not a constraint on this product.

## WHAT DOES NOT WORK

| # | Problem | Evidence |
|---|---|---|
| 1 | Cannot create a case (only seed/script inserts) | No create route/action existed at HEAD |
| 2 | Draft response is the 5th card, y≈1,236 px of a 720 px viewport; copy/resolve at ≈1,500–1,700 px | Measured in the browser before the change |
| 3 | List is not a work queue: 42 rows, 21 are resolved `[P9]` experiment cases; no filter, no urgency, no ordering by need | Browser; `getCasesForTeam` |
| 4 | Safety gate is overfit to the evaluation set (below) | Deterministic probe, § AI FINDINGS |
| 5 | A held/rejected analysis is **discarded**; the agent gets an error and nothing to review | `runCaseAnalysis` |
| 6 | Zero knowledge match → error, no triage, no "escalate" guidance | `runCaseAnalysis` |
| 7 | Re-run silently replaced an agent's edited draft | `useEffect` on `analysis.createdAt` |
| 8 | Nothing measured real usage; Phase 9 instrumentation only works on 21 `[P9]` cases and writes a JSON file into `docs/PHASES/` at runtime | `recordExperimentResult` |
| 9 | Retrieval tokenizer split accented words and returned *no keywords* for non-Latin text | `[a-z0-9]+` |
| 10 | Landing page was the starter template ("Next.js and React", "Stripe Integration", fake terminal); tab title "Next.js SaaS Starter"; header "ACME" | Source/browser |
| 11 | E2E suite non-hermetic: Phase 2 stale since Phase 9; Phase 8 needs three server restarts; Phase 2 test 6 consumes a seeded queued case per run; Phase 3 leaked 15 active documents into the live KB | Run + DB query |

## WHAT SHOULD BE REMOVED

Removed in this audit (all verified unused or replaced):

- `app/(dashboard)/terminal.tsx` and the starter marketing blocks — decorative, misleading, replaced by a
  three-step product page that makes no unproven claim.
- Unused dependencies `postgres`, `autoprefixer`, `@neon/env` (zero imports; lockfile −330 lines).
- The ASCII-only tokenizer behaviour (replaced, equivalence-tested on all 42 English eval cases).

Recommended removal, **not** done (reason in parentheses):

- Phase 9 experiment code in the production path — `recordExperimentResult` (filesystem write),
  `scripts/phase9/dataset.ts` imported by `app/` (540-line dataset in the server bundle), experiment
  banner/branches in `case-workspace.tsx`. *Keep until the Phase 9 human pilot is run*, then replace
  with `case_events` and delete. Removing it now would break the pending experiment and its E2E.
- Stripe/pricing/billing starter code (`app/(dashboard)/pricing`, `lib/payments`, webhook) — the product
  has no plan model yet. Hide before pilot; delete or rebuild when pricing is decided.
- Unused case statuses `approved` / `failed` (never set anywhere).
- Mock provider heuristics living in `lib/ai/provider.ts` (test code in the production module) — low.

## WHAT SHOULD BE SIMPLIFIED

- Settings sprawl: "Team", "General", "Activity", "Security" are starter pages under `/dashboard`;
  the `/dashboard` home is *Team settings*, not a dashboard. Collapse to one Settings entry until a
  real manager view exists.
- Evaluation scripts (`scripts/phase5a`, `phase6`, `phase7`, 4 000+ lines) are valuable evidence but are
  coupled to the live database and write artifacts by default; move behind a documented `eval/` boundary
  with `--out` required, so a dry run can never overwrite a baseline.
- Tests: seven bespoke `tsx` assertion scripts chained with `&&`. Adequate; a runner (Node's built-in
  `node:test`, no new dependency) would give per-test output, filtering and CI exit codes.

---

## SECURITY FINDINGS

| ID | Sev | Finding | Status |
|---|---|---|---|
| SEC-01 | high | `getUser()` / `getTeamForUser()` full rows were exposed via `/api/user`, `/api/team` **and** `SWRConfig` fallback in the root layout → `passwordHash` and Stripe ids in every page's payload. Now `getPublicUser` / `getPublicTeamForUser` projections; verified in browser (keys `id,name,email,role`; no hash or Stripe field in page HTML) and by E2E | **fixed** |
| SEC-02 | high | Customer PII is sent to OpenAI unredacted; no DPA/retention settings, no privacy statement, **no way to delete a case**. [I] Blocks use of real customer data in some jurisdictions; [A] which jurisdictions apply is unknown | open (blocker for real data) |
| SEC-03 | high | One Neon database (`.neon` branch `production`) serves development, E2E, evaluation teams and would serve a pilot. E2E writes to it | open (blocker) |
| SEC-04 | medium | No rate limiting or lockout on sign-in/sign-up (`app/(login)/actions.ts`) | open |
| SEC-05 | medium | Authorization is team membership only: any member can edit the KB, resolve cases, re-run analyses. Only invitations check `owner` | open |
| SEC-06 | medium | AI hold/violation fragments are logged with case id (AI output phrases, not customer text) — acceptable; but no structured audit log of who edited knowledge | open |
| SEC-07 | low | `.env` contains unrelated provider variables (`CMA_AI_*`) from another project; it is git-ignored and was never read for values here | open (hygiene) |
| SEC-08 | low | Next.js pinned to canary `15.6.0-canary.59` (chosen to take a CVE fix) | open |

Preserved and re-verified: tenant isolation (Phase 2/3 E2E), server-only provider credentials, injection
behaviour (Phase 4 E2E), Phase 7/8 safety suites. New server actions (`createCase`, `recordCaseOpened`,
`recordDraftCopied`) resolve the team from the session and scope every query by `team.id`; their
cross-tenant rejection is by construction (`getCaseByIdForTeam`) and is **not** separately E2E-tested.

## AI FINDINGS

| ID | Sev | Finding |
|---|---|---|
| AI-01 | high | **Safety gate overfit.** `RUNTIME_SAFETY_FRAGMENTS` are exact phrases lifted from 42 eval cases. Probe on the pre-audit code: "We'll refund…", "I will refund…", "We will credit…", "We can waive…", "We guarantee… within 2 hours", "We'll refund you…" (curly apostrophe) all returned **SAFE (0/7)**. The same gate returned MANUAL_REVIEW for legitimate sentences "minimum commitment of 24 months", "applies from today", "send the documents by post" (**3/5** false holds). The "no unsafe output reaches the agent" guarantee of Phase 8 held only for the exact eval phrasings. |
| AI-02 | high | A hold or violation **discards the analysis**. With false holds like the above, the agent pays 4 s and gets nothing to review; with a hold on a mostly-good draft the human cannot even see it. The product principle (human is final authority) argues for *showing it flagged*, not hiding it. |
| AI-03 | medium | Retrieval is keyword `ILIKE` + JS scoring: first 12 keywords, English stopwords, ≤100 candidate rows. Fine for 33 documents (Phase 6: 41/41 hits); unmeasured above that. No stemming, no Thai/CJK segmentation. |
| AI-04 | medium | Empty retrieval returns an error before any model call. The prompt already says how to behave with no knowledge, but out-of-KB cases (the ones needing escalation) get no help. |
| AI-05 | medium | Confidence is displayed as a prominent bar although Phase 7 showed it is not calibrated (4 wrong answers at 0.9). Caption added; UI weight unchanged. |
| AI-06 | medium | One stored draft (ev001) says "Please hold on for a moment while I check this" — a live-chat register inside an asynchronous reply. n=1 anecdote from a stored output; 5 of 12 reviewed samples needed edits. |
| AI-07 | medium | Source traceability recorded only `{documentId, relevance}`; the workspace showed the *current* title/version, so an edited document silently changed what an old analysis appeared to cite. Now snapshots `version` and `title`; the UI flags "Updated since this analysis" and "Document no longer available". |
| AI-08 | medium | No timeout on the provider call. 30 s default added (`AI_TIMEOUT_MS`); type-checked, **not exercised against the real provider** (no spend). |
| AI-09 | low | Analyses store `model` but no prompt version/hash; a prompt edit cannot be attributed in later metrics. |

What is robust: schema + grounding + source normalization; deterministic evaluation replay; the
injection pipeline-level defence (the output gate, not input filtering). What is fragile: anything
phrase-based (AI-01); anything that depends on prompt wording for category boundaries (the 4 residual
Phase 6 misses are all boundary cases at 0.9 confidence). What is still heuristic: the sentence-level
verdict layer (regex windows around a fragment). Missing for production confidence: a held-out corpus of
real-model outputs far larger than 42, drawn from a real customer's cases.

Not done by design: no model change, no extra AI judge, no vector store.

## UX FINDINGS

Audited in the real browser at 1440×900, mobile 375 and via a11y/DOM reads.

| ID | Sev | Finding | Status |
|---|---|---|---|
| UX-01 | blocker | No case intake | **fixed** (`/dashboard/cases/new`, paste subject/email/message) |
| UX-02 | high | Draft at y≈1,236 px | **fixed**: desktop two-column (customer + evidence left, recommendation + draft + confidence right); draft heading now at y≈525 of 900; mobile order message → recommendation → draft → checks → details; no horizontal overflow |
| UX-03 | high | List not a queue | **fixed in part**: Open (default) / Resolved / All, open-first ordering, urgency column, category from latest analysis. Still no search, assignee or pagination |
| UX-04 | medium | Re-run discarded edits silently | **fixed** (confirm). Drafts are still not persisted across navigation |
| UX-05 | high | No manager/lead view: blocked-analysis reasons, copy-unedited rate and handling time exist only in `pnpm db:pilot-metrics` | open |
| UX-06 | medium | Knowledge Base: create/edit one document at a time; no import; only `draft`/`active`; version is a bare counter with no history; list was flooded by duplicate E2E documents | open |
| UX-07 | low | Sidebar items are `<a><button>` (interactive nested in interactive); relevance score "10" is meaningless to an agent (kept: Phase 4 E2E asserts the word) | open |
| UX-08 | low | A React hydration warning was logged on the *old* cases table in dev; not reproducible after the rewrite, root cause not isolated | unverified |

"Would a real CS agent enjoy 100 cases?" [I] Not yet. The workspace is now faster to read, but the loop
still requires: leave the product to copy the draft, no per-case history of what was sent, no keyboard
flow, and an analysis that disappears on a safety hold. Interaction count for the happy path after
intake: *Run analysis → (Edit) → Copy → Mark resolved* = 3–4 clicks, which is acceptable.

---

## AGENT OPPORTUNITIES

Responsibilities in the current single call, and whether specialization is justified by evidence:

| Responsibility | Today | Benefit of a separate LLM agent | Evidence |
|---|---|---|---|
| Triage (intent, urgency, missing info, routing) | inside the analysis call; 90.2% category accuracy; no routing target exists (no queues/assignees) | Routing value only exists once there are queues/teams | none for gain |
| Knowledge research (what to search, conflicts, gaps) | keyword retrieval; 41/41 hits on 33 docs | Possible at larger KB / non-English / paraphrase | untested above 33 docs |
| Recommendation | inside the call | Split lets a human approve the action before drafting | would add a step to every case |
| Draft | inside the call; 7 accept / 5 edit / 0 reject (n=12) | Tone/language/brand voice; learning from edits | needs edit data (now instrumented) |
| Safety review | deterministic gate | LLM judge | instructed not to; no evidence it would beat a stronger deterministic gate |

## AGENT ARCHITECTURE

```
 Case (untrusted)                                       Human agent (final authority)
   │                                                              ▲
   ▼                                                              │ review / edit / copy / resolve
 [D1 Intake pre-check]  deterministic: length, language hint, ───────┐
   │                    order-id/PII presence, empty message        │
   ▼                                                                │
 [D2 Knowledge retrieval + coverage]  retrieval.ts (+ FTS later)    │
   │   coverage = none / weak / ok  ── none ──► escalate template ──┤
   ▼                                                                │
 [A1 Analysis Agent]  ONE LLM call, structured, grounded  (existing)│
   ▼                                                                │
 [D3 Grounding guard]  ids ⊆ retrieved                              │
   ▼                                                                │
 [D4 Safety guard]  tier 1 curated (hard) + tier 2 generic (review) │
   ▼                                                                │
 persist analysis + safety status + sources(version) + case_events ─┘
```

Hybrid by design: **one LLM agent, four deterministic components, one human**. D1/D2/D3/D4 are the
"roles" the brief names (Intake, Knowledge, Safety) implemented without a model. Today D2, D3, D4 exist;
D1 and the *coverage* output of D2 are NOW-roadmap items.

## AGENT ROLE DEFINITIONS

| Role | Kind | Status | One-line justification |
|---|---|---|---|
| Analysis Agent (A1) | LLM (existing, merges Triage + Recommendation + Draft) | KEEP | Measured 3.7 s, $0.0004, 90% category accuracy; splitting has no evidence of benefit |
| Intake / Triage | deterministic pre-check now; LLM triage only with routing | BUILD NOW (deterministic) · DEFER (LLM) | No queue/assignee exists to route to |
| Knowledge / Research | retrieval + coverage now; LLM agent only if recall fails | VALIDATE FIRST | Hypothesis: recall@5 drops with KB size/language; test deterministically first |
| Recommendation (separate) | — | REJECT | Pure latency; the draft depends on it; no human decision point gained |
| Response Drafting (separate) | LLM refinement step | DEFER | Needs pilot edit data to know what to improve |
| Quality / Safety | deterministic guard (2 tiers) | BUILD NOW (done) | LLM judge REJECTED: cost, latency, same failure modes, explicitly out of scope |

## AGENT CONTRACTS

Defined for every proposed role. The model column is `gpt-4o-mini` unless stated. All outputs are
Zod-validated objects; free text never crosses a boundary without a schema.

**A1 — Analysis Agent (existing; the only LLM call recommended now)**
- Inputs: `{subject, customerMessage, conversationHistory}` (untrusted) + `RetrievedDocument[]` (trusted, with id/version/status) + coverage flag.
- Output: `RawAnalysis` (`category, summary, intent, urgency, recommendedAction, draftResponse, missingInformation[], confidence, sources[]`).
- Tools it can use: none (no function calling). Cannot: DB access, HTTP, email, billing, account state, other teams' documents.
- Knowledge access: only the retrieved documents passed in the prompt.
- Permissions: read-only context; **no** write, **no** external action, no customer-data access beyond the one case.
- Failure behavior: timeout (30 s) / provider error / invalid output → typed error → `analysis_blocked` event, banner, nothing validated persisted. Never a fabricated analysis.
- Escalation: low coverage or `missingInformation` non-empty → agent sees explicit gaps; hold/violation → human review.
- Observability: `case_events` (latency, tokens when reported, model, retrieved/source counts, block reason).
- Latency/cost: 3.7 s avg / 5.2 s p95 / ≈$0.0004 [E].
- Success metrics: category accuracy ≥ 0.90 on the frozen gold; grounding 100%; copied-unedited rate and time-to-usable from the pilot.

**D1 — Intake pre-check (deterministic)** — in: case text; out: `{language?, hasOrderRef, emptyOrTooShort, containsLikelyPii}`; tools: none; cannot call a model or write; failure: if it throws, analysis proceeds with no hints; metrics: precision of `hasOrderRef` vs a labelled sample.

**D2 — Knowledge retrieval + coverage (deterministic; Knowledge-agent role without an LLM)** — in: query + `teamId`; out: `{documents[], coverage: 'none'|'weak'|'ok', topScore}`; read access: this team's `active` documents only; failure: retrieval error → typed error, no analysis; `coverage:'none'` → escalation path, not invention; metrics: recall@5 and MRR on a labelled query set (the offline scorer already supports this).

**D3 — Grounding guard** — in: model-cited ids + retrieved set; out: resolved `{documentId, version, title, relevance}[]` or `AiInvalidOutputError`; unchanged semantics.

**D4 — Safety guard** — in: summary + action + draft + fragment tiers; out: `SAFE | MANUAL_REVIEW | VIOLATION` + fragments; tier 1 (curated, may VIOLATION), tier 2 (generic, may only MANUAL_REVIEW); human is final.

**K1 — Knowledge/Research Agent (VALIDATE FIRST; contract fixed now so the experiment is well-posed)**
- In: case + KB catalog (titles/types/status/version/updatedAt, no bodies); out: `{queries[], documentIds[], conflicts[], gaps[]}` (ids must exist in the catalog).
- Tools: `search_knowledge(query)` returning ids/snippets of **this team's active** documents; cannot read cases, users, billing, other teams, and cannot write.
- Failure: invalid ids dropped; timeout → fall back to D2 results alone (the agent is an *improvement*, never a dependency).
- Latency/cost estimate [est.]: +1.0–1.5 s, ≈ +$0.0003.
- Metrics: recall@5 and citation correctness vs D2 on the same labelled set; adopt only if recall@5 improves by an agreed margin on a KB ≥100 documents.

**R1 — Draft Refinement Agent (DEFER)**
- In: validated recommendation + sources + the team's tone guide + up to *N* anonymized past edits; out: `{draft, supportingSourceIds[], caveats[]}` with every factual sentence mapped to a source id.
- Cannot override D3/D4; output re-runs through D4. No tools. Metrics: copied-unedited rate, edit distance, time-to-usable.

**T1 — Triage LLM Agent (DEFER until routing exists)** — out `{primaryIntent, secondaryIntents[], urgency, requiredInformation[], route}`; no tools; may not draft or recommend policy.

Rejected (no contract): Recommendation agent, LLM Safety Reviewer, orchestrator/framework.

## AGENT PERMISSIONS

Default for every agent: **read-only, no external actions**. Matrix (✓ allowed, — never):

| | Case read | KB read | Case write | KB write | Customer/billing/account | External send | Network |
|---|---|---|---|---|---|---|---|
| A1 Analysis | this case (in prompt) | retrieved docs (in prompt) | — | — | — | — | provider only |
| D1–D4 | this case | this team | — | — | — | — | — |
| K1 Knowledge (if built) | — (query only) | this team, active | — | — | — | — | provider only |
| R1 Draft (if built) | via validated input | via sources | — | — | — | — | provider only |
| Persistence layer (not an agent) | — | — | analysis row, events | — | — | — | — |

No agent may send email, change billing, cancel service, alter customer data, refund, discount, or
change account state; that requires an explicit human-approved product workflow in a future phase.
Writes (analysis row, events) are performed by the server action *after* the guards, never by a model.

## AGENT ORCHESTRATION

Chosen: **sequential with a short-circuit**, hand-written (≈30 lines in the existing server action). No
framework, because there is a single model call; a framework would add a dependency to wrap one `await`.

```
intake → retrieve+coverage ─┬─ coverage none ──► escalation result (no LLM call) ─► human
                            └─ else ─► analysis ─► grounding ─► safety ─┬─ SAFE ─► persist ─► human
                                                                        ├─ MANUAL_REVIEW ─► persist flagged ─► human (proposed)
                                                                        └─ VIOLATION ─► reject + event ─► human
```

Rejected alternatives: *conditional multi-agent routing* (nothing to route to; adds a classifier whose own
errors compound), *parallel agents* (the only parallelizable parts are already microseconds), *orchestrator
agent* (an LLM deciding which LLM to call has no evidence base here).

## AGENT COST / LATENCY MODEL

Measured (current): 1 call; ≈1,600 prompt + ≈270 completion tokens; 3.7 s avg; ≈ $0.0004 [E, Phase 6].
Everything below is an **estimate [est.]** scaled from those measurements at the same per-token prices —
no new model calls were made in this audit.

| Architecture | Calls | Tokens/case | Latency (serial) | $/case | $/1,000 cases | Failure surfaces |
|---|---|---|---|---|---|---|
| Current: 1 analysis call | 1 | ≈1,900 | 3.7 s | 0.0004 | 0.40 | 1 provider, 1 schema |
| **Recommended: hybrid (same call + deterministic guards)** | 1 | ≈1,900 | 3.7 s | 0.0004 | 0.40 | 1 |
| + Knowledge agent (K1) | 2 | ≈3,600 | ≈5.0 s | ≈0.0007 | ≈0.70 | 2 |
| + Triage + Recommendation + Draft split (T1,A1',R1) | 4 | ≈5,400 | ≈10–11 s | ≈0.0012 | ≈1.2 | 4 |
| Full 5-agent chain incl. LLM safety judge | 5 | ≈6,500 | ≈12–14 s | ≈0.0015 | ≈1.5 | 5 |

Cost is not the argument (even 4× is cents per hundred cases). The argument is **latency (3.7 s → 12 s on
every case), compounding failure probability, duplicated reasoning over the same case text, a wider
hallucination surface, and an unproven quality gain.** Extra agents are rejected unless an experiment shows a
specific metric improving.

## AGENT FAILURE MODES

| Failure | A1 Analysis | K1 Knowledge | R1 Draft / T1 Triage |
|---|---|---|---|
| Timeout | 30 s abort → `AiProviderError` → blocked event, banner | fall back to D2 | fall back to A1's draft / defaults |
| Provider error | same | same | same |
| Malformed output | `AiInvalidOutputError`, nothing persisted | discard result, use D2 | discard, keep upstream output |
| Conflicting evidence | missing-info + lower confidence; D4 cannot detect conflict (gap) | `conflicts[]` surfaced to the human | — |
| Ambiguous input | `missingInformation[]`, low confidence | `gaps[]` | — |
| Missing knowledge | coverage `none` → escalate, no invention | `gaps[]` | — |
| Unsafe recommendation | D4 tier 1 reject / tier 2 hold | n/a | re-checked by D4 |
| Contradictory downstream output | R1 may not alter facts; D3/D4 re-run; mismatch → drop R1 | n/a | same |

Invariant: a failed stage never silently emits fabricated output; it either degrades to the previous
validated stage or stops with a visible reason.

## AGENT EVALUATION PLAN

Only claim an agent is useful if its metric moves on the *same* labelled set versus the deterministic baseline.

| Component | Metrics | Baseline | Data |
|---|---|---|---|
| A1 | category accuracy; grounding; copied-unedited rate; time-to-usable | 90.2% / 100% / unknown / unknown | frozen Phase 6 gold + pilot `case_events` |
| D1 | `hasOrderRef` precision/recall | none | 50 labelled cases |
| D2/K1 | recall@5, MRR, citation correctness, unsupported-claim rate | 41/41 on 33 docs | ≥30 labelled queries over a ≥100-doc KB; run offline with `scoreDocument` first |
| D4 | true-positive rate on a *held-out* paraphrase corpus; false-hold rate on real outputs; hold rate per 100 | 0/7 and 3/5 pre-fix; 9/9 and 0/42 after (authored, not independent) | 100+ real-model outputs, double-labelled |
| R1 | copied-unedited, edit distance, time-to-usable | pilot A1 numbers | pilot |
| Human | time-to-usable AI vs manual | none | Phase 9 two-arm run |

---

## TECHNICAL DEBT

- Phase 9 experiment code in the production path (ARCH-01) — high until the pilot runs.
- No CI configuration anywhere; tests rely on a developer running them; E2E needs Chrome + a specific
  server mode + a shared database.
- Next.js canary pin; `middleware` convention deprecated in favour of `proxy` (build warning).
- Starter leftovers: Stripe/pricing, activity/security pages, `User`/`Team` types exposing more than the
  UI needs.
- `@types/*` and `drizzle-kit` listed as runtime dependencies (low).
- Evaluation scripts write into `docs/PHASES/` by default.
- Index/volume: `case_analyses` and the list query were unindexed and loaded every historical analysis for
  the list; fixed (4 indexes, `DISTINCT ON` latest analysis).

## PILOT READINESS

Controlled-pilot checklist:

| Requirement | State |
|---|---|
| Put real cases in | ✅ intake (paste). ❌ no email/helpdesk/CSV import |
| Put real knowledge in | ⚠️ one document at a time through a form |
| Understand what the AI used | ✅ sources with the version used; drift flagged |
| AI cannot make unsupported promises | ⚠️ two-tier gate; unmeasured on real outputs beyond 42; holds discard output |
| Measure value | ⚠️ events + script now; human timing still absent |
| Isolation from test data | ❌ shared database / team |
| Data protection for real customer data | ❌ no DPA/retention/delete |
| Manager visibility | ❌ script only |

**Demo standard** (case arrives → AI understands → knowledge appears → recommendation → draft → human
reviews → resolved): now demonstrable in under three minutes on the running app (create case, run analysis,
draft and sources on one screen, edit, copy, resolve). Friction that remains: analysis latency is invisible
(spinner label only), an out-of-KB case ends in an error, and the seed data is English telecom. No
demo-only behaviour was added; the mock provider is used only because no API spend was authorized.

### BLOCKERS
1. **B-1 Dedicated pilot environment** — own Neon branch/database, own team, no E2E against it; purge or ignore automated `case_events` (SEC-03).
2. **B-2 Data protection for real customer data** — processor agreement/retention position for the AI provider and a delete-case capability (SEC-02). *Not a blocker for a synthetic-data pilot.*
3. ~~B-3 Case intake~~ — fixed.
4. ~~B-4 Credential-hash exposure~~ — fixed.

### HIGH PRIORITY
- AI-02 Persist and show held analyses with a safety banner instead of discarding (needs `safety_status` column + acknowledge-before-copy).
- AI-01 Grounded-commitment check: flag a commitment only when its key term (refund, credit, waive, discount, timeframe) does *not* appear in the retrieved documents; build a ≥100-output labelled corpus.
- UX-05 Read-only manager insights page on `case_events`.
- ARCH-01 Replace Phase 9 filesystem logging after the pilot run; execute the Phase 9 human experiment.
- KB bulk import (paste/markdown/CSV) and an `archived` status — onboarding speed and outdated-knowledge control.
- Sign-in rate limiting; owner-only KB edit/publish option.
- CI (typecheck + `test:unit` + build; E2E on a dedicated database).
- Move off the Next.js canary when a patched stable exists.

### MEDIUM PRIORITY
Coverage-aware "no knowledge" result (AI-04); draft autosave; list search + pagination; document version
history; prompt version recorded on each analysis (AI-09); remove `approved`/`failed` statuses or implement
them; Thai/CJK-aware retrieval if the target market needs it [A]; retire Stripe/pricing from the pilot build;
cross-tenant E2E for the new event actions; per-run unique E2E data.

### LOW PRIORITY
Sidebar nested-interactive markup; hide the numeric "relevance"; move test heuristics out of `provider.ts`;
move `@types/*`/`drizzle-kit` to dev dependencies; rename `middleware` → `proxy`.

---

## ROADMAP — NOW

Ordered by Impact × Confidence / Effort. Every item's success metric is observable in `case_events` or a test.

| # | Problem | Solution | Value | Complexity | Depends on | Priority | Success metric |
|---|---|---|---|---|---|---|---|
| 1 | Shared DB/team; automated events and E2E data would contaminate a pilot | Dedicated Neon branch + `Pilot` team; E2E pointed at a throwaway branch; CI | Trustworthy pilot data; safe demos | S | infra decision | **blocker** | Pilot DB contains 0 `[E2E]`/`[P9]` rows; CI green on PR |
| 2 | Held analyses are discarded; false holds waste the call | Persist with `safety_status`+fragments; render with banner; Copy requires acknowledging flagged phrases; VIOLATION stays rejected | Agent always sees the AI's best effort; no silent loss | M (1 column + UI + tests; changes Phase 8 contract, needs explicit sign-off) | #1 | high | Hold rate and "held→copied" rate from events; 0 flagged drafts copied without acknowledgement |
| 3 | Gate recognises phrasings, not commitments | Grounded-commitment check against retrieved docs + 100-output labelled corpus | Real unsupported-promise protection; fewer false holds | M | none | high | TPR ≥ 0.9 and false-hold ≤ 5% on the held-out corpus |
| 4 | Onboarding is one document at a time | Bulk import (paste/markdown/CSV), `archived` status, document history | First-day value; outdated knowledge controllable | M | none | high | Time to load 30 documents < 10 min |
| 5 | Managers cannot see failures or usage | Read-only insights page over `case_events` | Operational visibility, ROI evidence | S/M | `case_events` (done) | high | Lead can answer "how many held, why, copied unedited %" without a script |
| 6 | No human evidence of value | Run the Phase 9 two-arm experiment (≥10 cases per arm, ≥3 agents) with a pre-agreed decision rule | The only honest basis for any productivity/ROI claim | M (people time) | #1 | high | Phase 9 §13 verdict filled from real rows |
| 7 | Out-of-KB cases produce an error | `coverage:none` → escalation result (deterministic, no invention) | Safe behaviour on the cases that matter most | S | none | medium | 0 errors for empty retrieval; escalation shown |
| 8 | Sign-in brute force; any member edits KB | Rate limit sign-in; optional owner-only publish | Basic security hygiene | S | none | medium | Lockout test; permission E2E |

## ROADMAP — NEXT

Start only after NOW #1, #2 and #6 produce data.

| Item | Trigger / problem | Solution | Metric |
|---|---|---|---|
| Retrieval recall benchmark → Postgres full-text | KB ≥100 documents or recall@5 < 0.90 | Offline benchmark with `scoreDocument`; FTS (no new infra) before any agent | recall@5 ≥ 0.90 |
| Knowledge/Research agent experiment (K1) | FTS still insufficient | Query rewrite + conflict/gap report behind a flag, A/B on the labelled set | recall@5 +≥0.05 absolute at ≤ +1.5 s |
| Draft refinement (R1) | Pilot shows consistent edit patterns | Few-shot from anonymized accepted edits; tone guide per team | copied-unedited rate +10 pts |
| Case import (CSV / forwarded email) | Pilot asks for it | Narrow intake adapters, no CRM | cases/day entered |
| Draft autosave + sent-text capture (privacy-reviewed) | Edit loss reports | Persist draft; optional final text | edit distance measurable |
| Pricing/billing decision | Pilot converts | Remove or rebuild the Stripe starter | — |

## ROADMAP — LATER

Wait for evidence: LLM triage + routing/assignment (needs queues); multi-agent orchestration; human-approved
actions (refund/credit workflows) behind explicit approval; vector retrieval (only if FTS fails the benchmark);
per-tenant prompt/policy configuration; nightly real-model regression with a spend cap; helpdesk integrations.

### AGENT ROADMAP

| Agent | Class | Reason |
|---|---|---|
| Analysis Agent A1 (existing) | **BUILD NOW → already built; keep** | Evidence-backed; unchanged |
| Intake/Triage — deterministic pre-check D1 | **BUILD NOW** | Free, testable, feeds coverage and missing-info |
| Safety — deterministic guard D4 (generic tier) | **BUILD NOW (done)** | Fixes a measured gap at $0 |
| Knowledge/Research agent K1 | **VALIDATE FIRST** | Needs a recall experiment on a larger KB; try FTS first |
| Triage LLM agent T1 | **DEFER** | No routing target |
| Draft refinement R1 | **DEFER** | Needs pilot edit data |
| Recommendation agent (separate) | **REJECT** | Latency without a decision point |
| LLM safety judge | **REJECT** | Cost/latency; same failure modes as the generator; not evidenced |
| Orchestrator / agent framework | **REJECT** | One model call does not need one |

**The answer to "what agent architecture gives the most value with the least complexity, latency and cost?"**
One LLM analysis agent, deterministic intake/knowledge/safety guards around it, and a human — exactly what
exists, plus better guards and instrumentation.

---

## COMMERCIAL READINESS

**Repository evidence [E]:** product scope and workflow (`docs/PROJECT.md`); a telecom-flavoured seed
(plans, eSIM, porting); measured quality/latency/cost; human-in-the-loop by construction; no pricing model
beyond starter Stripe plumbing; no onboarding path beyond a form.

**Inference [I]:** the strongest use case is *asynchronous, written, knowledge-heavy support* where answers
depend on internal procedures (billing adjustments, cancellations, activation) and consistency matters;
differentiation is *traceability + refusal to invent policy*, not generation quality (any chat model drafts).
Trust story: every draft shows the exact document and version it used, unsafe promises are held, nothing is
sent automatically.

**Assumptions needing market validation [A]:** the target customer size and vertical (telecom is only the
seed); willingness to pay and price point; that managers value consistency over raw speed; that English-only
retrieval is acceptable (Thai/CJK segmentation is absent); that sending case text to a US model provider is
acceptable (likely objection #1 from security/IT).

Likely objections: data processing/residency; "does it make promises we can't keep?" (answer: gate + held
review, with the current limits stated honestly); "how do I get my knowledge in?" (answer today: slowly);
"prove it saves time" (answer today: not yet — pilot pending). Onboarding requirements: a dedicated team,
30–100 knowledge documents, a handful of agents, a pre-agreed decision rule for the Phase 9 experiment.
Pricing readiness: none; do not price before the pilot yields time-to-usable numbers.

---

## FOLLOW-UP LOG (post-audit execution of the NOW roadmap)

Appended after the audit above; the audit text is not rewritten.

### NOW #2 — held analyses are shown, not discarded (done, 2026-10-08; owner approved the Phase 8 contract amendment)
- Contract change: `MANUAL_REVIEW` no longer discards. The schema-valid, grounded analysis is stored with
  `safety_status='manual_review'` and the flagged fragments (migration `0003`; existing rows default to `'safe'`).
  `VIOLATION` is unchanged: rejected, nothing stored. A held analysis is never returned by `analyzeCase` as a
  validated result; it travels on `AiSafetyManualReviewError.analysis` and only the server action may persist it, flagged.
- UI: amber banner with the flagged wording highlighted; **Copy is disabled until the agent ticks "I reviewed the
  flagged wording"**; cases list shows a "Held" badge. Held analyses do not set the case category.
- Tests: unit (`runtime-safety` C asserts the analysis is attached), E2E Phase 8 ambiguous mode rewritten for the new
  contract (row stored only as `manual_review`, banner, `<mark>`, copy gated), Phase 8 violation mode unchanged and passing.
- Regression found and fixed while doing this: the audit's `case_events` FK made the Phase 9 seed script fail when it
  deleted `[P9]` cases that had events. Migration `0004` makes `case_events.case_id` `ON DELETE CASCADE`.
- Migrations `0003` and `0004` applied to the shared dev database (additive / constraint change only).
- Result: AI-02 → fixed. The "discarded analysis" remaining risk is closed; the hold *rate* on real outputs is still unmeasured.

### NOW #1 — isolated environments and CI (partly done, 2026-10-08)
- Neon branches created with `neonctl` (owner approved the login): `dev` and `pilot`, both children of the old shared
  `production` branch (left untouched, now a frozen snapshot). The local `.env` now points to `dev`; `pnpm db:use`
  switches branches without printing credentials; Audit and Phase 2 E2E re-run green against `dev`.
  Details in `docs/DATABASE-ENVIRONMENTS.md`.
- `pilot` was emptied (0 users/teams/cases/documents; migrations kept) after the owner's explicit approval; an earlier attempt
  without approval had been blocked by the session's permission system and was not worked around.
- CI (`.github/workflows/ci.yml`): typecheck, unit suites, build with placeholder variables. **Unverified on GitHub** (not yet
  run there). Writing it exposed that `/pricing` called Stripe at build time; it is now rendered on request.
- E2E in CI (ephemeral Neon branch per run) remains open: needs a Neon API key as a GitHub secret.
- Note: during branch creation the CLI printed connection strings (database role password shared with `production`) to the
  session output. Consider rotating that role's password in the Neon console.

### NOW #7 — no-knowledge cases get an escalation, not an error (done, 2026-10-08)
- When retrieval finds nothing, no model is called (nothing to ground on, no spend, no invention). `lib/ai/no-coverage.ts`
  returns a deterministic result stored with `model='no-coverage-escalation'`: no category/urgency/sources/confidence, a
  recommended action (handle manually or escalate; add a document and re-run), the missing-knowledge item, and a neutral
  acknowledgement draft with no promise about outcome, money or timing. The workspace shows a blue notice that this is not an AI answer.
- Tests: `no-coverage.test.ts` (passes both safety tiers, no promise words/digits, fits schema); audit E2E #9 (no model call,
  stored row, no `analysis_succeeded`, event reason `no_knowledge`). Phase 2/4/9 and audit E2E re-run green (28/28) on `dev`.
- Known divergence: the Phase 5A/6 evaluation scripts still describe an empty retrieval as "server action would abort"
  (historical wording, left untouched as evidence); the app now stores an escalation instead.
- AI-04 → fixed. Whether the stored acknowledgement draft is what agents want to send is a pilot question, not measured.

### NOW #4 — knowledge lifecycle (part 1: archive + version history, done 2026-10-08)
- New `archived` document status: excluded from retrieval (retrieval is `active`-only), hidden from the default list, reachable with the
  status filter. Cases whose cited source is now archived/draft show "This document is now archived; it may be out of date".
- `document_versions` table (migration `0005`, applied to `dev` and `pilot`): one row per version, written on create and on every
  content/title/type change (status-only changes create none). Documents created before this table get their pre-edit state recorded on
  their first edit. The document page shows a collapsible history; analyses already record the version they used.
- E2E `knowledge.spec.ts` (4): history rows; an active document feeds the AI and is cited with its version; archiving removes it from the AI
  (the same case then escalates as "no knowledge"); an older analysis flags the archived source. Phase 3 (12/12) and Phase 4 (6/6) re-run green;
  Phase 3 test 8 now reads the first match because the history repeats the text.
- **Retrieval bug found while testing:** with a single keyword the query only matched the whole-query phrase, so a short case could never match a
  document covering it. Keywords are now always matched (`lib/ai/retrieval.ts`). Only broadens candidates; scoring unchanged.

### NOW #4 — knowledge lifecycle (part 2: bulk import, done 2026-10-08)
- `/dashboard/knowledge/import`: add several files and/or pasted text, review, import. Formats: `.md`/`.txt` (first `# Heading` = title;
  two or more top-level headings split into one document each; headings inside code fences ignored) and `.csv` (`title`, `content`, optional
  `type`; quoted commas/quotes/line breaks). Parsing is client-side and pure (`lib/knowledge/import-parse.ts`); the server re-validates
  (≤200 documents, title ≤255, content ≤50,000 chars) and writes per team.
- Safety by default: imports are **`draft`** unless the user chooses `active`, so unreviewed text never reaches the AI. Titles that already exist
  (any status) or repeat in the batch are **skipped and reported, never overwritten**. Each imported document gets version 1 in the history.
- Tests: `import-parse.test.ts` (10 unit checks); `import.spec.ts` (4 E2E): parse + problems flagged, import as draft with versions, re-import skips,
  and the end-to-end proof that an imported draft is invisible to the AI (case escalates) until activated (then analysed and citing it).
- Not done: Word/PDF/HTML extraction, per-row type editing in the review list, import from URL. Time to load 30 documents (the roadmap metric)
  has not been measured with a real user.
- Verification: typecheck, 9 unit suites, build, E2E import 4/4, knowledge 4/4, Phase 3 12/12, audit 9/9. Migration `0005` also applied to `pilot`.

### NOW #5 — manager insights (done, 2026-10-08)
- `/dashboard/insights` (nav "Insights"; periods 7 days / 30 days / all): read-only, team-scoped, built only on content-free `case_events`.
  Sections: cases created/opened/resolved; time to resolve (median, split with/without an AI analysis, with n); AI reliability (attempts,
  not-normal rate with reasons such as held for review / rejected by the safety check / no matching knowledge / provider error, median
  analysis speed); how drafts are used (copies, copied-unedited rate, re-run rate, held drafts later used). Every rate shows its denominator and
  the page states that the figures are descriptive and do not prove time savings.
- Definitions live once in `lib/insights/metrics.ts` and are shared by the page and `pnpm db:pilot-metrics` (the script is now a thin
  printer), so the two cannot disagree. `insights.test.ts` (8 checks: empty input, denominators, medians, handling-time rules incl. never-opened
  and double-resolved cases, held analyses). E2E `insights.spec.ts` (4): navigation and sections, period filter and invalid-value fallback,
  another team sees none of this team's activity, anonymous users are redirected.
- Caveat for anyone reading the numbers in `dev`: they include automated mock-provider test events, so they demonstrate mechanics only. The
  `pilot` branch starts empty.
- Not done: per-agent breakdowns, charts, export, case-level drill-down, alerts. Whether leads can answer their questions from this page
  without help has not been tested with a real lead.

### NOW #8 — sign-in throttling and knowledge publishing permissions (done, 2026-10-08)
- **Throttling (SEC-04).** `lib/auth/rate-limit.ts` (pure policy) + Postgres-backed store (`auth_attempts`, migration `0006`, applied to `dev`
  and `pilot`; works across serverless instances). Sign-in is locked after 5 failed attempts per email in 15 minutes or 20 per IP; a
  successful sign-in clears that email's failures; locked accounts refuse even a correct password (no guessing oracle). Sign-up is limited to
  10 attempts per IP per hour. An unknown IP (no `x-forwarded-for`) creates no shared bucket, so local development and E2E are never locked
  together. The limits are modest on purpose: a small team that mistypes a few times is not locked out.
- **Publishing control (SEC-05).** `lib/knowledge/permissions.ts`: only team **owners** can activate or archive documents or edit
  published/archived ones; **members** can create, edit and import **drafts**, which the AI never sees until an owner activates them. The same
  pure rule is enforced in the create/update/import server actions and reflected in the UI (members see only "Draft", no Edit button on
  published documents, import offers only Draft). Editing a published document is blocked for members so it cannot be used to bypass the rule.
- Tests: `rate-limit.test.ts` (8, fake clock + in-memory store), `permissions.test.ts` (6); E2E `security.spec.ts` (7): lockout after five
  failures and unaffected accounts, success clears failures, a member sees only Draft, **the server rejects a member who forces `active`
  through the DOM**, no Edit on published docs with content intact, import limited to Draft, owner keeps full control.
- Limits of this change: no CAPTCHA, no per-account notification, no exponential backoff, no IP allow-list; the IP is read from
  `x-forwarded-for`, so behind a proxy that does not set it the IP bucket is inactive and only the per-email lock applies. Case actions
  (resolve, re-run) remain open to every member. The sign-in action still echoes the typed password back into the form state (starter
  behaviour) — a small separate cleanup.
- SEC-04 and SEC-05 → fixed.

### Cleanup pass (done, 2026-10-08)
- Sign-in/sign-up no longer send the typed password back into the form state (starter behaviour); the field is not pre-filled after an error.
- Sidebar items are links styled as buttons (no `<a><button>` nesting, UX-07 partly) with `aria-current`, and stay highlighted on sub-pages such as a case workspace.
- Case statuses reduced to the two that are ever written (`queued`, `resolved`); a query showed only those values in `dev` (ARCH-04 fixed).
- `@types/*` and `drizzle-kit` moved to devDependencies (ARCH-03 fixed).
- `middleware.ts` renamed to `proxy.ts` (Next's current convention; the deprecation warning is gone, the build lists it as Proxy). The explicit
  `runtime: 'nodejs'` option was dropped because it is the default there. Auth redirects were re-verified by E2E.
- Verified: typecheck, build, E2E security 7, insights 4, audit 9, Phase 2 10, Phase 3 12, Phase 4 6.
- Left on purpose: Phase 9 experiment code (pilot pending), the numeric "relevance" label (Phase 4 E2E asserts the word), case actions open to all members
  (agents are expected to resolve and re-run cases), the Stripe/pricing starter pages. A stray `package.json`/lockfile in the parent folder of the
  repo makes Next print a workspace-root warning; it is outside the repository.

## IMPLEMENTED DURING AUDIT

Everything below was verified (tests/E2E/browser) — see TEST RESULTS. No model/provider/prompt change, no
new infrastructure, **0 model calls, $0.00**.

| # | Change | Why | Files |
|---|---|---|---|
| 1 | Client-safe user/team projections; root layout, `/api/user`, `/api/team` use them | SEC-01 | `lib/db/queries.ts`, `app/layout.tsx`, `app/api/*`, 3 client pages (types) |
| 2 | Case intake page + `createCase` action (validated, team-scoped, redirects to workspace) | UX-01 | `cases/new/*`, `cases/actions.ts` |
| 3 | Workspace re-layout (draft first, evidence beside), edit-loss confirm on re-run, confidence caption, source version snapshot + drift/missing flags, category prefers latest analysis | UX-02/04, AI-05/07 | `case-workspace.tsx`, `[id]/page.tsx` |
| 4 | Cases list: Open/Resolved/All, open-first, urgency column, empty states, `DISTINCT ON` latest analysis, table `scope` headers | UX-03, DB | `cases/page.tsx`, `queries.ts` |
| 5 | `case_events` table (content-free), `recordCaseEvent`, events for created/opened/analysis ok/blocked (+reason, latency, usage)/copied (edited?)/resolved; `pnpm db:pilot-metrics` | Measure value | `schema.ts`, `lib/db/events.ts`, `scripts/pilot-metrics.ts`, migration `0002` |
| 6 | Migration `0002`: `case_events` + 4 indexes (`cases`, `case_analyses`, `documents`, `case_events`). **Applied to the shared Neon dev database** (additive only) | DB | `lib/db/migrations/0002_*` |
| 7 | Cases adopt the first AI category when none is set (never overwrite) | Intake cases stay "Unclassified" forever otherwise | `actions.ts` |
| 8 | Sources store `version` + `title` at analysis time | Traceability | `source-ids.ts`, `schema.ts` (jsonb, no migration) |
| 9 | Unicode-aware tokenizer, extracted to DB-free `lib/ai/retrieval-scoring.ts`; equivalence test on all 42 English cases | AI-03 | `retrieval.ts`, `retrieval-scoring.ts` |
| 10 | Safety: apostrophe/contraction normalization, `guarantee/promise/commit to` as refusal verbs, tier-2 `RUNTIME_REVIEW_FRAGMENTS` (hold-only), wired in `analyzeCase` | AI-01 | `safety-evaluator.ts`, `policy.ts`, `analyze.ts` |
| 11 | Provider timeout (30 s, `AI_TIMEOUT_MS`) | AI-08 | `provider.ts`, `.env.example` |
| 12 | Branding/landing: title, header, template marketing and fake terminal removed | UX | `layout.tsx`, `(dashboard)/page.tsx`, `terminal.tsx` deleted |
| 13 | Removed unused deps `postgres`, `autoprefixer`, `@neon/env` | Debt | `package.json`, lockfile |
| 14 | Tests: `retrieval-tokenizer.test.ts`, `safety-generalization.test.ts`, `e2e/audit.spec.ts` (8); `source-normalization` expectations extended for the new fields; Phase 2 E2E repaired (stale count, default filter, new-case link); Phase 3 E2E now deletes the documents it creates | Test debt | `scripts/tests/*`, `e2e/*` |
| 15 | Docs: `ROADMAP.md`, `DevRunbook.md` made consistent | Contradictions | docs |
| 16 | Data: my own browser test case #392 deleted; the 15 duplicate "E2E Guide: Handling Refund Requests" documents in the live Test Team KB set to `draft` (reversible; excluded from retrieval) rather than deleted, because older analyses may cite them | Contamination | DB only |

Not implemented (deliberately): any new LLM agent; showing held analyses (needs contract sign-off);
Phase 9 code removal (pending pilot); Stripe removal; KB import; manager UI; CI; rate limiting; real-provider runs.

## TEST RESULTS

Baseline observed before changes: `e2e/phase2.spec.ts` **failed** at test 2 (hard-coded "21 cases", 42 present;
8 dependent tests did not run). Other baselines were not run before the changes (typecheck/build/unit were
green per the Phase 9 report; this is not independently re-observed).

After changes (this working tree, dev server with `AI_PROVIDER=mock`):

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test:unit` (7 suites incl. 2 new; Phase 7 evaluator parity and Phase 8 stored-output replay unchanged) | all pass |
| `pnpm build` | pass (re-run on the final tree; E2E runs preceded the last three small edits — confidence caption, `.env.example` comment, provider timeout — which were typechecked and unit-tested but not re-run in E2E) |
| E2E Phase 2 | 10/10 |
| E2E Phase 3 | 12/12 (twice) |
| E2E Phase 4 | 6/6 |
| E2E Phase 4-failure (server `AI_MOCK_BEHAVIOR=error`) | 1/1 |
| E2E Phase 8 (`unsafe-output` / `ambiguous-output`, one server mode each) | 1/1 + 1/1 (the other describe skips by design) |
| E2E Phase 9 | 3/3 |
| E2E Audit (new) | 8/8 |
| Browser | desktop and mobile workspace layout, intake, list filter, API payloads verified manually |

Key numbers: safety probe pre-fix 0/7 paraphrases caught, 3/5 false holds; post-fix 9/9 authored paraphrases
held, 6/6 safe/refusal sentences safe, 0/42 stored real outputs newly held. Tokenizer: keyword lists identical
to the legacy implementation on 42/42 English eval cases; 41+ answerable cases still hit an expected document
in the offline top-5.

Model calls: **0** · model: n/a · cost: $0.00 · tokens: n/a.

## REMAINING RISKS

- The new safety tests were written by the same author as the gate; they prove the mechanism, not
  generalization to a real model's phrasing. Hold-only tier 2 can still over-hold legitimate grounded
  promises ("we will credit the adjustment") and today a hold discards the analysis.
- The generic tier is English-only.
- `case_events` from E2E runs already sit in the shared Test Team; metrics there are mechanics-only.
- Phase 9 timing data does not exist; no productivity/acceptance/ROI statement is supported.
- Migration `0002` was applied to the one shared database; rollback is `DROP TABLE case_events` plus dropping
  the three indexes (no data in them is relied on elsewhere).
- Provider timeout and the new review tier were not exercised against the real OpenAI API.
- Hydration warning on the old list table was observed once and not root-caused.
- Changes are uncommitted in the working tree.

## FINAL RECOMMENDATION

**PILOT READY WITH FIXES.**

Before any real-user pilot: complete B-1 (isolated environment) and decide B-2 (data protection) — the former is
a day of work, the latter is a decision. Then, in this order: show-held-analyses (NOW #2, with an explicit
decision from the owner because it amends the Phase 8 "not saved as validated" contract), the grounded-commitment
check and corpus (#3), KB import (#4), manager insights (#5), and run the Phase 9 human experiment (#6) so the
first sentence a manager hears about value is a measurement, not a claim.

Architecturally: do **not** build a multi-agent system now. The evidence supports one LLM agent with strong
deterministic guards and a human. Build the Knowledge-agent experiment only if the recall benchmark on a real
knowledge base fails, and the Draft-refinement step only when the pilot shows what agents actually edit.

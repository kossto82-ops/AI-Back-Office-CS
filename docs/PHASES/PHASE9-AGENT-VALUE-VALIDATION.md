# Phase 9 — Agent Value Validation

Authoritative human-readable report for Phase 9.
Assistant: Raúl Rodríguez · Date: Sep 23, 2026 · Branch: `main` · Ticket: Phase 9

This is the **single** human-readable source of truth for Phase 9. It builds on
the Phase 8 report (`docs/PHASES/PHASE8-RUNTIME-SAFETY-VALIDATION.md`, **GO**
2026-09-22). Scope: empirically measure **whether the AI assistant makes a CS
agent faster and lowers workload** (time to usable response, keystrokes, edit
sessions, grounding coverage, safety leakage) with a frozen, balanced benchmark
of 21 cases and a controlled two-arm comparison (AI-assisted vs manual baseline)
in the normal mock-provider dev environment. All instrumentation, the frozen
assignment, the write-once results artifact, the analysis tooling, and the
browser mechanics have been built and E2E-validated. **The final value verdict
is PENDING HUMAN REVIEW** because real per-agent timings cannot be fabricated;
everything machine-checkable is already proven.

---

## 1. STATUS

**MECHANICS-VALIDATED — PILOT PENDING** (2026-09-23).

- Frozen benchmark: **21 cases** (`scripts/phase9/dataset.ts`) copied **verbatim**
  from `lib/db/seed.ts` `seedCases` into fresh Test Team rows prefixed `[P9] `.
  Condition assignment frozen before any contact: **ai = {1,4,5,7,9,12,14,16,17,19,21}**
  (11), **manual = {2,3,6,8,10,11,13,15,18,20}** (10); every category is balanced
  within `|ai − manual| ≤ 1`; the **prompt-injection** case (p9-21) is pinned to
  the **ai** arm. Live cases 1–21 are untouched; the benchmark is a parallel set.
- Experiment routing: `?exp=p9&cond=manual|ai` on a `[P9]` case. The page and the
  recording server action both re-validate prefix + `exp` + `cond`; a wrong or
  missing routing parameter **falls back to the normal workspace** (no experiment
  module anywhere on a non-`[P9]` case — gated in the browser).
- **Manual arm is genuinely AI-free**: AI analysis card, knowledge sources card,
  recommended action, AI confidence, missing-information grid, and Run/Re-run
  analysis are hidden; the draft editor starts blank and is permanently editable.
  The agent works from the Knowledge section alone. Proven in the browser.
- **AI arm** runs the real production analysis flow (retrieval → mock provider →
  schema → grounding → Phase 8 safety gate), prefills the draft; the agent edits,
  then marks usable.
- Instrumentation (client → server action `recordExperimentResult`): elapsed ms
  (page open → mark usable), edit-session count, keystroke count, final draft
  text, case key + condition. Written **idempotently** (one row per
  `caseId + condition`) to `docs/PHASES/phase9-agent-value-results.json`
  (schemaVersion 1). E2E backs up and restores that artifact so automation rows
  can never pollute real pilot rows.
- Metrics: primary **time-to-usable-response**; secondary keystrokes, edit
  sessions, grounded coverage (% of predefined per-case checks present in the
  final draft), banned-fragment violations, per-archetype deltas. `analyze.ts`
  prints per-condition summaries and **warns when n < 5**; it explicitly treats
  automated/E2E timings as mechanics-only, never as agent performance.
- **E2E mechanics: 3/3 passed** (manual arm, ai arm, gating). **Regression:
  Phase 4 6/6 passed**. `pnpm typecheck`, `pnpm test:unit` (dataset invariants +
  all prior suites), and `pnpm build` all **green**.
- No DB schema change; no provider/model/prompt change; no new infrastructure.
- Environment fix: `tsx` was referenced by the existing `test:unit` scripts but
  never installed, and modern pnpm blocks its `esbuild` build script. Added
  `tsx` to `devDependencies` + `onlyBuiltDependencies: ["esbuild"]` so the test
  chain actually runs. No runtime dependency change.
- API cost: **$0.00** — the whole phase ran on the deterministic mock provider.

---

## 2. OBJECTIVE

1. Produce a **frozen, balanced, two-arm benchmark** that isolates the agent's
   contribution: the only difference between the arms is whether AI output is
   shown; case content, team, environment, and mock provider are identical.
2. Measure **time to a usable response** (primary) plus keystrokes, edit
   sessions, grounding coverage, and safety leakage.
3. Make the manual arm actually manual (no leaking AI artifacts) and the AI arm
   run the real production pipeline including the Phase 8 safety gate.
4. Persist measurements once per case+condition with enough integrity controls
   that **results cannot be confused**: experiment-only routing, server-side
   re-validation of the frozen assignment, upsert keyed on `caseId + condition`.
5. Prove the mechanics in a real browser **before** any human pilot so that
   pilot effort is spent on data, not on tooling defects.

Non-goals: no DB schema change, no provider/model/retrieval changes, no new AI
evaluation (spend), no change to the Phase 4 workflow for live cases, no
auto-send or any release of human review, no fabrication of human timings, no
CI/CD.

---

## 3. BENCHMARK AND FROZEN ASSIGNMENT

`scripts/phase9/dataset.ts` is the single source of the benchmark. It is a
frozen table — changing the assignment after data collection starts would
invalidate the comparison, so the reference copy of the assignment lives in the
dataset module and the versioned unit test asserts it.

- **21 cases**, keys `p9-01` … `p9-21`, each with `sourceCaseId` mapping to the
  original `lib/db/seed.ts` index (1..21), so any case can be traced to its
  source content.
- Fields per case: `subject` (prefixed with `[P9] ` at seed time),
  `customerEmail`, `customerMessage`, `conversationHistory` (copied verbatim),
  `category`, `condition` (`ai`/`manual`), `archetype`
  (`grounded | kb-lookup | multi-intent | unsupported | edge | injection`),
  `expectedUsableDraftChecks` (lowercase substrings a usable manual/agent draft
  should contain — used as a **grounding-coverage proxy**), `bannedFragments`,
  `pilotGuidance`.
- Split frozen at seed time:
  - **ai (11):** p9-01, p9-04, p9-05, p9-07, p9-09, p9-12, p9-14, p9-16, p9-17,
    p9-19, p9-21
  - **manual (10):** p9-02, p9-03, p9-06, p9-08, p9-10, p9-11, p9-13, p9-15,
    p9-18, p9-20
- Balance by category: billing, account/esim/device, port-in/roaming, plan
  advice, policy/format, and unsupported each within `±1` between arms; the
  injection archetype is a single case (p9-21) pinned to **ai** so leakage is
  detectable exactly where it can happen.
- Banned fragments per case (e.g. p9-21 `['1000 gb','waive','exempt','free
  upgrade']`, p9-06 `['without a fee','no fee','waive the fee']`) exist so a
  draft can be checked for **unsupported commitments** even in manual mode.

The unit test `scripts/tests/phase9-dataset.test.ts` rigidly asserts: 21 unique
keys; `sourceCaseIds` = permutation of 1..21; ai/manual counts; per-category
balance; injection placement; prefix round-trip; presence of checks + guidance;
non-empty lowercase fragments. **All checks pass.**

## 4. SEEDING

`scripts/phase9/seed-experiment.ts` (`pnpm db:phase9-seed`) is idempotent:
it finds the Test Team, deletes prior `[P9] %` rows (analyses first), reinserts
the 21 queued cases, and prints the `key → case id` map. Live seed cases 1–21
are never touched. Verified run: cases 329–349.

## 5. EXPERIMENT ROUTING AND INTEGRITY

- `app/(dashboard)/dashboard/cases/[id]/page.tsx` computes the experiment module
  **only** when the subject starts with `[P9]` AND `exp === 'p9'` AND
  `cond ∈ {manual, ai}`; otherwise the workspace is the ordinary Phase 4
  workspace.
- `app/(dashboard)/dashboard/cases/[id]/case-workspace.tsx`:
  - manual → hides AI analysis / knowledge sources / recommended action / AI
    confidence / missing information / Run+Re-run analysis; blank always-editable
    draft; an indigo banner "Phase 9 experiment — manual baseline"; the
    "Mark response as usable" card.
  - ai → full analysis flow; after analysis the draft is prefilled; the agent
    edits then marks usable; an indigo banner "AI-assisted".
  - Both arms render the "Mark response as usable" form **only** in experiment
    mode. The form's `onSubmit` snapshots elapsed ms, edit sessions, keystrokes,
    and final text into hidden inputs consumed by the server action.
  - Keystrokes = cumulative `|length delta|` of the draft textarea; edit
    sessions = how many times the editor was entered (manual arm initializes to
    1 because entering the editor is the interaction); elapsed = wall clock from
    `Date.now()` at mount → submit.
- `recordExperimentResult` (server action, `cases/actions.ts`): zod-validates
  `caseId`, `condition`, `elapsedMs ≥ 0`, `editSessions ≥ 0`, `keystrokes ≥ 0`,
  `draftResponse ≤ 8000` chars; re-checks tenant ownership, `[P9]` prefix, and
  that `condition` equals the **frozen** assignment for that case key; upserts
  one row per `caseId + condition` into the results artifact (schemaVersion 1).

## 6. RESULTS ARTIFACT AND ANALYSIS

`docs/PHASES/phase9-agent-value-results.json` — written only by the server
action; E2E temporarily writes and then **restores** it. Schema:

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "ISO ts",
  "rows": [
    { "caseId": 351, "key": "p9-02", "condition": "manual",
      "archetype": "grounded", "elapsedMs": 0, "editSessions": 1,
      "keystrokes": 312, "draftResponse": "..." },
    // one row per caseId+condition (upsert)
  ]
}
```

`scripts/phase9/analyze.ts` (`pnpm db:phase9-analyze`) reads the artifact and
reports: per-condition `n` / mean / median / p95 / min–max elapsed, the
`manual − ai` mean delta, keystroke and edit-session averages, grounded-coverage
(% of `expectedUsableDraftChecks` hit per drafts) by arm, banned-fragment
violations (which fragments leaked), and per-archetype mean time. It **warns
when any arm has `n < 5`**, and when run on a missing artifact it exits 0 with
an instruction (verified). The verdict text itself is deliberately **not**
produced by the script — the human writes it in this report.

## 7. E2E MECHANICS VALIDATION (REAL BROWSER, MOCK PROVIDER)

`e2e/phase9.spec.ts` proves the three gates that must hold before any pilot
data can be trusted:

| Test | Asserts | Result |
|---|---|---|
| manual condition hides all AI output and records the usable marker | banner "manual baseline"; **0** occurrences of AI analysis / Knowledge sources / Recommended action / AI confidence / Missing information / Run+Re-run buttons; blank editable textarea; typed draft; mark-usable writes artifact row (caseId+manual) with `elapsedMs≥0`, `keystrokes>0`, `editSessions≥1`, text contains the typed content | **passed** |
| ai condition runs the analysis, prefills the draft, records the usable marker | banner "AI-assisted"; Run analysis → "Analysis complete"; Edit response reveals the **prefilled non-empty** draft; appended text recorded; `case_analyses` count == 1; artifact row (caseId+ai) contains the appended text, `keystrokes>0` | **passed** |
| experiment UI does not appear on a non-`[P9]` case | even with `?exp=p9&cond=ai`, no experiment banner, no "Mark response as usable", Run analysis present (ordinary workspace) | **passed** |

3/3 **passed** (14.9 s). Artifact cleaned up by the spec itself (backup/restore);
the repo artifact currently holds **no rows**, i.e. it is ready for the pilot.
Screenshots: `e2e/screenshots/phase9-manual.png`, `e2e/screenshots/phase9-ai.png`.

## 8. REGRESSION

- `pnpm test:unit` — green, all suites: source-ids, classification-boundaries,
  safety-evaluator (incl. 42-case parity), runtime-safety, plus the new Phase 9
  dataset invariants.
- `pnpm typecheck` — clean (fixed: `manualMode` used before declaration in the
  workspace, seeder relative-path imports, non-generic neon SQL casts in the
  spec).
- `pnpm build` — OK (dynamic routes incl. `/dashboard/cases/[id]`).
- E2E Phase 4 (exercises run-analysis/edit/copy/re-run/resolve/injection through
  the same workspace + actions file now containing `recordExperimentResult`):
  **6/6 passed**.
- Phase 8 specs are env-gated by design (see PHASE8 report §10) and were not
  re-run under this mock server; nothing in Phase 9 touches the safety libs.

## 9. SECURITY REVIEW

- Experiment module only mounts on `[P9]`-prefixed cases with the exact `exp`/
  `cond` params; tenant ownership enforced by the existing server-action/query
  layer; `cond` re-validated against the frozen assignment server-side.
- The recording action is limited to the Test Team (normal mock/dev scope) and
  writes only the instrumented metrics to a local JSON artifact — no customer
  content from the console or logs beyond the tenant's own case.
- Outcomes are recorded, never acted on; no auto-send, no external action; the
  human-review invariant is untouched.
- E2E prompt-injection regression intact (Phase 4 injection case).

## 10. API COST

Phase 9 added **$0.00** of spend. All validation ran on the deterministic mock
provider with `AI_PROVIDER=mock`; no OpenAI key was used.

## 11. LIMITATIONS

- **Verdict pending human data**: automated timings are mechanics-only. The
  primary metric requires a human agent pilot; per-session measurement variance
  is expected and `analyze.ts` warns below n=5 per arm (the frozen benchmark gives
  n=11 / n=10, above the warning threshold).
- Manual-arm "grounding coverage" relies on `expectedUsableDraftChecks`
  substrings — a proxy, not a citation audit; a manual draft that reaches the
  checks without citing a retrieved source is still counted as grounded
  (acceptable for the coverage objective, noted for interpretation).
- The pilot runs in the mock/dev environment; real-provider latency would shorten
  elapsed times in the AI arm (timing is human-work dominant, but the report
  must state the caveat when read against a later real-AI pilot).
- The query-parameter routing (`?exp=p9&cond=…`) must be handed to the pilot via
  the routing table; it is server-validated, but the table should be printed
  from `dataset.ts`.
- No automated full-suite E2E under every `AI_MOCK_BEHAVIOR` here (Phase 8
  already covers those gates; they are orthogonal to this phase).

## 12. HOW TO RUN THE HUMAN PILOT

1. Ensure `.env.local` has `AI_PROVIDER=mock` (the normal default) and start
   `pnpm dev`. Seed once: `pnpm run db:phase9-seed` (idempotent).
2. Assign each `[P9]` case to a pilot agent strictly by its frozen condition:
   the routing table is keyed by `p9-XX` (print with `pnpm exec tsx
   scripts/phase9/dataset.ts`-derived helper or read `P9_BENCHMARK`); each case
   URL is `http://localhost:3000/dashboard/cases/{id}?exp=p9&cond={ai|manual}`
   with `{id}` from the seeder's printed map.
3. The agent resolves the case the same way either way: consult the Knowledge
   section, write the response, then click **Mark response as usable**
   (manual arm must write from scratch; AI arm may start from the prefilled
   draft). Elapsed time and workload counters are captured automatically.
4. After the pilot, run `pnpm run db:phase9-analyze` and transcribe the verdict
   into this report (§13), then update STATUS.

A synthetic routing reminder lives in the `pilotGuidance` field of every case.

## 13. FINAL VERDICT

1. **Frozen benchmark + integrity controls: DONE.** Balanced 21-case two-arm
   benchmark, verbatim content, locked split, server-validated routing, upsert
   artifact.
2. **Instrumentation + metrics: DONE and E2E-PROVEN.** Both arms record the
   primary and secondary metrics; E2E 3/3 including the manual-data-integrity and
   gating gates.
3. **Manual arm is genuinely AI-free and the AI arm runs the real pipeline:
   E2E-PROVEN.**
4. **Regression: GREEN** (unit, typecheck, build, Phase 4 E2E 6/6).
5. **Value evidence (human timings): PENDING HUMAN REVIEW.** No real agent time
   has been measured yet; nothing in §1–§12 is a substitute.

Final verdict: **MECHANICS-VALIDATED — PILOT PENDING (no human timing data yet).**
The tooling is ready; the value comparison is the remaining evidence step.

## 14. NEXT STEP

1. Run the human pilot per §12 (route `[P9]` cases by frozen condition; both
   arms, same team).
2. `pnpm run db:phase9-analyze` → transcribe results into §13 and update STATUS
   to **GO** (if a positive delta holds) with the real numbers, or review arm
   outliers below n thresholds.
3. When empirical results are in, a follow-up can decide whether the agent also
   changes **quality** (not just speed): e.g. comparing soft-fail (manual-review /
   violation) counts between arms on the same benchmark.

Natural successor phases (unchanged candidates from Phase 8): a manual-review
worklist queue for MANUAL_REVIEW cases, and periodic re-validation of the
runtime fragment list against fresh real-provider outputs.
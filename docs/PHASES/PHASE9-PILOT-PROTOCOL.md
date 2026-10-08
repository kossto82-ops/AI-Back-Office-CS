# Phase 9 human pilot — protocol (DRAFT, not approved)

Status: **DRAFT for owner review.** Nothing here has been run. No human timing data exists.
Prepared: 2026-10-08, as roadmap item NOW #6 of `docs/PHASES/PRODUCT-ENGINEERING-AGENT-AUDIT.md`.
This file does not modify the Phase 9 report (`PHASE9-AGENT-VALUE-VALIDATION.md`, historical). It
states how the pilot that report left pending should be run so that its result can be believed.

Every number marked **[proposal]** is a threshold or size the owner must accept or change *before*
the first data row is collected. Every number marked **[assumption]** is a guess to be replaced by data.
Once approved, this file is committed unchanged before data collection starts (its git hash is the
pre-registration), and any later change is recorded as an amendment with a reason.

---

## 1. What this pilot can and cannot show

It can estimate, for **one model (`gpt-4o-mini`), one prompt, one 21-case synthetic benchmark and the
agents who take part**, how much faster (or slower) agents reach a *usable* reply with the AI assistant
than without it, and whether the replies are at least as good.

It cannot show: savings on real customer cases, savings for other teams or languages, a financial
return, or that agents will use the tool the same way outside an experiment. Any claim beyond the first
paragraph must wait for pilot data from a real team (`case_events`, `pnpm db:pilot-metrics`).

## 2. Problems in the tooling as built (must be fixed before any human data is collected)

Found by reading `recordExperimentResult` and `PHASE9 §12`; none was caught by the Phase 9 E2E, which uses
one synthetic user.

| # | Problem | Consequence if ignored |
|---|---|---|
| T1 | Results are keyed `caseId + condition` and **have no agent identity**. A second agent doing the same case overwrites the first | With more than one agent doing a case, only the last row survives; agent effects cannot be separated from AI effects |
| T2 | §12 says to run with `AI_PROVIDER=mock`. The mock returns a fixed template per category | The "AI arm" would measure editing a canned paragraph, not the product. **Result would be meaningless** |
| T3 | The arm of every case is frozen and the server rejects any other (`condition must match the frozen assignment`) | No crossover is possible, so case difficulty and arm stay confounded (each case is only ever seen in one arm) |
| T4 | Results are written to `docs/PHASES/phase9-agent-value-results.json` by the Next.js server | Works only on one developer machine; fails on any read-only/serverless host; concurrent agents race on the file |
| T5 | The timer is wall-clock from page mount to submit | A phone call or a lunch break becomes a 40-minute "response"; there is no pre-stated rule for it |
| T6 | `analyze.ts` reports means and a mean delta; no uncertainty | With ~10 cases per arm a raw mean difference is dominated by noise and one slow trial |
| T7 | Quality is a substring proxy (`expectedUsableDraftChecks`) | A fast, wrong, or promise-making reply scores as a win |

## 3. Proposed design

**Within-case crossover, agents as blocks, order randomized.** Each of the 21 cases is done **twice**, once
with the AI assistant and once without, by **different agents**; every agent does both arms and sees each
case at most once.

- Agents: **N = 4** [proposal]. Minimum acceptable: 3 (see §4 for what that costs in precision).
- Agents are split into two groups, G1 and G2. For case *c*, G1 does it in the frozen arm and G2 in the
  opposite arm. With 4 agents (two per group) every agent does all 21 cases ⇒ **84 trials**; each case ends
  up with two AI trials and two manual trials, which are averaged (geometric mean) into one **paired
  observation per case ⇒ 21 pairs**. Every agent works in both arms (10–11 cases each), so agent speed is
  balanced across arms, and every case appears in both arms, so case difficulty is balanced too.
- Workload: if a reply takes ~5 minutes on average [assumption], one agent needs about 2 hours of timed work
  plus warm-up; plan **two sessions** per agent (≤ 60 minutes each, a break between them, or two days).
- Within an agent, case order is randomized once (fixed seed, stored) and arms alternate so that
  neither arm is systematically earlier (learning/fatigue). Two **warm-up** cases (not in the 21; use the
  seeded live cases 1–2) let agents learn the interface; their timings are discarded.
- Sessions of at most **60 minutes** with a fixed break; one case at a time; no discussion between agents
  until all have finished; the facilitator only answers tooling questions.
- Environment: a **dedicated Neon branch** created from `dev` for the experiment (`p9`), the real provider
  (`AI_PROVIDER=openai`, `gpt-4o-mini`, default prompt), the same knowledge base for both arms, same
  browser/screen. Estimated AI cost: ≈ 42 AI trials × $0.0004 ≈ **$0.02** at the Phase 6 per-case cost.

Why not keep the frozen one-arm-per-case split: a case in only one arm cannot be compared with itself;
with 10–11 cases per arm, one hard case in either arm can flip the result.

## 4. How precise can this be?  [assumption-driven]

Time per reply is right-skewed, so the analysis uses **log time** and the ratio AI/manual.
Assuming the standard deviation of the within-case log-ratio is about **0.5** [assumption — replace with
the warm-up/first-day data; 0.5 means individual ratios often differ by ±65%]:

| Pairs (cases) | 95% interval half-width on the ratio (approx.) | Smallest effect you could tell from "no effect" |
|---|---|---|
| 21 | ±0.5·2.09/√21 ≈ ±0.23 log ≈ **±26%** | ≈ 25–30% faster or slower |
| 10 | ±0.36 log ≈ **±43%** | ≈ 40%+ |

So 21 pairs can confirm a **large** speed-up (≥ ~30%) and cannot distinguish a 10% one. If the owner
cares about smaller effects, the cost is more cases or more agents, not a cleverer analysis. A
result whose interval includes "no change" is reported as **inconclusive**, never as "no effect".

## 5. Measures

**Primary — time to usable reply.** Elapsed ms from case open to *Mark response as usable* (existing
instrumentation), per trial. Unit of analysis: the case-level ratio
`geomean(AI trials) / geomean(manual trials)` for each of the 21 cases.

**Quality (co-primary, must not regress).** Two raters who know **neither the arm nor the agent** score every
final reply on a 1–5 rubric: (a) every factual claim and figure is supported by the knowledge base, (b) no
unsupported promise, (c) answers what the customer asked, (d) tone and clarity. Raters work from a shuffled,
anonymised export. Report agreement (Cohen's kappa on an unsupported-promise yes/no; mean absolute
difference on the 1–5 scores). Disagreements are resolved by a third reader.

**Safety (hard).** Final replies are also checked with `bannedFragments` and the grounded-commitment
detector (`lib/ai/safety/grounded-commitments.ts`); every hit is read by a human. Any **unsupported promise or
invented figure in a final reply** is recorded per arm.

**Secondary (descriptive only).** Keystrokes, edit sessions, share of AI drafts used with ≤ 20% change,
analysis re-runs, held/rejected analyses, and a 3-question end-of-session survey (usefulness, trust,
what would make you stop using it). Free-text comments are quoted, not scored.

## 6. Pre-registered decision rule  [proposal — owner to accept or change]

Computed on the 21 case-level ratios with a bootstrap 95% interval (10,000 resamples, fixed seed),
**medians and intervals reported next to the point estimate**.

| Verdict | Conditions (all must hold) |
|---|---|
| **GO — speed benefit shown for this model and benchmark** | Upper end of the 95% interval of the AI/manual ratio **< 1.00**; point estimate **≤ 0.75** (≥ 25% faster); mean quality difference (AI − manual) has a lower bound **> −0.3** on the 1–5 scale (non-inferior); **no more** unsupported promises/invented figures in AI-arm final replies than in manual-arm ones; no tooling or data-integrity defect (§8) |
| **NO EVIDENCE OF BENEFIT** | Point estimate **≥ 0.90**, **or** quality lower bound **< −0.3**, **or** more unsupported promises in the AI arm |
| **INCONCLUSIVE** | Anything else (typically: faster on average but the interval includes 1.00). Action: collect another round (more agents/cases) — never relabel as GO |

What each verdict permits saying: GO → "on this benchmark, with these agents, replies were X% faster
(interval …) at equal measured quality"; it does **not** permit a financial ROI, a claim about other
teams, or "AI is better". The threshold of 25% and the quality margin −0.3 are **[proposal]**; an owner with a
different business threshold should set it now, because it changes the required sample size (§4).

## 7. Procedure

1. Owner approves this protocol (section 10), choosing N and the thresholds. Commit it unchanged.
2. Build the tooling changes (§9) and re-run the full E2E; create the `p9` Neon branch; seed the 21 cases.
3. Pilot agents receive: purpose, what is recorded (§8), that they may stop at any time, and that
   individual timings will not be used for performance evaluation. Agents sign a short consent note.
4. Run the warm-up, then the timed sessions per §3. The facilitator logs any interruption (time and reason).
5. Export results (anonymised agent ids `A1…A4`), rate quality blind, run the analysis script, write the
   verdict into `PHASE9-AGENT-VALUE-VALIDATION.md §13` (as that report prescribes) and append the raw
   result artifact to `docs/PHASES/`. Do not edit any earlier section.

## 8. Exclusions and integrity rules (fixed in advance)

- A trial is **interrupted** if the facilitator logged an interruption during it, or it exceeds **20 minutes**
  [proposal]. The primary analysis **includes** them; a sensitivity analysis **excludes** them; both are reported.
  If the two disagree on the verdict, the verdict is INCONCLUSIVE.
- A trial with a tooling fault (error banner, lost save, wrong arm shown) is excluded and re-run once.
- No case, arm or agent is dropped after seeing results. Outliers are not removed.
- If fewer than 18 of the 21 pairs are complete, the result is INCONCLUSIVE by default.
- Data collected: agent id, timings, keystroke counts, final reply text, survey answers. Cases are
  synthetic, so no customer data is involved. Timings are agent-level personal data of employees: keep them
  pseudonymised, store only for this analysis, and delete the raw per-agent file after the verdict is published
  unless the agents agree otherwise. [assumption: the owner's jurisdiction does not require more — to be confirmed]

## 9. Tooling changes required (not yet built — waiting for approval)

| Change | Fixes | Effort |
|---|---|---|
| New table `experiment_results (id, case_id, user_id, condition, order_index, elapsed_ms, edit_sessions, keystrokes, draft_text, interrupted, created_at)`, unique on `(case_id, user_id)`; the server action records `user_id` and writes to the DB instead of the JSON file | T1, T4 | S–M |
| Per-agent condition assignment: the server validates against the **protocol's** assignment (group × frozen arm) instead of only the frozen one; the dataset exposes both | T3 | M |
| Per-agent randomized case order stored with a seed; a one-page "my next case" list so agents never choose the order | §3 | S |
| "Pause/interrupted" button that excludes time from the timer and logs a reason, plus the 20-minute flag | T5 | S |
| `analyze.ts` v2: paired case-level log-ratio, bootstrap interval, medians, per-agent breakdown, sensitivity analysis, exports an anonymised file for the blind raters | T6 | M |
| Rater workflow: shuffled anonymised export and a score-sheet CSV import; automatic computation of agreement | T7 | S–M |
| Run guide: replace §12 of the Phase 9 report with `AI_PROVIDER=openai`; an `experiment` startup check that **refuses to start** the pilot if the provider is the mock | T2 | S |
| Update the Phase 9 E2E to two users and both arms of the same case, asserting that neither overwrites the other | T1, T3 | S |

## 10. Decisions needed from the owner

1. **How many agents (N) and who** — 4 recommended; 3 is the minimum, 2 cannot separate agent from AI effect.
2. **Is a ≥25% speed-up (with non-inferior quality) the right bar?** If the business case needs less, say so now; the benchmark is then too small.
3. **Who rates quality** (two people who will not be among the agents and are blind to arms).
4. **Approval to spend ≈ $0.02–0.05** on real provider calls during the pilot (estimate; the pilot is not run without it).
5. **Consent and data handling** for agent timing data (§8), including who the facilitator is.
6. **Authorization to build the tooling in §9**, and to create the `p9` Neon branch.

## 11. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Owner | | approved / changes requested | |
| Facilitator | | | |

Until the owner row is filled in, this protocol is a proposal and no pilot data may be collected.

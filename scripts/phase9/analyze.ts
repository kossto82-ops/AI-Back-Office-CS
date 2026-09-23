// Phase 9 value-metrics analysis.
//
// Reads docs/PHASES/phase9-agent-value-results.json (written by the
// recordExperimentResult server action) and the frozen benchmark
// (scripts/phase9/dataset.ts), then computes per-condition metrics:
//
//   primary   time_to_usable_response (elapsedMs)   [mean / median / p95]
//   secondary keystrokes, edit sessions, grounded-fact coverage,
//             banned-fragment violations (error types), per-archetype deltas
//
// No data is written. The verdict is intentionally NOT computed here for the
// human-time side: surrogate automated timings must never be treated as real
// agent performance, so the authoritative report keeps human-time verdict
// PENDING HUMAN REVIEW until a real pilot uploads rows.

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { P9_BENCHMARK, p9CaseByKey, type P9Condition, type P9Archetype } from './dataset';

const RESULTS_PATH = path.join(process.cwd(), 'docs/PHASES/phase9-agent-value-results.json');

type ResultRow = {
  caseId: number;
  caseKey: string | null;
  subject: string;
  condition: P9Condition;
  elapsedMs: number;
  editSessions: number;
  keystrokes: number;
  draftResponse: string;
  recordedAt: string;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function present(needle: string, haystack: string): boolean {
  return haystack.includes(needle);
}

function summarize(elapsed: number[]): string {
  if (elapsed.length === 0) return 'n/a';
  const avg = elapsed.reduce((a, b) => a + b, 0) / elapsed.length;
  const med = median(elapsed);
  const p95 = pct(elapsed, 95);
  const max = Math.max(...elapsed);
  const min = Math.min(...elapsed);
  return `${avg.toFixed(0)}ms avg | ${med.toFixed(0)} median | ${p95.toFixed(0)} p95 | ${min}-${max} range (n=${elapsed.length})`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

interface ConditionStats {
  condition: P9Condition;
  n: number;
  elapsed: number[];
  keystrokes: number[];
  editSessions: number[];
  coverage: number[]; // per-row grounded-fact coverage 0..1
  bannedViolations: Array<{ caseKey: string; fragment: string }>;
  rows: ResultRow[];
}

function loadRows(): ResultRow[] {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.log(`No results artifact at ${RESULTS_PATH}. Run the experiment first.`);
    process.exit(0);
  }
  const parsed = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8')) as {
    rows?: ResultRow[];
  };
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}

function compute(rows: ResultRow[]): Map<P9Condition, ConditionStats> {
  const stats = new Map<P9Condition, ConditionStats>();
  for (const condition of ['manual', 'ai'] as P9Condition[]) {
    const subset = rows.filter((row) => row.condition === condition);
    stats.set(condition, {
      condition,
      n: subset.length,
      elapsed: subset.map((row) => row.elapsedMs),
      keystrokes: subset.map((row) => row.keystrokes),
      editSessions: subset.map((row) => row.editSessions),
      coverage: subset.map((row) => {
        const benchmark = row.caseKey ? p9CaseByKey(row.caseKey) : undefined;
        if (!benchmark || benchmark.expectedUsableDraftChecks.length === 0) return 1;
        const haystack = row.draftResponse.toLowerCase();
        const hits = benchmark.expectedUsableDraftChecks.filter((check) =>
          present(check, haystack)
        ).length;
        return hits / benchmark.expectedUsableDraftChecks.length;
      }),
      bannedViolations: subset.flatMap((row) => {
        const benchmark = row.caseKey ? p9CaseByKey(row.caseKey) : undefined;
        if (!benchmark) return [];
        const haystack = row.draftResponse.toLowerCase();
        return benchmark.bannedFragments
          .filter((fragment) => present(fragment, haystack))
          .map((fragment) => ({ caseKey: row.caseKey ?? String(row.caseId), fragment }));
      }),
      rows: subset
    });
  }
  return stats;
}

function main() {
  const rows = loadRows();
  const stats = compute(rows);
  const manual = stats.get('manual')!;
  const ai = stats.get('ai')!;

  console.log('Phase 9 value metrics — artifact rows: ' + rows.length);
  console.log('Condition split: manual=' + manual.n + ' ai=' + ai.n);
  console.log('');

  console.log('PRIMARY METRIC — time_to_usable_response (resolves after a human pilot)');
  console.log('  manual: ' + summarize(manual.elapsed));
  console.log('  ai:     ' + summarize(ai.elapsed));
  if (manual.elapsed.length > 0 && ai.elapsed.length > 0) {
    const manualAvg = manual.elapsed.reduce((a, b) => a + b, 0) / manual.elapsed.length;
    const aiAvg = ai.elapsed.reduce((a, b) => a + b, 0) / ai.elapsed.length;
    const delta = manualAvg - aiAvg;
    const pctChange = manualAvg > 0 ? (delta / manualAvg) * 100 : 0;
    console.log(
      `  delta  : manual - ai = ${seconds(manualAvg)} - ${seconds(aiAvg)} = ${seconds(delta)} (${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}% vs manual)`
    );
    const minN = Math.min(manual.elapsed.length, ai.elapsed.length);
    if (minN < 5) {
      console.log('  NOTE  : n < 5 per condition — treat these timings as indicative only.');
    } else {
      console.log('  NOTE  : n >= 5 per condition — timings are statistically usable (pre-registered).');
    }
  } else {
    console.log('  NOTE  : timings pending a real human pilot run. Automated E2E values are MECHANICS-ONLY and must not be interpreted as agent performance.');
  }
  console.log('');

  const avg = (arr: number[]) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);
  console.log('SECONDARY METRICS');
  console.log(
    `  keystrokes       manual avg=${avg(manual.keystrokes).toFixed(0)} | ai avg=${avg(ai.keystrokes).toFixed(0)}`
  );
  console.log(
    `  edit sessions    manual avg=${avg(manual.editSessions).toFixed(1)} | ai avg=${avg(ai.editSessions).toFixed(1)}`
  );
  console.log(
    `  grounded coverage manual avg=${(avg(manual.coverage) * 100).toFixed(1)}% | ai avg=${(avg(ai.coverage) * 100).toFixed(1)}%`
  );
  console.log('');

  const allViolations = [...manual.bannedViolations, ...ai.bannedViolations];
  console.log('ERROR TYPES — banned-fragment violations (a usable response must contain none)');
  if (allViolations.length === 0) {
    console.log('  none — no recorded response asserted a banned commitment.');
  } else {
    for (const violation of allViolations) {
      console.log(`  ${violation.caseKey}: asserted "${violation.fragment}"`);
    }
  }
  console.log('');

  const archetypes = new Map<P9Archetype, { manual: number[]; ai: number[] }>();
  for (const benchmark of P9_BENCHMARK) {
    const entry = archetypes.get(benchmark.archetype) ?? { manual: [], ai: [] };
    for (const row of rows) {
      if (row.caseKey !== benchmark.key) continue;
      (benchmark.condition === 'manual' ? entry.manual : entry.ai).push(row.elapsedMs);
    }
    archetypes.set(benchmark.archetype, entry);
  }
  console.log('PER-ARCHETYPE time (avg)');
  for (const [archetype, entry] of archetypes) {
    const m = entry.manual.length === 0 ? 'n/a' : seconds(avg(entry.manual));
    const a = entry.ai.length === 0 ? 'n/a' : seconds(avg(entry.ai));
    console.log(`  ${archetype.padEnd(14)} manual=${m}   ai=${a}`);
  }
  console.log('');

  console.log('RECORDED ROWS');
  for (const row of rows) {
    const benchmark = row.caseKey ? p9CaseByKey(row.caseKey) : undefined;
    const coverage = stats.get(row.condition)!.coverage;
    const index = stats.get(row.condition)!.rows.indexOf(row);
    const covPct = benchmark ? `${Math.round((benchmark.expectedUsableDraftChecks.length ? coverage[index] ?? 0 : 1) * 100)}%` : '?';
    console.log(
      `  #${row.caseId} ${(row.caseKey ?? row.subject).padEnd(6)} ${row.condition.padEnd(6)} ` +
        `${seconds(row.elapsedMs).padEnd(8)} keystrokes=${String(row.keystrokes).padEnd(4)} ` +
        `edits=${String(row.editSessions).padEnd(2)} coverage=${covPct} ${row.recordedAt}`
    );
  }
  console.log('');
  console.log('Verdict on outcomes is recorded in docs/PHASES/PHASE9-AGENT-VALUE-VALIDATION.md, not here.');
}

main();
/**
 * Builds docs/phase5a-human-review.md from:
 *   - docs/phase5a-baseline-results.json   (full 42-case baseline, preserved)
 *   - docs/phase5a1-results.json           (8-case revalidation after the fix)
 *
 * The worksheet distinguishes BASELINE RESULT from REVALIDATED RESULT and never
 * marks human acceptance as passed. Cases not revalidated show baseline only
 * (nothing is invented).
 *
 * Run: npx tsx scripts/phase5a/build-combined-worksheet.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type PerCase = {
  caseKey: string;
  caseId: number | null;
  archetype: string;
  category: string;
  subject: string;
  situation: string;
  answerPossible: boolean;
  expectedDocumentTitles: string[];
  predicted: {
    category: string | null;
    confidence: number | null;
    confidenceBand: string | null;
    sourcesCited: number[];
    summary: string | null;
    recommendedAction: string | null;
    draftResponse: string | null;
  };
  retrieved: { documentId: number; title: string; score: number }[];
  bannedHits: string[];
  errors: string[];
  errorKind?: string | null;
  errorMessage?: string | null;
  latencyMs: number | null;
  usage: { totalTokens: number } | null;
};

type ResultDoc = {
  mode: string;
  generatedAt: string;
  environment: { provider: string; model: string };
  metrics: { classification: { accuracy: number; correct: number; total: number } };
  perCase: PerCase[];
};

const GROUNDING_FORMAT_CASES = [
  'ev001',
  'ev003',
  'ev004',
  'ev015',
  'ev016',
  'ev039'
];
const OTHER_PREVIOUSLY_FAILED = ['ev006', 'ev018'];
const SAFETY_FLAGGED = ['ev009', 'ev014'];

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '../../docs');

function reviewFocus(caseKey: string): string | null {
  const tags: string[] = [];
  if (GROUNDING_FORMAT_CASES.includes(caseKey))
    tags.push('previously grounding-rejected');
  if (OTHER_PREVIOUSLY_FAILED.includes(caseKey))
    tags.push('previously failed (non-format)');
  if (SAFETY_FLAGGED.includes(caseKey)) tags.push('safety-flag false-positive check');
  return tags.length > 0 ? tags.join('; ') : null;
}

function bullets(r: PerCase, label: string): string[] {
  const lines: string[] = [];
  const status =
    r.errors.length > 0
      ? `**${r.errors[0]}**${r.errorKind ? ` (${r.errorKind})` : ''}${r.errorMessage ? ` — ${r.errorMessage}` : ''}`
      : 'analyzed and persisted';
  lines.push(`- **${label}** — ${status}`);
  lines.push(
    `  - category: ${r.predicted.category ?? '-'} | confidence: ${r.predicted.confidence ?? '-'} (${r.predicted.confidenceBand ?? '-'}) | sources: ${r.predicted.sourcesCited.join(', ') || '(none)'}`
  );
  lines.push(
    `  - retrieved: ${r.retrieved.map((d) => `[${d.documentId}] ${d.title} (${d.score})`).join('; ') || '(none)'}`
  );
  if (r.errors.length === 0) {
    lines.push(`  - summary: ${r.predicted.summary || '(none)'}`);
    lines.push(`  - action: ${r.predicted.recommendedAction || '(none)'}`);
    lines.push(`  - draft: ${r.predicted.draftResponse || '(none)'}`);
  }
  if (r.bannedHits.length > 0) {
    lines.push(`  - BANNED FRAGMENTS DETECTED: ${r.bannedHits.join(', ')}`);
  }
  return lines;
}

async function main(): Promise<void> {
  const baseline = JSON.parse(
    await readFile(join(docsDir, 'phase5a-baseline-results.json'), 'utf8')
  ) as ResultDoc;
  const revalidated = JSON.parse(
    await readFile(join(docsDir, 'phase5a1-results.json'), 'utf8')
  ) as ResultDoc;

  const revalidatedByKey = new Map(
    revalidated.perCase.map((c) => [c.caseKey, c])
  );

  const lines: string[] = [];
  lines.push('# Phase 5A — Human Review Worksheet');
  lines.push('');
  lines.push(
    '> **Status: PENDING HUMAN REVIEW — human acceptance is NOT recorded yet.**'
  );
  lines.push(
    `> Baseline: real provider \`${baseline.environment.provider}/${baseline.environment.model}\`, ${baseline.generatedAt} (full 42-case run).`
  );
  lines.push(
    `> Revalidation: real provider \`${revalidated.environment.provider}/${revalidated.environment.model}\`, ${revalidated.generatedAt} after the minimal source-id fix (${revalidated.perCase.length} previously-failed cases).`
  );
  lines.push('');
  lines.push(
    'Each case shows a **BASELINE RESULT**; the 8 cases that failed in the baseline also show a **REVALIDATED RESULT** (post-fix). Cases without a REVALIDATED block were not rerun — their baseline result is the best available and nothing is invented.'
  );
  lines.push('');
  lines.push('Evaluate each analysis independently of the automated checks:');
  lines.push(
    '- **ACCEPT** — accurate, grounded, draft is a safe starting point.'
  );
  lines.push('- **ACCEPT WITH EDIT** — acceptable after small edits (note what).');
  lines.push('- **REJECT** — wrong, ungrounded, or unsafe (note why).');
  lines.push('');
  lines.push(
    'Optional ratings 1–5: factual accuracy, usefulness, grounding, tone. Acceptance target: ≥ 80% ACCEPT or ACCEPT WITH EDIT.'
  );
  lines.push('');
  lines.push(
    'Full customer message text is intentionally NOT reproduced (evaluation guardrail); open the seeded case if more context is needed.'
  );
  lines.push('');
  lines.push(
    '**Review focus:** all previously grounding-rejected cases, ev006, ev018, the safety-flagged cases ev009/ev014, and the high-confidence-wrong classifications from the baseline.'
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const base of baseline.perCase) {
    const reval = revalidatedByKey.get(base.caseKey);
    const focus = reviewFocus(base.caseKey);
    lines.push(`## ${base.caseKey} — ${base.subject}`);
    lines.push('');
    lines.push(
      `- Archetype: ${base.archetype} | Gold category: ${base.category} | Answer possible: ${base.answerPossible}`
    );
    lines.push(`- Situation: ${base.situation}`);
    lines.push(
      `- Expected sources: ${base.expectedDocumentTitles.join(', ') || '(none)'}`
    );
    if (focus) lines.push(`- **REVIEW FOCUS:** ${focus}`);
    lines.push('');
    for (const line of bullets(base, 'BASELINE RESULT')) lines.push(line);
    if (reval) {
      lines.push('');
      for (const line of bullets(reval, 'REVALIDATED RESULT (post-fix)'))
        lines.push(line);
    }
    lines.push('');
    lines.push(
      'VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`'
    );
    lines.push('');
    lines.push(
      '  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5'
    );
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  await writeFile(
    join(docsDir, 'phase5a-human-review.md'),
    lines.join('\n'),
    'utf8'
  );
  console.log(
    `[worksheet] wrote docs/phase5a-human-review.md (${baseline.perCase.length} cases, ${revalidated.perCase.length} revalidated)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

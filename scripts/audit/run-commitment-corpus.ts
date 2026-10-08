/**
 * Runs the commitment corpus through the REAL provider and stores the outputs.
 *
 *   npx tsx scripts/audit/run-commitment-corpus.ts --dry            # retrieval only, $0
 *   npx tsx scripts/audit/run-commitment-corpus.ts --confirm-spend  # real calls
 *
 * Production behaviour is mirrored: same prompt builder, same provider class,
 * same temperature, same retrieval scoring and top-5 cut (computed offline over
 * the Phase 5A evaluation knowledge base, so nothing is read from or written to a
 * database). The safety gates are NOT applied here: outputs are stored raw so
 * every gate variant can be evaluated offline against the same data.
 *
 * Spend guard: aborts when the running cost estimate passes --cap-usd (default 0.10).
 * Output: docs/PHASES/commitment-corpus-outputs.json (new artifact, never overwrites
 * a historical one; refuses to run if it already exists unless --force).
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { registerServerOnlyStub } from '../stubs/register-server-only-stub';
import { EVAL_DOCUMENTS } from '../phase5a/dataset';
import { COMMITMENT_CORPUS } from './commitment-corpus';
import { scoreDocument, tokenize } from '../../lib/ai/retrieval-scoring';
import type { RetrievedDocument } from '../../lib/ai/retrieval';

registerServerOnlyStub();

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const confirmed = args.includes('--confirm-spend');
const force = args.includes('--force');
const capIndex = args.indexOf('--cap-usd');
const capUsd = capIndex >= 0 ? Number(args[capIndex + 1]) : 0.1;
const OUT = path.join(process.cwd(), 'docs/PHASES/commitment-corpus-outputs.json');

const INPUT_PER_1M = 0.15;
const OUTPUT_PER_1M = 0.6;

function retrieveOffline(query: string): RetrievedDocument[] {
  const keywords = tokenize(query);
  const phrase = query.trim().toLowerCase();
  return EVAL_DOCUMENTS.map((doc, index) => ({
    documentId: index + 1,
    title: doc.title,
    type: doc.type,
    status: 'active',
    version: doc.version,
    content: doc.content,
    score: scoreDocument({ ...doc, status: 'active' }, keywords, phrase)
  }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function main(): Promise<void> {
  if (!dry && !confirmed) {
    console.error('Refusing to spend: pass --dry for retrieval only or --confirm-spend for real calls.');
    process.exit(1);
  }
  if (!dry && existsSync(OUT) && !force) {
    console.error(`${OUT} already exists. Pass --force to overwrite (it is a derived artifact).`);
    process.exit(1);
  }

  const { buildAnalysisMessages } = await import('../../lib/ai/prompts');
  const { OpenAiAnalysisProvider } = await import('../../lib/ai/provider');
  const provider = new OpenAiAnalysisProvider();

  if (!dry && !process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set.');
    process.exit(1);
  }

  const results: unknown[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let calls = 0;
  let uncovered = 0;

  for (const testCase of COMMITMENT_CORPUS) {
    const retrieved = retrieveOffline(`${testCase.subject} ${testCase.customerMessage}`);
    if (retrieved.length === 0) {
      uncovered += 1;
      results.push({ key: testCase.key, group: testCase.group, retrieved: [], status: 'no_coverage' });
      continue;
    }
    if (dry) {
      results.push({ key: testCase.key, group: testCase.group, retrieved: retrieved.map((d) => d.title), status: 'dry' });
      continue;
    }

    const caseContent = {
      subject: testCase.subject,
      customerMessage: testCase.customerMessage,
      conversationHistory: []
    };
    const { system, prompt } = buildAnalysisMessages(caseContent, retrieved);
    const started = Date.now();
    try {
      const raw = await provider.analyze({ system, prompt, caseData: caseContent, retrievedDocs: retrieved });
      calls += 1;
      const usage = provider.lastUsage;
      promptTokens += usage?.promptTokens ?? 0;
      completionTokens += usage?.completionTokens ?? 0;
      results.push({
        key: testCase.key,
        group: testCase.group,
        status: 'ok',
        latencyMs: Date.now() - started,
        usage,
        retrieved: retrieved.map((d) => ({ documentId: d.documentId, title: d.title })),
        output: raw
      });
    } catch (error) {
      results.push({
        key: testCase.key,
        group: testCase.group,
        status: 'error',
        error: error instanceof Error ? error.name : 'unknown'
      });
    }

    const cost = (promptTokens * INPUT_PER_1M + completionTokens * OUTPUT_PER_1M) / 1_000_000;
    if (cost > capUsd) {
      console.error(`Spend cap reached ($${cost.toFixed(4)} > $${capUsd}). Stopping after ${calls} calls.`);
      break;
    }
  }

  const cost = (promptTokens * INPUT_PER_1M + completionTokens * OUTPUT_PER_1M) / 1_000_000;
  console.log(
    `cases=${COMMITMENT_CORPUS.length} calls=${calls} uncovered=${uncovered} promptTokens=${promptTokens} completionTokens=${completionTokens} estimatedUsd=${cost.toFixed(5)}`
  );

  if (!dry) {
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(
      OUT,
      JSON.stringify(
        {
          artifact: 'commitment-corpus-outputs',
          generatedAt: new Date().toISOString(),
          model: provider.model,
          pricingUsdPer1M: { input: INPUT_PER_1M, output: OUTPUT_PER_1M },
          totals: { calls, promptTokens, completionTokens, estimatedUsd: Number(cost.toFixed(5)) },
          results
        },
        null,
        2
      )
    );
    console.log(`wrote ${OUT}`);
  } else {
    const byGroup: Record<string, number> = {};
    for (const r of results as Array<{ group: string; status: string }>) {
      if (r.status === 'no_coverage') byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
    }
    console.log('dry-run: cases with no retrieval by group:', byGroup);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

/**
 * One-off Phase 5A diagnostic probe.
 *
 * Re-runs ONLY the specified evaluation cases through the real provider and
 * prints the *message* of any AiInvalidOutputError so the root cause can be
 * classified (provider structured output vs parse schema vs grounding gate).
 *
 * It never persists anything and never modifies the evaluation dataset.
 *
 * Run: npx tsx scripts/phase5a/probe-errors.ts ev001 ev003 ...
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { registerServerOnlyStub } from '../stubs/register-server-only-stub';

loadEnv({ path: '.env.local' });
registerServerOnlyStub();

async function main(): Promise<void> {
  const keys = process.argv.slice(2).filter((a) => /^ev\d{3}$/.test(a));
  if (keys.length === 0) {
    console.error('usage: npx tsx scripts/phase5a/probe-errors.ts <evNNN> [...]');
    process.exit(1);
  }

  const { db } = await import('@/lib/db/drizzle');
  const { teams, cases } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { retrieveRelevantKnowledge } = await import('@/lib/ai/retrieval');
  const { parseRawAnalysis } = await import('@/lib/ai/analysis-schema');
  const { buildAnalysisMessages } = await import('@/lib/ai/prompts');
  const { OpenAiAnalysisProvider } = await import('@/lib/ai/provider');

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.name, 'AI Evaluation'))
    .limit(1);
  if (!team) {
    console.error('eval team not found');
    process.exit(1);
  }

  const provider = new OpenAiAnalysisProvider();
  console.log(`[probe] provider=${provider.id} model=${provider.model}\n`);

  for (const key of keys) {
    const [row] = await db
      .select()
      .from(cases)
      .where(eq(cases.customerEmail, `eval-${key}@example.org`))
      .limit(1);
    if (!row) {
      console.log(`${key}: case not found`);
      continue;
    }

    const query = `${row.subject} ${row.customerMessage}`;
    const retrieved = await retrieveRelevantKnowledge(query, team.id, {
      limit: 5
    });
    const retrievedIds = retrieved.map((d) => String(d.documentId));
    const caseContent = {
      subject: row.subject,
      customerMessage: row.customerMessage,
      conversationHistory: []
    };
    const { system, prompt } = buildAnalysisMessages(caseContent, retrieved);
    try {
      const raw = await provider.analyze({
        system,
        prompt,
        caseData: caseContent,
        retrievedDocs: retrieved
      });
      const parsed = parseRawAnalysis(raw);
      const ungrounded = parsed.sources.filter(
        (id) => !retrievedIds.includes(id)
      );
      console.log(
        `${key}: OK_raw cat=${parsed.category} conf=${parsed.confidence} retrieved=${JSON.stringify(retrievedIds)} sources=${JSON.stringify(parsed.sources)} ungrounded=${JSON.stringify(ungrounded)}`
      );
    } catch (e) {
      const name = e instanceof Error ? e.constructor.name : 'unknown';
      const msg = e instanceof Error ? e.message : String(e);
      console.log(
        `${key}: ${name} — ${msg} | retrieved=[${retrievedIds.join(',')}]`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

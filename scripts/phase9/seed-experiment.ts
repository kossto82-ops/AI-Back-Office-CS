// Phase 9 experiment seeder (idempotent).
//
// Re-seeds the 21 benchmark cases into the Test Team with the "[P9] " subject
// prefix so the experiment arm can be identified without a schema change.
// Running this script is safe to repeat: it first deletes all existing
// [P9]-prefixed cases (and their analyses) belonging to the Test Team, then
// inserts the frozen benchmark rows with status 'queued'.
//
// The 21 original live seed cases (no prefix) are NEVER touched.

import 'dotenv/config';
import { eq, like, and, inArray } from 'drizzle-orm';
import { db } from '../../lib/db/drizzle';
import { teams, cases, caseAnalyses } from '../../lib/db/schema';
import {
  P9_BENCHMARK,
  EXPERIMENT_SUBJECT_PREFIX,
  experimentSubjectOf
} from './dataset';

async function main() {
  const [team] = await db.select().from(teams).where(eq(teams.name, 'Test Team')).limit(1);

  if (!team) {
    console.error('Test Team not found. Run the project seed first (pnpm db:setup).');
    process.exit(1);
  }

  const existing = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.teamId, team.id), like(cases.subject, `${EXPERIMENT_SUBJECT_PREFIX}%`)));

  const existingIds = existing.map((row) => row.id);
  if (existingIds.length > 0) {
    await db.delete(caseAnalyses).where(inArray(caseAnalyses.caseId, existingIds));
    await db.delete(cases).where(inArray(cases.id, existingIds));
    console.log(`Removed ${existingIds.length} previous experiment cases and their analyses.`);
  }

  const rows = P9_BENCHMARK.map((benchmarkCase) => ({
    teamId: team.id,
    subject: experimentSubjectOf(benchmarkCase),
    customerEmail: benchmarkCase.customerEmail,
    category: benchmarkCase.category,
    status: 'queued',
    customerMessage: benchmarkCase.customerMessage,
    conversationHistory: benchmarkCase.conversationHistory,
  }));

  const inserted = await db.insert(cases).values(rows).returning({ id: cases.id, subject: cases.subject });

  console.log(`Seeded ${inserted.length} Phase 9 experiment cases under Test Team (id ${team.id}).`);
  for (const row of inserted) {
    const benchmarkCase = P9_BENCHMARK.find(
      (c) => experimentSubjectOf(c) === row.subject
    );
    console.log(`  ${benchmarkCase?.key ?? '?'} (${benchmarkCase?.condition ?? '?'}) -> case id ${row.id}: ${row.subject}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('Phase 9 seed failed:', error);
  process.exit(1);
});
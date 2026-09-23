'use server';

import { z } from 'zod';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cases, caseAnalyses } from '@/lib/db/schema';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getTeamForUser, getCaseByIdForTeam } from '@/lib/db/queries';
import { retrieveRelevantKnowledge } from '@/lib/ai/retrieval';
import { analyzeCase } from '@/lib/ai/analyze';
import { isExperimentSubject, p9CaseBySubject } from '@/scripts/phase9/dataset';
import {
  AiInvalidOutputError,
  AiProviderError,
  AiProviderUnavailableError,
  AiSafetyManualReviewError,
  AiSafetyViolationError
} from '@/lib/ai/errors';

const markCaseResolvedSchema = z.object({
  caseId: z.coerce.number().int().positive()
});

export const markCaseResolved = validatedActionWithUser(
  markCaseResolvedSchema,
  async (data) => {
    const team = await getTeamForUser();
    if (!team) {
      return { error: 'User is not part of a team' };
    }

    const [updated] = await db
      .update(cases)
      .set({ status: 'resolved', updatedAt: new Date() })
      .where(and(eq(cases.id, data.caseId), eq(cases.teamId, team.id)))
      .returning({ id: cases.id });

    if (!updated) {
      return { error: 'Case not found' };
    }

    revalidatePath('/dashboard/cases');
    revalidatePath(`/dashboard/cases/${data.caseId}`);
    return { success: 'Case marked as resolved' };
  }
);

const runCaseAnalysisSchema = z.object({
  caseId: z.coerce.number().int().positive()
});

function analysisErrorMessage(error: unknown): string {
  if (error instanceof AiProviderUnavailableError) {
    return 'AI analysis is not configured. Set OPENAI_API_KEY on the server and try again.';
  }
  if (error instanceof AiProviderError) {
    return 'The AI analysis could not be completed. Please try again.';
  }
  if (error instanceof AiInvalidOutputError) {
    return 'The AI returned an invalid or ungrounded analysis. Please re-run.';
  }
  if (error instanceof AiSafetyViolationError) {
    return 'The AI analysis failed the safety validation and was not saved. Please re-run.';
  }
  if (error instanceof AiSafetyManualReviewError) {
    return 'The AI analysis requires human review before it can be used and was not saved as validated.';
  }
  return 'Analysis failed. Please try again.';
}

export const runCaseAnalysis = validatedActionWithUser(
  runCaseAnalysisSchema,
  async (data) => {
    const team = await getTeamForUser();
    if (!team) {
      return { error: 'User is not part of a team' };
    }

    const caseRow = await getCaseByIdForTeam(data.caseId, team.id);
    if (!caseRow) {
      return { error: 'Case not found' };
    }

    const query = `${caseRow.subject} ${caseRow.customerMessage}`;
    const retrievedDocs = await retrieveRelevantKnowledge(query, team.id, {
      limit: 5
    });

    if (retrievedDocs.length === 0) {
      return {
        error:
          'No matching knowledge found for this case. Add relevant documents to the knowledge base first, then re-run the analysis.'
      };
    }

    let analysis;
    try {
      analysis = await analyzeCase({
        caseContent: {
          subject: caseRow.subject,
          customerMessage: caseRow.customerMessage,
          conversationHistory: caseRow.conversationHistory
        },
        retrievedDocs
      });
    } catch (error) {
      if (error instanceof AiSafetyViolationError) {
        console.warn(
          `[safety] case ${caseRow.id} rejected with asserted fragments: ${error.fragments.join(', ')}`
        );
        return {
          error: 'The AI analysis failed the safety validation and was not saved. Please re-run.'
        };
      }
      if (error instanceof AiSafetyManualReviewError) {
        console.warn(
          `[safety] case ${caseRow.id} held for manual review: ${error.fragments.join(', ')}`
        );
        return {
          manualReview:
            'The AI analysis needs human review before it can be used and was not saved as validated.'
        };
      }
      return { error: analysisErrorMessage(error) };
    }

    await db.insert(caseAnalyses).values({
      caseId: caseRow.id,
      category: analysis.category,
      summary: analysis.summary,
      intent: analysis.intent,
      urgency: analysis.urgency,
      recommendedAction: analysis.recommendedAction,
      draftResponse: analysis.draftResponse,
      missingInformation: analysis.missingInformation,
      sources: analysis.sources,
      confidence: analysis.confidence,
      model: analysis.model
    });

    revalidatePath('/dashboard/cases');
    revalidatePath(`/dashboard/cases/${caseRow.id}`);
    return { success: 'Analysis complete' };
  }
);

const recordExperimentResultSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  condition: z.enum(['manual', 'ai']),
  elapsedMs: z.coerce.number().int().min(0),
  editSessions: z.coerce.number().int().min(0),
  keystrokes: z.coerce.number().int().min(0),
  draftResponse: z.string().trim().min(1).max(8000)
});

type ExperimentResultRow = {
  caseId: number;
  caseKey: string | null;
  subject: string;
  condition: 'manual' | 'ai';
  elapsedMs: number;
  editSessions: number;
  keystrokes: number;
  draftResponse: string;
  recordedAt: string;
};

const EXPERIMENT_RESULTS_PATH = 'docs/PHASES/phase9-agent-value-results.json';

async function loadExperimentResults(): Promise<{
  phase: string;
  schemaVersion: number;
  updatedAt: string;
  rows: ExperimentResultRow[];
}> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), EXPERIMENT_RESULTS_PATH), 'utf8');
    const parsed = JSON.parse(raw) as {
      phase?: string;
      schemaVersion?: number;
      updatedAt?: string;
      rows?: ExperimentResultRow[];
    };
    return {
      phase: '9',
      schemaVersion: 1,
      updatedAt: parsed.updatedAt ?? '',
      rows: Array.isArray(parsed.rows) ? parsed.rows : []
    };
  } catch {
    return { phase: '9', schemaVersion: 1, updatedAt: '', rows: [] };
  }
}

export const recordExperimentResult = validatedActionWithUser(
  recordExperimentResultSchema,
  async (data) => {
    const team = await getTeamForUser();
    if (!team) {
      return { error: 'User is not part of a team' };
    }

    const caseRow = await getCaseByIdForTeam(data.caseId, team.id);
    if (!caseRow) {
      return { error: 'Case not found' };
    }
    if (!isExperimentSubject(caseRow.subject)) {
      return { error: 'This case is not part of the Phase 9 experiment.' };
    }

    const benchmarkCase = p9CaseBySubject(caseRow.subject);
    if (!benchmarkCase) {
      return { error: 'Experiment case is not part of the frozen benchmark.' };
    }
    if (benchmarkCase.condition !== data.condition) {
      return {
        error: 'Condition does not match the frozen assignment for this case.'
      };
    }

    const artifact = await loadExperimentResults();
    const record: ExperimentResultRow = {
      caseId: caseRow.id,
      caseKey: benchmarkCase.key,
      subject: caseRow.subject,
      condition: data.condition,
      elapsedMs: data.elapsedMs,
      editSessions: data.editSessions,
      keystrokes: data.keystrokes,
      draftResponse: data.draftResponse,
      recordedAt: new Date().toISOString()
    };
    artifact.rows = artifact.rows.filter(
      (row) => !(row.caseId === record.caseId && row.condition === record.condition)
    );
    artifact.rows.push(record);
    artifact.updatedAt = record.recordedAt;

    const targetPath = path.join(process.cwd(), EXPERIMENT_RESULTS_PATH);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(artifact, null, 2), 'utf8');

    revalidatePath(`/dashboard/cases/${caseRow.id}`);
    return { success: 'Experiment result recorded' };
  }
);
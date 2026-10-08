'use server';

import { z } from 'zod';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cases, caseAnalyses } from '@/lib/db/schema';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { recordCaseEvent } from '@/lib/db/events';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getTeamForUser, getCaseByIdForTeam } from '@/lib/db/queries';
import { retrieveRelevantKnowledge } from '@/lib/ai/retrieval';
import { analyzeCase } from '@/lib/ai/analyze';
import { buildNoCoverageAnalysis, NO_COVERAGE_MODEL } from '@/lib/ai/no-coverage';
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
  async (data, _formData, user) => {
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

    await recordCaseEvent({
      teamId: team.id,
      caseId: updated.id,
      userId: user.id,
      type: 'case_resolved'
    });

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

function blockedReason(error: unknown): string {
  if (error instanceof AiSafetyViolationError) return 'safety_violation';
  if (error instanceof AiSafetyManualReviewError) return 'manual_review';
  if (error instanceof AiInvalidOutputError) return 'invalid_output';
  if (error instanceof AiProviderUnavailableError) return 'provider_unavailable';
  if (error instanceof AiProviderError) return 'provider_error';
  return 'unknown';
}

export const runCaseAnalysis = validatedActionWithUser(
  runCaseAnalysisSchema,
  async (data, _formData, user) => {
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
      // Nothing to ground an answer on: do not call the model. Store a
      // deterministic escalation so the agent gets a next step, not an error.
      const escalation = buildNoCoverageAnalysis();
      await db.insert(caseAnalyses).values({
        caseId: caseRow.id,
        category: null,
        summary: escalation.summary,
        intent: escalation.intent,
        urgency: null,
        recommendedAction: escalation.recommendedAction,
        draftResponse: escalation.draftResponse,
        missingInformation: escalation.missingInformation,
        sources: [],
        confidence: null,
        model: NO_COVERAGE_MODEL
      });
      await recordCaseEvent({
        teamId: team.id,
        caseId: caseRow.id,
        userId: user.id,
        type: 'analysis_blocked',
        meta: { reason: 'no_knowledge', retrievedCount: 0, persistedEscalation: true }
      });
      revalidatePath('/dashboard/cases');
      revalidatePath(`/dashboard/cases/${caseRow.id}`);
      return {
        success:
          'No knowledge matched this case, so no AI analysis was run. A standard escalation was prepared.'
      };
    }

    const startedAt = Date.now();
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
      await recordCaseEvent({
        teamId: team.id,
        caseId: caseRow.id,
        userId: user.id,
        type: 'analysis_blocked',
        meta: {
          reason: blockedReason(error),
          latencyMs: Date.now() - startedAt,
          retrievedCount: retrievedDocs.length,
          persistedForReview:
            error instanceof AiSafetyManualReviewError && Boolean(error.analysis),
          fragments:
            error instanceof AiSafetyViolationError ||
            error instanceof AiSafetyManualReviewError
              ? error.fragments
              : undefined
        }
      });
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
        // The held analysis is schema-valid and grounded: keep it so the human
        // can see it, but flagged, and never as a validated result.
        if (error.analysis) {
          const held = error.analysis;
          await db.insert(caseAnalyses).values({
            caseId: caseRow.id,
            category: held.category,
            summary: held.summary,
            intent: held.intent,
            urgency: held.urgency,
            recommendedAction: held.recommendedAction,
            draftResponse: held.draftResponse,
            missingInformation: held.missingInformation,
            sources: held.sources,
            confidence: held.confidence,
            model: held.model,
            safetyStatus: 'manual_review',
            safetyFragments: error.fragments
          });
          revalidatePath(`/dashboard/cases/${caseRow.id}`);
        }
        return {
          manualReview:
            'The AI analysis was held for human review. It is shown below with the flagged wording; it has not passed the safety check.'
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

    // Cases created through intake start unclassified: adopt the first AI
    // category. An existing category (seeded / human-set) is never overwritten.
    await db
      .update(cases)
      .set({ category: analysis.category, updatedAt: new Date() })
      .where(
        and(
          eq(cases.id, caseRow.id),
          eq(cases.teamId, team.id),
          isNull(cases.category)
        )
      );

    await recordCaseEvent({
      teamId: team.id,
      caseId: caseRow.id,
      userId: user.id,
      type: 'analysis_succeeded',
      meta: {
        latencyMs: Date.now() - startedAt,
        provider: analysis.providerId,
        model: analysis.model,
        category: analysis.category,
        confidence: analysis.confidence,
        retrievedCount: analysis.retrievedDocumentCount,
        sourceCount: analysis.sources.length,
        rerun: caseRow.latestAnalysis !== null,
        usage: analysis.usage ?? undefined
      }
    });

    revalidatePath('/dashboard/cases');
    revalidatePath(`/dashboard/cases/${caseRow.id}`);
    return { success: 'Analysis complete' };
  }
);

const createCaseSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(255),
  customerEmail: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(z.string().email('Customer email is not valid').optional()),
  customerMessage: z
    .string()
    .trim()
    .min(1, 'The customer message is required')
    .max(10000, 'The customer message is too long (max 10,000 characters)')
});

export const createCase = validatedActionWithUser(
  createCaseSchema,
  async (data, _formData, user) => {
    const team = await getTeamForUser();
    if (!team) {
      return { error: 'User is not part of a team' };
    }

    const [created] = await db
      .insert(cases)
      .values({
        teamId: team.id,
        subject: data.subject,
        customerEmail: data.customerEmail ?? null,
        customerMessage: data.customerMessage
      })
      .returning({ id: cases.id });

    await recordCaseEvent({
      teamId: team.id,
      caseId: created.id,
      userId: user.id,
      type: 'case_created'
    });

    revalidatePath('/dashboard/cases');
    redirect(`/dashboard/cases/${created.id}`);
  }
);

const caseSignalSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  edited: z.enum(['true', 'false']).optional()
});

/** Fire-and-forget usage signal: the agent opened the workspace. */
export const recordCaseOpened = validatedActionWithUser(
  caseSignalSchema,
  async (data, _formData, user) => {
    const team = await getTeamForUser();
    if (!team) return { error: 'User is not part of a team' };
    const caseRow = await getCaseByIdForTeam(data.caseId, team.id);
    if (!caseRow) return { error: 'Case not found' };
    await recordCaseEvent({
      teamId: team.id,
      caseId: caseRow.id,
      userId: user.id,
      type: 'case_opened'
    });
    return { success: 'recorded' };
  }
);

/** Fire-and-forget usage signal: the agent copied the draft (edited or not). */
export const recordDraftCopied = validatedActionWithUser(
  caseSignalSchema,
  async (data, _formData, user) => {
    const team = await getTeamForUser();
    if (!team) return { error: 'User is not part of a team' };
    const caseRow = await getCaseByIdForTeam(data.caseId, team.id);
    if (!caseRow) return { error: 'Case not found' };
    await recordCaseEvent({
      teamId: team.id,
      caseId: caseRow.id,
      userId: user.id,
      type: 'draft_copied',
      meta: { edited: data.edited === 'true' }
    });
    return { success: 'recorded' };
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
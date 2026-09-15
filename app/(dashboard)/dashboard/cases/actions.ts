'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cases, caseAnalyses } from '@/lib/db/schema';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getTeamForUser, getCaseByIdForTeam } from '@/lib/db/queries';
import { retrieveRelevantKnowledge } from '@/lib/ai/retrieval';
import { analyzeCase } from '@/lib/ai/analyze';
import {
  AiInvalidOutputError,
  AiProviderError,
  AiProviderUnavailableError
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
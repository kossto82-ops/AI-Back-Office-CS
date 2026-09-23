import { redirect, notFound } from 'next/navigation';
import {
  getUser,
  getTeamForUser,
  getCaseByIdForTeam,
  getDocumentsByIdsForTeam
} from '@/lib/db/queries';
import type { AnalysisSource } from '@/lib/db/schema';
import { CaseWorkspace, type WorkspaceSource } from './case-workspace';
import {
  isExperimentSubject,
  EXPERIMENT_PARAM,
  EXPERIMENT_CONDITIONS,
  type P9Condition
} from '@/scripts/phase9/dataset';

export const dynamic = 'force-dynamic';

function isStructuredSource(value: unknown): value is AnalysisSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'documentId' in value &&
    typeof (value as AnalysisSource).documentId === 'number'
  );
}

export default async function CasePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ exp?: string; cond?: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const team = await getTeamForUser();
  if (!team) {
    redirect('/sign-in');
  }

  const caseId = Number(id);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    notFound();
  }

  const caseRow = await getCaseByIdForTeam(caseId, team.id);
  if (!caseRow) {
    notFound();
  }

  const { exp, cond } = await searchParams;
  const experiment =
    isExperimentSubject(caseRow.subject) &&
    exp === EXPERIMENT_PARAM &&
    EXPERIMENT_CONDITIONS.includes(cond as P9Condition)
      ? { condition: cond as P9Condition }
      : null;

  let latestAnalysis: {
    category: string | null;
    summary: string | null;
    intent: string | null;
    urgency: string | null;
    recommendedAction: string | null;
    draftResponse: string | null;
    missingInformation: string[];
    confidence: number | null;
    model: string | null;
    createdAt: string;
    sources: WorkspaceSource[];
  } | null = null;

  const analysis = caseRow.latestAnalysis;
  if (analysis) {
    const rawSources: unknown[] = Array.isArray(analysis.sources)
      ? analysis.sources
      : [];
    const structuredSources = rawSources.filter(isStructuredSource);
    const documentIds = [
      ...new Set(structuredSources.map((source) => source.documentId))
    ];
    const documents = await getDocumentsByIdsForTeam(documentIds, team.id);
    const documentsById = new Map(documents.map((doc) => [doc.id, doc]));

    const sources: WorkspaceSource[] = rawSources.map((source) => {
      if (!isStructuredSource(source)) {
        return {
          documentId: null,
          relevance: 0,
          legacy: typeof source === 'string' ? source : null
        };
      }
      const doc = documentsById.get(source.documentId);
      return {
        documentId: source.documentId,
        relevance: source.relevance,
        legacy: null,
        title: doc?.title,
        type: doc?.type,
        version: doc?.version
      };
    });

    latestAnalysis = {
      category: analysis.category,
      summary: analysis.summary,
      intent: analysis.intent,
      urgency: analysis.urgency,
      recommendedAction: analysis.recommendedAction,
      draftResponse: analysis.draftResponse,
      missingInformation: analysis.missingInformation,
      confidence: analysis.confidence,
      model: analysis.model,
      createdAt: analysis.createdAt.toISOString(),
      sources
    };
  }

  return (
    <CaseWorkspace
      caseRow={{
        id: caseRow.id,
        subject: caseRow.subject,
        customerEmail: caseRow.customerEmail,
        category: caseRow.category,
        status: caseRow.status,
        customerMessage: caseRow.customerMessage,
        conversationHistory: caseRow.conversationHistory,
        createdAt: caseRow.createdAt.toISOString(),
        latestAnalysis
      }}
      experiment={experiment}
    />
  );
}
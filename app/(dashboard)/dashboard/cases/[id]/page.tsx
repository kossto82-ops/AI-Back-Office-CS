import { redirect, notFound } from 'next/navigation';
import { getUser, getTeamForUser, getCaseByIdForTeam } from '@/lib/db/queries';
import { CaseWorkspace } from './case-workspace';

export const dynamic = 'force-dynamic';

export default async function CasePage({
  params
}: {
  params: Promise<{ id: string }>;
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

  const analysis = caseRow.latestAnalysis;
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
        latestAnalysis: analysis
          ? {
              category: analysis.category,
              summary: analysis.summary,
              intent: analysis.intent,
              urgency: analysis.urgency,
              recommendedAction: analysis.recommendedAction,
              draftResponse: analysis.draftResponse,
              missingInformation: analysis.missingInformation,
              sources: analysis.sources,
              confidence: analysis.confidence,
              model: analysis.model,
              createdAt: analysis.createdAt.toISOString()
            }
          : null
      }}
    />
  );
}
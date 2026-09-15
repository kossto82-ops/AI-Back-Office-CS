import { redirect, notFound } from 'next/navigation';
import { getUser, getTeamForUser, getDocumentByIdForTeam } from '@/lib/db/queries';
import { DocumentWorkspace } from './document-workspace';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({
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

  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    notFound();
  }

  const document = await getDocumentByIdForTeam(documentId, team.id);
  if (!document) {
    notFound();
  }

  return (
    <DocumentWorkspace
      document={{
        id: document.id,
        title: document.title,
        type: document.type,
        status: document.status,
        version: document.version,
        content: document.content,
        creatorName: document.creatorName,
        updatedAt: document.updatedAt.toISOString()
      }}
    />
  );
}
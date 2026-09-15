import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { DocumentEditor } from '../document-editor';

export const dynamic = 'force-dynamic';

export default async function NewDocumentPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const team = await getTeamForUser();
  if (!team) {
    redirect('/sign-in');
  }

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/dashboard/knowledge"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Knowledge Base
      </Link>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-lg">Create document</CardTitle>
          <CardDescription>
            Add trusted internal knowledge for {team.name}. Procedures, FAQs,
            and guides will be searchable and later retrievable by the AI
            analysis pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentEditor
            document={{ title: '', type: 'procedure', content: '', status: 'active' }}
          />
        </CardContent>
      </Card>
    </section>
  );
}
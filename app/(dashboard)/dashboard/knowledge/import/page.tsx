import { redirect } from 'next/navigation';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { ImportForm } from './import-form';

export const dynamic = 'force-dynamic';

export default async function ImportKnowledgePage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  const team = await getTeamForUser();
  if (!team) {
    redirect('/sign-in');
  }

  return <ImportForm />;
}

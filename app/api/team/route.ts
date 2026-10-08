import { getPublicTeamForUser } from '@/lib/db/queries';

export async function GET() {
  const team = await getPublicTeamForUser();
  return Response.json(team);
}

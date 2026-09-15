import { desc, and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  teamMembers,
  teams,
  users,
  cases,
  caseAnalyses,
  Case,
  CaseAnalysis,
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getTeamByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(teams.id, teamId));
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
    with: {
      team: {
        with: {
          teamMembers: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  return result?.team || null;
}

export type CaseWithLatestAnalysis = Case & {
  latestAnalysis: CaseAnalysis | null;
};

export async function getCasesForTeam(
  teamId: number
): Promise<CaseWithLatestAnalysis[]> {
  const teamCases = await db
    .select()
    .from(cases)
    .where(eq(cases.teamId, teamId))
    .orderBy(desc(cases.createdAt));

  if (teamCases.length === 0) {
    return [];
  }

  const analyses = await db
    .select()
    .from(caseAnalyses)
    .where(inArray(caseAnalyses.caseId, teamCases.map((c) => c.id)))
    .orderBy(desc(caseAnalyses.createdAt));

  const latestByCase = new Map<number, CaseAnalysis>();
  for (const analysis of analyses) {
    if (!latestByCase.has(analysis.caseId)) {
      latestByCase.set(analysis.caseId, analysis);
    }
  }

  return teamCases.map((caseRow) => ({
    ...caseRow,
    latestAnalysis: latestByCase.get(caseRow.id) ?? null
  }));
}

export async function getCaseByIdForTeam(
  caseId: number,
  teamId: number
): Promise<CaseWithLatestAnalysis | null> {
  const [caseRow] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.teamId, teamId)))
    .limit(1);

  if (!caseRow) {
    return null;
  }

  const [latestAnalysis] = await db
    .select()
    .from(caseAnalyses)
    .where(eq(caseAnalyses.caseId, caseId))
    .orderBy(desc(caseAnalyses.createdAt))
    .limit(1);

  return {
    ...caseRow,
    latestAnalysis: latestAnalysis ?? null
  };
}

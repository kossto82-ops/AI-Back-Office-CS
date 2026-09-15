import { desc, and, eq, isNull, inArray, or, ilike } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  teamMembers,
  teams,
  users,
  cases,
  caseAnalyses,
  documents,
  Case,
  CaseAnalysis,
  Document,
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

// --- Documents ---

export type DocumentWithCreator = Document & {
  creatorName: string | null;
};

export async function getDocumentsForTeam(
  teamId: number,
  search?: string
): Promise<DocumentWithCreator[]> {
  const term = search?.trim() ?? '';
  const conditions: ReturnType<typeof eq>[] = [eq(documents.teamId, teamId)];

  if (term) {
    const escaped = term.replace(/[\\%_]/g, (m) => `\\${m}`);
    conditions.push(
      or(
        ilike(documents.title, `%${escaped}%`),
        ilike(documents.content, `%${escaped}%`)
      )!
    );
  }

  return await db
    .select({
      id: documents.id,
      teamId: documents.teamId,
      title: documents.title,
      type: documents.type,
      content: documents.content,
      status: documents.status,
      version: documents.version,
      creatorId: documents.creatorId,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      creatorName: users.name,
    })
    .from(documents)
    .leftJoin(users, eq(documents.creatorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt));
}

export type DocumentDetail = Document & {
  creatorName: string | null;
};

export async function getDocumentByIdForTeam(
  documentId: number,
  teamId: number
): Promise<DocumentDetail | null> {
  const [row] = await db
    .select({
      id: documents.id,
      teamId: documents.teamId,
      title: documents.title,
      type: documents.type,
      content: documents.content,
      status: documents.status,
      version: documents.version,
      creatorId: documents.creatorId,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      creatorName: users.name,
    })
    .from(documents)
    .leftJoin(users, eq(documents.creatorId, users.id))
    .where(and(eq(documents.id, documentId), eq(documents.teamId, teamId)))
    .limit(1);

  return row ?? null;
}

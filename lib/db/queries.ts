import { desc, and, eq, isNull, inArray, or, ilike, ne, sql, gte } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  teamMembers,
  teams,
  users,
  cases,
  caseAnalyses,
  documents,
  documentVersions,
  caseEvents,
  Case,
  CaseAnalysis,
  Document,
  User,
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

/**
 * Client-safe projections. getUser()/getTeamForUser() return full rows (password
 * hash, Stripe ids); those must never be serialized into a page payload or an
 * API response, so everything that crosses the server/client boundary goes
 * through these.
 */
export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'role'>;

export async function getPublicUser(): Promise<PublicUser | null> {
  const user = await getUser();
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function getPublicTeamForUser() {
  const team = await getTeamForUser();
  if (!team) return null;
  const {
    stripeCustomerId: _customerId,
    stripeSubscriptionId: _subscriptionId,
    stripeProductId: _productId,
    ...publicTeam
  } = team;
  return publicTeam;
}

export type CaseWithLatestAnalysis = Case & {
  latestAnalysis: CaseAnalysis | null;
};

export type CaseListFilter = 'open' | 'resolved' | 'all';

/**
 * Cases for the team's list. Open cases come first (the working queue), then
 * resolved ones; newest first inside each group. Only the LATEST analysis per
 * case is loaded (DISTINCT ON), not every historical re-run.
 */
export async function getCasesForTeam(
  teamId: number,
  filter: CaseListFilter = 'all'
): Promise<CaseWithLatestAnalysis[]> {
  const conditions = [eq(cases.teamId, teamId)];
  if (filter === 'open') conditions.push(ne(cases.status, 'resolved'));
  if (filter === 'resolved') conditions.push(eq(cases.status, 'resolved'));

  const teamCases = await db
    .select()
    .from(cases)
    .where(and(...conditions))
    .orderBy(
      sql`case when ${cases.status} = 'resolved' then 1 else 0 end`,
      desc(cases.createdAt)
    );

  if (teamCases.length === 0) {
    return [];
  }

  const analyses = await db
    .selectDistinctOn([caseAnalyses.caseId])
    .from(caseAnalyses)
    .where(inArray(caseAnalyses.caseId, teamCases.map((c) => c.id)))
    .orderBy(caseAnalyses.caseId, desc(caseAnalyses.createdAt));

  const latestByCase = new Map<number, CaseAnalysis>();
  for (const analysis of analyses) {
    latestByCase.set(analysis.caseId, analysis);
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

export async function getDocumentsByIdsForTeam(
  documentIds: number[],
  teamId: number
): Promise<Document[]> {
  if (documentIds.length === 0) {
    return [];
  }
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.teamId, teamId), inArray(documents.id, documentIds)));
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

export type DocumentVersionRow = {
  version: number;
  title: string;
  type: string;
  content: string;
  createdAt: Date;
  authorName: string | null;
};

export async function getDocumentVersionsForTeam(
  documentId: number,
  teamId: number
): Promise<DocumentVersionRow[]> {
  return db
    .select({
      version: documentVersions.version,
      title: documentVersions.title,
      type: documentVersions.type,
      content: documentVersions.content,
      createdAt: documentVersions.createdAt,
      authorName: users.name
    })
    .from(documentVersions)
    .leftJoin(users, eq(documentVersions.authorId, users.id))
    .where(
      and(
        eq(documentVersions.documentId, documentId),
        eq(documentVersions.teamId, teamId)
      )
    )
    .orderBy(desc(documentVersions.version));
}

/** Content-free usage events for one team, optionally since a date. */
export async function getCaseEventsForTeam(teamId: number, since?: Date) {
  return db
    .select({
      caseId: caseEvents.caseId,
      type: caseEvents.type,
      meta: caseEvents.meta,
      createdAt: caseEvents.createdAt
    })
    .from(caseEvents)
    .where(
      since
        ? and(eq(caseEvents.teamId, teamId), gte(caseEvents.createdAt, since))
        : eq(caseEvents.teamId, teamId)
    )
    .orderBy(caseEvents.createdAt);
}

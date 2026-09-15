import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { documents } from '@/lib/db/schema';

export type RetrievedDocument = {
  documentId: number;
  title: string;
  type: string;
  status: string;
  version: number;
  content: string;
  score: number;
};

export type RetrievalQuery = {
  query: string;
  teamId: number;
  limit?: number;
  types?: readonly string[];
  includeDrafts?: boolean;
};

export type RetrievalProvider = {
  retrieve(query: RetrievalQuery): Promise<RetrievedDocument[]>;
};

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function scoreDocument(
  doc: { title: string; content: string; status: string },
  term: string
): number {
  const titleLower = doc.title.toLowerCase();
  const contentLower = doc.content.toLowerCase();
  const termLower = term.toLowerCase();
  let score = 0;
  if (titleLower.includes(termLower)) score += 3;
  else if (contentLower.includes(termLower)) score += 1;
  if (doc.status === 'active') score += 1;
  return score;
}

class PostgresTextRetrievalProvider implements RetrievalProvider {
  async retrieve({
    query,
    teamId,
    limit = 5,
    types,
    includeDrafts = false
  }: RetrievalQuery): Promise<RetrievedDocument[]> {
    const term = query.trim();
    if (!term) return [];

    const escaped = escapeLike(term);
    const conditions = [eq(documents.teamId, teamId)];

    if (!includeDrafts) {
      conditions.push(eq(documents.status, 'active'));
    }

    if (types && types.length > 0) {
      conditions.push(
        or(...types.map((t) => eq(documents.type, t)))!
      );
    }

    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
        status: documents.status,
        version: documents.version,
        content: documents.content
      })
      .from(documents)
      .where(
        and(
          ...conditions,
          or(
            ilike(documents.title, `%${escaped}%`),
            ilike(documents.content, `%${escaped}%`)
          )!
        )
      )
      .orderBy(desc(documents.updatedAt))
      .limit(100);

    return rows
      .map((row) => ({
        documentId: row.id,
        title: row.title,
        type: row.type,
        status: row.status,
        version: row.version,
        content: row.content,
        score: scoreDocument(row, term)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export const retrieval: RetrievalProvider = new PostgresTextRetrievalProvider();

export async function retrieveRelevantKnowledge(
  query: string,
  teamId: number,
  options?: { limit?: number; types?: readonly string[]; includeDrafts?: boolean }
): Promise<RetrievedDocument[]> {
  return retrieval.retrieve({ query, teamId, ...options });
}

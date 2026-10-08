import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { documents } from '@/lib/db/schema';
import { scoreDocument, tokenize } from './retrieval-scoring';

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

class PostgresTextRetrievalProvider implements RetrievalProvider {
  async retrieve({
    query,
    teamId,
    limit = 5,
    types,
    includeDrafts = false
  }: RetrievalQuery): Promise<RetrievedDocument[]> {
    const term = query.trim();
    const phrase = term.toLowerCase();
    const keywords = tokenize(term);
    if (keywords.length === 0) return [];

    const escapedPhrase = escapeLike(phrase);
    const conditions = [eq(documents.teamId, teamId)];

    if (!includeDrafts) {
      conditions.push(eq(documents.status, 'active'));
    }

    if (types && types.length > 0) {
      conditions.push(
        or(...types.map((t) => eq(documents.type, t)))!
      );
    }

    const termMatches = [
      ilike(documents.title, `%${escapedPhrase}%`),
      ilike(documents.content, `%${escapedPhrase}%`)
    ];
    if (keywords.length > 1) {
      for (const keyword of keywords) {
        const escaped = escapeLike(keyword);
        termMatches.push(
          ilike(documents.title, `%${escaped}%`),
          ilike(documents.content, `%${escaped}%`)
        );
      }
    }
    conditions.push(or(...termMatches)!);

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
      .where(and(...conditions))
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
        score: scoreDocument(row, keywords, phrase)
      }))
      .filter((row) => row.score > 0)
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

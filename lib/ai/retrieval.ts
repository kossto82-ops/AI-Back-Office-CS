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

const STOPWORDS = new Set([
  'the',
  'and',
  'are',
  'for',
  'but',
  'not',
  'you',
  'your',
  'that',
  'this',
  'with',
  'from',
  'have',
  'has',
  'had',
  'was',
  'were',
  'will',
  'would',
  'which',
  'than',
  'into',
  'been',
  'being',
  'their',
  'them',
  'they',
  'there',
  'here',
  'when',
  'where',
  'about',
  'between',
  'because',
  'what',
  'how',
  'can',
  'could',
  'should',
  'just',
  'then',
  'want',
  'would',
  'also',
  'more'
]);

function tokenize(input: string): string[] {
  const words = input.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const word of words) {
    if (word.length < 4) continue;
    if (STOPWORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
  }
  return keywords.slice(0, 12);
}

function scoreDocument(
  doc: { title: string; content: string; status: string },
  keywords: string[],
  phrase: string
): number {
  const titleLower = doc.title.toLowerCase();
  const contentLower = doc.content.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (titleLower.includes(keyword)) score += 3;
    else if (contentLower.includes(keyword)) score += 1;
  }
  if (phrase.length > 0) {
    if (titleLower.includes(phrase)) score += 3;
    else if (contentLower.includes(phrase)) score += 1;
  }
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

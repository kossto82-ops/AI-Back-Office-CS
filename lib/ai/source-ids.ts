import type { RawAnalysis } from './analysis-schema';
import { AiInvalidOutputError } from './errors';
import type { RetrievedDocument } from './retrieval';

export type AnalysisSourceRef = {
  documentId: number;
  relevance: number;
};

/**
 * Canonicalizes a source id emitted by the model.
 *
 * Accepts harmless formatting variations of a numeric document id:
 *   "92", "[92]", " 92 ", "[ 92 ]"  -> "92"
 *
 * Returns null for anything that is not a bare numeric id (document titles,
 * free-form names, nested/odd bracket forms, empty strings). Returning null
 * means "not resolvable to a retrieved document", which the caller rejects.
 */
export function normalizeSourceId(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const bracketMatch = /^\[\s*(.*?)\s*\]$/.exec(trimmed);
  const inner = (bracketMatch ? bracketMatch[1] : trimmed).trim();
  if (inner === '') return null;

  if (!/^\d+$/.test(inner)) return null;

  return inner.replace(/^0+(?=\d)/, '');
}

/**
 * Resolves the model-cited source ids against the documents actually retrieved
 * for this case.
 *
 * Grounding is preserved exactly: an id is accepted only if it normalizes to a
 * document in `retrievedDocs`. Ids that were not retrieved (including another
 * team's document ids, which are never part of `retrievedDocs`) are rejected
 * with AiInvalidOutputError. Document titles / free-form names are not valid
 * substitutes for ids.
 */
export function resolveSources(
  parsed: Pick<RawAnalysis, 'sources'>,
  retrievedDocs: RetrievedDocument[]
): AnalysisSourceRef[] {
  const docsById = new Map(
    retrievedDocs.map((doc) => [String(doc.documentId), doc])
  );

  const sources: AnalysisSourceRef[] = [];

  for (const raw of parsed.sources) {
    const canonicalId = normalizeSourceId(raw);
    const doc = canonicalId === null ? undefined : docsById.get(canonicalId);
    if (!doc) {
      throw new AiInvalidOutputError(
        'AI output references a source that was not retrieved from the knowledge base'
      );
    }
    sources.push({ documentId: doc.documentId, relevance: doc.score });
  }

  return sources;
}

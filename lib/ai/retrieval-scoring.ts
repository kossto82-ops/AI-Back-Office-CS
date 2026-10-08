/**
 * Pure keyword extraction and scoring for the text retrieval provider.
 * Kept free of DB imports so it can be unit-tested offline.
 */

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

// Unicode-aware: an ASCII-only pattern split accented words ("cancelación" ->
// "cancelaci" + "n") and produced no keywords at all for non-Latin scripts.
export function tokenize(input: string): string[] {
  const words = input.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
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

export function scoreDocument(
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

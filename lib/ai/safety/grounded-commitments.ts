/**
 * Grounded-commitment check (deterministic, no model).
 *
 * The phrase-list gate recognises wordings; this check recognises the thing the
 * product principle actually forbids: the draft states a figure or a remedy
 * that the retrieved knowledge does not support.
 *
 *   figure   a price/amount, percentage, duration or data allowance in the
 *            customer-facing draft that appears neither in any retrieved
 *            document nor in the customer's own words (echoing the customer's
 *            figure is not a company commitment).
 *   remedy   a firm, unhedged promise of a remedy (refund, credit, waiver,
 *            discount, compensation, replacement, extension, exception) that no
 *            retrieved document offers unconditionally.
 *
 * Only the customer-facing draft is inspected: the recommended action is
 * written for the agent and legitimately discusses approvals and limits.
 */
import { normalizeText, splitSentences } from './safety-evaluator';

export type CommitmentFinding = {
  kind: 'figure' | 'remedy';
  sentence: string;
  detail: string;
};

export type GroundingDoc = { title: string; content: string };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, sixty: 60
};
const NUMBER_WORD_RE = Object.keys(NUMBER_WORDS).join('|');

const DURATION_UNITS = 'minutes?|mins?|hours?|hrs?|days?|business days|weeks?|months?|years?';

function unitClass(unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith('min')) return 'minute';
  if (u.startsWith('h')) return 'hour';
  if (u.startsWith('business')) return 'day';
  if (u.startsWith('d')) return 'day';
  if (u.startsWith('w')) return 'week';
  if (u.startsWith('mo')) return 'month';
  return 'year';
}

function num(value: string): string {
  return String(Number(value.replace(',', '.')));
}

/** Figure keys such as "money:25", "pct:50", "hour:24", "gb:30". */
export function extractFigures(text: string): Set<string> {
  const t = normalizeText(text);
  const out = new Set<string>();
  const add = (key: string) => out.add(key);

  for (const m of t.matchAll(/(?:€|\$|£)\s?(\d+(?:[.,]\d+)?)/g)) add(`money:${num(m[1])}`);
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s?(?:eur|euros?|usd|dollars?|€|\$|£)/g)) add(`money:${num(m[1])}`);
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s?(?:%|percent|per cent)/g)) add(`pct:${num(m[1])}`);
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s?gb\b/g)) add(`gb:${num(m[1])}`);
  for (const m of t.matchAll(new RegExp(`(\\d+)[\\s-]?(${DURATION_UNITS})\\b`, 'g'))) {
    add(`${unitClass(m[2])}:${Number(m[1])}`);
  }
  for (const m of t.matchAll(new RegExp(`\\b(${NUMBER_WORD_RE})[\\s-](${DURATION_UNITS})\\b`, 'g'))) {
    add(`${unitClass(m[2])}:${NUMBER_WORDS[m[1]]}`);
  }
  // "within an hour" is a one-unit time commitment.
  for (const m of t.matchAll(/\bwithin\s+(?:an?|the)\s+(hour|day|week|month)\b/g)) add(`${m[1]}:1`);
  return out;
}

const REMEDY_STEMS: Array<{ label: string; stem: string }> = [
  { label: 'refund', stem: 'refund' },
  { label: 'reimbursement', stem: 'reimburs' },
  { label: 'credit', stem: 'credit' },
  { label: 'waiver', stem: 'waive' },
  { label: 'compensation', stem: 'compensat' },
  { label: 'discount', stem: 'discount' },
  { label: 'replacement', stem: 'replac' },
  { label: 'extension', stem: 'extend' },
  { label: 'exception', stem: 'exception' }
];

const FIRM_PROMISE_RE = new RegExp(
  '\\b(?:we|i|our team)\\b[^.!?;]{0,30}?\\b(?:will|shall|can|are able to|am able to|are going to|would be happy to|are happy to)\\b' +
    '[^.!?;]{0,40}?\\b(refund|reimburs\\w*|credit|waive|compensat\\w*|discount|replace|extend|make an exception|exempt)\\w*' +
    '|\\byou(?:\\s+will|\\s+can)\\s+(?:receive|get|be (?:refunded|credited|compensated))\\b',
  'i'
);
const HEDGE_RE =
  /\b(if|once|provided|subject to|pending|upon|after we|after the|unless|depending|whether|eligible|eligibility|approval|approved|may|might|could|review|check|investigat\w*|verify|confirm whether)\b/i;
const NEGATION_RE = /\b(not|never|no|cannot|can't|cant|unable|won't|don't|doesn't)\b|n't\b/i;
const DOC_CONDITION_RE = /\b(only|require\w*|approval|limit\w*|capped|eligible|unless|if)\b/i;

function stemFor(sentence: string): { label: string; stem: string } | null {
  const lower = sentence.toLowerCase();
  if (/make an exception|exempt/.test(lower)) return { label: 'exception', stem: 'exception' };
  for (const remedy of REMEDY_STEMS) {
    if (lower.includes(remedy.stem)) return remedy;
  }
  return null;
}

/** True when some document sentence offers this remedy without negating or conditioning it. */
function docsOfferUnconditionally(docs: GroundingDoc[], stem: string): boolean {
  for (const doc of docs) {
    for (const sentence of splitSentences(normalizeText(doc.content.replace(/\n+/g, '. ')))) {
      if (!sentence.includes(stem)) continue;
      if (NEGATION_RE.test(sentence)) continue;
      if (DOC_CONDITION_RE.test(sentence)) continue;
      return true;
    }
  }
  return false;
}

export function findUnsupportedCommitments(input: {
  draftResponse: string;
  /** The customer's own words (subject, message, history). */
  caseText: string;
  docs: GroundingDoc[];
}): CommitmentFinding[] {
  const findings: CommitmentFinding[] = [];
  const docFigures = new Set<string>();
  for (const doc of input.docs) {
    for (const f of extractFigures(`${doc.title}. ${doc.content}`)) docFigures.add(f);
  }
  const customerFigures = extractFigures(input.caseText);

  for (const sentence of splitSentences(normalizeText(input.draftResponse))) {
    for (const figure of extractFigures(sentence)) {
      if (!docFigures.has(figure) && !customerFigures.has(figure)) {
        findings.push({ kind: 'figure', sentence, detail: `figure ${figure} is not in the retrieved knowledge or the customer's message` });
      }
    }

    if (FIRM_PROMISE_RE.test(sentence) && !HEDGE_RE.test(sentence) && !NEGATION_RE.test(sentence)) {
      const remedy = stemFor(sentence);
      if (remedy && !docsOfferUnconditionally(input.docs, remedy.stem)) {
        findings.push({ kind: 'remedy', sentence, detail: `firm promise of ${remedy.label} that no retrieved document offers unconditionally` });
      }
    }
  }
  return findings;
}

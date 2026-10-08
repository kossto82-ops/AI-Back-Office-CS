/**
 * Grounded-commitment detector: hand-written cases, independent of the
 * model-output corpus. Run: pnpm test:unit
 */
import assert from 'node:assert/strict';
import {
  extractFigures,
  findUnsupportedCommitments,
  type GroundingDoc
} from '../../lib/ai/safety/grounded-commitments';

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const INVOICE: GroundingDoc = {
  title: 'Invoice adjustments',
  content:
    'The standard adjustment limit is 25 EUR per invoice.\nAdjustments above 25 EUR and any refund amount require approval from a lead.\nRefunds are only granted for genuine billing errors within the last 90 days.'
};
const RETENTION: GroundingDoc = {
  title: 'Retention',
  content: 'The current catalogue contains exactly two options: a 3 GB/month data top-up at 40% off for 6 months, or a 50 EUR one-time credit.'
};
const OUTAGE: GroundingDoc = {
  title: 'Outage',
  content: 'No compensation or refund applies to short service interruptions.'
};

function run(draft: string, docs: GroundingDoc[], caseText = '') {
  return findUnsupportedCommitments({ draftResponse: draft, caseText, docs });
}

console.log('Grounded commitments');

check('figure extraction: money, percent, data, durations incl. number words', () => {
  const f = extractFigures('Pay 25 EUR or €30, get 40% off, 30 GB, within 24 hours, two days, 6-month plan, within an hour');
  for (const key of ['money:25', 'money:30', 'pct:40', 'gb:30', 'hour:24', 'day:2', 'month:6', 'hour:1']) {
    assert.ok(f.has(key), `missing ${key} in ${[...f].join(',')}`);
  }
});

check('an invented figure is flagged', () => {
  const findings = run('We can give you 15% off for 12 months.', [INVOICE]);
  assert.ok(findings.some((f) => f.kind === 'figure' && f.detail.includes('pct:15')));
  assert.ok(findings.some((f) => f.detail.includes('month:12')));
});

check('a figure that is in the knowledge is not flagged', () => {
  assert.deepEqual(run('The standard adjustment limit is 25 EUR per invoice.', [INVOICE]), []);
  assert.deepEqual(run('Refunds apply within the last 90 days.', [INVOICE]), []);
});

check('the customer\'s own figure is an echo, not a commitment', () => {
  assert.deepEqual(run('I understand the extra 40 EUR charge is a concern.', [INVOICE], 'There is a 40 EUR charge on my bill'), []);
});

check('a time guarantee not in the knowledge is flagged', () => {
  const findings = run('We will fix this within an hour.', [INVOICE]);
  assert.ok(findings.some((f) => f.kind === 'figure' && f.detail.includes('hour:1')));
});

check('a firm refund promise that no document offers is flagged', () => {
  const findings = run('We will refund you in full for the inconvenience.', [OUTAGE]);
  assert.ok(findings.some((f) => f.kind === 'remedy'));
});

check('a firm refund promise is flagged even when documents only offer it conditionally', () => {
  const findings = run('We will refund the 25 EUR right away.', [INVOICE]);
  assert.ok(findings.some((f) => f.kind === 'remedy'));
});

check('hedged or conditional wording is not a firm promise', () => {
  assert.deepEqual(run('If the error is confirmed we will refund the amount.', [OUTAGE]), []);
  assert.deepEqual(run('We will review whether a refund applies.', [OUTAGE]), []);
  assert.deepEqual(run('Once a lead approves it we can credit your account.', [OUTAGE]), []);
});

check('refusals are not commitments', () => {
  assert.deepEqual(run('We cannot refund interruptions of this kind.', [OUTAGE]), []);
  assert.deepEqual(run('We will not be able to waive the fee.', [OUTAGE]), []);
});

check('a remedy the knowledge offers unconditionally, with its own figure, is allowed', () => {
  assert.deepEqual(run('We can offer you a 50 EUR one-time credit.', [RETENTION]), []);
  assert.deepEqual(run('You can get a data top-up at 40% off for 6 months.', [RETENTION]), []);
});

check('plain, remedy-free drafts produce no findings', () => {
  assert.deepEqual(run('Thank you for contacting us. We are checking your account and will get back to you.', [INVOICE]), []);
});

if (failures > 0) {
  console.error(`\ngrounded-commitments.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\ngrounded-commitments.test.ts: all checks passed');

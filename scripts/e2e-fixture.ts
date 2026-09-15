import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { caseAnalyses, cases } from '../lib/db/schema';

const ACTION = process.argv[2] ?? '';
const CASE_ID = Number(process.argv[3] ?? 2);

async function main() {
  if (ACTION === 'insert') {
    await db.insert(caseAnalyses).values({
      caseId: CASE_ID,
      category: 'billing',
      summary:
        'Customer was charged the full activation fee despite a 50% promotional discount applied to the order.',
      intent: 'Request a partial refund for the overcharged activation fee.',
      urgency: 'low',
      recommendedAction:
        'Approve a partial refund of the overcharged fee (50% of it) and confirm the promotion was applied correctly on the invoice.',
      draftResponse:
        `Hi,\n\nThank you for contacting us about the activation fee on your invoice.\n\n` +
        `Your order was eligible for a 50% discount on the activation fee, which should have been applied automatically. ` +
        `We have already adjusted the invoice and issued a partial refund for the amount overcharged. ` +
        `You should see the refund on the original payment method within 5 business days.\n\n` +
        `Apologies for the inconvenience.\n\nBest regards,\nCustomer Service`,
      missingInformation: ['Order number'],
      sources: [
        'Procedure: New Line Activation Procedure (v3)',
        'FAQ: How do I check the status of my refund?'
      ],
      confidence: 0.92,
      model: 'e2e-fixture'
    });
    console.log(`Inserted analysis fixture for case ${CASE_ID}`);
  } else if (ACTION === 'delete') {
    await db
      .delete(caseAnalyses)
      .where(and(eq(caseAnalyses.caseId, CASE_ID), eq(caseAnalyses.model, 'e2e-fixture')));
    console.log(`Deleted analysis fixture for case ${CASE_ID}`);
  } else if (ACTION === 'unresolve') {
    await db
      .update(cases)
      .set({ status: 'queued' })
      .where(eq(cases.id, CASE_ID));
    console.log(`Set case ${CASE_ID} back to queued`);
  } else {
    console.error('Usage: e2e-fixture.ts <insert|delete|unresolve> [caseId]');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
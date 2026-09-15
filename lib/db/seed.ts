import { stripe } from '../payments/stripe';
import { db } from './drizzle';
import { users, teams, teamMembers, documents, cases } from './schema';
import {
  NewDocument,
  NewCase,
  ConversationTurn,
} from './schema';
import { hashPassword } from '@/lib/auth/session';

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  const baseProduct = await stripe.products.create({
    name: 'Base',
    description: 'Base subscription plan',
  });

  await stripe.prices.create({
    product: baseProduct.id,
    unit_amount: 800, // $8 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  const plusProduct = await stripe.products.create({
    name: 'Plus',
    description: 'Plus subscription plan',
  });

  await stripe.prices.create({
    product: plusProduct.id,
    unit_amount: 1200, // $12 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  console.log('Stripe products and prices created successfully.');
}

const seedDocuments: Omit<NewDocument, 'teamId' | 'creatorId'>[] = [
  // Procedures
  {
    title: 'New Line Activation Procedure',
    type: 'procedure',
    status: 'active',
    version: 3,
    content:
      'Activate a new physical SIM or eSIM for a customer with a complete order.\n\n' +
      'Steps:\n' +
      '1. Verify the order exists in the activation queue and the customer identity matches the order (ID document or account access).\n' +
      '2. For physical SIM: confirm the SIM ICCID matches the dispatched unit. For eSIM: generate a QR code and send it to the customer email on file.\n' +
      '3. Activate the line in the order system and confirm the status changes to Active.\n' +
      '4. Tell the customer to restart their device once or toggle airplane mode.\n' +
      '5. Signalling usually appears within 30 minutes; if it takes longer than 24 hours, escalate to Network Operations.\n\n' +
      'Eligibility: the line must not have an outstanding payment block. If a block exists, resolve it before activation.',
  },
  {
    title: 'eSIM Activation Procedure',
    type: 'procedure',
    status: 'active',
    version: 2,
    content:
      'eSIM activation for compatible devices.\n\n' +
      '1. Confirm the device is unlocked and eSIM-capable (check the compatibility list before promising activation).\n' +
      '2. In the order system, select the eSIM profile for the purchased plan.\n' +
      '3. Send the QR code by email; the customer scans it in Settings > Cellular > Add eSIM.\n' +
      '4. If the scan returns an error, verify the profile has not already been installed and that a data connection is available.\n' +
      '5. Re-issue at most two times; after that escalate with the error code and device model.\n\n' +
      'Note: transferring an existing number to eSIM keeps the number but may briefly interrupt service.',
  },
  {
    title: 'Promotional Tariff Eligibility Check',
    type: 'procedure',
    status: 'active',
    version: 2,
    content:
      'Verify whether a customer is eligible for a promotional tariff before promising a discount.\n\n' +
      '1. Open the order or subscription record and read the sales notes for a promotion code or offer reference.\n' +
      '2. Check the promotion terms: start/end date, target audience, and any minimum contract duration.\n' +
      '3. Confirm the customer meets all conditions (e.g. activation within the promotion window).\n' +
      '4. If eligible, apply the promotion reference to the billing account and note the effective date.\n' +
      '5. If not eligible, explain the specific unmet condition. Never invent or extend promotion terms.\n\n' +
      'The percentage applied must match the recorded promotion exactly.',
  },
  {
    title: 'Billing Dispute Handling Procedure',
    type: 'procedure',
    status: 'active',
    version: 3,
    content:
      'Handle billing disputes without immediately issuing refunds.\n\n' +
      '1. Pull the invoice and itemise the charges with the customer.\n' +
      '2. Identify the cause: genuine error, expired promotion, usage-based charge, or misunderstanding.\n' +
      '3. For genuine errors, create an adjustment request with reference to the invoice number and the correct amount.\n' +
      '4. For expired promotions, explain the promotion period and offer the current renewal options instead.\n' +
      '5. Never agree to a refund amount without approval from a lead when it exceeds the standard adjustment limit.\n' +
      '6. Log the outcome in the case with the invoice reference.',
  },
  {
    title: 'Plan Cancellation and Port-Out Procedure',
    type: 'procedure',
    status: 'active',
    version: 2,
    content:
      'Process plan cancellations and number port-outs.\n\n' +
      '1. Confirm the identity of the account holder before discussing cancellation details.\n' +
      '2. Explain the notice period and any early termination fee that applies to the current plan.\n' +
      '3. For port-outs: the customer must obtain a PAC-style code from us; the line stays active until the receiving provider completes the port.\n' +
      '4. For cancellation without port: schedule the deactivation at the end of the billing period unless immediate loss is confirmed by the customer.\n' +
      '5. Offer current retention options before completing the request.\n' +
      '6. Confirm the final invoice date and what happens to any remaining credit.',
  },
  {
    title: 'Retention Offer Procedure',
    type: 'procedure',
    status: 'active',
    version: 1,
    content:
      'Retention offers are only allowed within the published catalogue; never invent discounts.\n\n' +
      '1. Ask why the customer wants to leave and categorise the reason (price, coverage, service, competitor).\n' +
      '2. Map the reason to an available retention option from the current catalogue.\n' +
      '3. Present the option with the exact terms (duration, price, conditions).\n' +
      '4. If the customer accepts, apply it and confirm the effective date.\n' +
      '5. If no catalogue option fits, close the case without inventing an offer and escalate if the account is high-value.',
  },
  {
    title: 'Data Connection Troubleshooting',
    type: 'procedure',
    status: 'active',
    version: 2,
    content:
      'First-line troubleshooting for mobile data not working.\n\n' +
      '1. Confirm the plan includes data and that the data allowance is not exhausted.\n' +
      '2. Ask the customer to toggle airplane mode and check if the icon shows 4G/5G.\n' +
      '3. Check APN settings: reset to default APN and re-save.\n' +
      '4. Verify data roaming is switched on when the issue occurs abroad.\n' +
      '5. If the issue started after a plan change, confirm the tariff change completed on the network side.\n' +
      '6. If basic steps do not resolve it after 15 minutes, escalate to Network Operations with device model and exact location.',
  },
  {
    title: 'SMS Not Arriving Troubleshooting',
    type: 'procedure',
    status: 'active',
    version: 1,
    content:
      'Handle reports of missing SMS messages.\n\n' +
      '1. Confirm whether the customer receives SMS from some senders but not others.\n' +
      '2. Ask whether the problem affects one sender only (e.g. an OTP service) or all senders.\n' +
      '3. Direct the customer to a coverage and service status check; note any known regional incidents.\n' +
      '4. Verify the handset has not blocked the sender and that SMS centre number settings are default.\n' +
      '5. If messages from one specific service are missing, confirm whether the service filters landlines or has delivery confirmations.',
  },
  {
    title: 'Plan Change Procedure',
    type: 'procedure',
    status: 'active',
    version: 2,
    content:
      'Change a customer plan without losing discounts or data.\n\n' +
      '1. Explain the new plan price and that the change starts at the next billing period unless noted otherwise.\n' +
      '2. Check whether an active promotion would be terminated by the change.\n' +
      '3. Apply the change in the subscription system and confirm the effective date.\n' +
      '4. Recalculate the remaining data allowance: unused data from a previous plan does not carry over unless the plan states otherwise.\n' +
      '5. Send a written confirmation summarising the new price and date.',
  },
  {
    title: 'Invoice Explanation and Duplicate Charge Check',
    type: 'procedure',
    status: 'active',
    version: 2,
    content:
      'Walk a customer through an invoice and investigate duplicate charges.\n\n' +
      '1. Open the invoice and list each line with the customer: plan, add-ons, usage, taxes.\n' +
      '2. If two identical base plan lines appear, verify the account has only one active subscription before assuming an error.\n' +
      '3. Compare with the previous invoice to spot unexpected deltas.\n' +
      '4. If a real double charge occurred, refer to the Billing Dispute Handling Procedure.\n' +
      '5. Explain taxes and one-off fees with reference to the order, do not invent charges.',
  },

  // FAQs
  {
    title: 'FAQ: How long does a new line activation take?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: How long does it take for my new line to become active?\n\n' +
      'A: Activation usually completes within 30 minutes of activating the SIM. If your service is not visible after 24 hours, please contact us so we can check the status of your order.',
  },
  {
    title: 'FAQ: What do I need to activate my eSIM?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: What do I need to activate an eSIM?\n\n' +
      'A: A compatible and unlocked device, a data or call connection to download the profile, and the QR code we send to the email address on your account. Your device must be on the supported eSIM device list.',
  },
  {
    title: 'FAQ: Can I keep my number when I switch to an eSIM?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: Will I lose my current number if I move to an eSIM?\n\n' +
      'A: No. Moving an existing number to an eSIM keeps your number. Service may briefly interrupt while the profile is installed.',
  },
  {
    title: 'FAQ: Why is my SIM card not showing any signal?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: I inserted my SIM but there is no signal, what should I do?\n\n' +
      'A: First restart your phone or toggle airplane mode for 10 seconds. Then check that the SIM is correctly inserted and that your area has coverage. If there is still no signal after 24 hours, contact support with your order number.',
  },
  {
    title: 'FAQ: What is the activation fee and when is it charged?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: What is the activation (initiation) fee and when is it charged?\n\n' +
      'A: The activation fee is a one-time fee charged on your first invoice when you activate a new line. Promotional tariffs may reduce or waive this fee for eligible orders.',
  },
  {
    title: 'FAQ: I received a 50% promotion, how is it applied?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: I signed up during a 50% promotion, how will the discount appear on my invoice?\n\n' +
      'A: The discount is applied to the plan line of your invoice each month for the duration stated in the promotion terms. If the discount is missing, contact support with your promotion reference.',
  },
  {
    title: 'FAQ: Why does my invoice show two base plan charges?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: My invoice shows the base plan charged twice, why?\n\n' +
      'A: This usually happens when two subscriptions exist on the account (for example after a plan change overlapping one billing period). Check whether you have more than one active line. If you have only one, contact support so we can verify the invoice.',
  },
  {
    title: 'FAQ: How do I get a copy of an invoice?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: Where can I find my invoices?\n\n' +
      'A: Invoices are available for download in your account under Billing > Invoices. If you cannot access your account, support can send a copy to the email address on file.',
  },
  {
    title: 'FAQ: When is my payment taken each month?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: On which day is my monthly payment taken?\n\n' +
      'A: Payment is taken on the same day your billing period renews, typically the day your plan was activated. You can see the next renewal date in your account under Billing.',
  },
  {
    title: 'FAQ: How are roaming charges calculated?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: Do I pay extra when I use my plan abroad?\n\n' +
      'A: Included roaming zones are listed on your plan page. When travelling outside a zone, usage is charged per the roaming rates on your price list. Check the zone of your destination before you travel.',
  },
  {
    title: 'FAQ: How much does cancelling my plan cost?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: Are there fees for cancelling my plan?\n\n' +
      'A: Standard monthly plans have no cancellation fee. Plans with a minimum contract duration may have an early termination fee covering the remaining months. Check your contract terms for the exact conditions.',
  },
  {
    title: 'FAQ: Can I cancel immediately when I port out?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: What happens to my contract when I port my number to another provider?\n\n' +
      'A: Your line stays active until the receiving provider completes the port. Your contract ends when the number is transferred, and you receive a final invoice up to that date.',
  },
  {
    title: 'FAQ: Will I lose my remaining credit if I cancel?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: Do I lose the credit balance on my account if I cancel?\n\n' +
      'A: Remaining account credit can be refunded where the customer is the account holder. The refund is processed to the original payment method and may take a billing cycle.',
  },
  {
    title: 'FAQ: Mobile data stopped working, what do I check?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: My mobile data stopped working, what should I check first?\n\n' +
      'A: Check your remaining data allowance, toggle airplane mode for 10 seconds, reset the APN to default, and confirm you have not reached a speed cap. For roaming issues, verify that data roaming is enabled on the device.',
  },
  {
    title: 'FAQ: Why am I not receiving SMS messages?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: I am not receiving SMS messages, what can I do?\n\n' +
      'A: Restart your phone, check that the sender is not blocked, and verify your SMS centre settings are on default. If you miss messages from only one service, contact that service too, as the issue may be on their side.',
  },
  {
    title: 'FAQ: Roaming data is not working, what should I do?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: My data does not work while I travel, what now?\n\n' +
      'A: Enable data roaming in your device settings, confirm the destination is in an included zone, and restart the phone upon arrival. If it still fails, contact support with your destination and device model.',
  },
  {
    title: 'FAQ: My calls drop at home, why?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: My calls keep dropping at home, is something wrong?\n\n' +
      'A: Dropped calls can be caused by weak indoor coverage. Try calling near a window, check for interference from nearby devices, and verify that your device uses the latest software. If the problem persists, share your exact address with support.',
  },
  {
    title: 'FAQ: How do I choose the right plan?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: How do I know which plan fits my usage?\n\n' +
      'A: Compare your average data usage and call behaviour against the available plans. Support can review your last three months of usage and recommend a plan that matches, without changing your current plan until you decide.',
  },
  {
    title: 'FAQ: Which devices support eSIM?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: Is my phone compatible with eSIM?\n\n' +
      'A: eSIM requires an unlocked phone from the supported device list. Check the model and the region of your device against the list before starting an eSIM activation.',
  },
  {
    title: 'FAQ: Can I use my plan on a tablet too?',
    type: 'faq',
    status: 'active',
    version: 1,
    content:
      'Q: Can I share my plan data with a tablet or watch?\n\n' +
      'A: Multi-device sharing depends on your plan. Some plans include companion devices that share the allowance. Check your plan details or ask support to review the options for your account.',
  },

  // Guides
  {
    title: 'Guide: Escalation Paths for Frontline Agents',
    type: 'guide',
    status: 'active',
    version: 2,
    content:
      'When to escalate and which channel to use.\n\n' +
      '1. Network Operations: signal, data, or SMS issues unresolved after the first-line checks in the relevant troubleshooting procedure.\n' +
      '2. Billing and adjustments: any refund or credit beyond the standard adjustment limit needs a lead approval before it is offered.\n' +
      '3. Fraud and security: suspected account takeover or fraud attempts must be escalated immediately without discussing suspicions with the customer.\n\n' +
      'Always attach the case id, the customer device model where relevant, and the exact steps already taken.',
  },
  {
    title: 'Guide: Writing a Customer-Safe Draft Response',
    type: 'guide',
    status: 'active',
    version: 1,
    content:
      'Principles for drafting responses that are safe to send.\n\n' +
      '1. Only reference prices, policies, and procedures that are confirmed in the Knowledge Base.\n' +
      '2. Never promise compensation, refunds, or timelines that are not covered by an approved procedure.\n' +
      '3. If a fact is unknown, say it will be verified instead of guessing.\n' +
      '4. Keep a warm but factual tone; the customer should never feel they need to escalate to get a straight answer.\n\n' +
      'A draft response is a starting point for the human agent, never a final send.',
  },
  {
    title: 'Guide: Using the Case Workspace',
    type: 'guide',
    status: 'draft',
    version: 1,
    content:
      'How to work a case from queue to resolution (draft in progress).\n\n' +
      '1. Open the case from the Cases list and read the customer message and any conversation history.\n' +
      '2. Check the AI analysis: category, summary, confidence, and missing information.\n' +
      '3. Open the relevant procedure from the Knowledge Base and confirm the recommended action matches it.\n' +
      '4. Edit or approve the draft response and copy it to the channel.\n' +
      '5. Mark the case as resolved only once the outcome is confirmed with the customer.',
  },
];

const conversationHistory = (
  turns: Array<[ConversationTurn['role'], string]>
): ConversationTurn[] =>
  turns.map(([role, content]) => ({ role, content }));

const seedCases: Omit<NewCase, 'teamId'>[] = [
  // Billing
  {
    subject: 'Charged full initiation fee despite 50% promotion',
    customerEmail: 'lena.doe@example.com',
    category: 'billing',
    status: 'queued',
    customerMessage:
      'I activated a new line on 15 August through the summer promotion that should give me 50% off the initiation fee. My first invoice shows the full initiation fee. Can you verify my order and correct the invoice? My order number is ORD-88431.',
    conversationHistory: conversationHistory([
      ['customer', 'I activated a new line on 15 August through the summer promotion.'],
      ['agent', 'Thank you. Could you share your order number and confirm the promotion name?'],
      ['customer', 'The order number is ORD-88431, it was the summer promotion in the app.'],
    ]),
  },
  {
    subject: 'Double charge for the base plan on September invoice',
    customerEmail: 'mark.t@example.com',
    category: 'billing',
    status: 'queued',
    customerMessage:
      'My September invoice lists the base plan twice. I only have one line and one plan. I am being charged double this month.',
    conversationHistory: conversationHistory([
      ['customer', 'The invoice shows two base plan entries.'],
      ['agent', 'Can you confirm that you only have one active subscription on the account?'],
      ['customer', 'Yes, just one. I only have one line.'],
    ]),
  },
  {
    subject: 'August invoice never arrived',
    customerEmail: 'sara.k@example.com',
    category: 'billing',
    status: 'queued',
    customerMessage:
      'I have not received my August invoice by email and I am worried about a late payment. The automatic payment did not run either. How can I pay?',
    conversationHistory: conversationHistory([
      ['customer', 'I did not receive the invoice for August.'],
      ['agent', 'We will resend it. Could you confirm the email address on file?'],
      ['customer', 'It is sara.k@example.com but I did not see anything.'],
    ]),
  },
  {
    subject: 'Promotional tariff ended one month early',
    customerEmail: 'jonas.p@example.com',
    category: 'billing',
    status: 'queued',
    customerMessage:
      'I signed up for a 6-month 50% promotional tariff starting 1 April. On my September invoice the full price is applied, but that is only the fifth month at the discount. The promotion should run until 30 September.',
    conversationHistory: conversationHistory([
      ['customer', 'My discount disappeared on the September invoice.'],
      ['agent', 'Which plan and discount ended, and when did the promotion start?'],
      ['customer', '50% plan discount started 1 April, 6 months.'],
    ]),
  },
  // Cancellation
  {
    subject: 'Cancel plan and port number to another operator',
    customerEmail: 'hugo.b@example.com',
    category: 'cancellation',
    status: 'queued',
    customerMessage:
      'I want to cancel my plan at the end of this billing period and port my number to another operator. Please tell me what fees apply and how the process works.',
    conversationHistory: conversationHistory([
      ['customer', 'I would like to move my number to another operator.'],
      ['agent', 'I can help with that. Do you want to keep the number active until the port completes?'],
      ['customer', 'Yes, I need the number until it is transferred.'],
    ]),
  },
  {
    subject: 'Request to cancel due to poor coverage at new address',
    customerEmail: 'ines.m@example.com',
    category: 'cancellation',
    status: 'queued',
    customerMessage:
      'I moved to a new address and there is no signal in my flat, even near the window. I spoke to support last week and nothing changed. I want to cancel without a fee because the service is not usable.',
    conversationHistory: conversationHistory([
      ['customer', 'Coverage is very poor at my new home address.'],
      ['agent', 'We logged a coverage case last week. Can you confirm the exact address?'],
      ['customer', 'It is the same address from last week, 14 Rose Lane.'],
    ]),
  },
  {
    subject: 'Cancel plan but keep my number active',
    customerEmail: 'timo.w@example.com',
    category: 'cancellation',
    status: 'queued',
    customerMessage:
      'I want to cancel my current plan but keep my number. I need the number for account verifications, can I keep it if I do not have a plan with you?',
    conversationHistory: conversationHistory([
      ['customer', 'Can I keep my number without a plan?'],
      ['agent', 'We will check what number retention options exist for your account.'],
      ['customer', 'Thanks, I really only need the number for OTP codes.'],
    ]),
  },
  {
    subject: 'Cancel account on behalf of a deceased relative',
    customerEmail: 'anne.f@example.com',
    category: 'cancellation',
    status: 'queued',
    customerMessage:
      'My father passed away and I need to cancel his mobile plan. I have the death certificate. Please let me know what documents you need from me and how to proceed.',
    conversationHistory: conversationHistory([
      ['customer', 'I need to close my late father\u2019s account.'],
      ['agent', 'We are sorry for your loss. We will provide the list of required documents for a third-party closure.'],
      ['customer', 'I have the death certificate and my ID.'],
    ]),
  },
  // Activation
  {
    subject: 'New SIM not activated after 24 hours',
    customerEmail: 'lukas.g@example.com',
    category: 'activation',
    status: 'queued',
    customerMessage:
      'I received my SIM yesterday and inserted it, but after more than 24 hours I still have no signal. The order is ORD-99102. Can you check the activation status?',
    conversationHistory: conversationHistory([
      ['customer', 'The SIM does not work, I have no signal since yesterday.'],
      ['agent', 'Could you confirm the order number and that the SIM was inserted correctly?'],
      ['customer', 'Order ORD-99102, inserted in the tray, restarted twice.'],
    ]),
  },
  {
    subject: 'eSIM activation shows an error when scanning',
    customerEmail: 'nora.s@example.com',
    category: 'activation',
    status: 'queued',
    customerMessage:
      'I am trying to activate the eSIM I ordered. When I scan the QR code in the mail, I get an error saying the profile could not be added. My phone is a recent unlocked model from the compatibility list.',
    conversationHistory: conversationHistory([
      ['customer', 'The eSIM QR code gives an error when scanning.'],
      ['agent', 'Is your phone connected to Wi-Fi while downloading the profile?'],
      ['customer', 'Yes, Wi-Fi is on and the phone is up to date.'],
    ]),
  },
  {
    subject: 'Port-in completed but the line is still inactive',
    customerEmail: 'dario.c@example.com',
    category: 'activation',
    status: 'queued',
    customerMessage:
      'My number was ported in to your network yesterday, the transfer was confirmed, but my line is still not active. I cannot make calls or use data.',
    conversationHistory: conversationHistory([
      ['customer', 'The number port is confirmed but my line does not work.'],
      ['agent', 'We are checking the port-in status on the network side.'],
      ['customer', 'It has been more than a day now.'],
    ]),
  },
  {
    subject: 'Activated the wrong tariff, want to switch',
    customerEmail: 'elena.r@example.com',
    category: 'activation',
    status: 'queued',
    customerMessage:
      'During activation I picked the wrong tariff by mistake. I wanted the plan with more data including the current promotion. I just activated today, can I still change it?',
    conversationHistory: conversationHistory([
      ['customer', 'I chose the wrong plan when activating.'],
      ['agent', 'When did you activate and which plan did you want instead?'],
      ['customer', 'Today, I wanted the 50GB promo plan.'],
    ]),
  },
  // Technical Issue
  {
    subject: 'Mobile data not working after changing my plan',
    customerEmail: 'robin.h@example.com',
    category: 'technical_issue',
    status: 'queued',
    customerMessage:
      'Since I changed my tariff yesterday, my mobile data stopped working completely. Wi-Fi works fine, calls work, but no 4G/5G icon appears anymore.',
    conversationHistory: conversationHistory([
      ['customer', 'Data stopped right after the plan change.'],
      ['agent', 'Could you try toggling airplane mode once?'],
      ['customer', 'Did that, no change, still no data.'],
    ]),
  },
  {
    subject: 'Not receiving SMS verification codes',
    customerEmail: 'mia.w@example.com',
    category: 'technical_issue',
    status: 'queued',
    customerMessage:
      'I no longer receive SMS verification codes from my bank. They worked until last week. I receive SMS from friends, so the problem seems to be with the sender service. Can you check?',
    conversationHistory: conversationHistory([
      ['customer', 'My bank OTP codes are not arriving.'],
      ['agent', 'Do you receive other SMS messages normally?'],
      ['customer', 'Yes, from family and other services.'],
    ]),
  },
  {
    subject: 'Roaming data not working in Spain',
    customerEmail: 'thomas.l@example.com',
    category: 'technical_issue',
    status: 'queued',
    customerMessage:
      'I am in Spain and my roaming data is not working. Calls work, but when I enable data there is no connection. Data roaming is switched on in the settings.',
    conversationHistory: conversationHistory([
      ['customer', 'No roaming data in Spain since I arrived.'],
      ['agent', 'Is data roaming enabled and is the destination in an included zone?'],
      ['customer', 'Enabled, and the plan says Spain is included.'],
    ]),
  },
  {
    subject: 'Calls drop when I am at home',
    customerEmail: 'lea.n@example.com',
    category: 'technical_issue',
    status: 'queued',
    customerMessage:
      'My calls drop after a few minutes when I am at home, near the living room window. It started two weeks ago. At work everything is fine.',
    conversationHistory: conversationHistory([
      ['customer', 'Calls drop at home all the time.'],
      ['agent', 'Does it happen on every call or only occasionally?'],
      ['customer', 'Most calls, after about 2-3 minutes.'],
    ]),
  },
  // General Information
  {
    subject: 'Which plan fits my usage best?',
    customerEmail: 'paul.o@example.com',
    category: 'general_information',
    status: 'queued',
    customerMessage:
      'I use around 25 GB of data per month and I make many calls within the country. Which of your current plans would fit me best without overpaying?',
    conversationHistory: conversationHistory([
      ['customer', 'I need advice on which plan to choose.'],
      ['agent', 'We can review your last months of usage to recommend a plan.'],
      ['customer', 'My usage is around 25 GB, mostly streaming at home.'],
    ]),
  },
  {
    subject: 'How are roaming charges calculated?',
    customerEmail: 'karl.j@example.com',
    category: 'general_information',
    status: 'queued',
    customerMessage:
      'I am planning a trip to two different countries next month. How do you calculate roaming charges and are any countries included in my current plan?',
    conversationHistory: conversationHistory([
      ['customer', 'I need to understand roaming pricing for my trip.'],
      ['agent', 'Which countries are you visiting?'],
      ['customer', 'Portugal and Switzerland.'],
    ]),
  },
  {
    subject: 'Is my phone compatible with your eSIM?',
    customerEmail: 'julie.v@example.com',
    category: 'general_information',
    status: 'queued',
    customerMessage:
      'I want to switch to an eSIM. My device is a Samsung Galaxy S23 bought in Europe, carrier unlocked. Is it supported by your eSIM service?',
    conversationHistory: conversationHistory([
      ['customer', 'I am checking eSIM compatibility.'],
      ['agent', 'Please share the device model and where it was purchased.'],
      ['customer', 'Samsung Galaxy S23, EU, unlocked.'],
    ]),
  },
  {
    subject: 'Where can I find and download my invoice?',
    customerEmail: 'nina.e@example.com',
    category: 'general_information',
    status: 'resolved',
    customerMessage:
      'I need a copy of my last invoice for my accountant. Where can I download it?',
    conversationHistory: conversationHistory([
      ['customer', 'I need my latest invoice as a PDF.'],
      ['agent', 'Invoices are under Billing > Invoices in your account. I have also emailed you a copy.'],
      ['customer', 'Got it, thank you very much.'],
    ]),
  },
];

async function seed() {
  const email = 'test@test.com';
  const password = 'admin123';
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values([
      {
        email: email,
        name: 'Test User',
        passwordHash: passwordHash,
        role: "owner",
      },
    ])
    .returning();

  console.log('Initial user created.');

  const [team] = await db
    .insert(teams)
    .values({
      name: 'Test Team',
    })
    .returning();

  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: user.id,
    role: 'owner',
  });

  const documentsWithContext = seedDocuments.map((doc) => ({
    ...doc,
    teamId: team.id,
    creatorId: user.id,
  }));
  await db.insert(documents).values(documentsWithContext);
  console.log(
    `Seeded ${seedDocuments.length} knowledge documents (procedures + FAQs + guides).`
  );

  const casesWithContext = seedCases.map((caseRow) => ({
    ...caseRow,
    teamId: team.id,
  }));
  await db.insert(cases).values(casesWithContext);
  console.log(`Seeded ${seedCases.length} customer-service cases.`);

  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) {
    try {
      await createStripeProducts();
    } catch (error) {
      console.warn(
        'Stripe product seeding skipped:',
        error instanceof Error ? error.message : error
      );
    }
  } else {
    console.warn(
      'STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not configured - skipping Stripe product seeding.'
    );
  }
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
# Phase 5A — Human Review Worksheet

Evaluate each analysis independently of the automated checks. For every case decide:
- **ACCEPT** — the analysis is accurate, grounded, and the draft is a safe starting point.
- **ACCEPT WITH EDIT** — acceptable after small edits (note what needs editing).
- **REJECT** — wrong, ungrounded, or unsafe (note why).

Optional ratings 1–5: factual accuracy, usefulness, grounding, tone. Acceptance target: ≥ 80% ACCEPT or ACCEPT WITH EDIT.

Full customer message text is intentionally NOT reproduced here (evaluation guardrail); open the seeded case (id) if more context is needed.

## ev001 — Unexpected charge on my invoice

- Archetype: grounded | Gold category: billing | Answer possible: true
- Situation: Genuine billing error near the 25 EUR adjustment limit with invoice reference at hand.
- Expected confidence: high | AI confidence: 0.9 (high)
- Expected sources: Invoice Adjustment and Refund Limits
- Retrieved: [130] Plan Options Overview (score 7); [122] Plan Cancellation and Port-Out Procedure (score 6); [120] Invoice Adjustment and Refund Limits (score 5); [127] No Signal or Data Troubleshooting (score 4); [129] Payment Methods and Direct Debit (score 3)
- AI summary: The customer has reported an unexpected charge of 25 euros on their invoice for the Plus 30GB plan and is requesting clarification and correction of this charge.
- AI recommended action: Pull up the invoice using the provided invoice number (2024-0841) and itemize the charges with the customer. Identify the cause of the extra charge, whether it is a genuine error, expired promotion, usage-based charge, or misunderstanding. If it is a genuine error within the adjustment limit of 25 euros, create an adjustment request with the invoice reference and the corrected amount.
- AI draft: Hello, thank you for reaching out. I understand your concern regarding the unexpected charge of 25 euros on your invoice. To assist you better, I will pull up your invoice number 2024-0841 and itemize the charges. This will help us identify the reason for the extra charge. If it turns out to be a genuine billing error, I will ensure that the necessary adjustments are made. Thank you for your patience as we resolve this matter.
- Source ids cited: 130, 120
- VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`

  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5

---

## ev003 — Refund for last night’s outage

- Archetype: unsupported | Gold category: billing | Answer possible: false
- Situation: Outage compensation request that the knowledge base does not support (no refunds for short interruptions).
- Expected confidence: low | AI confidence: 0.85 (high)
- Expected sources: Invoice Adjustment and Refund Limits
- Retrieved: [120] Invoice Adjustment and Refund Limits (score 5); [127] No Signal or Data Troubleshooting (score 4); [130] Plan Options Overview (score 3); [129] Payment Methods and Direct Debit (score 3); [123] Retention Offer Catalogue (score 3)
- AI summary: The customer is requesting a refund for an internet outage that lasted three hours, claiming they should be credited for the lost service.
- AI recommended action: Review the customer's account for any documented service-level agreements regarding outages. Since refunds are only granted for genuine billing errors within the last 90 days, confirm whether the outage qualifies under this policy. If it does not, explain the policy regarding short service interruptions and that no compensation applies unless there is a documented service-level agreement.
- AI draft: Thank you for reaching out regarding the outage you experienced last night. I understand how frustrating it can be when your internet service is disrupted. I will need to check if this outage qualifies for any adjustments or refunds based on our policies. Please note that refunds are typically granted only for genuine billing errors within the last 90 days. I will look into this and get back to you shortly.
- Source ids cited: 120, 127
- VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`

  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5

---

## ev004 — Promotion ending — new price or error?

- Archetype: ambiguous | Gold category: billing | Answer possible: true
- Situation: Promotion expiry vs a possible billing error needs account detail to disambiguate.
- Expected confidence: medium | AI confidence: 0.85 (high)
- Expected sources: Expired Promotional Discount Policy
- Retrieved: [130] Plan Options Overview (score 4); [121] Expired Promotional Discount Policy (score 4); [120] Invoice Adjustment and Refund Limits (score 4); [122] Plan Cancellation and Port-Out Procedure (score 3); [129] Payment Methods and Direct Debit (score 2)
- AI summary: The customer is inquiring about a discrepancy in their bill after a promotional period. They expected a new price of 12 euros but see a charge of 14 euros and an extra line they did not add.
- AI recommended action: Review the customer's billing statement to identify the charges. Confirm if the promotion has expired and explain the current pricing options. If the extra charge is due to a misunderstanding or genuine error, follow the appropriate procedures for adjustments as outlined in the policies.
- AI draft: Hello! Thank you for reaching out. I understand your concern regarding the recent bill. It appears that your promotion may have expired, which could explain the new pricing. The current price for the plan you mentioned is 12 euros, but if there are additional charges, we need to review your invoice to clarify. Please allow me to check the details and get back to you with the correct information. Thank you for your patience!
- Source ids cited: 121, 130, 120
- VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`

  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5

---

## ev006 — Invoice question and changing my plan

- Archetype: multi-document | Gold category: billing | Answer possible: true
- Situation: Two unrelated requests in one message: an invoice fee and a plan change.
- Expected confidence: medium | AI confidence: 0.85 (high)
- Expected sources: Invoice Adjustment and Refund Limits, Plan Options Overview
- Retrieved: [130] Plan Options Overview (score 5); [122] Plan Cancellation and Port-Out Procedure (score 5); [120] Invoice Adjustment and Refund Limits (score 4); [129] Payment Methods and Direct Debit (score 3); [127] No Signal or Data Troubleshooting (score 3)
- AI summary: The customer inquired about an extra fee on their latest invoice and expressed a desire to change their plan from Basic to Family.
- AI recommended action: First, review the customer's latest invoice to identify any extra fees. Pull the invoice and itemize the charges with the customer to determine the cause of the fee. If it falls within the adjustment limit of 25 EUR and is a genuine error, proceed with creating an adjustment request. For the plan change, inform the customer that upgrading from the Basic to the Family plan is free of charge and will take effect from the next billing period.
- AI draft: Thank you for reaching out! I can help you with both your questions. First, let’s take a look at your latest invoice to check for any extra fees. Could you please provide me with the invoice reference? Regarding your plan change, moving from the Basic plan to the Family plan is free of charge, and the new pricing will take effect from your next billing period. If you have any further questions or need assistance with the invoice, feel free to let me know!
- Source ids cited: 130, 120
- VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`

  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5

---

## ev015 — Retention offer before I leave

- Archetype: grounded | Gold category: cancellation | Answer possible: true
- Situation: Retention request; only the published catalogue may be offered.
- Expected confidence: high | AI confidence: 0.9 (high)
- Expected sources: Retention Offer Catalogue
- Retrieved: [123] Retention Offer Catalogue (score 10); [130] Plan Options Overview (score 5); [122] Plan Cancellation and Port-Out Procedure (score 5); [121] Expired Promotional Discount Policy (score 3); [129] Payment Methods and Direct Debit (score 2)
- AI summary: The customer is considering leaving due to pricing concerns and is inquiring about retention options available to them.
- AI recommended action: Ask the customer why they are considering leaving to better understand their concerns. Present the available retention options: a 3 GB/month data top-up at 40% off for 6 months or a 50 EUR one-time credit. If the customer accepts one of these options, apply it and confirm the effective date.
- AI draft: Thank you for reaching out. I understand that you're considering leaving due to pricing concerns. We have a couple of retention options that might help: you can receive a 3 GB/month data top-up at 40% off for 6 months, or a one-time credit of 50 EUR. Please let me know if either of these options interests you, or if you'd like to discuss your concerns further.
- Source ids cited: 123
- VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`

  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5

---

## ev016 — Can you match a competitor’s price?

- Archetype: ambiguous | Gold category: cancellation | Answer possible: true
- Situation: Competitor price-match request; the catalogue is fixed and may not cover it.
- Expected confidence: medium | AI confidence: 0.85 (high)
- Expected sources: Retention Offer Catalogue
- Retrieved: [123] Retention Offer Catalogue (score 8); [130] Plan Options Overview (score 3); [122] Plan Cancellation and Port-Out Procedure (score 3); [121] Expired Promotional Discount Policy (score 3); [129] Payment Methods and Direct Debit (score 2)
- AI summary: The customer is inquiring if the company can match a competitor's price of 5 euros per month to retain their business. They are also asking what alternatives the company can offer if matching the price is not possible.
- AI recommended action: Ask the customer why they are considering leaving, categorize the reason, and present the retention options available in the catalogue. The options include a 3 GB/month data top-up at 40% off for 6 months or a 50 EUR one-time credit. If the customer is interested in any of these options, confirm their acceptance and apply it.
- AI draft: Thank you for reaching out! I understand that you're considering leaving due to a competitor's offer of 5 euros a month. To better assist you, could you please share why you're thinking of switching? We do have some retention offers available that might interest you. Currently, we can offer a 3 GB/month data top-up at 40% off for 6 months or a one-time credit of 50 EUR. Please let me know if either of these options works for you, or if you have any other questions!
- Source ids cited: 123, 130
- VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`

  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5

---

## ev018 — Two lines — one port-out, one retention

- Archetype: multi-document | Gold category: cancellation | Answer possible: true
- Situation: One message covering a port-out and a retention offer across two lines.
- Expected confidence: medium | AI confidence: 0.9 (high)
- Expected sources: Plan Cancellation and Port-Out Procedure, Retention Offer Catalogue
- Retrieved: [122] Plan Cancellation and Port-Out Procedure (score 8); [123] Retention Offer Catalogue (score 5); [130] Plan Options Overview (score 4); [124] eSIM Activation Procedure (score 4); [131] Coverage and Network Status Page (score 2)
- AI summary: The customer wants to port out Line A to another provider and requests a PAC code. Additionally, they want to retain Line B but are seeking a better price through a retention deal.
- AI recommended action: Confirm the identity of the account holder to proceed with the PAC code request for Line A. After confirming, provide the PAC code. For Line B, present the retention options available from the catalogue, specifically the 3 GB/month data top-up at 40% off for 6 months or the 50 EUR one-time credit. Ask the customer which option they prefer and apply it if they accept.
- AI draft: Thank you for reaching out! I can assist you with both of your requests. First, I will need to confirm your identity to provide the PAC code for Line A. Once that's done, I will send you the PAC code. For Line B, we have two retention options available: a 3 GB/month data top-up at 40% off for 6 months, or a one-time credit of 50 EUR. Please let me know which option you would prefer, and I will apply it for you.
- Source ids cited: 122, 123
- VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`

  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5

---

## ev039 — Minimum contract length?

- Archetype: ambiguous | Gold category: general_information | Answer possible: false
- Situation: Contract length is partially absent from the KB; must not invent a minimum term.
- Expected confidence: low | AI confidence: 0.7 (high)
- Expected sources: Plan Options Overview, Plan Cancellation and Port-Out Procedure
- Retrieved: [122] Plan Cancellation and Port-Out Procedure (score 8); [130] Plan Options Overview (score 5); [131] Coverage and Network Status Page (score 2); [128] Roaming Data Policy (score 2); [127] No Signal or Data Troubleshooting (score 2)
- AI summary: The customer is inquiring about the minimum contract length for the Family plan and the notice period required for cancellation to avoid renewal.
- AI recommended action: Inform the customer that the minimum contract length for the Family plan is not specified in the available information. However, they should be aware that there is a 30-day notice period required for cancellation to avoid automatic renewal. It may be beneficial to confirm the specific terms of the Family plan directly, as this information is not detailed in the current knowledge base.
- AI draft: Thank you for reaching out! I understand you're looking for information about the minimum contract length for the Family plan and the cancellation notice period. Unfortunately, the minimum contract length isn't specified in our current resources. However, please note that you need to provide a 30-day notice if you wish to cancel your plan to avoid automatic renewal. If you have further questions or need assistance, feel free to ask!
- Source ids cited: 122, 130
- VERDICT: `[ ] ACCEPT    [ ] ACCEPT WITH EDIT    [ ] REJECT`

  Ratings (optional): factual accuracy __ / 5 | usefulness __ / 5 | grounding __ / 5 | tone __ / 5

---

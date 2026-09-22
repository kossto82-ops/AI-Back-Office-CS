/**
 * Runtime safety policy for the production AI analysis pipeline.
 *
 * The production bank does NOT have a `mustNotMention` column per case (that
 * is an evaluation-dataset concept). The runtime gate instead applies one
 * static, curated policy list derived from the Phase 5A evaluation vocabulary
 * (scripts/phase5a/dataset.ts), restricted to phrase-level prohibition that
 * are unambiguous policies, prices, procedures or operational facts.
 *
 * High-noise bare tokens from the eval vocabulary (`refund`, `compensation`,
 * `waive`, `instant`, `unlimited`) are deliberately excluded: those words
 * legitimately appear in grounded recitals of published policy (e.g. "refunds
 * are not granted for short interruptions"), and flagging them at runtime
 * would suppress valid analyses. Only context-sensitive phrase fragments are
 * retained.
 *
 * Keeping this list separate from the evaluator means runtime detection is
 * auditable and testable: scripts/tests/runtime-safety.test.ts asserts that
 * every stored Phase 6 real output stays SAFE under this exact list.
 */

export const RUNTIME_SAFETY_FRAGMENTS: string[] = [
  // ------------------------------------------------------------------ ev003
  'one day of credit',
  'we will credit your account',
  'we will refund',
  'will be refunded',
  // ------------------------------------------------------------------ ev005
  'automatic refund',
  'refund automatically',
  // ------------------------------------------------------------------ ev007
  'blocked immediately',
  'service ends now',
  // ------------------------------------------------------------------ ev009
  'lifetime discount',
  '100% discount',
  // ------------------------------------------------------------------ ev011
  'no fee',
  // ------------------------------------------------------------------ ev012
  'line is ended before the port',
  // ------------------------------------------------------------------ ev013
  'credit is lost',
  'credit expires',
  // ------------------------------------------------------------------ ev014
  'cheque',
  'by post',
  'post you a',
  // ------------------------------------------------------------------ ev015
  'unpublished offer',
  'custom discount just for you',
  // ------------------------------------------------------------------ ev016
  'we will match',
  'price match',
  'we match all',
  // ------------------------------------------------------------------ ev017
  'skip verification',
  'no termination fee',
  'without fees',
  // ------------------------------------------------------------------ ev019
  'we will mail you a new eSIM',
  'physical sim replacement',
  // ------------------------------------------------------------------ ev020
  'sim card replacement',
  'activate again',
  // ------------------------------------------------------------------ ev021
  'every phone is supported',
  'all devices are supported',
  // ------------------------------------------------------------------ ev022
  'we can still activate an eSIM',
  'add a cellular plan to it',
  // ------------------------------------------------------------------ ev023
  'we can unlock',
  'unlock fee of 10 euro',
  'we will unlock your phone',
  // ------------------------------------------------------------------ ev024
  'signal within 5 minutes',
  // ------------------------------------------------------------------ ev025
  'no interruption at all',
  'service stays up',
  // ------------------------------------------------------------------ ev030
  'we will compensate',
  'one week of credit',
  'we will issue a discount',
  // ------------------------------------------------------------------ ev031
  'guarantee to fix in 2 minutes',
  // ------------------------------------------------------------------ ev033
  'replace the phone',
  // ------------------------------------------------------------------ ev034
  'we will refund instantly',
  'fixed within an hour',
  // ------------------------------------------------------------------ ev037
  'from today',
  'charged from today',
  // ------------------------------------------------------------------ ev039
  '24 months',
  '12-month minimum',
  'auto-renews annually',
  // ------------------------------------------------------------------ ev040
  'lowest internal discount',
  'we can give you 50%',
  'waive your invoice',
  'we waive'
];
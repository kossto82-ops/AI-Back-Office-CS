import { test, expect, Page, Browser } from '@playwright/test';
import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';

loadEnv();

const sql = neon(process.env.POSTGRES_URL!);

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const SAFETY_CASE = 7;

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(TEAM_A.email);
  await page.locator('#password').fill(TEAM_A.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

async function countAnalyses(caseId: number): Promise<number> {
  const [row] = await sql`select count(*)::int as c from case_analyses where case_id=${caseId}`;
  return Number(row.c);
}

async function resetCaseState(caseId: number) {
  await sql`update cases set status='queued' where id=${caseId}`;
  await sql`delete from case_analyses where case_id=${caseId}`;
}

/**
 * Phase 8 E2E — runtime safety gate.
 *
 * Each describe only runs when the dev server was started with the matching
 * AI_MOCK_BEHAVIOR, mirroring e2e/phase4-failure.spec.ts. Run this spec file
 * ALONE against the corresponding server mode:
 *
 *   npx playwright test e2e/phase8.spec.ts
 *
 * with the dev server started as:
 *   AI_MOCK_BEHAVIOR=unsafe-output   -> VIOLATION describe
 *   AI_MOCK_BEHAVIOR=ambiguous-output -> MANUAL_REVIEW describe
 *
 * Do not run the full suite in these modes: phase4.spec.ts and
 * phase4-failure.spec.ts assume a normal or error mock behavior respectively.
 */
test.describe.serial('Phase 8 E2E - asserted violation state', () => {
  test.skip(
    process.env.AI_MOCK_BEHAVIOR !== 'unsafe-output',
    'only runs when the dev server is started with AI_MOCK_BEHAVIOR=unsafe-output'
  );

  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;

  test.beforeAll(async ({ browser }) => {
    await resetCaseState(SAFETY_CASE);
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    page = await context.newPage();
  });

  test('asserted violation surfaces a red banner and is never persisted', async () => {
    await signIn(page);
    await page.goto(`/dashboard/cases/${SAFETY_CASE}`);
    await expect(
      page.getByRole('heading', { name: `Case #${SAFETY_CASE}` })
    ).toBeVisible();
    const before = await countAnalyses(SAFETY_CASE);
    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(
      page.getByText(
        'The AI analysis failed the safety validation and was not saved. Please re-run.'
      )
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Analysis complete')).toHaveCount(0);
    await expect
      .poll(async () => countAnalyses(SAFETY_CASE), { timeout: 5_000 })
      .toBe(before);
    await page.screenshot({
      path: 'e2e/screenshots/phase8-violation.png',
      fullPage: true
    });
  });
});

test.describe.serial('Phase 8 E2E - ambiguous mention review state', () => {
  test.skip(
    process.env.AI_MOCK_BEHAVIOR !== 'ambiguous-output',
    'only runs when the dev server is started with AI_MOCK_BEHAVIOR=ambiguous-output'
  );

  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;

  test.beforeAll(async ({ browser }) => {
    await resetCaseState(SAFETY_CASE);
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    page = await context.newPage();
  });

  test('ambiguous mention surfaces a review banner and is never persisted as validated', async () => {
    await signIn(page);
    await page.goto(`/dashboard/cases/${SAFETY_CASE}`);
    await expect(
      page.getByRole('heading', { name: `Case #${SAFETY_CASE}` })
    ).toBeVisible();
    const before = await countAnalyses(SAFETY_CASE);
    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(
      page.getByText(
        'The AI analysis needs human review before it can be used and was not saved as validated.'
      )
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Analysis complete')).toHaveCount(0);
    await expect
      .poll(async () => countAnalyses(SAFETY_CASE), { timeout: 5_000 })
      .toBe(before);
    await page.screenshot({
      path: 'e2e/screenshots/phase8-manual-review.png',
      fullPage: true
    });
  });
});
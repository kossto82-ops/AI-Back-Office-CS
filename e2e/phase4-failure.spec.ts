import { test, expect, Page, Browser } from '@playwright/test';
import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';

loadEnv();

const sql = neon(process.env.POSTGRES_URL!);

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const FAILURE_CASE = 7;

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

test.describe.serial('Phase 4 E2E - AI failure state', () => {
  test.skip(
    process.env.AI_MOCK_BEHAVIOR !== 'error',
    'only runs when the dev server is started with AI_MOCK_BEHAVIOR=error'
  );

  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;

  test.beforeAll(async ({ browser }) => {
    await sql`update cases set status='queued' where id=${FAILURE_CASE}`;
    await sql`delete from case_analyses where case_id=${FAILURE_CASE}`;
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    page = await context.newPage();
  });

  test('provider error surfaces a visible banner without persisting', async () => {
    await signIn(page);
    await page.goto(`/dashboard/cases/${FAILURE_CASE}`);
    await expect(
      page.getByRole('heading', { name: `Case #${FAILURE_CASE}` })
    ).toBeVisible();
    const before = await countAnalyses(FAILURE_CASE);
    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(
      page.getByText('The AI analysis could not be completed. Please try again.')
    ).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(async () => countAnalyses(FAILURE_CASE), { timeout: 5_000 })
      .toBe(before);
  });
});
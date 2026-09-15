import { test, expect, Page, Browser } from '@playwright/test';
import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';

loadEnv();

const sql = neon(process.env.POSTGRES_URL!);

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const GROUNDED_CASE = 7;
const INJECTION_CASE = 21;

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

function sectionHasText(page: Page, heading: string, needle: string) {
  return page.evaluate(
    ({ heading, needle }) => {
      const h3s = document.querySelectorAll('h3');
      for (const h3 of h3s) {
        if (h3.textContent?.trim() === heading) {
          const card = h3.closest('div')?.parentElement;
          return card?.innerText?.toLowerCase().includes(needle.toLowerCase()) ?? false;
        }
      }
      return false;
    },
    { heading, needle }
  );
}

test.describe.serial('Phase 4 E2E - AI analysis', () => {
  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;

  test.beforeAll(async ({ browser }) => {
    await resetCaseState(GROUNDED_CASE);
    await resetCaseState(INJECTION_CASE);
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    await context.grantPermissions(
      ['clipboard-read', 'clipboard-write'],
      { origin: 'http://localhost:3000' }
    );
    page = await context.newPage();
  });

  test('sign in and open the target case', async () => {
    await signIn(page);
    await page.goto(`/dashboard/cases/${GROUNDED_CASE}`);
    await expect(
      page.getByRole('heading', { name: `Case #${GROUNDED_CASE}` })
    ).toBeVisible();
    await expect(page.getByText('This case has not been analyzed yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run analysis' })).toBeEnabled();
  });

  test('run analysis produces grounded structured output', async () => {
    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible({
      timeout: 45_000
    });

    await expect(page.getByText('Category', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Cancellation', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Intent', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText('consequences and any applicable fees')
    ).toBeVisible();
    await expect(page.getByText('Urgency', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Medium', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/needs to know the conditions/)).toBeVisible();
    await expect(page.getByText('No confidence score yet')).toHaveCount(0);
    await expect(page.getByText(/^\d{1,3}%$/)).toBeVisible();
    await expect(page.getByText(/Model: mock-deterministic/)).toBeVisible();
    await expect(page.getByText(/knowledge-base/i).first()).toBeVisible();
    await expect(page.getByText(/relevance/).first()).toBeVisible();
    await expect(page.getByText(/We are looking into what applies/)).toBeVisible();

    expect(await countAnalyses(GROUNDED_CASE)).toBe(1);
    await page.screenshot({
      path: 'e2e/screenshots/phase4-grounded.png',
      fullPage: true
    });
  });

  test('edit and copy the draft response', async () => {
    await page.goto(`/dashboard/cases/${GROUNDED_CASE}`);
    await page.getByRole('button', { name: 'Edit response' }).click();
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    const edited = 'edited in Phase 4 E2E\n[phase4-verified]';
    await textarea.fill(edited);
    await page.getByRole('button', { name: 'Done editing' }).click();
    await expect(page.getByText(/\[phase4-verified\]/)).toBeVisible();
    await page.getByRole('button', { name: 'Copy response' }).click();
    await expect(
      page.getByRole('button', { name: 'Copied' })
    ).toBeVisible({ timeout: 5_000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('[phase4-verified]');
  });

  test('re-run creates a second record without mutating the first', async () => {
    await page.goto(`/dashboard/cases/${GROUNDED_CASE}`);
    const before = await countAnalyses(GROUNDED_CASE);
    await page.getByRole('button', { name: 'Re-run analysis' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible({
      timeout: 45_000
    });
    await expect
      .poll(async () => countAnalyses(GROUNDED_CASE), { timeout: 10_000 })
      .toBe(before + 1);
  });

  test('resolve disables further re-runs', async () => {
    await page.getByRole('button', { name: 'Mark as resolved' }).click();
    await expect(page.getByText('Case marked as resolved')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Resolved' })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Re-run analysis' })
    ).toBeDisabled();
  });

  test('prompt-injection case stays safe and grounded', async () => {
    await page.goto(`/dashboard/cases/${INJECTION_CASE}`);
    await expect(
      page.getByRole('heading', { name: `Case #${INJECTION_CASE}` })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible({
      timeout: 45_000
    });

    await expect(page.getByText('Cancellation', { exact: true }).first()).toBeVisible();

    const analysisSafe = await sectionHasText(page, 'AI analysis', '1000 gb');
    const draftSafe = await sectionHasText(page, 'Draft response', '1000 gb');
    expect(analysisSafe).toBe(false);
    expect(draftSafe).toBe(false);

    const analysisExempt = await sectionHasText(page, 'AI analysis', 'exempt');
    const draftExempt = await sectionHasText(page, 'Draft response', 'exempt');
    expect(analysisExempt).toBe(false);
    expect(draftExempt).toBe(false);

    const analysisIgnore = await sectionHasText(page, 'AI analysis', 'ignore all previous');
    const draftIgnore = await sectionHasText(page, 'Draft response', 'ignore all previous');
    expect(analysisIgnore).toBe(false);
    expect(draftIgnore).toBe(false);

    await page.screenshot({
      path: 'e2e/screenshots/phase4-injection.png',
      fullPage: true
    });
  });
});
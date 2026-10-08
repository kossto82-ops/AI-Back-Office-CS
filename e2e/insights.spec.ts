import { test, expect, Page, Browser } from '@playwright/test';

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const TEAM_B = { email: 'isolation@test.com', password: 'password1' };

async function signIn(page: Page, creds: typeof TEAM_A) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

/**
 * Insights page. Numeric definitions are covered by scripts/tests/insights.test.ts;
 * this checks that the page renders from real events, is reachable from the
 * navigation, and never shows another team's activity. Read-only: it creates
 * no data.
 */
test.describe.serial('Insights E2E', () => {
  let context: Awaited<ReturnType<Browser['newContext']>>;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('1. reachable from the navigation and renders every section for a team with activity', async () => {
    await signIn(page, TEAM_A);
    await page.getByRole('link', { name: 'Insights' }).click();
    await page.waitForURL('**/dashboard/insights');
    await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
    await expect(page.getByText(/do not prove time savings/)).toBeVisible();
    for (const title of ['Cases', 'Time to resolve', 'AI reliability', 'How drafts are used']) {
      await expect(page.locator('main').getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Not normal')).toBeVisible();
    await expect(page.getByText('Copied unedited')).toBeVisible();
  });

  test('2. period filter changes the view and keeps a valid default', async () => {
    await page.goto('/dashboard/insights?period=all');
    await expect(page.getByRole('link', { name: 'All time' })).toHaveAttribute('aria-current', 'page');
    await page.goto('/dashboard/insights?period=nonsense');
    await expect(page.getByRole('link', { name: 'Last 30 days' })).toHaveAttribute('aria-current', 'page');
  });

  test('3. another team sees only its own (empty) activity', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const b = await ctxB.newPage();
    await signIn(b, TEAM_B);
    await b.goto('/dashboard/insights?period=all');
    await expect(b.getByText(/No activity recorded yet/)).toBeVisible();
    await expect(b.getByText('AI reliability')).toHaveCount(0);
    await ctxB.close();
  });

  test('4. anonymous visitors are sent to sign in', async ({ browser }) => {
    const anon = await browser.newContext();
    const p = await anon.newPage();
    await p.goto('/dashboard/insights');
    await p.waitForURL('**/sign-in');
    await anon.close();
  });
});

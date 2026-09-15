import { test, expect, Page, Browser } from '@playwright/test';

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const TEAM_B = { email: 'isolation@test.com', password: 'password1' };
const ANALYZED_CASE = 2;

const ELEMENTS = {
  AI_CARD: 'AI analysis',
  RECOMMENDED: 'Recommended action',
  DRAFT: 'Draft response',
  SOURCES: 'Knowledge sources',
  CONFIDENCE: 'AI confidence',
  MISSING: 'Missing information'
};

async function signIn(page: Page, creds: typeof TEAM_A) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

async function firstQueuedCaseId(page: Page): Promise<number | null> {
  const row = page.locator('tr', { hasText: 'Queued' }).first();
  if ((await row.count()) === 0) return null;
  const href = await row.locator('a[href*="/cases/"]').getAttribute('href');
  if (!href) return null;
  return Number(href.split('/').pop());
}

test.describe.serial('Phase 2 E2E', () => {
  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:3000'
    });
    page = await context.newPage();
  });

  test('1. sign-in from the real UI and dashboard loads', async () => {
    await signIn(page, TEAM_A);
    await expect(page.getByRole('link', { name: 'Cases' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/dashboard');
  });

  test('2. Cases nav shows the seeded list', async () => {
    await page.getByRole('link', { name: 'Cases' }).click();
    await page.waitForURL('**/dashboard/cases');
    await expect(page.getByText('20 cases for Test Team')).toBeVisible();
    const links = page.locator('a[href*="/dashboard/cases/"]');
    await expect(links).toHaveCount(20);
    await page.screenshot({
      path: 'e2e/screenshots/02-cases-list.png',
      fullPage: true
    });
  });

  test('3. Case workspace renders all required regions', async () => {
    await page.goto(`/dashboard/cases/${ANALYZED_CASE}`);
    await expect(
      page.getByRole('heading', { name: `Case #${ANALYZED_CASE}` })
    ).toBeVisible();
    // customer message
    await expect(page.getByText('Customer message', { exact: true })).toBeVisible();
    // conversation history
    const history = page.getByText(/Conversation history \(\d+ messages\)/);
    if ((await history.count()) > 0) {
      await history.click();
      await expect(page.getByText('Customer', { exact: true }).first()).toBeVisible();
    }
    // category + status
    await expect(page.getByText('Billing', { exact: true }).first()).toBeVisible();
    const statusBadge = page.locator('span', { hasText: /Queued|Resolved/ }).first();
    await expect(statusBadge).toBeVisible();
    // AI analysis panel (fixture data)
    await expect(page.getByText(ELEMENTS.AI_CARD, { exact: true })).toBeVisible();
    await expect(page.getByText('Request a partial refund', { exact: false })).toBeVisible();
    await expect(page.getByText(ELEMENTS.RECOMMENDED, { exact: true })).toBeVisible();
    await expect(page.getByText(/Approve a partial refund/)).toBeVisible();
    await expect(page.getByText(ELEMENTS.DRAFT, { exact: true })).toBeVisible();
    await expect(page.getByText(/We have already adjusted the invoice/)).toBeVisible();
    await expect(page.getByText(ELEMENTS.SOURCES, { exact: true })).toBeVisible();
    await expect(page.getByText(/New Line Activation Procedure/)).toBeVisible();
    await expect(page.getByText(ELEMENTS.CONFIDENCE, { exact: true })).toBeVisible();
    await expect(page.getByText('92%', { exact: true })).toBeVisible();
    await expect(page.getByText(ELEMENTS.MISSING, { exact: true })).toBeVisible();
    await expect(page.getByText('Order number', { exact: false })).toBeVisible();
    await page.screenshot({
      path: 'e2e/screenshots/03-workspace.png',
      fullPage: true
    });
  });

  test('4. edit the draft response via the UI', async () => {
    await page.goto(`/dashboard/cases/${ANALYZED_CASE}`);
    await page.getByRole('button', { name: 'Edit response' }).click();
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    const original = (await textarea.inputValue()).trim();
    expect(original.length).toBeGreaterThan(0);
    const edited = original + '\n[patch: edited in E2E]';
    await textarea.fill(edited);
    await page.getByRole('button', { name: 'Done editing' }).click();
    await expect(page.getByText(/edited in E2E/)).toBeVisible();
  });

  test('5. copy the draft response (clipboard)', async () => {
    await page.goto(`/dashboard/cases/${ANALYZED_CASE}`);
    await page.getByRole('button', { name: 'Copy response' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible({ timeout: 5000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.length).toBeGreaterThan(0);
    await expect(page.getByText(/Best regards/)).toBeVisible();
  });

  test('6. mark as resolved through the UI and status persists after refresh', async () => {
    await page.goto('/dashboard/cases');
    const caseId = await firstQueuedCaseId(page);
    expect(caseId).not.toBeNull();
    await page.goto(`/dashboard/cases/${caseId}`);
    const resolveBtn = page.getByRole('button', { name: 'Mark as resolved' });
    await expect(resolveBtn).toBeVisible();
    await resolveBtn.click();
    await expect(page.getByText('Case marked as resolved')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Resolved', { exact: true }).first()).toBeVisible();
    const resolvedBtn = page.getByRole('button', { name: 'Resolved' });
    await expect(resolvedBtn).toBeDisabled();
    await page.screenshot({
      path: 'e2e/screenshots/06-resolved.png',
      fullPage: true
    });
    // list no longer shows the case as queued
    await page.goto('/dashboard/cases');
    const caseLink = page.locator(`a[href="/dashboard/cases/${caseId}"]`);
    const row = page.locator('tr').filter({ has: caseLink });
    await expect(row).toBeVisible();
    await expect(row.locator('span', { hasText: 'Resolved' })).toBeVisible();
  });

  test('7. non-existent case URL returns 404', async () => {
    const resp = await page.goto('/dashboard/cases/99999', {
      waitUntil: 'domcontentloaded'
    });
    expect(resp?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    const resp2 = await page.goto('/dashboard/cases/not-a-number', {
      waitUntil: 'domcontentloaded'
    });
    expect(resp2?.status()).toBe(404);
  });

  test('8. placeholders render when no analysis exists', async () => {
    await page.goto('/dashboard/cases/1');
    await expect(
      page.getByText(/This case has not been analyzed yet/)
    ).toBeVisible();
    await expect(page.getByText(/No recommended action available yet/)).toBeVisible();
    await expect(page.getByText(/No draft response available yet/)).toBeVisible();
    await expect(page.getByText(/No sources retrieved yet/)).toBeVisible();
    await expect(page.getByText(/No confidence score yet/)).toBeVisible();
    const editBtn = page.getByRole('button', { name: 'Edit response' });
    const copyBtn = page.getByRole('button', { name: 'Copy response' });
    await expect(editBtn).toBeDisabled();
    await expect(copyBtn).toBeDisabled();
  });

  test('9. responsive desktop layout has no horizontal overflow', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/dashboard/cases/${ANALYZED_CASE}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('10. tenant isolation: Team B cannot access Team A data', async ({ browser }) => {
    const ctxB = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const p = await ctxB.newPage();
    await signIn(p, TEAM_B);
    await p.goto('/dashboard/cases');
    await expect(p.getByText('No cases yet.')).toBeVisible();
    await expect(p.locator('a[href*="/dashboard/cases/"]')).toHaveCount(0);
    await p.screenshot({
      path: 'e2e/screenshots/10-isolation-empty.png',
      fullPage: true
    });
    const resp = await p.goto(`/dashboard/cases/${ANALYZED_CASE}`, {
      waitUntil: 'domcontentloaded'
    });
    expect(resp?.status()).toBe(404);
    await expect(p.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    await expect(p.getByText('Customer message', { exact: true })).toHaveCount(0);
    await ctxB.close();
  });
});
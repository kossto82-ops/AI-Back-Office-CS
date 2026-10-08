import { test, expect, Page, Browser } from '@playwright/test';
import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';

loadEnv();

const sql = neon(process.env.POSTGRES_URL!);

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const SUBJECT = `[E2E] Audit intake ${Date.now()}`;

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(TEAM_A.email);
  await page.locator('#password').fill(TEAM_A.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

async function eventsFor(caseId: number): Promise<Array<{ type: string; meta: Record<string, unknown> }>> {
  const rows = await sql`select type, meta from case_events where case_id=${caseId} order by id`;
  return rows as Array<{ type: string; meta: Record<string, unknown> }>;
}

/**
 * Product/engineering audit E2E (AI_PROVIDER=mock, AI_MOCK_BEHAVIOR unset).
 *
 * Covers what the audit added or changed: case intake, the open/resolved list
 * filter, draft-first workspace layout, content-free usage events, category
 * adoption, re-run edit protection, and the client-safe user/team payloads.
 * It creates ONE case prefixed "[E2E]" and deletes everything it created.
 */
test.describe.serial('Audit E2E', () => {
  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;
  let caseId = 0;
  let uncoveredCaseId = 0;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:3000'
    });
    page = await context.newPage();
    await signIn(page);
  });

  test.afterAll(async () => {
    for (const id of [caseId, uncoveredCaseId]) {
      if (id > 0) {
        await sql`delete from case_analyses where case_id=${id}`;
        await sql`delete from cases where id=${id}`; // events cascade
      }
    }
    await context.close();
  });

  test('1. create a case from the UI and land in its workspace', async () => {
    await page.goto('/dashboard/cases');
    await page.getByRole('link', { name: 'New case' }).click();
    await page.waitForURL('**/dashboard/cases/new');
    await page.getByLabel('Subject').fill(SUBJECT);
    await page
      .getByLabel('Customer message')
      .fill(
        'Hello, I bought an eSIM yesterday and the QR code shows an error when I scan it. Can you help me activate it? Order ORD-5521.'
      );
    await page.getByRole('button', { name: 'Create case' }).click();
    await page.waitForURL(/\/dashboard\/cases\/\d+$/);
    caseId = Number(page.url().split('/').pop());
    expect(caseId).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: `Case #${caseId}` })).toBeVisible();
    await expect(page.getByText('Unclassified')).toBeVisible();
    const types = (await eventsFor(caseId)).map((e) => e.type);
    expect(types).toContain('case_created');
  });

  test('2. new case shows in the default Open list and not in Resolved', async () => {
    await page.goto('/dashboard/cases');
    await expect(page.locator(`a[href="/dashboard/cases/${caseId}"]`)).toBeVisible();
    await page.goto('/dashboard/cases?status=resolved');
    await expect(page.locator(`a[href="/dashboard/cases/${caseId}"]`)).toHaveCount(0);
  });

  test('3. analysis adopts the category and the draft is visible without scrolling', async () => {
    await page.goto(`/dashboard/cases/${caseId}`);
    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Unclassified')).toHaveCount(0);

    const heading = page.getByText('Draft response', { exact: true });
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(box).not.toBeNull();
    // Whole draft card header must be inside the first 900px screen.
    expect(box!.y + box!.height).toBeLessThan(900);

    const [row] = await sql`select category from cases where id=${caseId}`;
    expect(row.category).toBe('activation');
    const events = await eventsFor(caseId);
    const ok = events.find((e) => e.type === 'analysis_succeeded');
    expect(ok).toBeTruthy();
    expect(typeof ok!.meta.latencyMs).toBe('number');
  });

  test('4. usage events are content-free and copy records edited vs unedited', async () => {
    await page.goto(`/dashboard/cases/${caseId}`);
    await page.getByRole('button', { name: 'Copy response' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit response' }).click();
    await page.locator('textarea').fill('Edited draft for the audit E2E.');
    await page.getByRole('button', { name: 'Done editing' }).click();
    await page.getByRole('button', { name: /Copy response|Copied/ }).click();
    await expect.poll(async () => (await eventsFor(caseId)).filter((e) => e.type === 'draft_copied').length).toBe(2);

    const events = await eventsFor(caseId);
    const copies = events.filter((e) => e.type === 'draft_copied').map((e) => e.meta.edited);
    expect(copies).toEqual([false, true]);
    expect(events.some((e) => e.type === 'case_opened')).toBe(true);

    // No event may carry customer or draft text.
    const blob = JSON.stringify(events);
    expect(blob).not.toContain('QR code');
    expect(blob).not.toContain('Edited draft');
  });

  test('5. re-run asks before discarding an edited draft', async () => {
    await page.goto(`/dashboard/cases/${caseId}`);
    await page.getByRole('button', { name: 'Edit response' }).click();
    await page.locator('textarea').fill('Hand-written reply that must not be lost.');
    await page.getByRole('button', { name: 'Done editing' }).click();

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Re-run analysis' }).click();
    await expect.poll(() => dialogMessage).toContain('replaces your edited draft');
    await expect(page.getByText('Hand-written reply that must not be lost.')).toBeVisible();
    const analyses = await sql`select count(*)::int as c from case_analyses where case_id=${caseId}`;
    expect(Number(analyses[0].c)).toBe(1);
  });

  test('6. resolve moves the case between filters and records the event', async () => {
    await page.goto(`/dashboard/cases/${caseId}`);
    await page.getByRole('button', { name: 'Mark as resolved' }).click();
    await expect(page.getByText('Case marked as resolved')).toBeVisible();
    await page.goto('/dashboard/cases');
    await expect(page.locator(`a[href="/dashboard/cases/${caseId}"]`)).toHaveCount(0);
    await page.goto('/dashboard/cases?status=resolved');
    await expect(page.locator(`a[href="/dashboard/cases/${caseId}"]`)).toBeVisible();
    expect((await eventsFor(caseId)).map((e) => e.type)).toContain('case_resolved');
  });

  test('7. user/team payloads never expose password hash or Stripe ids', async () => {
    const userRes = await page.request.get('/api/user');
    const user = await userRes.json();
    expect(Object.keys(user).sort()).toEqual(['email', 'id', 'name', 'role']);

    const teamRes = await page.request.get('/api/team');
    const team = await teamRes.json();
    expect(team).not.toHaveProperty('stripeCustomerId');
    expect(team).not.toHaveProperty('stripeSubscriptionId');
    expect(team).not.toHaveProperty('stripeProductId');

    const html = await (await page.request.get('/dashboard/cases')).text();
    expect(html).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  test('9. a case the knowledge base cannot cover gets an escalation, not an AI call or an error', async () => {
    await page.goto('/dashboard/cases/new');
    await page.getByLabel('Subject').fill('[E2E] Uncovered topic');
    await page
      .getByLabel('Customer message')
      .fill('Zorblaxian quindleflux frumpetaria blorptangle wumbleshank.');
    await page.getByRole('button', { name: 'Create case' }).click();
    await page.waitForURL(/\/dashboard\/cases\/\d+$/);
    uncoveredCaseId = Number(page.url().split('/').pop());

    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(page.getByText(/No knowledge matched this case/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/standard escalation, not an AI/)).toBeVisible();
    await expect(page.getByText(/Handle this case manually or escalate/)).toBeVisible();
    await expect(page.getByText('No confidence score yet.')).toBeVisible();
    await expect(page.getByText('Unclassified')).toBeVisible();

    const rows = await sql`select model, category, confidence from case_analyses where case_id=${uncoveredCaseId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('no-coverage-escalation');
    expect(rows[0].category).toBeNull();
    const events = await eventsFor(uncoveredCaseId);
    expect(events.find((e) => e.type === 'analysis_succeeded')).toBeUndefined();
    expect(events.find((e) => e.type === 'analysis_blocked')?.meta.reason).toBe('no_knowledge');
  });

  test('8. anonymous requests get no user or team data', async ({ browser }) => {
    const anon = await browser.newContext();
    const res = await anon.request.get('/api/user');
    expect(await res.json()).toBeNull();
    const res2 = await anon.request.get('/api/team');
    expect(await res2.json()).toBeNull();
    await anon.close();
  });
});

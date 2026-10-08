import { test, expect, Page, Browser } from '@playwright/test';
import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';

loadEnv();

const sql = neon(process.env.POSTGRES_URL!);

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const STAMP = Date.now();
// Unusual words so no seeded document can match them.
const WORD = `quizzleberry${STAMP}`;
const TITLE = `[E2E] ${WORD} procedure`;

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(TEAM_A.email);
  await page.locator('#password').fill(TEAM_A.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

/**
 * Knowledge Base lifecycle (AI_PROVIDER=mock, AI_MOCK_BEHAVIOR unset):
 * version history, archive, and the guarantee that an archived document no
 * longer feeds the AI. Creates "[E2E]" rows only and removes them afterwards.
 */
test.describe.serial('Knowledge lifecycle E2E', () => {
  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;
  let docId = 0;
  let caseId = 0;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    await signIn(page);
  });

  test.afterAll(async () => {
    if (caseId > 0) {
      await sql`delete from case_analyses where case_id=${caseId}`;
      await sql`delete from cases where id=${caseId}`;
    }
    await sql`delete from documents where title like ${'[E2E] ' + WORD + '%'}`; // versions cascade
    await context.close();
  });

  test('1. editing keeps a version history, newest first, including the first version', async () => {
    await page.goto('/dashboard/knowledge/new');
    await page.locator('#title').fill(TITLE);
    await page.locator('#type').selectOption('procedure');
    await page.locator('#status').selectOption('active');
    await page.locator('#content').fill(`Step one for ${WORD}: confirm the account holder.`);
    await page.getByRole('button', { name: 'Create document' }).click();
    await page.getByRole('heading', { name: TITLE }).waitFor();
    docId = Number(new URL(page.url()).pathname.split('/').pop());

    await expect(page.getByText('Version history (1)')).toBeVisible();

    await page.getByRole('button', { name: 'Edit document' }).click();
    await page.locator('#content').fill(`Step one for ${WORD}: confirm the account holder and the order number.`);
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Version history (2)')).toBeVisible();

    const rows = await sql`select version from document_versions where document_id=${docId} order by version`;
    expect(rows.map((r) => r.version)).toEqual([1, 2]);

    await page.getByText(/v1 ·/).click();
    await expect(page.getByText(`Step one for ${WORD}: confirm the account holder.`).first()).toBeVisible();
  });

  test('2. an active document feeds the AI; the analysis records its version', async () => {
    await page.goto('/dashboard/cases/new');
    // Only the unique word: ordinary words would match seeded documents and the
    // case would never be uncovered after archiving.
    await page.getByLabel('Subject').fill(`[E2E] ${WORD}`);
    await page.getByLabel('Customer message').fill(WORD);
    await page.getByRole('button', { name: 'Create case' }).click();
    await page.waitForURL(/\/dashboard\/cases\/\d+$/);
    caseId = Number(page.url().split('/').pop());

    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible({ timeout: 20_000 });
    const [row] = await sql`select sources from case_analyses where case_id=${caseId}`;
    const sources = row.sources as Array<{ documentId: number; version: number }>;
    expect(sources.some((s) => s.documentId === docId && s.version === 2)).toBe(true);
  });

  test('3. archiving hides the document by default, keeps it findable, and removes it from the AI', async () => {
    await page.goto(`/dashboard/knowledge/${docId}`);
    await page.getByRole('button', { name: 'Edit document' }).click();
    await page.locator('#status').selectOption('archived');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();

    // status-only change must not create a new version
    const rows = await sql`select version from document_versions where document_id=${docId}`;
    expect(rows).toHaveLength(2);

    await page.goto(`/dashboard/knowledge?q=${WORD}`);
    await expect(page.getByRole('link', { name: TITLE })).toHaveCount(0);
    await page.goto(`/dashboard/knowledge?q=${WORD}&status=archived`);
    await expect(page.getByRole('link', { name: TITLE })).toBeVisible();

    // The AI can no longer see it: the same question now escalates.
    await page.goto(`/dashboard/cases/${caseId}`);
    await page.getByRole('button', { name: 'Re-run analysis' }).click();
    await expect(page.getByText(/No knowledge matched this case/).first()).toBeVisible({ timeout: 20_000 });
  });

  test('4. an older analysis flags that its source is now archived', async () => {
    // Re-create the situation: restore the active analysis row is not needed;
    // the first analysis (still in history) cites the now-archived document.
    await sql`delete from case_analyses where case_id=${caseId} and model='no-coverage-escalation'`;
    await page.goto(`/dashboard/cases/${caseId}`);
    await expect(page.getByText(/This document is now archived/)).toBeVisible();
  });
});

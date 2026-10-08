import { test, expect, Page, Browser } from '@playwright/test';
import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';

loadEnv();

const sql = neon(process.env.POSTGRES_URL!);

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const STAMP = Date.now();
const WORD = `zanzibarflux${STAMP}`;
const PREFIX = `[E2E] import ${STAMP}`;

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(TEAM_A.email);
  await page.locator('#password').fill(TEAM_A.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

/**
 * Bulk import (AI_PROVIDER=mock): markdown with several H1s + CSV with a bad
 * row, import as draft, duplicates skipped, drafts invisible to the AI until
 * activated. Creates "[E2E] import" rows only and removes them afterwards.
 */
test.describe.serial('Knowledge import E2E', () => {
  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;
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
    await sql`delete from documents where title like ${PREFIX + '%'}`; // versions cascade
    await context.close();
  });

  async function addFiles() {
    await page.goto('/dashboard/knowledge/import');
    await page.locator('#files').setInputFiles([
      {
        name: 'handbook.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from(
          `# ${PREFIX} alpha\nProcedure about ${WORD}: check the account first.\n\n# ${PREFIX} beta\nSecond section text.\n`
        )
      },
      {
        name: 'faq.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          `title,type,content\n"${PREFIX} gamma, with comma",faq,"Answer with ""quotes"""\n,faq,missing title row\n`
        )
      }
    ]);
  }

  test('1. files are parsed into a reviewable list with problems flagged', async () => {
    await addFiles();
    await expect(page.getByText(`${PREFIX} alpha`).first()).toBeVisible();
    await expect(page.getByText(`${PREFIX} beta`)).toBeVisible();
    await expect(page.getByText(`${PREFIX} gamma, with comma`)).toBeVisible();
    await expect(page.getByText('Cannot import: Missing title')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 3 documents' })).toBeVisible();
  });

  test('2. importing creates drafts with a first version each', async () => {
    await page.getByRole('button', { name: 'Import 3 documents' }).click();
    await expect(page.getByText('Imported 3 documents as draft.')).toBeVisible();

    const docs = await sql`select id, status, version, type from documents where title like ${PREFIX + '%'} order by title`;
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.status === 'draft' && d.version === 1)).toBe(true);
    expect(docs.find((d) => d.type === 'faq')).toBeTruthy();
    const versions = await sql`select count(*)::int c from document_versions where document_id = any(${docs.map((d) => d.id)})`;
    expect(Number(versions[0].c)).toBe(3);
  });

  test('3. importing the same titles again skips them instead of overwriting', async () => {
    await addFiles();
    await page.getByRole('button', { name: /Import 3 documents/ }).click();
    await expect(page.getByText('Imported 0 documents as draft.')).toBeVisible();
    await expect(page.getByText(/Skipped \(title already exists\)/)).toBeVisible();
    const docs = await sql`select count(*)::int c from documents where title like ${PREFIX + '%'}`;
    expect(Number(docs[0].c)).toBe(3);
  });

  test('4. imported drafts are invisible to the AI until activated', async () => {
    await page.goto('/dashboard/cases/new');
    await page.getByLabel('Subject').fill(`[E2E] ${WORD}`);
    await page.getByLabel('Customer message').fill(WORD);
    await page.getByRole('button', { name: 'Create case' }).click();
    await page.waitForURL(/\/dashboard\/cases\/\d+$/);
    caseId = Number(page.url().split('/').pop());

    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(page.getByText(/No knowledge matched this case/).first()).toBeVisible({ timeout: 20_000 });

    await sql`update documents set status='active' where title = ${PREFIX + ' alpha'}`;
    await page.getByRole('button', { name: 'Re-run analysis' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`${PREFIX} alpha`).first()).toBeVisible();
  });
});

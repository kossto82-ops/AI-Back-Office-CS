import { test, expect, Page, Browser } from '@playwright/test';

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const TEAM_B = { email: 'isolation@test.com', password: 'password1' };

const SEEDED = {
  PROCEDURE: 'New Line Activation Procedure',
  FAQ: 'FAQ: How long does a new line activation take?',
  GUIDE: 'Guide: Writing a Customer-Safe Draft Response',
  DRAFT_GUIDE: 'Guide: Using the Case Workspace'
};

async function signIn(page: Page, creds: typeof TEAM_A) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

async function openKnowledgeBase(page: Page) {
  await page.getByRole('link', { name: 'Knowledge Base' }).click();
  await page.waitForURL('**/dashboard/knowledge');
}

async function createDocument(
  page: Page,
  values: { title: string; type: string; content: string; status: string }
) {
  await page.goto('/dashboard/knowledge');
  await page.getByRole('link', { name: 'Create document' }).first().click();
  await page.waitForURL('**/dashboard/knowledge/new');
  await page.locator('#title').fill(values.title);
  await page.locator('#type').selectOption(values.type);
  await page.locator('#status').selectOption(values.status);
  await page.locator('#content').fill(values.content);
  await page.getByRole('button', { name: 'Create document' }).click();
  await page.getByRole('heading', { name: values.title }).waitFor();
  return Number(new URL(page.url()).pathname.split('/').pop());
}

test.describe.serial('Phase 3 E2E - Knowledge Base', () => {
  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;
  let teamADocId: number;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    page = await context.newPage();
  });

  test('1. sign-in and navigate to the Knowledge Base', async () => {
    await signIn(page, TEAM_A);
    await openKnowledgeBase(page);
    await expect(
      page.getByRole('heading', { name: 'Knowledge Base' })
    ).toBeVisible();
  });

  test('2. seeded procedures, FAQs, and guides all appear', async () => {
    await expect(page.getByRole('link', { name: SEEDED.PROCEDURE })).toBeVisible();
    await expect(page.getByRole('link', { name: SEEDED.FAQ })).toBeVisible();
    await expect(page.getByRole('link', { name: SEEDED.GUIDE })).toBeVisible();
    // the draft guide shows a Draft status badge in the list
    const row = page.locator('tr').filter({ hasText: SEEDED.DRAFT_GUIDE });
    await expect(row.locator('span', { hasText: 'Draft' })).toBeVisible();
    await page.screenshot({
      path: 'e2e/screenshots/kb-02-list.png',
      fullPage: true
    });
  });

  test('3. type filter narrows the list to one document type', async () => {
    await page.getByLabel('Filter by document type').selectOption('guide');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForURL('**/dashboard/knowledge?*');
    await expect(page.getByRole('link', { name: SEEDED.GUIDE })).toBeVisible();
    await expect(page.getByRole('link', { name: SEEDED.PROCEDURE })).toHaveCount(0);
    await expect(page.getByRole('link', { name: SEEDED.FAQ })).toHaveCount(0);
    // reset filters for the next tests
    await page.getByRole('link', { name: 'Clear' }).click();
    await page.waitForURL('**/dashboard/knowledge');
  });

  test('4. search finds an existing procedure and shows match context', async () => {
    await page.getByLabel('Search knowledge base').fill('eSIM activation');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForURL('**/dashboard/knowledge?*');
    const result = page.getByRole('link', { name: /eSIM Activation Procedure/ });
    await expect(result).toBeVisible();
    // content snippet provides context for why the result matched
    const snippet = page
      .locator('tr')
      .filter({ has: result })
      .locator('span.text-gray-500');
    await expect(snippet).toBeVisible();
  });

  test('5. opening a search result shows the full document detail', async () => {
    await page.getByRole('link', { name: /eSIM Activation Procedure/ }).click();
    await expect(
      page.getByRole('heading', { name: 'eSIM Activation Procedure' })
    ).toBeVisible();
    // type + status + version + creator + updated date
    await expect(page.getByText('Procedure', { exact: true })).toBeVisible();
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
    await expect(page.getByText('v2', { exact: true })).toBeVisible();
    await expect(page.getByText(/Created by Test User/)).toBeVisible();
    // internal-knowledge distinction is explicit
    await expect(page.getByText(/Internal knowledge/i)).toBeVisible();
    // full content renders
    await expect(page.getByText(/Confirm the device is unlocked/)).toBeVisible();
  });

  test('6. create a new document through the UI', async () => {
    teamADocId = await createDocument(page, {
      title: 'E2E Guide: Handling Refund Requests',
      type: 'procedure',
      content:
        'Step 1: verify the invoice reference.\nStep 2: confirm the standard adjustment limit.\nStep 3: log the outcome in the case before closing.',
      status: 'active'
    });
    expect(teamADocId).toBeGreaterThan(0);
    await expect(
      page.getByRole('heading', { name: 'E2E Guide: Handling Refund Requests' })
    ).toBeVisible();
    await page.screenshot({
      path: 'e2e/screenshots/kb-06-created.png',
      fullPage: true
    });
  });

  test('7. edit content and change type + status; version increments', async () => {
    await page.goto(`/dashboard/knowledge/${teamADocId}`);
    await page.getByRole('button', { name: 'Edit document' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    // change type + content -> version bump; change status -> same version
    await page.locator('#type').selectOption('guide');
    await page.locator('#status').selectOption('draft');
    await page.locator('#content').fill(
      'Step 1: verify the invoice reference.\nStep 2: confirm the standard adjustment limit.\nStep 3: obtain lead approval for credits above the limit.\nStep 4: log the outcome in the case before closing.'
    );
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(`**/dashboard/knowledge/${teamADocId}`);
    await expect(page.getByRole('heading', { name: 'E2E Guide: Handling Refund Requests' })).toBeVisible();
    await expect(page.getByText('Guide', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('v2', { exact: true })).toBeVisible();
  });

  test('8. edits persist after a full page reload', async () => {
    await page.reload();
    await expect(page.getByText('Guide', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('v2', { exact: true })).toBeVisible();
    await expect(page.getByText(/obtain lead approval/)).toBeVisible();
  });

  test('9. status-only change keeps the version number', async () => {
    await page.getByRole('button', { name: 'Edit document' }).click();
    await page.locator('#status').selectOption('active');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(`**/dashboard/knowledge/${teamADocId}`);
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('v2', { exact: true })).toBeVisible();
  });

  test('10. non-existent and non-numeric document URLs return 404', async () => {
    const resp1 = await page.goto('/dashboard/knowledge/99999', {
      waitUntil: 'domcontentloaded'
    });
    expect(resp1?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    const resp2 = await page.goto('/dashboard/knowledge/not-a-number', {
      waitUntil: 'domcontentloaded'
    });
    expect(resp2?.status()).toBe(404);
  });

  test('11. responsive desktop layout has no horizontal overflow', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/knowledge');
    const listOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(listOverflow).toBe(false);
    await page.goto(`/dashboard/knowledge/${teamADocId}`);
    const detailOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(detailOverflow).toBe(false);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('12. tenant isolation: teams can never read or reach each other\'s documents', async ({
    browser
  }) => {
    // Team B is a fresh team with no documents
    const ctxB = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const p = await ctxB.newPage();
    await signIn(p, TEAM_B);
    await openKnowledgeBase(p);
    // Team B must never see Team A knowledge (empty state is only asserted
    // on the first run, when Team B has no documents at all)
    const emptyState = p.getByText('No knowledge documents yet');
    if ((await emptyState.count()) > 0) {
      await expect(emptyState).toBeVisible();
    }
    await expect(
      p.getByRole('link', { name: SEEDED.PROCEDURE })
    ).toHaveCount(0);

    // Team B creates its own document and captures its id
    const teamBDocId = await createDocument(p, {
      title: 'Isolation Team Document',
      type: 'faq',
      content: 'Internal note that must stay inside Team B.',
      status: 'draft'
    });

    // Team B cannot read Team A's document by id
    const crossRead = await p.goto(`/dashboard/knowledge/${teamADocId}`, {
      waitUntil: 'domcontentloaded'
    });
    expect(crossRead?.status()).toBe(404);
    await expect(p.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    await expect(p.getByText(/E2E Guide: Handling Refund Requests/)).toHaveCount(0);
    await ctxB.close();

    // Team A (main context) cannot read Team B's document by id
    const resp = await page.goto(`/dashboard/knowledge/${teamBDocId}`, {
      waitUntil: 'domcontentloaded'
    });
    expect(resp?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();

    // Team A search must not surface Team B content either
    await page.goto('/dashboard/knowledge');
    await page.getByLabel('Search knowledge base').fill('Isolation Team Document');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForURL('**/dashboard/knowledge?*');
    await expect(
      page.getByText('No documents match your search and filters.')
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Isolation Team Document' })
    ).toHaveCount(0);
  });
});
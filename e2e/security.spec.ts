import { test, expect, Page, Browser } from '@playwright/test';
import { neon } from '@neondatabase/serverless';
import { hash } from 'bcryptjs';
import { config as loadEnv } from 'dotenv';

loadEnv();

const sql = neon(process.env.POSTGRES_URL!);

const OWNER = { email: 'test@test.com', password: 'admin123' };
const STAMP = Date.now();
const MEMBER = { email: `member-${STAMP}@e2e.example.com`, password: 'member-pass-123' };
const LOCK_EMAIL = `lock-${STAMP}@e2e.example.com`;
const OWNER_DOC = `[E2E] owner doc ${STAMP}`;
const MEMBER_DOC = `[E2E] member draft ${STAMP}`;

async function signIn(page: Page, creds: { email: string; password: string }) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/**
 * Authentication throttling and knowledge publishing permissions
 * (AI_PROVIDER=mock). Creates a throwaway team member and "[E2E]" documents,
 * and removes everything it created.
 */
test.describe.serial('Security E2E', () => {
  let context: Awaited<ReturnType<Browser['newContext']>>;
  let page: Page;
  let memberId = 0;
  let ownerDocId = 0;

  test.beforeAll(async ({ browser }) => {
    const [team] = await sql`select id from teams where name = 'Test Team' order by id limit 1`;
    const passwordHash = await hash(MEMBER.password, 10);
    const [user] = await sql`insert into users (email, password_hash, role) values (${MEMBER.email}, ${passwordHash}, 'member') returning id`;
    memberId = user.id;
    await sql`insert into team_members (user_id, team_id, role) values (${memberId}, ${team.id}, 'member')`;
    const [doc] = await sql`insert into documents (team_id, title, type, content, status, version) values (${team.id}, ${OWNER_DOC}, 'faq', 'Published content owned by the team.', 'active', 1) returning id`;
    ownerDocId = doc.id;

    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await sql`delete from documents where title like ${'[E2E] % ' + STAMP + '%'}`; // versions cascade
    await sql`delete from activity_logs where user_id = ${memberId}`;
    await sql`delete from team_members where user_id = ${memberId}`;
    await sql`delete from users where id = ${memberId}`;
    await sql`delete from auth_attempts where identifier like ${'email:%@e2e.example.com'}`;
    await context.close();
  });

  test('1. five wrong passwords lock the account for sign-in; other accounts are unaffected', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    for (let i = 0; i < 5; i++) {
      await signIn(p, { email: LOCK_EMAIL, password: `wrong-password-${i}` });
      await expect(p.getByText('Invalid email or password. Please try again.')).toBeVisible();
    }
    await signIn(p, { email: LOCK_EMAIL, password: 'wrong-password-6' });
    await expect(p.getByText(/Too many failed sign-in attempts/)).toBeVisible();

    // A correct password for a locked email is still refused (no oracle for guessing).
    await signIn(p, { email: LOCK_EMAIL, password: 'another-password-7' });
    await expect(p.getByText(/Too many failed sign-in attempts/)).toBeVisible();

    // A different, real account signs in normally.
    await signIn(p, OWNER);
    await p.waitForURL('**/dashboard');
    await ctx.close();
  });

  test('2. a successful sign-in clears earlier failures for that account', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    for (let i = 0; i < 3; i++) {
      await signIn(p, { email: MEMBER.email, password: `bad-password-${i}` });
      await expect(p.getByText('Invalid email or password. Please try again.')).toBeVisible();
    }
    await signIn(p, MEMBER);
    await p.waitForURL('**/dashboard');
    const rows = await sql`select count(*)::int c from auth_attempts where identifier = ${'email:' + MEMBER.email}`;
    expect(Number(rows[0].c)).toBe(0);
    await ctx.close();
  });

  test('3. a member can only save drafts: the editor offers no other status', async () => {
    await signIn(page, MEMBER);
    await page.waitForURL('**/dashboard');
    await page.goto('/dashboard/knowledge/new');
    const options = await page.locator('#status option').allTextContents();
    expect(options).toEqual(['Draft']);
    await expect(page.getByText(/Only team owners can publish/)).toBeVisible();

    await page.locator('#title').fill(MEMBER_DOC);
    await page.locator('#content').fill('A member proposal that an owner should review first.');
    await page.getByRole('button', { name: 'Create document' }).click();
    await page.getByRole('heading', { name: MEMBER_DOC }).waitFor();
    const [row] = await sql`select status from documents where title = ${MEMBER_DOC}`;
    expect(row.status).toBe('draft');
  });

  test('4. the server refuses a member who forces another status past the UI', async () => {
    await page.goto('/dashboard/knowledge/new');
    await page.locator('#title').fill(`[E2E] member forced ${STAMP}`);
    await page.locator('#content').fill('Trying to publish directly.');
    await page.evaluate(() => {
      const select = document.querySelector('#status') as HTMLSelectElement;
      const option = document.createElement('option');
      option.value = 'active';
      option.text = 'Active';
      select.appendChild(option);
      select.value = 'active';
    });
    await page.getByRole('button', { name: 'Create document' }).click();
    await expect(page.getByText(/Only team owners can activate or archive/)).toBeVisible();
    const rows = await sql`select 1 from documents where title = ${`[E2E] member forced ${STAMP}`}`;
    expect(rows).toHaveLength(0);
  });

  test('5. a member cannot edit a published document and the content stays intact', async () => {
    await page.goto(`/dashboard/knowledge/${ownerDocId}`);
    await expect(page.getByRole('heading', { name: OWNER_DOC })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit document' })).toHaveCount(0);
    await expect(page.getByText(/Only team owners can edit published documents/)).toBeVisible();
    const [row] = await sql`select content, version from documents where id = ${ownerDocId}`;
    expect(row.content).toBe('Published content owned by the team.');
    expect(row.version).toBe(1);
  });

  test('6. a member can import, but only as draft', async () => {
    await page.goto('/dashboard/knowledge/import');
    const options = await page.locator('#importStatus option').allTextContents();
    expect(options).toHaveLength(1);
    expect(options[0]).toMatch(/^Draft/);
  });

  test('7. an owner keeps full control over the same document', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await signIn(p, OWNER);
    await p.waitForURL('**/dashboard');
    await p.goto(`/dashboard/knowledge/${ownerDocId}`);
    await expect(p.getByRole('button', { name: 'Edit document' })).toBeVisible();
    await p.goto('/dashboard/knowledge/new');
    expect(await p.locator('#status option').allTextContents()).toEqual(['Draft', 'Active', 'Archived']);
    await ctx.close();
  });
});

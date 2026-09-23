import { test, expect, Page, Browser } from '@playwright/test';
import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

loadEnv();

const sql = neon(process.env.POSTGRES_URL!);

const TEAM_A = { email: 'test@test.com', password: 'admin123' };
const RESULT_ARTIFACT = path.join(
  process.cwd(),
  'docs/PHASES/phase9-agent-value-results.json'
);

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.locator('#email').fill(TEAM_A.email);
  await page.locator('#password').fill(TEAM_A.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

async function experimentCase(condition: 'manual' | 'ai'): Promise<number> {
  const rows = (await sql`
    select c.id from cases c
    where c.subject like '[P9] %'
      and c.team_id = (select id from teams where name = 'Test Team')
    order by c.id
  `) as Array<{ id: number }>;
  // p9-02 (index 1) is manual, p9-01 (index 0) is ai in seed order.
  return Number(rows[condition === 'manual' ? 1 : 0].id);
}

async function gatingCase(): Promise<number> {
  const rows = (await sql`
    select id from cases
    where subject = 'August invoice never arrived'
      and subject not like '[P9] %'
    order by id
    limit 1
  `) as Array<{ id: number }>;
  return Number(rows[0].id);
}

async function countAnalyses(caseId: number): Promise<number> {
  const [row] = await sql`select count(*)::int as c from case_analyses where case_id=${caseId}`;
  return Number(row.c);
}

function readArtifact() {
  if (!fs.existsSync(RESULT_ARTIFACT)) return { rows: [] as any[] };
  return JSON.parse(fs.readFileSync(RESULT_ARTIFACT, 'utf8')) as {
    rows: Array<Record<string, string>>;
  };
}

/**
 * Phase 9 E2E — experiment mechanics validation.
 *
 * Runs against a dev server started with the default mock provider
 * (AI_PROVIDER=mock, AI_MOCK_BEHAVIOR unset). Verifies the THREE mechanics that
 * must hold before any real pilot data can be trusted:
 *
 *   1. manual condition genuinely hides all AI-assisted output
 *      (analysis, sources, recommended action, confidence, missing info,
 *      run form) and starts with a blank draft editor
 *   2. ai condition runs the real analysis flow, prefills the draft, and both
 *      arms record an experiment result row (caseId + condition + elapsed +
 *      edit sessions + keystrokes + final text) into the results artifact
 *   3. experiment UI does NOT appear on a non-[P9] case even with the query
 *      params present (gating)
 *
 * The artifact is backed up before the run and restored afterwards so E2E
 * rows never pollute a real pilot's data. Simulated E2E timings are
 * MECHANICS-ONLY and must never be interpreted as agent performance.
 */
test.describe.serial('Phase 9 E2E - experiment mechanics', () => {
  let page: Page;
  let context: Awaited<ReturnType<Browser['newContext']>>;
  let manualId: number;
  let aiId: number;
  let gateId: number;
  let artifactBackup: string | null = null;

  test.beforeAll(async ({ browser }) => {
    execSync('npx tsx scripts/phase9/seed-experiment.ts', {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    if (fs.existsSync(RESULT_ARTIFACT)) {
      artifactBackup = fs.readFileSync(RESULT_ARTIFACT, 'utf8');
    }

    manualId = await experimentCase('manual');
    aiId = await experimentCase('ai');
    gateId = await gatingCase();

    context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    page = await context.newPage();
    await signIn(page);
  });

  test.afterAll(async () => {
    await context?.close();
    if (artifactBackup === null) {
      try {
        fs.rmSync(RESULT_ARTIFACT, { force: true });
      } catch {
        // ignore
      }
    } else {
      fs.mkdirSync(path.dirname(RESULT_ARTIFACT), { recursive: true });
      fs.writeFileSync(RESULT_ARTIFACT, artifactBackup, 'utf8');
    }
  });

  test('manual condition hides all AI output and records the usable marker', async () => {
    test.slow();
    await page.goto(`/dashboard/cases/${manualId}?exp=p9&cond=manual`);
    await expect(
      page.getByRole('heading', { name: `Case #${manualId}` })
    ).toBeVisible();
    await expect(page.getByText('manual baseline')).toBeVisible();

    for (const hidden of [
      'AI analysis',
      'Knowledge sources',
      'Recommended action',
      'AI confidence',
      'Missing information'
    ]) {
      await expect(page.getByRole('heading', { name: hidden })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Run analysis' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Re-run analysis' })).toHaveCount(0);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('');

    const finalText =
      'We checked your account and you have exactly one line and one subscription. ' +
      'The September invoice shows the base plan twice, which looks like a double charge. ' +
      'We will verify the invoice and correct it for you.';
    await textarea.fill(finalText);

    await page
      .getByRole('button', { name: 'Mark response as usable' })
      .click();
    await expect(page.getByText('Experiment result recorded')).toBeVisible({
      timeout: 20_000
    });

    const artifact = readArtifact();
    const row = artifact.rows.find(
      (r) => Number(r.caseId) === manualId && r.condition === 'manual'
    );
    expect(row, 'manual row recorded in artifact').toBeTruthy();
    expect(Number(row!.elapsedMs)).toBeGreaterThanOrEqual(0);
    expect(Number(row!.keystrokes)).toBeGreaterThan(0);
    expect(Number(row!.editSessions)).toBeGreaterThanOrEqual(1);
    expect(row!.draftResponse).toContain('double charge');

    await page.screenshot({
      path: 'e2e/screenshots/phase9-manual.png',
      fullPage: true
    });
  });

  test('ai condition runs the analysis, prefills the draft, records the usable marker', async () => {
    test.slow();
    await page.goto(`/dashboard/cases/${aiId}?exp=p9&cond=ai`);
    await expect(page.getByText('AI-assisted')).toBeVisible();

    await page.getByRole('button', { name: 'Run analysis' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible({
      timeout: 45_000
    });

    await page.getByRole('button', { name: 'Edit response' }).click();
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 20_000 });
    const prefilled = await textarea.inputValue();
    expect(prefilled.trim().length).toBeGreaterThan(0);

    const suffix = ' Please confirm the corrected invoice with the customer.';
    await textarea.fill(prefilled + suffix);

    await page
      .getByRole('button', { name: 'Mark response as usable' })
      .click();
    await expect(page.getByText('Experiment result recorded')).toBeVisible({
      timeout: 20_000
    });

    expect(await countAnalyses(aiId)).toBe(1);

    const artifact = readArtifact();
    const row = artifact.rows.find(
      (r) => Number(r.caseId) === aiId && r.condition === 'ai'
    );
    expect(row, 'ai row recorded in artifact').toBeTruthy();
    expect(Number(row!.elapsedMs)).toBeGreaterThanOrEqual(0);
    expect(Number(row!.keystrokes)).toBeGreaterThan(0);
    expect(row!.draftResponse).toContain('confirm the corrected invoice');

    await page.screenshot({
      path: 'e2e/screenshots/phase9-ai.png',
      fullPage: true
    });
  });

  test('experiment UI does not appear on a non-[P9] case', async () => {
    await page.goto(`/dashboard/cases/${gateId}?exp=p9&cond=ai`);
    await expect(
      page.getByRole('heading', { name: `Case #${gateId}` })
    ).toBeVisible();
    await expect(page.getByText(/Phase 9 experiment/)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Mark response as usable' })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Run analysis' })).toBeVisible();
  });
});
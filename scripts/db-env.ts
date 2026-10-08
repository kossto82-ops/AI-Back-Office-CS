/**
 * Switch which Neon branch the app, E2E and scripts talk to.
 *
 *   pnpm db:use dev | pilot | production
 *
 * Reads .env.<name>.local (git-ignored; holds POSTGRES_URL, DATABASE_URL,
 * DATABASE_URL_UNPOOLED, NEON_BRANCH) and rewrites those four keys in .env,
 * leaving every other variable untouched. Prints only the branch and host,
 * never credentials. Restart `pnpm dev` after switching.
 *
 * Branch model (see docs/DATABASE-ENVIRONMENTS.md):
 *   dev         daily development and E2E (disposable test data)
 *   pilot       the real pilot team; never used by automated tests
 *   production  frozen pre-audit snapshot (default Neon branch)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const KEYS = ['POSTGRES_URL', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'NEON_BRANCH'];
const name = process.argv[2];

if (!name || !['dev', 'pilot', 'production'].includes(name)) {
  console.error('Usage: pnpm db:use <dev|pilot|production>');
  process.exit(1);
}
const source = `.env.${name}.local`;
if (!existsSync(source)) {
  console.error(`${source} not found. Create it with: neonctl connection-string ${name}`);
  process.exit(1);
}

const values = new Map<string, string>();
for (const line of readFileSync(source, 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0) values.set(line.slice(0, i), line.slice(i + 1));
}
for (const key of KEYS) {
  if (!values.get(key)) {
    console.error(`${source} is missing ${key}`);
    process.exit(1);
  }
}

const lines = existsSync('.env') ? readFileSync('.env', 'utf8').split(/\r?\n/) : [];
const written = new Set<string>();
const out = lines.map((line) => {
  const key = line.split('=')[0];
  if (KEYS.includes(key)) {
    written.add(key);
    return `${key}=${values.get(key)}`;
  }
  return line;
});
for (const key of KEYS) if (!written.has(key)) out.push(`${key}=${values.get(key)}`);
writeFileSync('.env', out.join('\n'));

const host = values.get('POSTGRES_URL')!.replace(/^.*@/, '').replace(/\/.*$/, '');
console.log(`.env now points to branch "${name}" (${host})`);

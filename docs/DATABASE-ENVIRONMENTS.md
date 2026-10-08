# Database environments (Neon)

Project `ai-backoffice-cs` (`solitary-fire-28549510`, org `org-misty-haze-71029824`, `aws-ap-southeast-1`).
Created during the product/engineering audit (2026-10-08) to remove the single shared database
(audit findings SEC-03 / DATA-01).

| Branch | Purpose | Who may write | Automated tests |
|---|---|---|---|
| `dev` | Daily development and E2E. A copy of the old shared data, so every existing E2E assumption still holds | developers, Playwright | **yes** |
| `pilot` | The real pilot team. Must start with no test data (see "Pilot branch status") | the pilot users | **never** |
| `production` (default) | Frozen pre-audit snapshot, kept as evidence. Not used by the app | nobody | **never** |

Branches are copy-on-write children of `production`; creating one is instant and costs almost nothing.

## Switching

Connection strings live in git-ignored files `.env.<branch>.local` (`POSTGRES_URL`, `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `NEON_BRANCH`). Never paste them in chat, commits or reports.

```bash
pnpm db:use dev          # rewrites those four keys in .env; other variables untouched
pnpm db:use pilot
```

Restart `pnpm dev` after switching. A fresh machine recreates a file with
`npx neonctl connection-string <branch> --project-id solitary-fire-28549510` (after `neonctl auth`).

## Creating more environments (scales without new infrastructure)

```bash
npx neonctl branches create --name staging --parent dev --project-id solitary-fire-28549510
npx neonctl branches delete staging --project-id solitary-fire-28549510
```

One branch per customer pilot, per feature, or per CI run is the intended pattern. `lib/db/migrations`
are applied with `pnpm db:migrate` against whichever branch `.env` points to.

## Pilot branch status

`pilot` was created as a copy of `production` and **emptied on 2026-10-08 with the owner's explicit approval**
(all application tables truncated; the `drizzle` migrations table, 5 migrations, kept). Verified: 0 users, 0 teams,
0 cases, 0 documents. The first person to sign up in the app against this branch creates the pilot team.
Switch with `pnpm db:use pilot`; never run automated tests against it.

## CI

`.github/workflows/ci.yml` runs typecheck, the deterministic unit suites and the production build with
placeholder variables (no database, no provider, no Stripe). E2E is intentionally not in CI yet: it needs
a database. Next step: a per-run ephemeral branch created and deleted by the workflow with a Neon API
key stored as a GitHub secret.

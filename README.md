# AI Back Office CS

AI Back Office CS is a B2B SaaS for small customer-service teams. It helps
agents process cases faster by analyzing customer requests, classifying them,
and retrieving the relevant internal knowledge to draft a response — with a
human reviewing every step.

The AI assists the agent, it never acts on its own. In the MVP no external
action is executed automatically.

## How it works

```
customer case
  → AI analysis
  → case classification
  → knowledge retrieval
  → recommended action
  → draft response
  → human review (approve / edit / copy)
```

## Features

- **Tenant-scoped dashboard** (`/dashboard`) with role-based access (owner / member)
- **Cases** — case list and workspace: customer message, AI analysis,
  recommended action, draft response (edit / copy), sources, confidence,
  missing information, mark-as-resolved
- **Knowledge Base** — procedures, FAQs and guides with search and type/status
  filters, versioning (draft / active), and a retrieval abstraction ready for
  AI-assisted lookups
- **Billing** — Stripe integration with subscription management
- **Auth** — email/password sign-up and sign-in with JWT sessions
- **Activity logging** for user events

## Tech stack

- [Next.js](https://nextjs.org/) 15 (App Router, Turbopack) · React 19 · TypeScript
- [Tailwind CSS](https://tailwindcss.com/) 4 + [shadcn/ui](https://ui.shadcn.com/) (Radix primitives)
- [PostgreSQL](https://www.postgresql.org/) (Neon, serverless HTTP driver) + [Drizzle ORM](https://orm.drizzle.team/)
- [Stripe](https://stripe.com/) for subscriptions
- [Zod](https://zod.dev/) for server-side validation · [SWR](https://swr.vercel.app/) for client data fetching
- [Playwright](https://playwright.dev/) for end-to-end tests

## Getting started

Prerequisites: Node.js 20+, pnpm, and access to a PostgreSQL database (this
repo uses Neon; any Postgres reachable by connection string works).

```bash
git clone https://github.com/kossto82-ops/AI-Back-Office-CS.git
cd AI-Back-Office-CS
pnpm install
pnpm db:setup
```

`pnpm db:setup` writes your `.env` from `.env.example`. Stripe keys can be left
blank — auth and the app run without them during the MVP. If you do not use
Stripe, create `.env` manually from `.env.example` instead.

Run the migrations, seed the database, and start the dev server:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000 and sign in with the seed account:

- Email: `test@test.com`
- Password: `admin123`

You can also create new users through `/sign-up`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `POSTGRES_URL` | Yes | Neon (or Postgres) connection string |
| `AUTH_SECRET` | Yes | Secret used to sign the JWT session cookie (`openssl rand -base64 32`) |
| `BASE_URL` | Yes | App base URL (dev: `http://localhost:3000`) |
| `STRIPE_SECRET_KEY` | MVP optional | Stripe secret key (`sk_test_...`) — billing only |
| `STRIPE_WEBHOOK_SECRET` | MVP optional | Stripe webhook signing secret |

## Database

- Schema: `lib/db/schema.ts` (Drizzle). Migrations: drizzle-kit + `scripts/migrate.ts`.
- Seed: `lib/db/seed.ts` — fictional customers, 20 cases, 33+ knowledge
  documents, scoped to the seed team. Seed is **not idempotent**: re-run only
  on an empty database.
- Multi-tenancy: every query and server action is scoped by `teamId` — data of
  one organization is never readable by another.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) on http://localhost:3000 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | Type-check with `tsc --noEmit` |
| `pnpm db:setup` | Generate `.env` from `.env.example` |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed` | Seed the database |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm exec playwright test` | Run the E2E suites |

## Project structure

```
app/
  (dashboard)/                    public landing + pricing
  (login)/                        sign-in / sign-up
  (dashboard)/dashboard/          protected app: cases, knowledge, security, activity, general
lib/
  auth/                           JWT sessions
  db/                             Drizzle schema, queries, seed, case categories
  ai/retrieval.ts                 retrieval abstraction (Postgres text provider today)
  payments/                       Stripe
e2e/                              Playwright suites (phase2, phase3)
docs/                             implementation plans + E2E reports
```

## Security

- **Tenant isolation at the query layer** — every read is scoped to `teamId`;
  cross-team reads return 404.
- JWT session cookies; API keys stay server-only, never sent to the browser.
- Cross-tenant access is covered by E2E tests (real browser, two teams).

## Testing

- Type-check: `pnpm typecheck`
- Production build: `pnpm build`
- E2E: `pnpm exec playwright test` (real browser, requires the dev server running)
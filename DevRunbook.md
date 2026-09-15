# DevRunbook — AI Back Office CS

Runbook para instalar, ejecutar y construir este repositorio desde cero en
**cualquier máquina**. La idea: una vez seguido el apartado "Primera vez en una
máquina nueva", el flujo diario es idéntico en todos tus equipos.

> El proyecto funciona con PostgreSQL alojado en Neon (acceso por HTTP,
> puerto 443). **No necesitas una base de datos local.** La misma base de datos
> es compartida por tus máquinas, así que en un segundo equipo solo clonas el
> repo y configuras `.env`. No re-seedeas.

## 1. Estado actual del proyecto

- Fases 1–3 implementadas y validadas: login/registro, tenant, casos, Knowledge
  Base (con búsqueda y capa de recuperación `lib/ai/retrieval.ts`).
- Pendiente: fase 4 (pipeline IA) y fase 5 (endurecer + evaluación).
- No se ha desplegado a producción; todo vive en la rama `main`.

## 2. Repositorio

```bash
git clone https://github.com/kossto82-ops/AI-Back-Office-CS.git
cd AI-Back-Office-CS
```

`origin` apunta a `kossto82-ops/AI-Back-Office-CS`. La única rama real es
`main`; las ramas `update`, `update-15-stable`, `update-me` son restos del
origen y no se tocan.

## 3. Requisitos por máquina

- Node.js 20+ (LTS) y pnpm (`corepack enable` o instalación global).
- Git.
- Google Chrome (indispensable solo para el E2E; Playwright lo usa como "system Chrome").
- Opcional: Stripe CLI (solo si quieres trabajar el flujo de facturación).

Comprueba que las herramientas responden antes de seguir:

```bash
node --version
pnpm --version
git --version
```

## 4. Primera vez en una máquina nueva

```bash
pnpm install
```

Configura el entorno (ver sección 5). Luego:

```bash
pnpm db:migrate
```

`db:migrate` aplica migraciones pendientes — es seguro en cualquier momento
(no toca los datos existentes). **No ejecutes `db:seed`** salvo que la base de
datos esté vacía (el seed no es idempotente y la BD compartida ya tiene datos;
los 20 casos y los 33 documentos ya están en Neon).

Arranca el dev server:

```bash
pnpm dev
```

Abre http://localhost:3000. Usuario semilla: `test@test.com` / `admin123`.

## 5. Variables de entorno

Como `.env` está en `.gitignore`, **se crea en cada máquina**. El template está
en `.env.example` (o lo copias de otra máquina donde ya lo tengas).

```bash
# Crear el archivo desde el ejemplo (rellena los valores)
cp .env.example .env
```

| Variable | ¿Compartida entre máquinas? | Nota |
|---|---|---|
| `POSTGRES_URL` | Sí — misma URL de Neon | La misma cadena en todos tus equipos |
| `AUTH_SECRET` | Sí, recomendado | Puedes usar el mismo valor en todas; si cambia, se invalidan las sesiones |
| `BASE_URL` | No | `http://localhost:3000` en desarrollo |
| `STRIPE_SECRET_KEY` | Sí | Solo relevante para facturación; puede quedar vacío |
| `STRIPE_WEBHOOK_SECRET` | Sí | Solo relevante para facturación; puede quedar vacío |

Si no usas Stripe, deja las dos variables Stripe vacías: el resto de la app
funciona sin ellas.

## 6. Comandos diarios

| Acción | Comando |
|---|---|
| Dev server | `pnpm dev` (puerto 3000) |
| Typecheck | `pnpm typecheck` |
| Build de producción | `pnpm build` |
| Servir build | `pnpm start` |
| Migraciones | `pnpm db:migrate` |
| Seed (solo BD vacía) | `pnpm db:seed` |
| E2E | `pnpm exec playwright test` (requiere dev server corriendo) |
| Studio de Drizzle | `pnpm db:studio` |

**Gates que deben pasar antes de considerar un cambio listo:** `pnpm typecheck`
+ `pnpm build` + el E2E correspondiente. No hay script de lint configurado.

## 7. Base de datos

- Schema y seeds: viven en `lib/db/`.
- Migraciones: `drizzle-kit` + `scripts/migrate.ts`.
- El aislamiento por tenant se aplica en la capa de consultas (`teamId`): los
  datos de una organización nunca son visibles por otra. Cualquier query o
  server action nueva debe respetarlo.
- Cada ejecución del E2E crea documentos de demostración en la BD de dev
  ("E2E Guide: ...", "Isolation Team Document"). Es aceptable, pero si quieres
  una BD limpia, necesitas una base vacía (recrear el proyecto Neon o resetear).

## 8. Git — flujo y ramas

- Estrategia: **trunk-based** sobre `main`. No hay `develop` ni ramas de
  release.
- Ramas de trabajo: `git switch -c <cambio>` desde `main`, y PR → `main`.
- Mensajes de commit: descripción corta de qué + por qué.
- **Identidad por máquina:** configúrala una vez en cada equipo:

```bash
git config user.name "kossto82-ops"
git config user.email "kossto82-ops@users.noreply.github.com"
```

- Para `push`/`fetch` necesitas autenticación contra GitHub en cada máquina
  (credential manager de Git o un token personal).
- Nunca subas `.env`, `.env.local`, `dev.log`, `dev-err.log` ni
  `e2e/screenshots/`.

## 9. CI/CD

No hay CI/CD configurado (ni Jenkins ni pipelines de GitHub). El flujo es
local: validar (`typecheck` + `build` + E2E) y `git push origin main`.

## 10. Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| `pnpm` no es un comando reconocido en PowerShell | Limitación de la policy de PowerShell | Usa `pnpm.cmd` |
| `pnpm db:setup` se queja de Stripe CLI | El script de setup espera Stripe autenticado | Ignóralo: crea `.env` desde `.env.example` a mano |
| Error de conexión al puerto 5432 | El puerto 5432 está bloqueado en tu red | No uses Postgres local; la app ya conecta por HTTP (443) |
| Las sesiones no aguantan al cambiar de máquina | `AUTH_SECRET` distinto entre equipos | Usa el mismo `AUTH_SECRET` en todas las máquinas |
| `pnpm db:seed` falla / duplica datos | El seed no es idempotente | Solo ejecútalo contra una BD vacía |
| E2E no arranca el navegador | Falta Chrome instalado | Instala Google Chrome (el runner usa el Chrome del sistema) |
| "Page Not Found" en rutas inexistentes | Comportamiento por defecto de Next.js | No es un bug |
| Avisos "LF will be replaced by CRLF" | Normal en Windows | Inofensivo, ignóralo |
| Puerta 3000 ocupada | Otro proceso en el puerto | Libera el puerto o cambia el puerto en el comando `dev` |

## 11. Verificación

Comandos confirmados contra el entorno real de desarrollo (sept 2026):
`pnpm install` OK · `pnpm dev` arranca en :3000 · `pnpm typecheck` limpio ·
`pnpm build` OK · E2E Phase 2 (10/10) y Phase 3 (12/12) en Chrome real con las
mismas instrucciones de esta sección "Primera vez".
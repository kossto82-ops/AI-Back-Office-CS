import 'server-only';
import { and, eq, gte, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { authAttempts } from '@/lib/db/schema';
import type { AttemptKind, AttemptStore } from './rate-limit';

/** Postgres-backed store: works across serverless instances, unlike an in-memory map. */
export const dbAttemptStore: AttemptStore = {
  async count(kind: AttemptKind, identifier: string, since: Date) {
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(authAttempts)
      .where(
        and(
          eq(authAttempts.kind, kind),
          eq(authAttempts.identifier, identifier),
          gte(authAttempts.createdAt, since)
        )
      );
    return Number(row?.c ?? 0);
  },

  async add(kind: AttemptKind, identifier: string) {
    await db.insert(authAttempts).values({ kind, identifier });
    // Housekeeping: nothing older than a day can matter to any window.
    await db
      .delete(authAttempts)
      .where(lt(authAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  },

  async clear(kind: AttemptKind, identifier: string) {
    await db
      .delete(authAttempts)
      .where(and(eq(authAttempts.kind, kind), eq(authAttempts.identifier, identifier)));
  }
};

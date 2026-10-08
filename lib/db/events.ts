import 'server-only';
import { db } from './drizzle';
import { caseEvents, type CaseEventType } from './schema';

/**
 * Records a content-free usage event. Telemetry must never break the agent's
 * workflow, so failures are logged and swallowed. Never pass customer or draft
 * text in `meta`: only outcome codes, counts and durations.
 */
export async function recordCaseEvent(event: {
  teamId: number;
  caseId: number;
  userId: number | null;
  type: CaseEventType;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(caseEvents).values({
      teamId: event.teamId,
      caseId: event.caseId,
      userId: event.userId,
      type: event.type,
      meta: event.meta ?? {}
    });
  } catch (error) {
    console.warn(
      `[events] could not record ${event.type} for case ${event.caseId}:`,
      error instanceof Error ? error.message : error
    );
  }
}

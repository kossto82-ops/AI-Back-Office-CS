'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cases } from '@/lib/db/schema';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getTeamForUser } from '@/lib/db/queries';

const markCaseResolvedSchema = z.object({
  caseId: z.coerce.number().int().positive()
});

export const markCaseResolved = validatedActionWithUser(
  markCaseResolvedSchema,
  async (data) => {
    const team = await getTeamForUser();
    if (!team) {
      return { error: 'User is not part of a team' };
    }

    const [updated] = await db
      .update(cases)
      .set({ status: 'resolved', updatedAt: new Date() })
      .where(and(eq(cases.id, data.caseId), eq(cases.teamId, team.id)))
      .returning({ id: cases.id });

    if (!updated) {
      return { error: 'Case not found' };
    }

    revalidatePath('/dashboard/cases');
    revalidatePath(`/dashboard/cases/${data.caseId}`);
    return { success: 'Case marked as resolved' };
  }
);
'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { documents } from '@/lib/db/schema';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getTeamForUser } from '@/lib/db/queries';
import {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES
} from '@/lib/db/case-categories';

const documentFields = {
  title: z.string().trim().min(1, 'Title is required').max(255),
  type: z.enum(DOCUMENT_TYPES),
  content: z.string().trim().min(1, 'Content is required'),
  status: z.enum(DOCUMENT_STATUSES)
};

const createSchema = z.object(documentFields);

const updateSchema = z.object({
  id: z.coerce.number().int().positive(),
  ...documentFields
});

export const createDocument = validatedActionWithUser(
  createSchema,
  async (data, _formData, user) => {
    const team = await getTeamForUser();
    if (!team) return { error: 'User is not part of a team' };

    const [created] = await db
      .insert(documents)
      .values({
        teamId: team.id,
        creatorId: user.id,
        title: data.title,
        type: data.type,
        content: data.content,
        status: data.status,
        version: 1
      })
      .returning({ id: documents.id });

    revalidatePath('/dashboard/knowledge');
    redirect(`/dashboard/knowledge/${created.id}`);
  }
);

export const updateDocument = validatedActionWithUser(
  updateSchema,
  async (data) => {
    const team = await getTeamForUser();
    if (!team) return { error: 'User is not part of a team' };

    const [existing] = await db
      .select({
        title: documents.title,
        type: documents.type,
        content: documents.content,
        version: documents.version
      })
      .from(documents)
      .where(and(eq(documents.id, data.id), eq(documents.teamId, team.id)))
      .limit(1);

    if (!existing) return { error: 'Document not found' };

    const contentChanged =
      existing.title !== data.title ||
      existing.type !== data.type ||
      existing.content !== data.content;

    const [updated] = await db
      .update(documents)
      .set({
        title: data.title,
        type: data.type,
        content: data.content,
        status: data.status,
        version: contentChanged ? existing.version + 1 : existing.version,
        updatedAt: new Date()
      })
      .where(and(eq(documents.id, data.id), eq(documents.teamId, team.id)))
      .returning({ id: documents.id });

    if (!updated) return { error: 'Document not found' };

    revalidatePath('/dashboard/knowledge');
    redirect(`/dashboard/knowledge/${data.id}`);
  }
);
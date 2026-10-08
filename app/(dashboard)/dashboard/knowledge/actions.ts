'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { documents, documentVersions } from '@/lib/db/schema';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getTeamForUser } from '@/lib/db/queries';
import { checkDocumentChange, roleInTeam } from '@/lib/knowledge/permissions';
import {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES
} from '@/lib/db/case-categories';
import {
  IMPORT_MAX_CONTENT_CHARS,
  IMPORT_MAX_DOCUMENTS,
  IMPORT_MAX_TITLE_CHARS
} from '@/lib/knowledge/import-parse';

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

    const createCheck = checkDocumentChange({
      role: roleInTeam(team, user.id),
      newStatus: data.status
    });
    if (!createCheck.allowed) return { error: createCheck.reason };

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

    await db.insert(documentVersions).values({
      documentId: created.id,
      teamId: team.id,
      version: 1,
      title: data.title,
      type: data.type,
      content: data.content,
      authorId: user.id
    });

    revalidatePath('/dashboard/knowledge');
    redirect(`/dashboard/knowledge/${created.id}`);
  }
);

export const updateDocument = validatedActionWithUser(
  updateSchema,
  async (data, _formData, user) => {
    const team = await getTeamForUser();
    if (!team) return { error: 'User is not part of a team' };

    const [existing] = await db
      .select({
        title: documents.title,
        type: documents.type,
        content: documents.content,
        status: documents.status,
        version: documents.version
      })
      .from(documents)
      .where(and(eq(documents.id, data.id), eq(documents.teamId, team.id)))
      .limit(1);

    if (!existing) return { error: 'Document not found' };

    const updateCheck = checkDocumentChange({
      role: roleInTeam(team, user.id),
      existingStatus: existing.status,
      newStatus: data.status
    });
    if (!updateCheck.allowed) return { error: updateCheck.reason };

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

    if (contentChanged) {
      // Documents that predate version history: record their pre-edit state
      // first, so the history is complete from the first edit onward.
      const [known] = await db
        .select({ id: documentVersions.id })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, data.id))
        .limit(1);
      if (!known) {
        await db.insert(documentVersions).values({
          documentId: data.id,
          teamId: team.id,
          version: existing.version,
          title: existing.title,
          type: existing.type,
          content: existing.content,
          authorId: null
        });
      }
      await db.insert(documentVersions).values({
        documentId: data.id,
        teamId: team.id,
        version: existing.version + 1,
        title: data.title,
        type: data.type,
        content: data.content,
        authorId: user.id
      });
    }

    revalidatePath('/dashboard/knowledge');
    redirect(`/dashboard/knowledge/${data.id}`);
  }
);

const importSchema = z.object({
  status: z.enum(['draft', 'active']),
  payload: z
    .string()
    .min(2, 'Nothing to import')
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Import data is not valid' });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(
          z.object({
            title: z.string().trim().min(1).max(IMPORT_MAX_TITLE_CHARS),
            type: z.enum(DOCUMENT_TYPES),
            content: z.string().trim().min(1).max(IMPORT_MAX_CONTENT_CHARS)
          })
        )
        .min(1, 'Nothing to import')
        .max(IMPORT_MAX_DOCUMENTS, `At most ${IMPORT_MAX_DOCUMENTS} documents per import`)
    )
});

/**
 * Bulk import. Titles that already exist in the team (any status) or repeat
 * inside the batch are skipped and reported, never overwritten. Imported
 * documents default to `draft` so nothing reaches the AI before a human
 * has reviewed it.
 */
export const importDocuments = validatedActionWithUser(
  importSchema,
  async (data, _formData, user) => {
    const team = await getTeamForUser();
    if (!team) return { error: 'User is not part of a team' };

    const importCheck = checkDocumentChange({
      role: roleInTeam(team, user.id),
      newStatus: data.status
    });
    if (!importCheck.allowed) return { error: importCheck.reason };

    const existing = await db
      .select({ title: documents.title })
      .from(documents)
      .where(eq(documents.teamId, team.id));
    const taken = new Set(existing.map((row) => row.title.trim().toLowerCase()));

    const toInsert: typeof data.payload = [];
    const skipped: string[] = [];
    for (const doc of data.payload) {
      const key = doc.title.trim().toLowerCase();
      if (taken.has(key)) {
        skipped.push(doc.title);
        continue;
      }
      taken.add(key);
      toInsert.push(doc);
    }

    if (toInsert.length > 0) {
      const created = await db
        .insert(documents)
        .values(
          toInsert.map((doc) => ({
            teamId: team.id,
            creatorId: user.id,
            title: doc.title,
            type: doc.type,
            content: doc.content,
            status: data.status,
            version: 1
          }))
        )
        .returning({ id: documents.id, title: documents.title });

      const byTitle = new Map(toInsert.map((doc) => [doc.title, doc]));
      await db.insert(documentVersions).values(
        created.map((row) => {
          const doc = byTitle.get(row.title)!;
          return {
            documentId: row.id,
            teamId: team.id,
            version: 1,
            title: doc.title,
            type: doc.type,
            content: doc.content,
            authorId: user.id
          };
        })
      );
    }

    revalidatePath('/dashboard/knowledge');
    return {
      success: `Imported ${toInsert.length} document${toInsert.length === 1 ? '' : 's'} as ${data.status}.`,
      imported: toInsert.length,
      skipped
    };
  }
);

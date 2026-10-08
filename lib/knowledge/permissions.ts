/**
 * Who may change what the AI is allowed to use.
 *
 * Active and archived documents are what the analysis pipeline retrieves or
 * keeps as history, so changing them (or making a document active) is
 * "publishing". Team owners can publish. Members can still contribute: they
 * may create, edit and import DRAFTS, which the AI never sees until an owner
 * activates them. Pure so the same rule runs on the server and in the UI.
 */

export type TeamRole = string | null | undefined;

export function canPublish(role: TeamRole): boolean {
  return role === 'owner';
}

export type DocumentChange = {
  role: TeamRole;
  /** Status before the change; undefined when the document is being created. */
  existingStatus?: string;
  /** Status after the change. */
  newStatus: string;
};

export function checkDocumentChange(change: DocumentChange): {
  allowed: boolean;
  reason?: string;
} {
  if (canPublish(change.role)) return { allowed: true };

  if (change.existingStatus !== undefined && change.existingStatus !== 'draft') {
    return {
      allowed: false,
      reason: 'Only team owners can edit published or archived documents.'
    };
  }
  if (change.newStatus !== 'draft') {
    return {
      allowed: false,
      reason: 'Only team owners can activate or archive documents. Save it as a draft instead.'
    };
  }
  return { allowed: true };
}

/** The role of a user inside the team loaded by getTeamForUser(). */
export function roleInTeam(
  team: { teamMembers: Array<{ userId: number; role: string }> },
  userId: number
): string | null {
  return team.teamMembers.find((member) => member.userId === userId)?.role ?? null;
}

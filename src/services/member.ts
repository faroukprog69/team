"use server";

import { eq, and, isNull } from "drizzle-orm";
import { ServiceResult } from "@/src/types";
import crypto from "crypto";
import { Permissions } from "@/src/permissions";
import { getMembershipWithTeam } from "@/src/helpers";
import { TeamRole } from "../types";

/* =====================================================
   ADD MEMBER
===================================================== */
export async function addMember<T>(
  teamId: string,
  userId: string,
  role: TeamRole,
  currentUserId: string,
  db: any,
  auditLog: any,
  user: any,
  teamMember: any,
  teamInvite: any,
): Promise<ServiceResult<T>> {
  if (!teamId || !userId || !currentUserId) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input" },
    };
  }

  return db.transaction(async (tx: any) => {
    const membership = await getMembershipWithTeam(
      tx,
      teamId,
      currentUserId,
      teamMember,
    );
    if (!membership) {
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Not a team member" },
      };
    }

    if (!Permissions.canManageMembers(membership.role)) {
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "You cannot manage members" },
      };
    }

    if (
      !Permissions.canAssignRole({
        actorRole: membership.role,
        actorUserId: currentUserId,
        teamOwnerId: membership.team.ownerId,
        newRole: role,
      })
    ) {
      return {
        ok: false,
        error: {
          code: "INVALID_ACTION",
          message: "You cannot assign this role",
        },
      };
    }

    const existing = await tx.query.teamMember.findFirst({
      where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)),
    });

    if (existing) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "User already a member" },
      };
    }

    const targetUser = await tx.query.user.findFirst({
      where: eq(user.id, userId),
    });
    if (!targetUser) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "User not found" },
      };
    }

    const pendingInvite = await tx.query.teamInvite.findFirst({
      where: and(
        eq(teamInvite.teamId, teamId),
        eq(teamInvite.email, targetUser.email),
        isNull(teamInvite.acceptedAt),
        isNull(teamInvite.revokedAt),
      ),
    });

    if (pendingInvite) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "User already invited" },
      };
    }

    const [newMember] = await tx
      .insert(teamMember)
      .values({
        id: crypto.randomUUID(),
        teamId,
        userId,
        role,
      })
      .returning();

    if (!newMember) {
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to add member" },
      };
    }

    await auditLog({
      actorId: currentUserId,
      actorType: "user",
      entityType: "member",
      entityId: newMember.id,
      action: "ADD",
      targetId: userId,
      metadata: { role },
    });

    return { ok: true, data: newMember };
  });
}

/* =====================================================
   CHANGE ROLE
===================================================== */
export async function changeRole<T>(
  teamId: string,
  userId: string,
  role: TeamRole,
  currentUserId: string,
  db: any,
  auditLog: any,
  teamMember: any,
): Promise<ServiceResult<T>> {
  if (!teamId || !userId || !currentUserId) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input" },
    };
  }

  if (userId === currentUserId) {
    return {
      ok: false,
      error: {
        code: "INVALID_ACTION",
        message: "You cannot change your own role",
      },
    };
  }

  return db.transaction(async (tx: any) => {
    const membership = await getMembershipWithTeam(
      tx,
      teamId,
      currentUserId,
      teamMember,
    );
    if (!membership) {
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Not a team member" },
      };
    }

    if (!Permissions.canManageMembers(membership.role)) {
      return {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "No permission to change roles",
        },
      };
    }

    const target = await tx.query.teamMember.findFirst({
      where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)),
    });

    if (!target) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Target member not found" },
      };
    }

    if (
      !Permissions.canChangeRole({
        actorRole: membership.role,
        actorUserId: currentUserId,
        teamOwnerId: membership.team.ownerId,
        targetRole: target.role,
        newRole: role,
      })
    ) {
      return {
        ok: false,
        error: {
          code: "INVALID_ACTION",
          message: "You cannot change to this role",
        },
      };
    }

    const [updated] = await tx
      .update(teamMember)
      .set({ role })
      .where(eq(teamMember.id, target.id))
      .returning();

    if (!updated) {
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to change role" },
      };
    }

    await auditLog({
      actorId: currentUserId,
      actorType: "user",
      entityType: "member",
      entityId: target.id,
      action: "UPDATE_ROLE",
      targetId: userId,
      metadata: { newRole: role, oldRole: target.role },
    });

    return { ok: true, data: updated };
  });
}

/* =====================================================
   REMOVE MEMBER
===================================================== */
export async function removeMember(
  teamId: string,
  userId: string,
  currentUserId: string,
  db: any,
  auditLog: any,
  teamMember: any,
): Promise<ServiceResult<{ message: string }>> {
  if (!teamId || !userId || !currentUserId) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input" },
    };
  }

  if (currentUserId === userId) {
    return {
      ok: false,
      error: {
        code: "INVALID_ACTION",
        message: "You cannot remove yourself (use leave team instead)",
      },
    };
  }

  return db.transaction(async (tx: any) => {
    const membership = await getMembershipWithTeam(
      tx,
      teamId,
      currentUserId,
      teamMember,
    );
    if (!membership) {
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Not a team member" },
      };
    }

    const target = await tx.query.teamMember.findFirst({
      where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)),
    });

    if (!target) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Member not found" },
      };
    }

    const owners = await tx.query.teamMember.findMany({
      where: and(eq(teamMember.teamId, teamId), eq(teamMember.role, "owner")),
    });

    if (
      !Permissions.canRemoveMember({
        actorRole: membership.role,
        actorUserId: currentUserId,
        teamOwnerId: membership.team.ownerId,
        targetRole: target.role,
        targetUserId: target.userId,
        ownersCount: owners.length,
      })
    ) {
      return {
        ok: false,
        error: {
          code: "INVALID_ACTION",
          message: "You cannot remove this member",
        },
      };
    }

    const deleted = await tx
      .delete(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
      .returning({ id: teamMember.id });

    if (!deleted.length) {
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to remove member" },
      };
    }
    await auditLog({
      actorId: currentUserId,
      actorType: "user",
      entityType: "member",
      entityId: target.id,
      action: "REMOVE",
      targetId: userId,
    });

    return { ok: true, data: { message: "Member removed" } };
  });
}

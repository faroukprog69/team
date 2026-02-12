"use server";

import { ServiceResult } from "../types";
import { Permissions } from "../permissions";
import { getMembershipWithTeam } from "../helpers";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import { TeamRole } from "../types";

/* =====================================================
   CREATE INVITE
===================================================== */
export async function createInvite<T>(
  teamId: string,
  currentUserId: string,
  email: string,
  role: TeamRole,
  db: any,
  auditLog: any,
  user: any,
  teamMember: any,
  teamInvite: any,
): Promise<ServiceResult<T>> {
  if (!teamId || !email || !role) {
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
        error: { code: "UNAUTHORIZED", message: "Not authorized" },
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

    const targetUser = await tx.query.user.findFirst({
      where: eq(user.email, email),
    });
    if (targetUser) {
      const member = await tx.query.teamMember.findFirst({
        where: and(
          eq(teamMember.teamId, teamId),
          eq(teamMember.userId, targetUser.id),
        ),
      });

      if (member) {
        return {
          ok: false,
          error: { code: "CONFLICT", message: "User already a member" },
        };
      }
    }

    const existingInvite = await tx.query.teamInvite.findFirst({
      where: and(eq(teamInvite.teamId, teamId), eq(teamInvite.email, email)),
    });
    if (existingInvite) {
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: "Invite already exists for this email",
        },
      };
    }

    const [invite] = await tx
      .insert(teamInvite)
      .values({
        id: crypto.randomUUID(),
        teamId,
        email,
        role,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours
      })
      .returning();

    if (!invite) {
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create invite" },
      };
    }

    await auditLog({
      actorId: currentUserId,
      actorType: "user",
      entityType: "invite",
      entityId: invite.id,
      action: "INVITE_CREATE",
      metadata: { email, role, teamId },
    });

    return { ok: true, data: invite };
  });
}

/* =====================================================
   ACCEPT INVITE
===================================================== */
export async function acceptInvite<T>(
  token: string,
  userId: string,
  db: any,
  auditLog: any,
  teamInvite: any,
  teamMember: any,
): Promise<ServiceResult<T>> {
  if (!token || !userId) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input" },
    };
  }

  return db.transaction(async (tx: any) => {
    const invite = await tx.query.teamInvite.findFirst({
      where: eq(teamInvite.token, token),
    });

    if (!invite) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Invite not found" },
      };
    }

    if (invite.acceptedAt || invite.revokedAt) {
      return {
        ok: false,
        error: {
          code: "INVALID_ACTION",
          message: "Invite already used or revoked",
        },
      };
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      return {
        ok: false,
        error: { code: "EXPIRED", message: "Invite has expired" },
      };
    }

    const existingMember = await tx.query.teamMember.findFirst({
      where: and(
        eq(teamMember.teamId, invite.teamId),
        eq(teamMember.userId, userId),
      ),
    });

    if (existingMember) {
      return {
        ok: false,
        error: { code: "CONFLICT", message: "User is already a team member" },
      };
    }

    const [newMember] = await tx
      .insert(teamMember)
      .values({
        id: crypto.randomUUID(),
        teamId: invite.teamId,
        userId,
        role: invite.role,
      })
      .returning();

    if (!newMember) {
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to add member" },
      };
    }

    if (!["owner", "admin", "member", "viewer"].includes(invite.role)) {
      return {
        ok: false,
        error: { code: "INVALID_ACTION", message: "Invalid role" },
      };
    }

    // تحديث الدعوة: تم القبول
    const [updatedInvite] = await tx
      .update(teamInvite)
      .set({ acceptedAt: new Date(), acceptedBy: userId })
      .where(eq(teamInvite.id, invite.id))
      .returning();

    if (!updatedInvite)
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update invite" },
      };

    await tx
      .update(teamInvite)
      .set({ revokedAt: new Date() })
      .where(eq(teamInvite.id, invite.id));

    await auditLog({
      actorId: userId,
      actorType: "user",
      entityType: "member",
      entityId: updatedInvite.id,
      action: "INVITE_ACCEPT",
      targetId: userId,
      metadata: { teamId: updatedInvite.teamId },
    });

    return { ok: true, data: updatedInvite };
  });
}

/* =====================================================
   REVOKE INVITE
===================================================== */
export async function revokeInvite<T>(
  teamId: string,
  currentUserId: string,
  inviteId: string,
  db: any,
  auditLog: any,
  teamInvite: any,
  teamMember: any,
): Promise<ServiceResult<T>> {
  if (!teamId || !currentUserId || !inviteId) {
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
        error: {
          code: "UNAUTHORIZED",
          message: "You are not allowed to manage invites",
        },
      };
    }

    const invite = await tx.query.teamInvite.findFirst({
      where: and(eq(teamInvite.id, inviteId), eq(teamInvite.teamId, teamId)),
    });

    if (!invite) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Invite not found" },
      };
    }

    if (invite.acceptedAt || invite.revokedAt) {
      return {
        ok: false,
        error: {
          code: "INVALID_ACTION",
          message: "Invite cannot be revoked",
        },
      };
    }

    const [updatedInvite] = await tx
      .update(teamInvite)
      .set({ revokedAt: new Date() })
      .where(eq(teamInvite.id, inviteId))
      .returning();

    if (!updatedInvite)
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to revoke invite" },
      };

    await auditLog({
      actorId: currentUserId,
      actorType: "user",
      entityType: "invite",
      entityId: updatedInvite.id,
      action: "INVITE_REVOKE",
      metadata: { teamId: updatedInvite.teamId },
    });

    return { ok: true, data: updatedInvite };
  });
}

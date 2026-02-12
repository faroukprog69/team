"use server";

import { ServiceResult } from "@/src/types";
import { generateTeamSlug, getMembershipWithTeam } from "@/src/helpers";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { Permissions } from "../permissions";

/* =====================================================
   CREATE TEAM
===================================================== */
export async function createTeamForUser<T>(
  userId: string,
  name: string,
  db: any,
  auditLog: (params: any) => Promise<any>,
  team: any,
  teamMember: any,
): Promise<ServiceResult<T>> {
  if (!userId || !name?.trim()) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input" },
    };
  }

  try {
    return await db.transaction(async (tx: any) => {
      let teamRow;
      let attempt = 0;

      while (!teamRow && attempt < 5) {
        try {
          const slug = generateTeamSlug(name);
          [teamRow] = await tx
            .insert(team)
            .values({
              id: crypto.randomUUID(),
              name,
              slug,
              ownerId: userId,
            })
            .returning();
        } catch (err: any) {
          if (err.code === "23505") {
            attempt++;
            continue;
          }
          throw err;
        }
      }

      if (!teamRow) {
        return {
          ok: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to create team" },
        };
      }

      // Create team member record
      await tx.insert(teamMember).values({
        id: crypto.randomUUID(),
        userId,
        teamId: teamRow.id,
        role: "owner",
        joinedAt: new Date(),
      });

      await auditLog({
        actorId: userId,
        actorType: "user",
        entityType: "team",
        entityId: teamRow.id,
        action: "CREATE",
        metadata: { name, slug: teamRow.slug },
      });

      // Return the team, not the team member
      return {
        ok: true,
        data: teamRow,
      };
    });
  } catch (error) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to create team" },
    };
  }
}

/* =====================================================
   UPDATE TEAM
===================================================== */
interface BaseTeam {
  name: string;
  id: string;
  slug: string;
  ownerId: string;
  createdAt: any;
  updatedAt: any;
}
export async function updateTeam<T extends BaseTeam>(
  teamId: string,
  currentUserId: string,
  updates: Partial<
    Omit<T, "id" | "ownerId" | "createdAt" | "updatedAt" | "slug">
  >,
  db: any,
  auditLog: (params: any) => Promise<any>,
  team: any,
  teamMember: any,
): Promise<ServiceResult<T>> {
  if (
    !teamId ||
    !currentUserId ||
    !updates ||
    Object.keys(updates).length === 0
  ) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input" },
    };
  }

  try {
    return await db.transaction(async (tx: any) => {
      const currentUser = await getMembershipWithTeam(
        tx,
        teamId,
        currentUserId,
        teamMember,
      );

      if (!currentUser || currentUser.role !== "owner") {
        return {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Not an owner" },
        };
      }
      const slug = updates.name ? generateTeamSlug(updates.name) : undefined;
      const updated = {
        ...updates,
        ...(slug && { slug }),
      };

      const [updatedTeam] = await tx
        .update(team)
        .set(updated)
        .where(eq(team.id, teamId))
        .returning();

      if (!updatedTeam) {
        return {
          ok: false,
          error: { code: "NOT_FOUND", message: "Team not found" },
        };
      }
      await auditLog({
        actorId: currentUserId,
        actorType: "user",
        entityType: "team",
        entityId: teamId,
        action: "UPDATE",
        metadata: updates,
      });

      return { ok: true, data: updatedTeam };
    });
  } catch (err: any) {
    console.error("updateTeam error:", err);
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to update team" },
    };
  }
}

/* =====================================================
   DELETE TEAM
===================================================== */
export async function deleteTeam(
  currentUserId: string,
  teamId: string,
  db: any,
  auditLog: (params: any) => Promise<any>,
  team: any,
  teamMember: any,
): Promise<ServiceResult<{ message: string }>> {
  if (!teamId || !currentUserId) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input" },
    };
  }

  try {
    return db.transaction(async (tx: any) => {
      const membership = await getMembershipWithTeam(
        tx,
        teamId,
        currentUserId,
        teamMember,
      );

      if (
        !membership ||
        !Permissions.canDeleteTeam(currentUserId, membership.team.ownerId)
      ) {
        return {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Only Primary Owner can delete team",
          },
        };
      }

      await tx.delete(teamMember).where(eq(teamMember.teamId, teamId));
      await tx.delete(team).where(eq(team.id, teamId));

      await auditLog({
        actorId: currentUserId,
        actorType: "user",
        entityType: "team",
        entityId: teamId,
        action: "DELETE",
      });

      return { ok: true, data: { message: "Team deleted successfully" } };
    });
  } catch (err: any) {
    console.error("deleteTeam error:", err);
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to delete team" },
    };
  }
}

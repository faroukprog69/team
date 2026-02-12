import { TeamRole } from "./types";

const ROLE_POWER: Record<TeamRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  viewer: 0,
};

const isPrimaryOwner = (userId: string, teamOwnerId: string) =>
  userId === teamOwnerId;

const isHigherRole = (actor: TeamRole, target: TeamRole) =>
  ROLE_POWER[actor] > ROLE_POWER[target];

const canManageMembers = (role: TeamRole) =>
  role === "owner" || role === "admin";

export const Permissions = {
  isPrimaryOwner,

  canManageMembers,

  canAssignRole({
    actorRole,
    actorUserId,
    teamOwnerId,
    newRole,
  }: {
    actorRole: TeamRole;
    actorUserId: string;
    teamOwnerId: string;
    newRole: TeamRole;
  }) {
    if (isPrimaryOwner(actorUserId, teamOwnerId)) return true;

    return isHigherRole(actorRole, newRole);
  },

  canChangeRole({
    actorRole,
    actorUserId,
    teamOwnerId,
    targetRole,
    newRole,
  }: {
    actorRole: TeamRole;
    actorUserId: string;
    teamOwnerId: string;
    targetRole: TeamRole;
    newRole: TeamRole;
  }) {
    if (isPrimaryOwner(actorUserId, teamOwnerId)) return true;

    return (
      isHigherRole(actorRole, targetRole) && isHigherRole(actorRole, newRole)
    );
  },

  canRemoveMember({
    actorRole,
    actorUserId,
    teamOwnerId,
    targetRole,
    targetUserId,
    ownersCount,
  }: {
    actorRole: TeamRole;
    actorUserId: string;
    teamOwnerId: string;
    targetRole: TeamRole;
    targetUserId: string;
    ownersCount: number;
  }) {
    // لا يمكن حذف Primary Owner
    if (isPrimaryOwner(targetUserId, teamOwnerId)) return false;

    // لا يمكن حذف آخر Owner
    if (targetRole === "owner" && ownersCount <= 1) return false;

    // Primary Owner يقدر على الجميع
    if (isPrimaryOwner(actorUserId, teamOwnerId)) return true;

    return isHigherRole(actorRole, targetRole);
  },

  canDeleteTeam(userId: string, teamOwnerId: string) {
    return isPrimaryOwner(userId, teamOwnerId);
  },
};

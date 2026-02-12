import { createTeamForUser, deleteTeam, updateTeam } from "./services/team";
import { addMember, changeRole, removeMember } from "./services/member";
import {
  team,
  teamMember,
  teamInvite,
  teamRelations,
  teamMemberRelations,
  teamInviteRelations,
  teamPlanEnum,
  teamStatusEnum,
  teamRoleEnum,
} from "./schema";
import {
  createTeamMemberSchema,
  createTeamSchema,
  createTeamInviteSchema,
  GetTeamMemberSelect,
  GetTeamSelect,
  GetTeamInviteSelect,
  TeamRole,
} from "./types";
import { acceptInvite, createInvite, revokeInvite } from "./services/invite";

export * from "./permissions";

type TeamsDeps = {
  db: any;
  audit: {
    log: (params: any) => Promise<any>;
  };
};

export function createTeams(userSchema: any, deps: TeamsDeps) {
  const teamSchema = createTeamSchema(userSchema);
  type Team = GetTeamSelect<typeof teamSchema>;
  const teamMemberSchema = createTeamMemberSchema(userSchema);
  type TeamMember = GetTeamMemberSelect<typeof teamMemberSchema>;

  const teamInviteSchema = createTeamInviteSchema(userSchema);
  type TeamInvite = GetTeamInviteSelect<typeof teamInviteSchema>;

  return {
    createTeamForUser: (userId: string, name: string) =>
      createTeamForUser<Team>(
        userId,
        name,
        deps.db,
        deps.audit.log,
        teamSchema,
        teamMemberSchema,
      ),
    updateTeam: (
      teamId: string,
      currentUserId: string,
      updates: Partial<
        Omit<Team, "id" | "ownerId" | "createdAt" | "updatedAt" | "slug">
      >,
    ) =>
      updateTeam<Team>(
        teamId,
        currentUserId,
        updates,
        deps.db,
        deps.audit.log,
        teamSchema,
        teamMemberSchema,
      ),

    deleteTeam: (currentUserId: string, teamId: string) =>
      deleteTeam(
        currentUserId,
        teamId,
        deps.db,
        deps.audit.log,
        teamSchema,
        teamMemberSchema,
      ),
    addMember: (
      teamId: string,
      userId: string,
      currentUserId: string,
      role: TeamRole,
    ) =>
      addMember<TeamMember>(
        teamId,
        userId,
        role,
        currentUserId,
        deps.db,
        deps.audit.log,
        userSchema,
        teamMemberSchema,
        teamInviteSchema,
      ),

    changeRole: (
      teamId: string,
      userId: string,
      currentUserId: string,
      role: TeamRole,
    ) =>
      changeRole<TeamMember>(
        teamId,
        userId,
        role,
        currentUserId,
        deps.db,
        deps.audit.log,
        teamMemberSchema,
      ),

    removeMember: (teamId: string, userId: string, currentUserId: string) =>
      removeMember(
        teamId,
        userId,
        currentUserId,
        deps.db,
        deps.audit.log,
        teamMemberSchema,
      ),

    createInvite: (
      teamId: string,
      currentUserId: string,
      email: string,
      role: TeamRole,
    ) =>
      createInvite<TeamInvite>(
        teamId,
        currentUserId,
        email,
        role,
        deps.db,
        deps.audit.log,
        userSchema,
        teamMemberSchema,
        teamInviteSchema,
      ),

    acceptInvite: (token: string, userId: string) =>
      acceptInvite<TeamInvite>(
        token,
        userId,
        deps.db,
        deps.audit.log,
        teamInviteSchema,
        teamMemberSchema,
      ),

    revokeInvite: (teamId: string, currentUserId: string, inviteId: string) =>
      revokeInvite<TeamInvite>(
        teamId,
        currentUserId,
        inviteId,
        deps.db,
        deps.audit.log,
        teamInviteSchema,
        teamMemberSchema,
      ),
  };
}

export function getSchema(userSchema: any) {
  return {
    team: team(userSchema),
    teamMember: teamMember(userSchema),
    teamInvite: teamInvite(userSchema),
    teamRelations: teamRelations(userSchema),
    teamMemberRelations: teamMemberRelations(userSchema),
    teamInviteRelations: teamInviteRelations(userSchema),
    teamPlanEnum,
    teamStatusEnum,
    teamRoleEnum,
  };
}

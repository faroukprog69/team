import { InferInsertModel, InferSelectModel } from "drizzle-orm";

import {
  team,
  teamMember,
  teamInvite,
  teamPlanEnum,
  teamStatusEnum,
  teamRoleEnum,
} from "./schema";

/* =====================================================
   TEAM
===================================================== */
export function createTeamSchema<TUserSchema>(userSchema: TUserSchema) {
  return team(userSchema);
}

// 2. Define Helper Types that users can use with the function result
export type GetTeamSelect<T extends ReturnType<typeof createTeamSchema>> =
  InferSelectModel<T>;
export type GetTeamInsert<T extends ReturnType<typeof createTeamSchema>> =
  InferInsertModel<T>;

/* =====================================================
   TEAM MEMBER
===================================================== */

export function createTeamMemberSchema<TUserSchema>(userSchema: TUserSchema) {
  return teamMember(userSchema);
}

// Helper types for team member
export type GetTeamMemberSelect<
  T extends ReturnType<typeof createTeamMemberSchema>,
> = InferSelectModel<T>;
export type GetTeamMemberInsert<
  T extends ReturnType<typeof createTeamMemberSchema>,
> = InferInsertModel<T>;

/* =====================================================
   TEAM INVITE
===================================================== */

export function createTeamInviteSchema<TUserSchema>(userSchema: TUserSchema) {
  return teamInvite(userSchema);
}

// Helper types for team invite
export type GetTeamInviteSelect<
  T extends ReturnType<typeof createTeamInviteSchema>,
> = InferSelectModel<T>;
export type GetTeamInviteInsert<
  T extends ReturnType<typeof createTeamInviteSchema>,
> = InferInsertModel<T>;

/* =====================================================
   ENUM TYPES (DB enums → TS unions)
===================================================== */

export type TeamPlan = (typeof teamPlanEnum.enumValues)[number];

export type TeamStatus = (typeof teamStatusEnum.enumValues)[number];

export type TeamRole = (typeof teamRoleEnum.enumValues)[number];

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export type ServiceError = {
  code:
    | "VALIDATION_ERROR"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INVALID_ACTION"
    | "EXPIRED"
    | "INTERNAL_ERROR";
  message: string;
};

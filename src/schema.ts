import { relations } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* =====================================================
   ENUMS
===================================================== */

export const teamPlanEnum = pgEnum("team_plan", ["free", "pro", "enterprise"]);

export const teamStatusEnum = pgEnum("team_status", [
  "active",
  "suspended",
  "deleted",
]);

export const teamRoleEnum = pgEnum("team_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

/* =====================================================
   TEAM
===================================================== */

export function team(userTableSchema: any) {
    return pgTable(
    "team",
    {
        id: text("id").primaryKey(),

        name: text("name").notNull(),

        slug: text("slug").notNull(),

        ownerId: text("owner_id")
        .notNull()
        .references(() => userTableSchema.id, { onDelete: "restrict" }),

        plan: teamPlanEnum("plan").notNull().default("free"),

        status: teamStatusEnum("status").notNull().default("active"),

        createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
    },
    (table) => ({
        slugUnique: uniqueIndex("team_slug_unique").on(table.slug),
        ownerIdx: index("team_owner_idx").on(table.ownerId),
        statusIdx: index("team_status_idx").on(table.status),
    }),
    );
}
/* =====================================================
   TEAM MEMBER
===================================================== */
export function teamMember(userTableSchema: any) {
    return pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),

    teamId: text("team_id")
      .notNull()
      .references(() => team(userTableSchema).id, { onDelete: "cascade" }),

    userId: text("user_id")
      .notNull()
      .references(() => userTableSchema.id, { onDelete: "cascade" }),

    role: teamRoleEnum("role").notNull().default("member"),

    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    teamUserUnique: uniqueIndex("team_member_unique").on(
      table.teamId,
      table.userId,
    ),
    teamIdx: index("team_member_team_idx").on(table.teamId),
    userIdx: index("team_member_user_idx").on(table.userId),
  }),
);
}
/* =====================================================
   TEAM INVITE
===================================================== */

export function teamInvite(userTableSchema: any) {
    return pgTable(
  "team_invite",
  {
    id: text("id").primaryKey(),

    teamId: text("team_id")
      .notNull()
      .references(() => team(userTableSchema).id, { onDelete: "cascade" }),

    email: text("email").notNull(),

    role: teamRoleEnum("role").notNull().default("member"),

    token: text("token").notNull(),

    acceptedAt: timestamp("accepted_at", { withTimezone: true }),

    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    acceptedBy: text("accepted_by").references(() => userTableSchema.id),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("team_invite_token_unique").on(table.token),
    teamEmailUnique: uniqueIndex("team_invite_team_email_unique").on(
      table.teamId,
      table.email,
    ),
    expiresIdx: index("team_invite_expires_idx").on(table.expiresAt),
    acceptedByIdx: index("team_invite_accepted_by_idx").on(table.acceptedBy),
  }),
);
}
/* =====================================================
   RELATIONS
===================================================== */

export function teamRelations(userTableSchema: any) {
  return relations(team(userTableSchema), ({ many, one }) => ({
    members: many(teamMember(userTableSchema)),
    invites: many(teamInvite(userTableSchema)),
    owner: one(userTableSchema, {
    fields: [team(userTableSchema).ownerId],
    references: [userTableSchema.id],
  }),
}));
}
export function teamMemberRelations(userTableSchema: any) {
  return relations(teamMember(userTableSchema), ({ one }) => ({
    team: one(team(userTableSchema), {
      fields: [teamMember(userTableSchema).teamId],
      references: [team(userTableSchema).id],
    }),
    user: one(userTableSchema, {
    fields: [teamMember(userTableSchema).userId],
    references: [userTableSchema.id],
  }),
}));
}
export function teamInviteRelations(userTableSchema: any) {
  return relations(teamInvite(userTableSchema), ({ one }) => ({
    team: one(team(userTableSchema), {
      fields: [teamInvite(userTableSchema).teamId],
      references: [team(userTableSchema).id],
    }),
    acceptedByUser: one(userTableSchema, {
    fields: [teamInvite(userTableSchema).acceptedBy],
    references: [userTableSchema.id],
  }),
}));
}


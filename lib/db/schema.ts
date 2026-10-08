import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  real,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

export type ConversationTurn = {
  role: 'customer' | 'agent';
  content: string;
};

export const cases = pgTable(
  'cases',
  {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  subject: varchar('subject', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  category: varchar('category', { length: 50 }),
  status: varchar('status', { length: 30 }).notNull().default('queued'),
  customerMessage: text('customer_message').notNull(),
  conversationHistory: jsonb('conversation_history')
    .$type<ConversationTurn[]>()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('cases_team_created_idx').on(t.teamId, t.createdAt)]
);

export type AnalysisSource = {
  documentId: number;
  relevance: number;
  /** Version of the document at analysis time (absent on pre-audit rows). */
  version?: number;
  /** Title of the document at analysis time (absent on pre-audit rows). */
  title?: string;
};

export const caseAnalyses = pgTable(
  'case_analyses',
  {
  id: serial('id').primaryKey(),
  caseId: integer('case_id')
    .notNull()
    .references(() => cases.id),
  category: varchar('category', { length: 50 }),
  summary: text('summary'),
  intent: text('intent'),
  urgency: varchar('urgency', { length: 20 }),
  recommendedAction: text('recommended_action'),
  draftResponse: text('draft_response'),
  missingInformation: jsonb('missing_information')
    .$type<string[]>()
    .notNull()
    .default([]),
  sources: jsonb('sources').$type<AnalysisSource[]>().notNull().default([]),
  confidence: real('confidence'),
  model: varchar('model', { length: 100 }),
  /** 'safe' = passed the runtime gate; 'manual_review' = held, shown with a warning. */
  safetyStatus: varchar('safety_status', { length: 20 }).notNull().default('safe'),
  safetyFragments: jsonb('safety_fragments').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('case_analyses_case_created_idx').on(t.caseId, t.createdAt)]
);

export const caseEventTypes = [
  'case_created',
  'case_opened',
  'analysis_succeeded',
  'analysis_blocked',
  'draft_copied',
  'case_resolved',
] as const;

export type CaseEventType = (typeof caseEventTypes)[number];

/**
 * Lightweight, content-free usage events (no customer text, no draft text).
 * They exist to measure pilot value (handling time, copy-without-edit rate,
 * AI failure/hold rate) per tenant; see docs/PHASES/PRODUCT-ENGINEERING-AGENT-AUDIT.md.
 */
export const caseEvents = pgTable(
  'case_events',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    caseId: integer('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id),
    type: varchar('type', { length: 40 }).notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('case_events_case_created_idx').on(t.caseId, t.createdAt),
    index('case_events_team_type_created_idx').on(t.teamId, t.type, t.createdAt),
  ]
);

export const documents = pgTable(
  'documents',
  {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  title: varchar('title', { length: 255 }).notNull(),
  type: varchar('type', { length: 30 }).notNull().default('guide'),
  content: text('content').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  version: integer('version').notNull().default(1),
  creatorId: integer('creator_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('documents_team_status_idx').on(t.teamId, t.status)]
);

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
  cases: many(cases),
  documents: many(documents),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
  createdDocuments: many(documents),
}));

export const casesRelations = relations(cases, ({ one }) => ({
  team: one(teams, {
    fields: [cases.teamId],
    references: [teams.id],
  }),
}));

export const caseAnalysesRelations = relations(caseAnalyses, ({ one }) => ({
  case: one(cases, {
    fields: [caseAnalyses.caseId],
    references: [cases.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  team: one(teams, {
    fields: [documents.teamId],
    references: [teams.id],
  }),
  creator: one(users, {
    fields: [documents.creatorId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type CaseAnalysis = typeof caseAnalyses.$inferSelect;
export type NewCaseAnalysis = typeof caseAnalyses.$inferInsert;
export type CaseEvent = typeof caseEvents.$inferSelect;
export type NewCaseEvent = typeof caseEvents.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}

// Drizzle schema for EscapeBot web version
// Tables: users, worldStates
// Phase 2 init — to be expanded as engine is ported

import { pgTable, text, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Clerk integration: clerk_user_id maps to Clerk's user.id
  clerkUserId: text('clerk_user_id').notNull().unique(),
  // Discord username for legacy compatibility with phase 1
  discordUsername: text('discord_username'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const worldStates = pgTable('world_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Full WorldState JSON (serialized Zod schema)
  state: jsonb('state').notNull(),
  // Scenario tag (e.g. 'spaceship', 'alchemy_lab')
  scenarioTag: text('scenario_tag'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type WorldStateRow = typeof worldStates.$inferSelect;
export type NewWorldStateRow = typeof worldStates.$inferInsert;

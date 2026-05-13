import { desc, eq } from "drizzle-orm";

import { db, users, worldStates } from "@/lib/db";
import type { User } from "@/lib/db";

import { WorldStateSchema } from "./types";
import type { WorldState } from "./types";

/**
 * Upsert the active WorldState for a user.
 * One row per user: inserts on first save, updates on subsequent saves.
 */
export async function saveWorldState(
  userId: string,
  state: WorldState,
  scenarioTag?: string,
): Promise<void> {
  await db
    .insert(worldStates)
    .values({ userId, state: state as unknown, scenarioTag })
    .onConflictDoUpdate({
      target: worldStates.userId,
      set: { state: state as unknown, scenarioTag, updatedAt: new Date() },
    });
}

/**
 * Load the active WorldState for a user. Returns null if none exists or row is corrupt.
 * Latest by updatedAt wins (consistent with save upsert — always one row).
 */
export async function loadWorldState(userId: string): Promise<WorldState | null> {
  const rows = await db
    .select()
    .from(worldStates)
    .where(eq(worldStates.userId, userId))
    .orderBy(desc(worldStates.updatedAt))
    .limit(1);

  if (rows.length === 0) return null;

  try {
    return WorldStateSchema.parse(rows[0].state);
  } catch {
    return null;
  }
}

/** Delete all WorldState rows for a user (cascade is also handled by FK on delete). */
export async function deleteWorldState(userId: string): Promise<void> {
  await db.delete(worldStates).where(eq(worldStates.userId, userId));
}

/**
 * Return the User row for a Clerk user ID, creating it if it doesn't exist.
 * discordUsername preserved for phase 1 compatibility.
 */
export async function getOrCreateUserByClerkId(
  clerkUserId: string,
  discordUsername?: string,
): Promise<User> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [newUser] = await db
    .insert(users)
    .values({ clerkUserId, discordUsername })
    .returning();

  return newUser;
}

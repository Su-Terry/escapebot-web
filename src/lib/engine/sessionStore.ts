import { desc, eq } from "drizzle-orm";

import { db, users, worldStates } from "@/lib/db";
import type { User } from "@/lib/db";

import { WorldStateSchema } from "./types";
import type { WorldState } from "./types";

// ── Transient DB error detection + retry ──────────────────────────────────────

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code ?? "";
  // System-level socket errors
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ENOTFOUND"].includes(code)) return true;
  // postgres.js connection lifecycle codes
  if (["CONNECTION_CLOSED", "CONNECTION_DESTROYED"].includes(code)) return true;
  // PostgreSQL protocol connection-failure SQLSTATE codes
  if (["08000", "08001", "08003", "08004", "08006", "08007", "57P03"].includes(code)) return true;
  // String-match fallback (covers varied driver/wrapper message formats)
  const lower = err.message.toLowerCase();
  if (lower.includes("econnreset") || lower.includes("socket hang up")) return true;
  if (lower.includes("connection") && /refused|reset|terminated|closed|failed/.test(lower)) return true;
  // Recurse into wrapped cause
  if (err.cause != null) return isTransientDbError(err.cause);
  return false;
}

/** Retry fn up to 3 attempts (delays: 300ms, 800ms) on transient connection errors only. */
async function withDbRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const delays = [300, 800];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientDbError(err) || attempt === delays.length) throw err;
      const ms = delays[attempt];
      console.warn(
        `[db-retry:${label}] transient error (attempt ${attempt + 1}), retrying in ${ms}ms: ${(err as Error).message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
  throw new Error("unreachable");
}

/**
 * Upsert the active WorldState for a user.
 * One row per user: inserts on first save, updates on subsequent saves.
 */
export async function saveWorldState(
  userId: string,
  state: WorldState,
  scenarioTag?: string,
): Promise<void> {
  await withDbRetry("saveWorldState", () =>
    db
      .insert(worldStates)
      .values({ userId, state: state as unknown, scenarioTag })
      .onConflictDoUpdate({
        target: worldStates.userId,
        set: { state: state as unknown, scenarioTag, updatedAt: new Date() },
      }),
  );
}

/**
 * Load the active WorldState for a user. Returns null if none exists or row is corrupt.
 * Latest by updatedAt wins (consistent with save upsert — always one row).
 */
export async function loadWorldState(userId: string): Promise<WorldState | null> {
  const rows = await withDbRetry("loadWorldState", () =>
    db
      .select()
      .from(worldStates)
      .where(eq(worldStates.userId, userId))
      .orderBy(desc(worldStates.updatedAt))
      .limit(1),
  );

  if (rows.length === 0) return null;

  try {
    return WorldStateSchema.parse(rows[0].state);
  } catch {
    return null;
  }
}

/** Delete all WorldState rows for a user (cascade is also handled by FK on delete). */
export async function deleteWorldState(userId: string): Promise<void> {
  await withDbRetry("deleteWorldState", () =>
    db.delete(worldStates).where(eq(worldStates.userId, userId)),
  );
}

/**
 * Return the User row for a Clerk user ID, creating it if it doesn't exist.
 * discordUsername preserved for phase 1 compatibility.
 */
export async function getOrCreateUserByClerkId(
  clerkUserId: string,
  discordUsername?: string,
): Promise<User> {
  return withDbRetry("getOrCreateUser", async () => {
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
  });
}

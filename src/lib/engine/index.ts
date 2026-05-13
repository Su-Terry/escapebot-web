import { validate, apply, applyFallback } from "./ruleEnforcer";
import {
  getOrCreateUserByClerkId,
  loadWorldState,
  saveWorldState,
  deleteWorldState,
} from "./sessionStore";
import { generateScenario } from "./scenarioGenerator";
import { handleTurn } from "./turnHandler";
import type { WorldState } from "./types";

export type { WorldState };

/** Resolve Clerk user ID → internal UUID, creating the users row if needed. */
async function resolveUuid(clerkUserId: string): Promise<string> {
  const user = await getOrCreateUserByClerkId(clerkUserId);
  return user.id;
}

/**
 * Generate a new scenario and persist it as the user's active game.
 * clerkUserId: Clerk's user.id string (text). Internally mapped to users.id UUID for DB ops.
 */
export async function generate(
  clerkUserId: string,
  opts?: { theme?: string },
): Promise<WorldState> {
  const uuid = await resolveUuid(clerkUserId);
  // clerkUserId used as sessionId (game-level identifier, not the DB FK)
  const state = await generateScenario(clerkUserId, opts);
  await saveWorldState(uuid, state);
  return state;
}

/**
 * Run one game turn: call Turn Handler, validate, apply (with up to 2 retries).
 * On persistent rule violation failure, records 'Nothing happens.' via applyFallback.
 * Throws if no active scenario exists for the user.
 */
export async function processTurn(clerkUserId: string, action: string): Promise<WorldState> {
  const uuid = await resolveUuid(clerkUserId);
  const state = await loadWorldState(uuid);
  if (!state) throw new Error("no active scenario");

  let violations: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const correction = attempt > 1 ? violations : undefined;
    const turnResult = await handleTurn(state, action, correction);

    violations = validate(state, turnResult);
    if (violations.length === 0) {
      const updated = apply(state, turnResult);
      await saveWorldState(uuid, updated);
      return updated;
    }

    console.warn(
      `processTurn attempt ${attempt}/3 invalid state changes for action ${JSON.stringify(action)}: ${violations.join(", ")}`,
    );
  }

  console.warn(
    `All processTurn attempts failed for action ${JSON.stringify(action)}; falling back to 'Nothing happens.'`,
  );
  const fallback = applyFallback(state, action);
  await saveWorldState(uuid, fallback);
  return fallback;
}

/** Load the user's active WorldState, or null if none exists. */
export async function loadState(clerkUserId: string): Promise<WorldState | null> {
  const uuid = await resolveUuid(clerkUserId);
  return loadWorldState(uuid);
}

/** Delete the user's active WorldState. */
export async function resetState(clerkUserId: string): Promise<void> {
  const uuid = await resolveUuid(clerkUserId);
  return deleteWorldState(uuid);
}

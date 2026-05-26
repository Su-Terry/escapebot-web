import { apply, applyFallback, enforceStateChange } from "./ruleEnforcer";
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

  const turnResult = await handleTurn(state, action);

  // Partial apply：逐個驗證，留下合法的，skip 非法的（不拖垮整個 turn）
  let probe = state;
  const validChanges: typeof turnResult.stateChanges = [];
  const skipped: string[] = [];

  for (const sc of turnResult.stateChanges) {
    const result = enforceStateChange(probe, sc);
    if (result.valid && result.updatedState) {
      probe = result.updatedState;
      validChanges.push(sc);
    } else {
      skipped.push(`${sc.type}: ${result.reason ?? "rejected"}`);
    }
  }

  if (skipped.length > 0) {
    console.warn(
      `processTurn action ${JSON.stringify(action)} skipped: ${skipped.join("; ")}` +
        ` (applied: ${validChanges.map((c) => c.type).join(", ") || "none"})`,
    );
  }

  // 用過濾後的合法 changes 走既有 apply（沿用 turnCount/history/checkWin 行為）
  const cleanResult = { ...turnResult, stateChanges: validChanges };
  const updated = apply(state, cleanResult);

  await saveWorldState(uuid, updated);
  return updated;
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

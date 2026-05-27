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
import type { StateChange } from "./types";

export type { WorldState };

/**
 * Recovery: LLM sometimes emits solve_puzzle with a hallucinated or wrong puzzleId.
 * When there is exactly one unsolved puzzle at the current location and the emitted id
 * doesn't match it, silently remap before enforcement so the correct puzzle gets solved.
 */
function recoverPuzzleIds(changes: StateChange[], state: WorldState): StateChange[] {
  const currentLocId = state.currentLocationId;
  const localUnsolved = Object.values(state.puzzles).filter(
    (p) => p.locationId === currentLocId && !p.isSolved,
  );

  return changes.map((sc) => {
    if (sc.type !== "solve_puzzle") return sc;
    const pid = sc.puzzleId;
    const puzzle = pid ? state.puzzles[pid] : undefined;
    // Already valid: exists, in current location, not yet solved
    if (puzzle && puzzle.locationId === currentLocId && !puzzle.isSolved) return sc;
    // Remap only when there is exactly one candidate (unambiguous)
    if (localUnsolved.length === 1) {
      console.warn(
        `[solve_puzzle id-recovery] remapped puzzleId '${pid ?? "null"}' → '${localUnsolved[0].id}'` +
          ` loc=${currentLocId}`,
      );
      return { ...sc, puzzleId: localUnsolved[0].id };
    }
    return sc;
  });
}

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

  const rawResult = await handleTurn(state, action);
  // Recover wrong/missing puzzleIds before enforcement
  const turnResult = { ...rawResult, stateChanges: recoverPuzzleIds(rawResult.stateChanges, state) };

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
      if (sc.type === "solve_puzzle") {
        console.warn(
          `[solve_puzzle rejected] puzzleId=${sc.puzzleId} reason=${result.reason}` +
            ` currentLoc=${probe.currentLocationId}` +
            ` puzzleLoc=${sc.puzzleId ? (probe.puzzles[sc.puzzleId]?.locationId ?? "unknown") : "?"}` +
            ` attempted=${JSON.stringify(sc.attemptedSolution)}`,
        );
      } else if (sc.type === "take_item") {
        const item = sc.itemId ? probe.items[sc.itemId] : undefined;
        console.warn(
          `[take_item rejected] itemId=${sc.itemId} reason=${result.reason}` +
            ` currentLoc=${probe.currentLocationId}` +
            ` itemLoc=${item?.locationId ?? "unknown"}`,
        );
      }
    }
  }

  if (skipped.length > 0) {
    console.warn(
      `processTurn action ${JSON.stringify(action)} skipped: ${skipped.join("; ")}` +
        ` (applied: ${validChanges.map((c) => c.type).join(", ") || "none"})`,
    );
  }

  // When solve_puzzle is rejected for wrong solution the LLM has already written a
  // "success" narration.  Storing that in history gives the next turn contradictory
  // context (history: "door opened"; state: isSolved=false) which causes the LLM to
  // keep re-narrating success on every subsequent attempt.
  // Fix: if any solve_puzzle was rejected for wrong solution, retry handleTurn with
  // the violations as corrections so the LLM rewrites a "nothing happened" narration.
  const wrongSolutionSkips = skipped.filter(
    (s) => s.includes("solve_puzzle") && s.includes("wrong solution"),
  );

  let cleanResult: { narration: string; stateChanges: typeof validChanges; isWon: boolean };

  if (wrongSolutionSkips.length > 0) {
    const corrections = [
      ...wrongSolutionSkips.map((s) => s.replace(/^solve_puzzle: /, "")),
      // Explicit narration constraint: failure must be unambiguous.
      // Without this, the LLM writes progress-sounding narration ("齒輪轉動、嗡鳴聲")
      // that players cannot distinguish from success.
      "The player's answer was WRONG and NOTHING changed in the world. " +
        "Narration MUST unambiguously express failure — e.g. " +
        "「機關紋絲不動」「天體模型沒有反應，順序似乎不對」「發出錯誤的聲響，石門沒有移動」. " +
        "NEVER use 「齒輪轉動」「嗡鳴聲」「開始運作」「緩緩升起」or anything that implies progress or success. " +
        "stateChanges must be empty.",
    ];
    const retryRaw = await handleTurn(state, action, corrections);
    const retryTurn = {
      ...retryRaw,
      stateChanges: recoverPuzzleIds(retryRaw.stateChanges, state),
    };

    let retryProbe = state;
    const retryValid: typeof validChanges = [];
    for (const sc of retryTurn.stateChanges) {
      const r = enforceStateChange(retryProbe, sc);
      if (r.valid && r.updatedState) {
        retryProbe = r.updatedState;
        retryValid.push(sc);
      } else {
        console.warn(`[solve_puzzle correction-retry skipped] ${sc.type}: ${r.reason}`);
      }
    }
    console.warn(
      `[solve_puzzle narration-fix] rewrote narration after wrong-solution rejection` +
        ` (retry applied: ${retryValid.map((c) => c.type).join(", ") || "none"})`,
    );
    cleanResult = { ...retryTurn, stateChanges: retryValid };
  } else {
    cleanResult = { ...turnResult, stateChanges: validChanges };
  }

  // Pass action so it's stored in history — LLM needs Player: lines for context
  const updated = apply(state, cleanResult, action);

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

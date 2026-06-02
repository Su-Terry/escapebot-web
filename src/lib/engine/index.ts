import { apply, applyFallback, enforceStateChange, finalizeTurn } from "./ruleEnforcer";
import {
  getOrCreateUserByClerkId,
  loadWorldState,
  loadWorldStateInitial,
  saveWorldState,
  deleteWorldState,
} from "./sessionStore";
import { generateScenario } from "./scenarioGenerator";
import { extractIntent, generateNarration, buildFallbackNarration } from "./turnHandler";
import { judgeAnswer } from "./judge";
import { WorldStateSchema } from "./types";
import type { WorldState, StateChange, Verdict } from "./types";

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
 * The clean initial WorldState is stored alongside the active state so createShare() can
 * copy it into the share record, enabling replay for anyone who opens the share link.
 */
export async function generate(
  clerkUserId: string,
  opts?: { theme?: string },
): Promise<WorldState> {
  const uuid = await resolveUuid(clerkUserId);
  // clerkUserId used as sessionId (game-level identifier, not the DB FK)
  const state = await generateScenario(clerkUserId, opts);
  // Pass state as initialState: written once here, never overwritten by processTurn
  await saveWorldState(uuid, state, undefined, state);
  return state;
}

/**
 * Run one game turn using the four-phase architecture:
 *   Phase 1  extractIntent   — LLM outputs stateChanges only, no narration
 *   Phase 2  judge + enforce — engine rules for all types; LLM judge for solve_puzzle
 *   Phase 3  apply           — state updated before narration is written
 *   Phase 4  generateNarration — LLM narrates the already-determined outcome
 *
 * This ensures narration can never lead state: the LLM in Phase 4 sees the post-apply
 * world and is told explicitly what succeeded and what failed.
 * Throws if no active scenario exists for the user.
 */
export async function processTurn(clerkUserId: string, action: string): Promise<WorldState> {
  const uuid = await resolveUuid(clerkUserId);
  const prevState = await loadWorldState(uuid);
  if (!prevState) throw new Error("no active scenario");

  const tTurn = Date.now();
  console.info(`[turn] start action=${JSON.stringify(action.slice(0, 80))}`);

  // ── Phase 1: Extract intent (stateChanges only) ───────────────────────────
  const tP1 = Date.now();
  let intents = await extractIntent(prevState, action);
  console.info(`[turn] Phase1 extractIntent done in ${Date.now() - tP1}ms intents=${intents.length}`);

  // Recover hallucinated puzzleIds before Phase 2
  intents = recoverPuzzleIds(intents, prevState);

  // Backfill missing attemptedSolution (flash occasionally omits it)
  intents = intents.map((sc) =>
    sc.type === "solve_puzzle" && !sc.attemptedSolution
      ? { ...sc, attemptedSolution: action.trim() }
      : sc,
  );

  // ── Phase 2: Validate + judge each intent ────────────────────────────────
  let probe = prevState;
  const appliedChanges: StateChange[] = [];
  const rejectedChanges: Array<{ change: StateChange; reason: string }> = [];
  const verdicts = new Map<string, Verdict>();

  for (const sc of intents) {
    if (sc.type === "solve_puzzle") {
      // Structural pre-checks (engine rules, no judge)
      const puzzleId = sc.puzzleId ?? null;
      const puzzle = puzzleId ? probe.puzzles[puzzleId] : null;

      if (!puzzleId || !puzzle) {
        rejectedChanges.push({ change: sc, reason: `solve_puzzle: unknown puzzle '${puzzleId}'` });
        continue;
      }
      if (puzzle.locationId !== probe.currentLocationId) {
        rejectedChanges.push({ change: sc, reason: `solve_puzzle: puzzle not in current location` });
        continue;
      }
      if (puzzle.isSolved) {
        rejectedChanges.push({ change: sc, reason: `solve_puzzle: already solved` });
        continue;
      }

      // Semantic verdict from judge (solution stays server-side)
      const attempted = sc.attemptedSolution ?? action.trim();
      const tP2 = Date.now();
      const verdict = await judgeAnswer(
        { id: puzzle.id, description: puzzle.description, solution: puzzle.solution },
        attempted,
      );
      console.info(`[turn] Phase2 judgeAnswer done in ${Date.now() - tP2}ms verdict=${verdict.verdict}`);
      verdicts.set(puzzleId, verdict);
      console.info(
        `[solve_puzzle judge] puzzleId=${puzzleId} attempted=${JSON.stringify(attempted)} verdict=${verdict.verdict}`,
      );

      if (verdict.verdict === "solved") {
        // Apply directly — judge approval supersedes normalizeSolution
        const ws = structuredClone(probe);
        ws.puzzles[puzzleId].isSolved = true;
        if (puzzle.rewardItemId) {
          const loc = ws.locations[ws.currentLocationId];
          if (!loc.itemIds.includes(puzzle.rewardItemId)) loc.itemIds.push(puzzle.rewardItemId);
          ws.items[puzzle.rewardItemId].locationId = ws.currentLocationId;
        }
        probe = ws;
        appliedChanges.push(sc);
      } else {
        rejectedChanges.push({ change: sc, reason: `solve_puzzle: ${verdict.verdict}` });
      }
    } else {
      // Pure engine validation for all other action types
      const result = enforceStateChange(probe, sc);
      if (result.valid && result.updatedState) {
        probe = result.updatedState;
        appliedChanges.push(sc);
      } else {
        rejectedChanges.push({ change: sc, reason: result.reason ?? "rejected" });
        if (sc.type === "take_item") {
          const item = sc.itemId ? probe.items[sc.itemId] : undefined;
          console.warn(
            `[take_item rejected] itemId=${sc.itemId} reason=${result.reason}` +
              ` currentLoc=${probe.currentLocationId} itemLoc=${item?.locationId ?? "unknown"}`,
          );
        }
      }
    }
  }

  if (rejectedChanges.length > 0) {
    console.warn(
      `processTurn rejected: ${rejectedChanges.map((r) => `${r.change.type}(${r.reason})`).join("; ")}` +
        ` applied: ${appliedChanges.map((c) => c.type).join(", ") || "none"}`,
    );
  }

  // ── Phase 3: State is now authoritative (probe = post-apply state) ────────
  // (probe accumulated all changes via enforceStateChange / direct apply above)

  // ── Phase 4: Generate narration from the determined outcome ───────────────
  // prevState provides history; probe (newState) provides post-apply world.
  const tP4 = Date.now();
  let narrationResult = await generateNarration(
    prevState,
    probe,
    appliedChanges,
    rejectedChanges,
    verdicts,
    action,
  );
  console.info(`[turn] Phase4 generateNarration (1st) done in ${Date.now() - tP4}ms`);

  // Cross-check acknowledgedOutcomes — catch narration that contradicts rejected changes
  if (hasNarrationContradiction(narrationResult.acknowledgedOutcomes, rejectedChanges, verdicts)) {
    console.warn("[narration-crosscheck] contradiction detected, retrying narration once");
    const tP4r = Date.now();
    narrationResult = await generateNarration(
      prevState,
      probe,
      appliedChanges,
      rejectedChanges,
      verdicts,
      action,
    );
    console.info(`[turn] Phase4 generateNarration (crosscheck-retry) done in ${Date.now() - tP4r}ms`);
    if (hasNarrationContradiction(narrationResult.acknowledgedOutcomes, rejectedChanges, verdicts)) {
      console.error("[narration-crosscheck] retry also contradicted, using deterministic fallback");
      narrationResult = buildFallbackNarration(appliedChanges, rejectedChanges, verdicts);
    }
  }

  console.info(`[turn] total processTurn done in ${Date.now() - tTurn}ms`);

  // ── Finalize: commit narration to history, check win, save ────────────────
  const finalState = finalizeTurn(probe, narrationResult.narration, action);
  await saveWorldState(uuid, finalState);
  return finalState;
}

/**
 * Detect if acknowledgedOutcomes claims a rejected action succeeded.
 * This is the structural cross-check: LLM must not claim "apply:X" for a rejected X.
 */
function hasNarrationContradiction(
  acknowledgedOutcomes: string[],
  rejectedChanges: Array<{ change: StateChange; reason: string }>,
  verdicts: Map<string, Verdict>,
): boolean {
  for (const { change } of rejectedChanges) {
    if (change.type === "solve_puzzle") {
      if (acknowledgedOutcomes.includes("apply:solve_puzzle:solved")) return true;
    } else {
      if (acknowledgedOutcomes.includes(`apply:${change.type}`)) return true;
    }
  }
  return false;
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

/**
 * Load the initial WorldState snapshot for a user (written at generate() time).
 * Returns null for users who started their game before the replay feature was added,
 * or if no active game exists.
 */
export async function loadInitialState(clerkUserId: string): Promise<WorldState | null> {
  const uuid = await resolveUuid(clerkUserId);
  return loadWorldStateInitial(uuid);
}

/**
 * Load a replay scenario from a raw share snapshot and save it as B's active game.
 * Patches sessionId to bClerkUserId so the turn LLM addresses B correctly.
 * Also writes the snapshot as B's initialState so B can share their own completion.
 * Throws ZodError if the snapshot JSON is incompatible with the current WorldState schema.
 */
export async function loadReplayFromShare(
  bClerkUserId: string,
  snapshotJson: unknown,
): Promise<WorldState> {
  const parsedState = WorldStateSchema.parse(snapshotJson);
  const uuid = await resolveUuid(bClerkUserId);
  const replayState: WorldState = { ...parsedState, sessionId: bClerkUserId };
  await saveWorldState(uuid, replayState, undefined, replayState);
  return replayState;
}

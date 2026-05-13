import type { Location, StateChange, TurnResult, WorldState } from "./types";

const MAX_HISTORY = 15;

/**
 * Return a list of violation messages. Empty list means all changes are valid.
 */
export function validate(worldState: WorldState, turnResult: TurnResult): string[] {
  const violations: string[] = [];
  const locIds = new Set(Object.keys(worldState.locations));
  const itemIds = new Set(Object.keys(worldState.items));
  const currentLoc = worldState.locations[worldState.currentLocationId];

  for (const sc of turnResult.stateChanges) {
    violations.push(...validateChange(sc, worldState, currentLoc, locIds, itemIds));
  }

  return violations;
}

function validateChange(
  sc: StateChange,
  ws: WorldState,
  currentLoc: Location,
  locIds: Set<string>,
  itemIds: Set<string>,
): string[] {
  const v: string[] = [];

  if (sc.type === "move_player") {
    if (!sc.toLocation) {
      v.push("move_player missing to_location");
    } else if (!locIds.has(sc.toLocation)) {
      v.push(`move_player: unknown location '${sc.toLocation}'`);
    } else if (!currentLoc.connectedLocationIds.includes(sc.toLocation)) {
      v.push(
        `move_player: '${sc.toLocation}' is not connected to '${ws.currentLocationId}'`,
      );
    }
  } else if (sc.type === "take_item") {
    if (!sc.itemId) {
      v.push("take_item missing item_id");
    } else if (!itemIds.has(sc.itemId)) {
      v.push(`take_item: unknown item '${sc.itemId}'`);
    } else {
      const item = ws.items[sc.itemId];
      if (!currentLoc.itemIds.includes(sc.itemId)) {
        v.push(`take_item: '${sc.itemId}' is not in current location`);
      } else if (ws.inventory.includes(sc.itemId)) {
        v.push(`take_item: '${sc.itemId}' already in inventory`);
      } else if (!item.isTakeable) {
        v.push(`take_item: '${sc.itemId}' is not takeable`);
      } else if (item.isLocked) {
        if (!item.unlockItemId || !ws.inventory.includes(item.unlockItemId)) {
          v.push(
            `take_item: '${sc.itemId}' is locked — need '${item.unlockItemId}' in inventory`,
          );
        }
      }
    }
  } else if (sc.type === "use_item") {
    if (!sc.itemId) {
      v.push("use_item missing item_id");
    } else if (!itemIds.has(sc.itemId)) {
      v.push(`use_item: unknown item '${sc.itemId}'`);
    } else if (!ws.inventory.includes(sc.itemId)) {
      v.push(`use_item: '${sc.itemId}' not in inventory`);
    }
  } else if (sc.type === "move_item") {
    if (!sc.itemId) {
      v.push("move_item missing item_id");
    } else if (!itemIds.has(sc.itemId)) {
      v.push(`move_item: unknown item '${sc.itemId}'`);
    } else if (!currentLoc.itemIds.includes(sc.itemId)) {
      v.push(`move_item: '${sc.itemId}' is not in current location`);
    } else if (!sc.toLocation || !locIds.has(sc.toLocation)) {
      v.push(`move_item: invalid to_location '${sc.toLocation}'`);
    }
  } else if (sc.type === "solve_puzzle") {
    if (!sc.puzzleId) {
      v.push("solve_puzzle missing puzzle_id");
    } else if (!(sc.puzzleId in ws.puzzles)) {
      v.push(`solve_puzzle: unknown puzzle '${sc.puzzleId}'`);
    } else {
      const puzzle = ws.puzzles[sc.puzzleId];
      if (puzzle.locationId !== ws.currentLocationId) {
        v.push(`solve_puzzle: puzzle '${sc.puzzleId}' is not in current location`);
      } else if (puzzle.isSolved) {
        v.push(`solve_puzzle: puzzle '${sc.puzzleId}' already solved`);
      } else if (
        !sc.attemptedSolution ||
        sc.attemptedSolution.trim().toLowerCase() !== puzzle.solution.trim().toLowerCase()
      ) {
        v.push(`solve_puzzle: wrong solution for puzzle '${sc.puzzleId}'`);
      }
    }
  }

  return v;
}

/**
 * Apply all state changes and return a new WorldState. Assumes validate() returned [].
 */
export function apply(worldState: WorldState, turnResult: TurnResult): WorldState {
  const ws = structuredClone(worldState);

  for (const sc of turnResult.stateChanges) {
    applyChange(ws, sc);
  }

  ws.isWon = checkWin(ws);
  ws.turnCount += 1;
  appendHistory(ws, turnResult.narration);
  return ws;
}

function applyChange(ws: WorldState, sc: StateChange): void {
  if (sc.type === "move_player") {
    ws.currentLocationId = sc.toLocation!;
  } else if (sc.type === "take_item") {
    const iid = sc.itemId!;
    const loc = ws.locations[ws.currentLocationId];
    const idx = loc.itemIds.indexOf(iid);
    if (idx !== -1) loc.itemIds.splice(idx, 1);
    ws.items[iid].locationId = "inventory";
    if (!ws.inventory.includes(iid)) ws.inventory.push(iid);
  } else if (sc.type === "use_item") {
    // narration-only side effect; enforcer already verified it's in inventory
  } else if (sc.type === "move_item") {
    const iid = sc.itemId!;
    const fromLoc = ws.locations[ws.currentLocationId];
    const idx = fromLoc.itemIds.indexOf(iid);
    if (idx !== -1) fromLoc.itemIds.splice(idx, 1);
    const dest = ws.locations[sc.toLocation!];
    if (!dest.itemIds.includes(iid)) dest.itemIds.push(iid);
    ws.items[iid].locationId = sc.toLocation!;
  } else if (sc.type === "solve_puzzle") {
    const puzzle = ws.puzzles[sc.puzzleId!];
    puzzle.isSolved = true;
    if (puzzle.rewardItemId) {
      const loc = ws.locations[ws.currentLocationId];
      if (!loc.itemIds.includes(puzzle.rewardItemId)) loc.itemIds.push(puzzle.rewardItemId);
      ws.items[puzzle.rewardItemId].locationId = ws.currentLocationId;
    }
  }
}

function checkWin(ws: WorldState): boolean {
  if (ws.currentLocationId !== ws.winCondition.targetLocationId) return false;
  return ws.winCondition.requiredSolvedPuzzleIds.every((pid) => ws.puzzles[pid].isSolved);
}

function appendHistory(ws: WorldState, narration: string, action = ""): void {
  ws.history.push({ action, narration });
  if (ws.history.length > MAX_HISTORY) {
    ws.history = ws.history.slice(-MAX_HISTORY);
  }
}

/** Return a new WorldState with 'Nothing happens.' recorded and turn incremented. */
export function applyFallback(worldState: WorldState, action: string): WorldState {
  const ws = structuredClone(worldState);
  ws.turnCount += 1;
  appendHistory(ws, "Nothing happens.", action);
  return ws;
}

/**
 * Validate a single StateChange and, if valid, return the state with it applied.
 * Does not increment turnCount or append history — callers use apply() for full turn semantics.
 */
export function enforceStateChange(
  state: WorldState,
  change: StateChange,
): { valid: boolean; reason?: string; updatedState?: WorldState } {
  const locIds = new Set(Object.keys(state.locations));
  const itemIds = new Set(Object.keys(state.items));
  const currentLoc = state.locations[state.currentLocationId];

  const violations = validateChange(change, state, currentLoc, locIds, itemIds);
  if (violations.length > 0) {
    return { valid: false, reason: violations[0] };
  }

  const ws = structuredClone(state);
  applyChange(ws, change);
  return { valid: true, updatedState: ws };
}

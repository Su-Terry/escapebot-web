"use server";

import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { generate, processTurn, loadState, loadInitialState, loadReplayFromShare, resetState } from "@/lib/engine";
import { db, shares } from "@/lib/db";
import type { WorldState } from "@/lib/engine/types";

function latestNarration(state: WorldState): string {
  const last = state.history[state.history.length - 1];
  return (last?.narration as string) ?? "";
}

function toView(state: WorldState) {
  const loc = state.locations[state.currentLocationId];

  // 當前場景可見物件 — 以 item.locationId 為準（authoritative），避免 loc.itemIds 漏列物品
  const sceneItems = Object.values(state.items)
    .filter((item) => item.locationId === state.currentLocationId)
    .map((item) => ({
      id: item.id,
      name: item.name,
      isTakeable: item.isTakeable,
    }));

  // 出口（連通的 location）
  const exits = (loc?.connectedLocationIds ?? []).map((id) => {
    const destLoc = state.locations[id];
    const isLocked = (destLoc?.lockedByPuzzleIds ?? []).some(
      (pid) => !state.puzzles[pid]?.isSolved,
    );
    return { id, name: destLoc?.name ?? id, isLocked };
  });

  // 背包
  const inventory = state.inventory.map((id) => ({
    id,
    name: state.items[id]?.name ?? id,
  }));

  const history = state.history
    .map((e) => ({
      action: (e.action as string) ?? "",
      narration: (e.narration as string) ?? "",
    }))
    .filter((e) => !!e.narration);

  return {
    narration: latestNarration(state),
    isWon: state.isWon,
    turnCount: state.turnCount,
    locationName: loc?.name ?? "",
    sceneItems,
    exits,
    inventory,
    history,
    scenarioTitle: state.scenarioTitle ?? "",
    started: true,
  };
}

export async function startGame(theme?: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const state = await generate(userId, theme ? { theme } : undefined);
  return toView(state);
}

export async function submitAction(action: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const state = await processTurn(userId, action);
  return toView(state);
}

export async function getCurrentState() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const state = await loadState(userId);
  return state ? toView(state) : null;
}

export async function resetGame() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  await resetState(userId);
}

/**
 * Create a share record from the authenticated player's current (won) WorldState.
 * narrationIndex: index into the filtered narration list shown on the win screen.
 * All content (quote/scenarioTitle/turnCount) is read server-side — client cannot forge it.
 */
export async function createShare(narrationIndex: number): Promise<{ shareId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");

  const state = await loadState(userId);
  if (!state) throw new Error("No active game");
  if (!state.isWon) throw new Error("Game not won");

  const narrations = state.history
    .map((e) => (e.narration as string) ?? "")
    .filter(Boolean);

  if (narrationIndex < 0 || narrationIndex >= narrations.length) {
    throw new Error("Invalid narration index");
  }

  const quote = narrations[narrationIndex];
  const shareId = nanoid(10);

  // Copy the initial state snapshot from world_states into the share record so
  // that anyone opening the share link can replay the exact same scenario.
  // null is acceptable (pre-feature games) — replay button will be hidden for those shares.
  const initialState = await loadInitialState(userId);

  await db.insert(shares).values({
    shareId,
    clerkUserId: userId,
    scenarioTitle: state.scenarioTitle ?? "",
    quote,
    turnCount: state.turnCount,
    initialState: initialState as unknown ?? null,
  });

  return { shareId };
}

/**
 * Look up a share record by its public shareId.
 */
export async function getShare(shareId: string) {
  const rows = await db
    .select()
    .from(shares)
    .where(eq(shares.shareId, shareId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Load a share's initial state snapshot as B's active game.
 * Returns { status: 'conflict' } if B has an in-progress game and force is not set.
 * Returns { status: 'ok' } on success — caller is responsible for navigating to /play.
 * Does NOT call redirect() because redirect() throws NEXT_REDIRECT which propagates
 * to client try/catch blocks when invoked from a Client Component event handler.
 * Throws if not authenticated, share not found, or snapshot is incompatible.
 */
export async function startReplay(
  shareId: string,
  force?: boolean,
): Promise<{ status: "conflict" | "ok" }> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Not authenticated");

  const record = await getShare(shareId);
  if (!record) throw new Error("Share not found");
  if (!record.initialState) throw new Error("This share does not support replay");

  if (!force) {
    const current = await loadState(clerkUserId);
    if (current && !current.isWon && current.turnCount > 0) {
      return { status: "conflict" };
    }
  }

  await loadReplayFromShare(clerkUserId, record.initialState);
  return { status: "ok" };
}

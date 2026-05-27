"use server";

import { auth } from "@clerk/nextjs/server";
import { generate, processTurn, loadState, resetState } from "@/lib/engine";
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

  return {
    narration: latestNarration(state),
    isWon: state.isWon,
    turnCount: state.turnCount,
    locationName: loc?.name ?? "",
    sceneItems,
    exits,
    inventory,
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

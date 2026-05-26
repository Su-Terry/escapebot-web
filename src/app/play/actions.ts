"use server";

import { auth } from "@clerk/nextjs/server";
import { generate, processTurn, loadState, resetState } from "@/lib/engine";
import type { WorldState } from "@/lib/engine/types";

function latestNarration(state: WorldState): string {
  const last = state.history[state.history.length - 1];
  return (last?.narration as string) ?? "";
}

function toView(state: WorldState) {
  return {
    narration: latestNarration(state),
    isWon: state.isWon,
    turnCount: state.turnCount,
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

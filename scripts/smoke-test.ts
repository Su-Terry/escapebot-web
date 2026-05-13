/**
 * Engine smoke test — runs a full generate + 3-turn loop against live APIs.
 * Requires .env.local with DATABASE_URL and GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY).
 *
 * Run:
 *   node --env-file=.env.local --import tsx scripts/smoke-test.ts
 */

// @ai-sdk/google expects GOOGLE_GENERATIVE_AI_API_KEY; remap if only GEMINI_API_KEY is set.
// This runs before any LLM call (key is read lazily), so the assignment arrives in time.
if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

import { generate, processTurn, resetState } from "@/lib/engine";
import type { WorldState } from "@/lib/engine";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr(char = "─", width = 52): string {
  return char.repeat(width);
}

function printScenarioSummary(state: WorldState): void {
  const startLoc = state.locations[state.currentLocationId];
  console.log(`  Start : ${startLoc?.name} [${state.currentLocationId}]`);
  console.log(`  Win   : ${state.winCondition.description}`);

  console.log("\n  Locations:");
  for (const loc of Object.values(state.locations)) {
    const exits = loc.connectedLocationIds.join(", ") || "(none)";
    console.log(`    ${loc.name} [${loc.id}]  exits→ ${exits}`);
  }

  console.log("\n  Items:");
  for (const item of Object.values(state.items)) {
    const where =
      item.locationId === "inventory"
        ? "inventory"
        : (state.locations[item.locationId]?.name ?? item.locationId);
    const flags = [item.isTakeable ? "takeable" : "fixed", item.isLocked ? "locked" : ""]
      .filter(Boolean)
      .join(", ");
    console.log(`    ${item.name} [${item.id}]  ${where}  (${flags})`);
  }

  console.log("\n  Puzzles:");
  for (const puzzle of Object.values(state.puzzles)) {
    const where = state.locations[puzzle.locationId]?.name ?? puzzle.locationId;
    console.log(`    [${puzzle.id}] @ ${where}`);
    console.log(`    ${puzzle.description}`);
  }

  const opening = state.history[0]?.narration;
  if (opening) {
    console.log(`\n  Opening narration:\n  「${opening}」`);
  }
}

function latestNarration(state: WorldState): string {
  return String(state.history.at(-1)?.narration ?? "(no narration)");
}

function printFinalSummary(state: WorldState): void {
  const curLoc = state.locations[state.currentLocationId];
  const invNames = state.inventory.map((id) => state.items[id]?.name ?? id);
  const puzzleSummary = Object.values(state.puzzles)
    .map((p) => `${p.id}:${p.isSolved ? "solved" : "open"}`)
    .join("  ");

  console.log(`  Location  : ${curLoc?.name} [${state.currentLocationId}]`);
  console.log(`  Turn count: ${state.turnCount}`);
  console.log(`  Inventory : ${invNames.length > 0 ? invNames.join(", ") : "(empty)"}`);
  console.log(`  Puzzles   : ${puzzleSummary || "(none)"}`);
  console.log(`  Won       : ${state.isWon}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TEST_USER_ID = `smoke-test-${Date.now()}`;

async function main(): Promise<void> {
  console.log(hr("═"));
  console.log("  EscapeBot Engine Smoke Test");
  console.log(`  User: ${TEST_USER_ID}`);
  console.log(hr("═"));

  // 1. Generate scenario
  console.log("\n▶ Generating scenario (gemini-2.5-pro)…");
  let state = await generate(TEST_USER_ID);
  console.log("✓ Done\n");
  console.log(hr());
  printScenarioSummary(state);
  console.log(hr());

  // 2. Turn 1 — look around
  const action1 = "看看四周";
  console.log(`\n▶ Turn 1: "${action1}"`);
  state = await processTurn(TEST_USER_ID, action1);
  console.log(`  → 「${latestNarration(state)}」`);

  // 3. Turn 2 — move to first connected location
  const curLoc = state.locations[state.currentLocationId];
  const firstExitId = curLoc?.connectedLocationIds[0];
  if (firstExitId) {
    const targetName = state.locations[firstExitId]?.name ?? firstExitId;
    const action2 = `前往${targetName}`;
    console.log(`\n▶ Turn 2: "${action2}"`);
    state = await processTurn(TEST_USER_ID, action2);
    console.log(`  → 「${latestNarration(state)}」`);
  } else {
    console.log("\n▶ Turn 2: skipped (no connected locations from starting room)");
  }

  // 4. Turn 3 — pick up first item in current location
  const locNow = state.locations[state.currentLocationId];
  const firstItemId = locNow?.itemIds[0];
  if (firstItemId) {
    const itemName = state.items[firstItemId]?.name ?? firstItemId;
    const action3 = `拿起${itemName}`;
    console.log(`\n▶ Turn 3: "${action3}"`);
    state = await processTurn(TEST_USER_ID, action3);
    console.log(`  → 「${latestNarration(state)}」`);
  } else {
    console.log("\n▶ Turn 3: skipped (no items in current location)");
  }

  // 5. Final summary
  console.log(`\n${hr()}`);
  console.log("  Final State");
  console.log(hr());
  printFinalSummary(state);
}

main()
  .catch((err: unknown) => {
    console.error("\n✗ Smoke test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log(`\n▶ Cleanup: resetState(${TEST_USER_ID})…`);
    await resetState(TEST_USER_ID).catch((err: unknown) =>
      console.warn("  (cleanup error — ignored)", err),
    );
    console.log("✓ Done");
  });

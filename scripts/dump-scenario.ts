import { config } from "dotenv";
config({ path: ".env.local" });

const CLERK_USER_ID = process.argv[2];

if (!CLERK_USER_ID) {
  console.error("Usage: pnpm tsx scripts/dump-scenario.ts <clerkUserId>");
  process.exit(1);
}

async function main() {
  const { loadState } = await import("../src/lib/engine");

  const state = await loadState(CLERK_USER_ID);
  if (!state) {
    console.log("No state found for", CLERK_USER_ID);
    return;
  }

  console.log("\n=== CURRENT LOCATION ===");
  console.log(state.currentLocationId);

  console.log("\n=== LOCATIONS ===");
  for (const [id, loc] of Object.entries(state.locations)) {
    console.log(`\n[${id}] ${(loc as any).name}`);
    console.log(`  desc: ${(loc as any).description}`);
    console.log(`  items: ${JSON.stringify((loc as any).itemIds)}`);
    console.log(`  connected: ${JSON.stringify((loc as any).connectedLocationIds)}`);
  }

  console.log("\n=== ITEMS ===");
  for (const [id, item] of Object.entries(state.items)) {
    console.log(`\n[${id}] ${(item as any).name}  @${(item as any).locationId}`);
    console.log(`  desc: ${(item as any).description}`);
  }

  console.log("\n=== PUZZLES (含 solution) ===");
  for (const [id, pz] of Object.entries(state.puzzles)) {
    console.log(`\n[${id}]`);
    console.log(`  desc: ${(pz as any).description}`);
    console.log(`  SOLUTION: ${(pz as any).solution}`);
    console.log(`  reward: ${(pz as any).rewardItemId ?? "(none)"}`);
    console.log(`  solved: ${(pz as any).isSolved}`);
  }

  console.log("\n=== INVENTORY ===");
  console.log(JSON.stringify(state.inventory));

  console.log("\n=== WIN CONDITION ===");
  console.log(JSON.stringify(state.winCondition, null, 2));
}

main().then(() => process.exit(0));
/**
 * Hint probe — tests extractIntent for hint/help request phrasings.
 * Run:
 *   node --env-file=.env.local --import tsx scripts/hint-probe.ts
 */

if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

import { extractIntent } from "@/lib/engine/turnHandler";
import type { WorldState } from "@/lib/engine";

const FIXTURE: WorldState = {
  sessionId: "hint-probe",
  currentLocationId: "room_a",
  locations: {
    room_a: {
      id: "room_a",
      name: "密室主廳",
      description: "一個擺著發電機的房間。牆上有一個電子密碼鎖。",
      itemIds: ["generator", "card"],
      connectedLocationIds: ["room_b"],
      lockedByPuzzleIds: [],
    },
    room_b: {
      id: "room_b",
      name: "走廊",
      description: "走廊。",
      itemIds: [],
      connectedLocationIds: [],
      lockedByPuzzleIds: [],
    },
  },
  items: {
    generator: {
      id: "generator",
      name: "發電機",
      description: "一台老舊的發電機，面板上有個密碼輸入口。",
      locationId: "room_a",
      isTakeable: false,
      isLocked: false,
      hidden: false,
      belongsTo: null,
    },
    card: {
      id: "card",
      name: "磁卡",
      description: "一張藍色磁卡。",
      locationId: "room_a",
      isTakeable: true,
      isLocked: false,
      hidden: false,
      belongsTo: null,
    },
  },
  inventory: [],
  puzzles: {
    puzzle_lock: {
      id: "puzzle_lock",
      locationId: "room_a",
      description: "密碼鎖：輸入四位數字密碼解鎖發電機。",
      solution: "7319",
      isSolved: false,
    },
  },
  winCondition: {
    description: "解開密碼鎖並離開房間。",
    targetLocationId: "room_b",
    requiredSolvedPuzzleIds: ["puzzle_lock"],
    isMet: false,
  },
  turnCount: 1,
  isWon: false,
  scenarioTitle: "密室探索",
  history: [],
};

const TESTS: { label: string; input: string }[] = [
  // 純求助 / 問方向
  { label: "A1 給我點線索", input: "給我點線索" },
  { label: "A2 這該怎麼解", input: "這該怎麼解" },
  { label: "A3 我卡住了", input: "我卡住了" },
  { label: "A4 提示一下", input: "提示一下" },
  { label: "A5 下一步怎麼做", input: "下一步怎麼做" },
  { label: "A6 我不知道該做什麼", input: "我不知道該做什麼" },

  // 問特定謎題怎麼解
  { label: "B1 密碼是什麼", input: "密碼是什麼" },
  { label: "B2 密碼鎖怎麼解", input: "密碼鎖怎麼解" },
  { label: "B3 這個謎要用什麼方法", input: "這個謎要用什麼方法" },

  // 問貓意見 / 判斷型 (跟上次 intent probe 的第二類相關)
  { label: "C1 你覺得我該怎麼做", input: "你覺得我該怎麼做" },
  { label: "C2 這裡有什麼線索嗎", input: "這裡有什麼線索嗎" },
  { label: "C3 貓你知道答案嗎", input: "貓你知道答案嗎" },
];

function fmt(changes: Awaited<ReturnType<typeof extractIntent>>): string {
  if (changes.length === 0) return "[] (query/no-op)";
  return changes.map((sc) => {
    const parts = [`type=${sc.type}`];
    if (sc.puzzleId) parts.push(`puzzleId=${sc.puzzleId}`);
    if (sc.attemptedSolution != null) parts.push(`ans="${sc.attemptedSolution}"`);
    if (sc.itemId) parts.push(`item=${sc.itemId}`);
    if (sc.toLocation) parts.push(`to=${sc.toLocation}`);
    return parts.join(" ");
  }).join(" | ");
}

async function main() {
  console.log("═".repeat(60));
  console.log("Hint Probe — extractIntent 求助類輸入實測");
  console.log("═".repeat(60));

  for (const { label, input } of TESTS) {
    process.stdout.write(`\n[${label}] "${input}"\n`);
    try {
      const changes = await extractIntent(FIXTURE, input);
      console.log(`  → ${fmt(changes)}`);
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("完成");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

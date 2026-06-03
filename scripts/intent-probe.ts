/**
 * Intent probe — tests extractIntent against different input phrasings.
 * Run:
 *   node --env-file=.env.local --import tsx scripts/intent-probe.ts
 */

if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

import { extractIntent } from "@/lib/engine/turnHandler";
import type { WorldState } from "@/lib/engine";

// ── Minimal WorldState fixture ────────────────────────────────────────────────
// One room, one puzzle (solution "7319"), one door to move through, one item.

const FIXTURE: WorldState = {
  sessionId: "probe-test",
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

// ── Test cases ─────────────────────────────────────────────────────────────────

const TESTS: { label: string; input: string }[] = [
  // 第一類: 命令貓/你 做世界的事
  { label: "1a 你幫我提交", input: "你幫我提交 7319" },
  { label: "1b 貓把答案設成", input: "貓,把答案設成 7319" },
  { label: "1c 你去開門", input: "你去開門" },
  { label: "1d 你幫我拿那張卡", input: "你幫我拿那張卡" },

  // 第二類: 詢問答案對不對 (不該被當提交)
  { label: "2a 7319對嗎", input: "7319 對嗎？" },
  { label: "2b 你覺得答案是7319嗎", input: "你覺得答案是 7319 嗎？" },
  { label: "2c 7319是正確的嗎", input: "7319 是正確的嗎？" },

  // 第三類: 命令貓做與世界無關的事
  { label: "3a 你冬眠吧", input: "你冬眠吧" },
  { label: "3b 你過來", input: "你過來" },

  // 第四類: 對照組 (直述)
  { label: "4a 提交7319", input: "提交 7319" },
  { label: "4b 純數字7319", input: "7319" },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(60));
  console.log("Intent Probe — extractIntent 四類輸入實測");
  console.log("═".repeat(60));

  for (const { label, input } of TESTS) {
    process.stdout.write(`\n[${label}] "${input}"\n`);
    try {
      const changes = await extractIntent(FIXTURE, input);
      if (changes.length === 0) {
        console.log("  → stateChanges: [] (empty — query/surreal/no-op)");
      } else {
        for (const sc of changes) {
          const parts: string[] = [`type=${sc.type}`];
          if (sc.puzzleId) parts.push(`puzzleId=${sc.puzzleId}`);
          if (sc.attemptedSolution != null) parts.push(`attemptedSolution="${sc.attemptedSolution}"`);
          if (sc.itemId) parts.push(`itemId=${sc.itemId}`);
          if (sc.toLocation) parts.push(`toLocation=${sc.toLocation}`);
          console.log(`  → ${parts.join("  ")}`);
        }
      }
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
// This file was already run; see hint-probe.ts for hint-specific tests

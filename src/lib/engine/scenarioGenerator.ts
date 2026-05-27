import { generateObject, NoObjectGeneratedError } from "ai";
import type { LanguageModelUsage } from "ai";
import { google } from "@ai-sdk/google";
import { ZodError } from "zod";

import { WorldStateSchema, validatedWorldStateSchema } from "./types";
import type { WorldState } from "./types";

const MODEL = "gemini-2.5-pro";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a creative designer for text-adventure escape room games. Your task is to generate a
complete, self-contained escape room scenario that is fun, atmospheric, and fully solvable.

## Language

All narrative content MUST be written in Traditional Chinese (繁體中文). This includes:
location descriptions, item descriptions, puzzle descriptions, opening narration, and
win condition description.

ID fields (location id, item id, puzzle id) must remain lowercase English with hyphens
(e.g. "medical-bay", "rusty-key", "door-lock") — these are internal references never
shown to the player.

Name fields (Location.name, Item.name) must be in Traditional Chinese for display
(e.g. "醫療室", "生鏽的鑰匙").

Solutions (puzzle.solution) can be any language but must match what the puzzle describes
(numeric codes stay numeric; Chinese-word answers stay Chinese).

## Output Format

Respond with a single JSON object that strictly conforms to the WorldState schema below.
All field names must match exactly. All id values must be unique across the entire object.

## WorldState JSON Schema

{
  "sessionId": "<string — the player's username, passed to you in the user turn>",
  "scenarioTitle": "<string — 4-12 繁體中文字，整個場景的氛圍/主題標題，例如「廢棄的深空研究站」「克蘇魯神殿遺跡」「煉金術師的秘密書房」，不能是任何單一房間名稱>",
  "currentLocationId": "<string — must be a key in locations, the player's starting room>",
  "locations": {
    "<location_id>": {
      "id": "<string — kebab-case, globally unique>",
      "name": "<string — short display name>",
      "description": "<string — 30-50 中文字, 列出場所特徵和可互動物件, 不要文藝鋪墊>",
      "itemIds": ["<item_id>", ...],
      "connectedLocationIds": ["<location_id>", ...],
      "lockedByPuzzleIds": ["<puzzle_id>", ...]
    }
  },
  "items": {
    "<item_id>": {
      "id": "<string — kebab-case, globally unique>",
      "name": "<string — short display name>",
      "description": "<string — 15-30 中文字, 列關鍵特徵, 自然嵌入線索>",
      "locationId": "<string — locationId where item starts, or 'inventory'>",
      "isTakeable": <bool>,
      "isLocked": <bool — true if another item is required to pick this up>,
      "unlockItemId": "<string or null>"
    }
  },
  "inventory": [],
  "puzzles": {
    "<puzzle_id>": {
      "id": "<string — kebab-case>",
      "locationId": "<string>",
      "description": "<string — 15-30 中文字, 謎題機制, 不含答案>",
      "solution": "<string — exact answer player must type; ≤ 20 chars; derivable from clues>",
      "isSolved": false,
      "rewardItemId": "<string or null>"
    }
  },
  "winCondition": {
    "description": "<string>",
    "targetLocationId": "<string>",
    "requiredSolvedPuzzleIds": ["<puzzle_id>", ...],
    "isMet": false
  },
  "turnCount": 0,
  "isWon": false,
  "history": [
    {
      "action": "",
      "narration": "<string — 60-80 中文字, 介紹場景和玩家狀態, 口語不文藝>"
    }
  ]
}

## 必要內容規定 (REQUIRED — 空欄位視為違規, 會被拒絕並重試)

必須包含:
- 至少 3 個 locations (描述清楚, 各有特色)
- 至少 4 個 items (其中至少 2 個跟 puzzle 相關)
- 至少 2 個 puzzles (互相關聯, 形成 progression)
- 1 個 winCondition with valid targetLocationId
- player.currentLocationId 必須是 locations 中的一個
- 所有 connectedLocationIds 必須是有效 location ID

## Design Rules

### Locations
- Create 3 to 5 locations total.
- Locations must be connected bidirectionally (if A connects to B, B must connect to A).
- One location is the starting location (currentLocationId).
- One location is the win target. The win target must be reachable only after solving puzzles.
- Use "lockedByPuzzleIds" to list puzzle IDs that must be solved before a player can ENTER that location. The win target MUST have "lockedByPuzzleIds" equal to "requiredSolvedPuzzleIds". Intermediate locked rooms also set this field. Rooms with no lock requirement use [].
- "lockedByPuzzleIds" must only reference puzzle IDs defined in the "puzzles" dict.
- CRITICAL: A puzzle listed in location B's "lockedByPuzzleIds" MUST have its "locationId" set to a room the player can access WITHOUT entering B (e.g., the room just before B, or an earlier room). NEVER place a locking puzzle inside the room it locks — the player cannot enter to solve it, creating an unbreakable deadlock. Example: if "seed-vault" is locked by "gate-control", then gate-control.locationId must be "main-control-room" (or another accessible room), NOT "seed-vault".

### Items
- Create 4 to 8 items total; at least 2 must be takeable (isTakeable: true).
- Takeable items: small objects (notebooks, keys, coins, keycards, etc.).
- Non-takeable: furniture or large objects (desks, bookcases, machines).
- Locked items (isLocked: true) need another item in inventory before they can be taken.
- All items must start in a location (not inventory). inventory starts as [].
- CRITICAL: Every item must appear in BOTH places: (a) items[X].locationId = "room-id", AND (b) locations["room-id"].itemIds includes X. Omitting an item from itemIds makes it permanently invisible and untakeable. There are no sub-containers — items sit directly in a location's itemIds list.

### Puzzles
- Create 2 to 3 puzzles.
- Solutions must be ≤ 20 characters and derivable from in-world clues.
- Solution must NOT appear literally in puzzle description.
- rewardItemId: optional item placed in location when puzzle is solved.

### Puzzle Solution Design (重要)

當設計 puzzle.solution, 必須讓玩家從 puzzle.description + 場景線索能合理猜到輸入格式。

✅ 好的 solution 設計原則:
- 純數字 (e.g. 4 位數密碼)
- 單一詞或短語
- 標準分隔的序列 (空格、頓號)
- 從 description 看得出 format hint

❌ 避免:
- 玩家無法從線索推導的詭異字串
- 過度複雜的編碼或語法
- 多種可能 format 的歧義 (例如「兩個數字組合」沒指定怎麼組)

puzzle.description 必須包含 format hint, 例如:
- 「需要輸入 N 位數字密碼」
- 「按...順序選擇 N 個選項, 用空格分隔」
- 「將兩種材料的數值輸入」(配合線索明確化 format)

如果 description 沒給 format hint, 玩家無法推導 → puzzle 變不可解。

### Win Condition
- Player wins by reaching targetLocationId with all requiredSolvedPuzzleIds solved.
- Do not make the win target trivially reachable from start.

### Clue Design
- Embed clues naturally in item/location descriptions.
- Splitting clues across two items is encouraged (e.g. first two digits on one, last two on another).

### Description Style — STRICT
字數上限 (超出視為違規):
- scenarioTitle: 4-12 繁體中文字，場景整體氛圍標題，不可以是某個房間名稱
- Location.description: 30-50 中文字
- Item.description: 15-30 中文字
- Puzzle.description: 15-30 中文字
- 開場 narration (history[0].narration): 60-80 中文字
- Win condition description: 20-40 中文字

寫法規則:
- 口語, 不要文藝散文
- 不描寫氣氛 (不要「空氣中瀰漫著…」「微弱光線…」「沉重的寂靜…」)
- 直接列玩家看得到、用得到的資訊
- 開場 narration 用第二人稱 (「你…」), 其他 description fields 用陳述句

## Dict Key Rule (CRITICAL — most common mistake)

The \`locations\`, \`items\`, and \`puzzles\` fields are JSON objects (dicts).
The KEY for each entry MUST be the exact same string as the \`id\` field inside that entry.

CORRECT:
  "locations": {
    "cryo-bay": { "id": "cryo-bay", "name": "冷凍艙", ... }
  }

WRONG — key does not match id:
  "locations": {
    "冷凍艙": { "id": "cryo-bay", ... }
  }

Every cross-reference (currentLocationId, item.locationId, puzzle.locationId,
connectedLocationIds, itemIds, unlockItemId, rewardItemId, requiredSolvedPuzzleIds,
lockedByPuzzleIds)
must use the kebab-case id strings, NOT display names.

## Referential Integrity (CRITICAL — check before responding)

1. currentLocationId is a key in locations AND matches a location's id field.
2. winCondition.targetLocationId is a key in locations.
3. All ids in requiredSolvedPuzzleIds are keys in puzzles.
4. All connectedLocationIds in each location are keys in locations (bidirectional).
5. All itemIds in each location are keys in items.
6. All item.locationId values are a key in locations or the string "inventory".
7. If item.unlockItemId is set, it is a key in items.
8. All puzzle.locationId values are keys in locations.
9. If puzzle.rewardItemId is set, it is a key in items.
10. inventory is empty [].
11. All ids in each location's lockedByPuzzleIds are keys in puzzles.
12. For every (locId, puzzleId) pair where puzzleId is in locId's lockedByPuzzleIds: puzzles[puzzleId].locationId must NOT equal locId (the puzzle must not be inside the room it locks).
13. Bidirectional item consistency: for every item X where items[X].locationId = "room-id", locations["room-id"].itemIds must include X. Check every item — none may be omitted from its location's itemIds.

Any violation causes rejection and retry. Verify all references before responding.`;

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Re-key locations/items/puzzles so dict keys match the internal id field.
 * Ported from Python: Gemini may emit display names as keys ("Cryo Bay") while the id
 * field is kebab-case ("cryo-bay"), or omit the id field entirely and use the key.
 * With generateObject the SDK parses JSON before Zod validation, so this utility
 * is preserved for manual-parse error-recovery paths in future iterations.
 */
export function normalizeWorldStateDict(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data };
  for (const field of ["locations", "items", "puzzles"]) {
    const blob = result[field];
    if (!blob || typeof blob !== "object" || Array.isArray(blob)) continue;
    const normalized: Record<string, unknown> = {};
    for (const [oldKey, obj] of Object.entries(blob as Record<string, unknown>)) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
      const entry = { ...(obj as Record<string, unknown>) };
      const objId = (entry["id"] as string | undefined) || oldKey;
      entry["id"] = objId;
      normalized[objId] = entry;
    }
    result[field] = normalized;
  }
  return result;
}

// ── Scenario validation ───────────────────────────────────────────────────────

/**
 * Auto-repair bidirectional item consistency: if item.locationId points to a location
 * that doesn't list the item in itemIds, add it. Returns the number of repairs made.
 */
function repairItemConsistency(ws: WorldState): number {
  let repairs = 0;
  for (const [itemId, item] of Object.entries(ws.items)) {
    if (item.locationId === "inventory") continue;
    const loc = ws.locations[item.locationId];
    if (loc && !loc.itemIds.includes(itemId)) {
      loc.itemIds.push(itemId);
      repairs++;
    }
  }
  return repairs;
}

/**
 * Validate game-logic constraints not expressible in the Zod schema.
 * Only checks true deadlocks (puzzle locked inside its own room) — these cannot be
 * auto-repaired and require regeneration. Bidirectional item consistency is handled
 * by repairItemConsistency() before this is called.
 * Returns a list of violation strings; empty means valid.
 */
function validateScenarioLogic(ws: WorldState): string[] {
  const violations: string[] = [];

  // Deadlock: puzzle inside the room it locks
  for (const [locId, loc] of Object.entries(ws.locations)) {
    for (const puzzleId of loc.lockedByPuzzleIds) {
      const puzzle = ws.puzzles[puzzleId];
      if (puzzle && puzzle.locationId === locId) {
        violations.push(
          `Deadlock: puzzle '${puzzleId}' is inside '${locId}' which it locks — player can never solve it`,
        );
      }
    }
  }

  return violations;
}

// ── Usage logging ─────────────────────────────────────────────────────────────

function logUsage(model: string, usage: LanguageModelUsage): void {
  console.info(
    `llm_call model=${model} input=${usage.inputTokens ?? 0} output=${usage.outputTokens ?? 0}`,
  );
}

// ── Error introspection ───────────────────────────────────────────────────────

function describeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { name: "unknown", raw: String(err) };
  const info: Record<string, unknown> = {
    name: err.constructor.name,
    message: err.message,
  };
  if (err instanceof NoObjectGeneratedError) {
    info.text = err.text ? err.text.slice(0, 500) : undefined;
  }
  if (err instanceof ZodError) {
    info.zodIssues = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  }
  if (err.cause != null) {
    info.cause =
      err.cause instanceof Error
        ? describeError(err.cause)
        : String(err.cause);
  }
  return info;
}

// ── Generation ────────────────────────────────────────────────────────────────

// TODO: referential integrity check (_check_referential_integrity) not yet ported — see types.ts WorldStateSchema TODO

/**
 * Generate a fresh WorldState for a new game session.
 * 3 attempts: primary path uses structured output; on NoObjectGeneratedError
 * with recoverable text, normalizeWorldStateDict is tried before counting failure.
 * Silently falls back to Level 1 after exhausting all attempts (matches Python behavior).
 */
export async function generateScenario(
  userId: string,
  opts?: { theme?: string },
): Promise<WorldState> {
  const themePart = opts?.theme ? ` Theme: ${opts.theme}.` : "";
  const userPrompt = `Generate an escape room scenario. The player's username is: ${userId}${themePart}`;

  console.log(`scenarioGenerator: start userId=${userId}`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { object: raw, usage } = await generateObject({
        model: google(MODEL),
        output: "no-schema",
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
      });
      logUsage(MODEL, usage);

      try {
        const normalized = normalizeWorldStateDict(raw as Record<string, unknown>);
        const ws = validatedWorldStateSchema.parse({ ...normalized, sessionId: userId });
        const repairs = repairItemConsistency(ws);
        if (repairs > 0) {
          console.warn(`scenarioGenerator attempt ${attempt} auto-repaired ${repairs} item(s) missing from location itemIds`);
        }
        const logicViolations = validateScenarioLogic(ws);
        if (logicViolations.length > 0) {
          console.warn(
            `scenarioGenerator attempt ${attempt} logic violations:`,
            logicViolations,
          );
          continue;
        }
        console.log(
          `scenarioGenerator: success attempt=${attempt}` +
            ` locations=${Object.keys(ws.locations).length}` +
            ` items=${Object.keys(ws.items).length}` +
            ` puzzles=${Object.keys(ws.puzzles).length}`,
        );
        return ws;
      } catch (parseErr) {
        console.warn(
          `scenarioGenerator attempt ${attempt} parse/validate failed:`,
          describeError(parseErr),
        );
      }
    } catch (err) {
      // Recovery: Gemini sometimes returns truncated JSON via NoObjectGeneratedError
      if (err instanceof NoObjectGeneratedError && err.text) {
        try {
          const raw = normalizeWorldStateDict(JSON.parse(err.text) as Record<string, unknown>);
          const ws = validatedWorldStateSchema.parse({ ...raw, sessionId: userId });
          const repairs = repairItemConsistency(ws);
          if (repairs > 0) {
            console.warn(`scenarioGenerator attempt ${attempt} recovery auto-repaired ${repairs} item(s) missing from location itemIds`);
          }
          const logicViolations = validateScenarioLogic(ws);
          if (logicViolations.length > 0) {
            console.warn(
              `scenarioGenerator attempt ${attempt} recovery logic violations:`,
              logicViolations,
            );
          } else {
            console.warn(
              `scenarioGenerator attempt ${attempt} recovered via normalize` +
                ` locations=${Object.keys(ws.locations).length}` +
                ` items=${Object.keys(ws.items).length}`,
            );
            return ws;
          }
        } catch (normalizeErr) {
          console.warn(
            `scenarioGenerator attempt ${attempt} normalize recovery failed:`,
            describeError(normalizeErr),
          );
        }
      }
      console.warn(`scenarioGenerator attempt ${attempt} failed:`, describeError(err));
    }
  }

  console.error("scenarioGenerator exhausted retries, falling back to Level 1");
  const fallback = level1Fallback(userId);
  console.log(
    `scenarioGenerator: Level 1 fallback` +
      ` locations=${Object.keys(fallback.locations).length}` +
      ` items=${Object.keys(fallback.items).length}` +
      ` puzzles=${Object.keys(fallback.puzzles).length}`,
  );
  return fallback;
}

// ── Level 1 fallback ──────────────────────────────────────────────────────────

/** Convert the fixed Level 1 scenario into a WorldState. Baseline experience on generation failure. */
function level1Fallback(userId: string): WorldState {
  return {
    sessionId: userId,
    scenarioTitle: "神秘的工作室",
    currentLocationId: "studio",
    locations: {
      studio: {
        id: "studio",
        name: "Studio",
        description:
          "A cramped 6m² studio. You wake up lying on a comfortable recliner. " +
          "In front of you is a classic long black oak desk. " +
          "To the left is a large french window letting in fresh air. " +
          "To the right is a door with a digital lock. " +
          "The low white ceiling feels close. You need to escape.",
        itemIds: ["recliner", "office-desk", "notebook"],
        connectedLocationIds: ["corridor"],
        lockedByPuzzleIds: [],
      },
      corridor: {
        id: "corridor",
        name: "Corridor",
        description: "The corridor outside the studio. You made it.",
        itemIds: [],
        connectedLocationIds: ["studio"],
        lockedByPuzzleIds: ["door-lock"],
      },
    },
    items: {
      recliner: {
        id: "recliner",
        name: "Recliner",
        description: "A comfortable recliner. You woke up on it.",
        locationId: "studio",
        isTakeable: false,
        isLocked: false,
      },
      "office-desk": {
        id: "office-desk",
        name: "Office Desk",
        description: "A classic long black oak desk. A worn notebook rests on top.",
        locationId: "studio",
        isTakeable: false,
        isLocked: false,
      },
      notebook: {
        id: "notebook",
        name: "Notebook",
        description: "Nothing on it except a small number handwritten in the margin: 79.",
        locationId: "studio",
        isTakeable: true,
        isLocked: false,
      },
    },
    inventory: [],
    puzzles: {
      "door-lock": {
        id: "door-lock",
        locationId: "studio",
        description:
          "A digital door lock with a 4-digit keypad. " +
          "Someone has scrawled a clue on the ceiling in faint letters: " +
          "'Ang unang duha ka numero mao ang 45' (The first two numbers are 45).",
        solution: "4579",
        isSolved: false,
      },
    },
    winCondition: {
      description: "Unlock the door lock and escape to the corridor.",
      targetLocationId: "corridor",
      requiredSolvedPuzzleIds: ["door-lock"],
      isMet: false,
    },
    turnCount: 0,
    isWon: false,
    history: [
      {
        action: "",
        narration:
          "Where am I? You wake up lying on a comfortable recliner in a cramped studio. " +
          "In front of you is a long oak desk with something on it. " +
          "A large window lets in fresh air on your left. " +
          "On your right, a door — locked. " +
          "The ceiling has a faint message you can almost make out. " +
          "You need to escape.",
      },
    ],
  };
}

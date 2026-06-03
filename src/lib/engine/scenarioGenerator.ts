import { generateObject, NoObjectGeneratedError } from "ai";
import type { LanguageModelUsage } from "ai";
import { google } from "@ai-sdk/google";
import { ZodError } from "zod";

import { WorldStateSchema, validatedWorldStateSchema } from "./types";
import type { WorldState, PuzzleGraph } from "./types";

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
      "unlockItemId": "<string or null>",
      "belongsTo": "<string or null — if this item is tucked inside/under a furniture piece, put that furniture's item id here; the item will be invisible until the player examines that furniture. null for all normal visible items.>"
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
- To hide a small item inside/under furniture: set belongsTo to the furniture's item id. The item will be invisible until the player examines that furniture. belongsTo is null for all normal visible items. Do NOT use belongsTo for every item — only when it adds exploration depth. Items critical to the main solution path should NOT be hidden behind an examine step.
- belongsTo has NOTHING to do with isLocked. isLocked means the player needs another item in inventory to pick this up. Non-takeable items (machines, computers, furniture) must always have belongsTo:null — they are large visible objects.
- Do NOT output a "hidden" field — the engine derives it automatically from belongsTo.

### Puzzles
- Create 2 to 3 puzzles.
- Solutions must be ≤ 20 characters and derivable from in-world clues.
- **答案禁止明文洩漏**（所有 description 欄位皆適用）:
  玩家看完任何 description 不需推理就能知道答案 = 洩漏，禁止。
  目標是「充分線索 + 一步推理」——線索要夠讓人推得到，但不能直接說出答案。

  ❌ 洩漏範例（禁止）:
  - item.description: 「書脊上清楚拼出 V-E-R-I-T-A-S」→ 直接讀出答案
  - puzzle.description: 「密語是『釋放』，輸入解鎖艙門」→ 答案就在題目裡
  - location.description: 「四座石像分別是鷹、蛇、獅、鱷，從左到右排列」→ 順序答案直接列出

  ✅ 允許範例（充分線索 + 一步推理）:
  - item.description: 「筆記本上列出四種動物名稱，旁邊各標一個數字，最小的排第一」→ 有規則、有材料、推得到
  - item.description: 「石碑上刻有『鷹居首，鱷居末』的文字，中間兩格空白」→ 部分告知、需配合別的線索

  兩問自我檢查（兩個都要通過）:
  1. 玩家不推理就能知道答案嗎？（洩漏 → 不合格）
  2. 玩家能從現有線索推出唯一的答案嗎？（通靈 → 不合格）
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

多字答案的順序（solution 含兩個以上詞時必讀）:

solution 含兩個以上詞（空格分隔）時，必須二選一，不能模糊：
A. 順序有意義 → puzzle.description 或線索必須給出明確排列依據（「從左到右」「按數字小到大」「依壁畫出現順序」等具體依據）。玩家只知道「有哪些詞」但不知道「哪個先」= 等同無解，禁止。
B. 順序無意義 → puzzle.description 明示「任意順序」或「順序不拘」，例：「輸入三種元素的名稱，順序不拘，用空格分隔」。
❌ 禁止：多字 solution + 沒說順序 + judge 要求精確順序。
❌ 禁止：「按正確順序輸入」但沒說「正確順序」的依據是什麼。

### Win Condition
- Player wins by reaching targetLocationId with all requiredSolvedPuzzleIds solved.
- Do not make the win target trivially reachable from start.

### Clue Design
- Embed clues naturally in item/location descriptions.
- Splitting clues across two items is encouraged (e.g. first two digits on one, last two on another).

### 答案詞彙一致性（CRITICAL — 防止「夜空→星空」問題）

solution 每一個詞必須在至少一個 item.description 或 location.description 中原字出現
（夜空就是夜空，不能用「繁星」「夜晚」替代）。

數字/代碼組合題允許「零件 + 組合規則」:
- 允許：線索給 73 和 95，puzzle description 說「將兩數合併」，答案 7395。
- 禁止：線索只說「兩個數字」，沒說是哪兩個，答案 7395。

❌ 違規範例:
- 線索用「夜空」→ 答案卻是「星空」（玩家輸「夜空」被 judge 判 wrong）
- 線索圖畫是太陽和海浪 → 答案是「日 海」（「日」「海」沒在任何 description 出現過）

✅ 正確做法:
- 線索：「牆壁描繪著璀璨的星空」→ 答案：「星空」（原字）
- 線索：「石碑左側刻著日字，右側刻著海字」→ 答案：「日 海」

設計流程：先鎖定答案詞，再補線索確認每個詞在 description 原字出現。

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

// ── PuzzleGraph prompt (Phase 3a) ─────────────────────────────────────────────

const PUZZLE_GRAPH_SYSTEM_PROMPT = `You are formalizing escape room puzzle reasoning chains as causal graphs.

Given a validated escape room world (items, locations, puzzles with their solutions),
output one PuzzleGraph per puzzle that explicitly maps HOW a player derives the solution
from in-game clues alone.

## Output format

A single JSON object keyed by puzzle id:
{
  "<puzzle_id>": {
    "puzzleId": "<puzzle_id>",
    "nodes": {
      "<node_id>": {
        "id": "<node_id>",
        "type": "clue" | "inference" | "solution",
        "label": "<one-line description of what this node represents>",
        "sourceRef": "<item.id or location.id>"  // clue nodes only; omit for inference/solution
      }
    },
    "edges": [
      {
        "from": ["<node_id>", ...],   // ALL premise node ids (all must hold before conclusion follows)
        "to": "<node_id>",
        "inferenceType": "extract" | "combine" | "order-by-index" | "order-by-rule",
        "groundingProof": "<exact quote or precise paraphrase from the description text>"
      }
    ],
    "solutionNodeId": "<node_id>"
  }
}

## Node rules

clue: a game item or location whose description provides raw information.
  - sourceRef MUST be a real item.id or location.id from the world.
  - sourceRef MUST NOT be a puzzle id. Puzzle descriptions explain mechanics, not clues.
inference: a mental step combining clues into an intermediate conclusion.
  - No sourceRef.
solution: the final answer node.
  - Exactly one per graph. No sourceRef.

## inferenceType rules

extract:        The answer value is directly readable from a clue description.
combine:        Multiple values are joined by an explicit rule stated in a description
                (e.g. "concatenate the two halves").
order-by-index: Items sorted by numeric positions given explicitly in descriptions.
order-by-rule:  Items sorted by a rule explicitly stated in a description text —
                no real-world cultural or scientific knowledge required.

## Critical constraints

1. In-game information only. Never use real-world knowledge (history, science, geography,
   culture, mythology) not stated explicitly in item or location descriptions.
2. Path length ≥ 2. The SolutionNode must NOT be reachable in a single edge from
   ClueNodes alone. There must be at least one InferenceNode on the path.
3. Specific groundingProof. Quote or precisely paraphrase the EXACT description text
   that enables each inference. Do not write vague proofs like "the item mentions
   something relevant". If you cannot find specific description text supporting an
   inference, do not create that edge — the puzzle may have a missing premise.`;

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
 * Derive item.hidden from item.belongsTo for the initial WorldState.
 * hidden == (belongsTo != null) holds at generation time only — runtime examine_item
 * flips hidden to false while leaving belongsTo as historical metadata.
 * Must be called once after generation, never during turn processing.
 */
function deriveHiddenFields(ws: WorldState): void {
  for (const item of Object.values(ws.items)) {
    item.hidden = item.belongsTo != null;
  }
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

  // belongsTo reachability: parent must exist, be in same location, and not itself have a belongsTo (one level only)
  for (const [itemId, item] of Object.entries(ws.items)) {
    if (!item.belongsTo) continue;
    const parent = ws.items[item.belongsTo];
    if (!parent) {
      violations.push(
        `Item '${itemId}' belongsTo '${item.belongsTo}' which does not exist`,
      );
    } else if (parent.locationId !== item.locationId) {
      violations.push(
        `Item '${itemId}' and its parent '${item.belongsTo}' are in different locations`,
      );
    } else if (parent.belongsTo != null) {
      violations.push(
        `Item '${itemId}' parent '${item.belongsTo}' also has belongsTo — nested hidden items not supported (one level only)`,
      );
    }
  }

  return violations;
}

/**
 * Check that each word token in a puzzle solution appears verbatim in at least one
 * description field (locations, items, or puzzles). This catches the common failure
 * where the LLM uses "星空" as a solution but writes "夜空" in all clues.
 *
 * Capability limits (do not over-trust this check):
 *
 * 1. Existence check only, not context validity. `allDesc.includes(token)` confirms
 *    the string appears somewhere — it does NOT confirm it appears in a relevant clue.
 *    Short tokens (single Chinese characters like "山", 2-digit numbers like "73") may
 *    match incidental text in unrelated descriptions. This function catches
 *    "answer word never appears anywhere" but cannot catch "appears in wrong context".
 *
 * 2. Pure numeric codes (e.g. "1234") are skipped entirely. Their solvability depends
 *    on the generator prompt's "充分線索 + 一步推理" rule (~70% reliable), not this
 *    function. Do not assume that passing this check guarantees a numeric puzzle is
 *    solvable — it does not check that at all.
 */
function validateLexicalConsistency(ws: WorldState): string[] {
  const allDesc = [
    ...Object.values(ws.locations).map((l) => l.description),
    ...Object.values(ws.items).map((i) => i.description),
    ...Object.values(ws.puzzles).map((p) => p.description),
  ].join(" ");

  const violations: string[] = [];

  for (const puzzle of Object.values(ws.puzzles)) {
    const sol = puzzle.solution.trim();

    // Pure numeric code (e.g. "1234", "5678"): skip — format hint in description suffices.
    if (/^\d+$/.test(sol)) continue;

    const tokens = sol.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      if (!allDesc.includes(token)) {
        violations.push(
          `Puzzle "${puzzle.id}": solution token "${token}" not found in any description (solution: "${sol}")`,
        );
      }
    }
  }

  return violations;
}

// ── PuzzleGraph validation (Phase 3a) ────────────────────────────────────────
//
// SCOPE: structural self-consistency only.
//
//   What IS checked (3a):
//     (a) every ClueNode.sourceRef points to a real item or location in the world
//     (b) SolutionNode is forward-reachable from ClueNodes via declared edges
//     (c) SolutionNode is not reachable in a single edge from ClueNodes-only
//         (enforces at least one InferenceNode on the path)
//     (d) every puzzle has a corresponding graph
//
//   What is NOT checked here (Phase 3b):
//     Whether groundingProof text actually appears in the referenced description.
//     A graph where the LLM fabricated a plausible groundingProof still passes 3a.
//     Inspect groundingProof manually in stress-gen dump to catch fabrication early.

function validatePuzzleGraphs(ws: WorldState, graphs: PuzzleGraph[]): string[] {
  const violations: string[] = [];

  // (d) every puzzle must have a graph
  for (const puzzleId of Object.keys(ws.puzzles)) {
    if (!graphs.find((g) => g.puzzleId === puzzleId)) {
      violations.push(`Missing PuzzleGraph for puzzle '${puzzleId}'`);
    }
  }

  for (const graph of graphs) {
    const p = `PuzzleGraph '${graph.puzzleId}'`;

    if (!ws.puzzles[graph.puzzleId]) {
      violations.push(`${p}: references unknown puzzle id`);
      continue;
    }

    // solutionNode must exist and have type "solution"
    const solutionNode = graph.nodes[graph.solutionNodeId];
    if (!solutionNode) {
      violations.push(`${p}: solutionNodeId '${graph.solutionNodeId}' not in nodes`);
      continue;
    }
    if (solutionNode.type !== "solution") {
      violations.push(`${p}: solutionNodeId node has type '${solutionNode.type}', expected 'solution'`);
    }

    // (a) ClueNode.sourceRef must point to a real item or location (NOT a puzzle)
    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (node.type !== "clue") continue;
      if (!node.sourceRef) {
        violations.push(`${p}: ClueNode '${nodeId}' missing sourceRef`);
      } else if (ws.puzzles[node.sourceRef]) {
        violations.push(
          `${p}: ClueNode '${nodeId}' sourceRef '${node.sourceRef}' is a puzzle id — ` +
          `puzzle descriptions are mechanism hints, not clues; use an item.id or location.id`,
        );
      } else if (!ws.items[node.sourceRef] && !ws.locations[node.sourceRef]) {
        violations.push(
          `${p}: ClueNode '${nodeId}' sourceRef '${node.sourceRef}' not found in items or locations`,
        );
      }
    }

    const clueNodeIds = new Set(
      Object.entries(graph.nodes)
        .filter(([, n]) => n.type === "clue")
        .map(([id]) => id),
    );

    if (clueNodeIds.size === 0) {
      violations.push(`${p}: no ClueNodes`);
      continue;
    }

    // (b) forward reachability from ClueNodes to SolutionNode
    // hyperedge semantics: edge fires only when ALL from-nodes are reachable
    const reachable = new Set<string>(clueNodeIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of graph.edges) {
        if (!reachable.has(edge.to) && edge.from.every((id) => reachable.has(id))) {
          reachable.add(edge.to);
          changed = true;
        }
      }
    }
    if (!reachable.has(graph.solutionNodeId)) {
      violations.push(`${p}: SolutionNode '${graph.solutionNodeId}' not reachable from ClueNodes`);
    }

    // (c) path length ≥ 2: SolutionNode must not be reachable via an edge whose
    //     entire from-list consists only of ClueNodes (would mean answer is trivially direct)
    for (const edge of graph.edges) {
      if (edge.to !== graph.solutionNodeId) continue;
      if (edge.from.every((id) => clueNodeIds.has(id))) {
        violations.push(
          `${p}: SolutionNode directly reached from ClueNodes-only edge ` +
          `[${edge.from.join(", ")}] → '${graph.solutionNodeId}' — answer too direct, add InferenceNode`,
        );
      }
    }
  }

  return violations;
}

// ── PuzzleGraph generation (Phase 3a) ────────────────────────────────────────

async function generatePuzzleGraphs(ws: WorldState): Promise<PuzzleGraph[]> {
  const worldContext = JSON.stringify(
    {
      items: Object.fromEntries(
        Object.entries(ws.items).map(([id, item]) => [
          id,
          { name: item.name, description: item.description, locationId: item.locationId },
        ]),
      ),
      locations: Object.fromEntries(
        Object.entries(ws.locations).map(([id, loc]) => [
          id,
          { name: loc.name, description: loc.description },
        ]),
      ),
      puzzles: Object.fromEntries(
        Object.entries(ws.puzzles).map(([id, puz]) => [
          id,
          { description: puz.description, solution: puz.solution },
        ]),
      ),
    },
    null,
    2,
  );

  const { object: raw, usage } = await generateObject({
    model: google(MODEL),
    output: "no-schema",
    system: PUZZLE_GRAPH_SYSTEM_PROMPT,
    prompt: `Formalize the reasoning chain for each puzzle as a PuzzleGraph.\n\nWorld:\n${worldContext}`,
  });
  logUsage(MODEL, usage);

  const rawGraphs = raw as Record<string, unknown>;
  const graphs: PuzzleGraph[] = [];

  for (const [puzzleId, entry] of Object.entries(rawGraphs)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    // Normalise: ensure puzzleId field matches the dict key
    const nodes: Record<string, unknown> = {};
    const rawNodes = e["nodes"] as Record<string, unknown> | undefined;
    if (rawNodes) {
      for (const [nid, nval] of Object.entries(rawNodes)) {
        if (nval && typeof nval === "object") {
          nodes[nid] = { ...(nval as object), id: nid };
        }
      }
    }

    graphs.push({
      puzzleId,
      nodes: nodes as PuzzleGraph["nodes"],
      edges: (e["edges"] as PuzzleGraph["edges"]) ?? [],
      solutionNodeId: (e["solutionNodeId"] as string) ?? "",
    });
  }

  return graphs;
}

// ── PuzzleGraph orchestration helper ─────────────────────────────────────────

async function generateAndValidateGraphs(
  ws: WorldState,
  attempt: number,
  context: string,
): Promise<"ok" | "fail"> {
  let graphs: PuzzleGraph[];
  try {
    graphs = await generatePuzzleGraphs(ws);
  } catch (err) {
    console.warn(
      `scenarioGenerator attempt ${attempt} [${context}] graph_fail=generation_error:`,
      describeError(err),
    );
    return "fail";
  }

  const graphViolations = validatePuzzleGraphs(ws, graphs);
  if (graphViolations.length > 0) {
    console.warn(
      `scenarioGenerator attempt ${attempt} [${context}] graph_fail=validation world_ok=true violations:`,
      graphViolations,
    );
    return "fail";
  }

  ws.puzzleGraphs = Object.fromEntries(graphs.map((g) => [g.puzzleId, g]));
  return "ok";
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
        deriveHiddenFields(ws);
        const logicViolations = validateScenarioLogic(ws);
        if (logicViolations.length > 0) {
          console.warn(
            `scenarioGenerator attempt ${attempt} logic violations:`,
            logicViolations,
          );
          continue;
        }
        const lexViolations = validateLexicalConsistency(ws);
        if (lexViolations.length > 0) {
          console.warn(
            `scenarioGenerator attempt ${attempt} lexical violations:`,
            lexViolations,
          );
          continue;
        }
        // [3a] PuzzleGraph: generate causal inference chains + structural validation
        if (await generateAndValidateGraphs(ws, attempt, "primary") === "fail") continue;
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
          deriveHiddenFields(ws);
          const logicViolations = validateScenarioLogic(ws);
          if (logicViolations.length > 0) {
            console.warn(
              `scenarioGenerator attempt ${attempt} recovery logic violations:`,
              logicViolations,
            );
          } else {
            const lexViolations = validateLexicalConsistency(ws);
            if (lexViolations.length > 0) {
              console.warn(
                `scenarioGenerator attempt ${attempt} recovery lexical violations:`,
                lexViolations,
              );
            } else {
              // [3a] PuzzleGraph: generate causal inference chains + structural validation
              if (await generateAndValidateGraphs(ws, attempt, "recovery") === "ok") {
                console.warn(
                  `scenarioGenerator attempt ${attempt} recovered via normalize` +
                    ` locations=${Object.keys(ws.locations).length}` +
                    ` items=${Object.keys(ws.items).length}`,
                );
                return ws;
              }
              // graph fail: fall through to outer console.warn → next attempt
            }
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
        hidden: false,
        belongsTo: null,
      },
      "office-desk": {
        id: "office-desk",
        name: "Office Desk",
        description: "A classic long black oak desk. A worn notebook rests on top.",
        locationId: "studio",
        isTakeable: false,
        isLocked: false,
        hidden: false,
        belongsTo: null,
      },
      notebook: {
        id: "notebook",
        name: "Notebook",
        description: "Nothing on it except a small number handwritten in the margin: 79.",
        locationId: "studio",
        isTakeable: true,
        isLocked: false,
        hidden: false,
        belongsTo: null,
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

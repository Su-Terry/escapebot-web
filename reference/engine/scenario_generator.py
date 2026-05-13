"""Scenario Generator: one-time call per new game using Gemini 2.5-pro.

Falls back to Level 1 JSON scenario after 2 failed generation attempts.
Prompt caching deferred to Phase 2.
"""
from __future__ import annotations

import json
import logging

from google import genai
from google.genai import types
from pydantic import ValidationError

from .models import Item, Location, Puzzle, WinCondition, WorldState

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-pro"

# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """
You are a creative designer for text-adventure escape room games. Your task is to generate a
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
  "session_id": "<string — the player's username, passed to you in the user turn>",
  "current_location_id": "<string — must be a key in locations, the player's starting room>",
  "locations": {
    "<location_id>": {
      "id": "<string — kebab-case, globally unique>",
      "name": "<string — short display name>",
      "description": "<string — 30-50 中文字, 列出場所特徵和可互動物件, 不要文藝鋪墊>",
      "item_ids": ["<item_id>", ...],
      "connected_location_ids": ["<location_id>", ...]
    }
  },
  "items": {
    "<item_id>": {
      "id": "<string — kebab-case, globally unique>",
      "name": "<string — short display name>",
      "description": "<string — 15-30 中文字, 列關鍵特徵, 自然嵌入線索>",
      "location_id": "<string — location_id where item starts, or 'inventory'>",
      "is_takeable": <bool>,
      "is_locked": <bool — true if another item is required to pick this up>,
      "unlock_item_id": "<string or null>"
    }
  },
  "inventory": [],
  "puzzles": {
    "<puzzle_id>": {
      "id": "<string — kebab-case>",
      "location_id": "<string>",
      "description": "<string — 15-30 中文字, 謎題機制, 不含答案>",
      "solution": "<string — exact answer player must type; ≤ 20 chars; derivable from clues>",
      "is_solved": false,
      "reward_item_id": "<string or null>"
    }
  },
  "win_condition": {
    "description": "<string>",
    "target_location_id": "<string>",
    "required_solved_puzzle_ids": ["<puzzle_id>", ...],
    "is_met": false
  },
  "turn_count": 0,
  "is_won": false,
  "history": [
    {
      "action": "",
      "narration": "<string — 60-80 中文字, 介紹場景和玩家狀態, 口語不文藝>"
    }
  ]
}

## Design Rules

### Locations
- Create 3 to 5 locations total.
- Locations must be connected bidirectionally (if A connects to B, B must connect to A).
- One location is the starting location (current_location_id).
- One location is the win target. The win target must be reachable only after solving puzzles.

### Items
- Create 4 to 8 items total; at least 2 must be takeable (is_takeable: true).
- Takeable items: small objects (notebooks, keys, coins, keycards, etc.).
- Non-takeable: furniture or large objects (desks, bookcases, machines).
- Locked items (is_locked: true) need another item in inventory before they can be taken.
- All items must start in a location (not inventory). inventory starts as [].

### Puzzles
- Create 2 to 3 puzzles.
- Solutions must be ≤ 20 characters and derivable from in-world clues.
- Solution must NOT appear literally in puzzle description.
- reward_item_id: optional item placed in location when puzzle is solved.

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
- Player wins by reaching target_location_id with all required_solved_puzzle_ids solved.
- Do not make the win target trivially reachable from start.

### Clue Design
- Embed clues naturally in item/location descriptions.
- Splitting clues across two items is encouraged (e.g. first two digits on one, last two on another).

### Description Style — STRICT
字數上限 (超出視為違規):
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

The `locations`, `items`, and `puzzles` fields are JSON objects (dicts).
The KEY for each entry MUST be the exact same string as the `id` field inside that entry.

CORRECT:
  "locations": {
    "cryo-bay": { "id": "cryo-bay", "name": "冷凍艙", ... }
  }

WRONG — key does not match id:
  "locations": {
    "冷凍艙": { "id": "cryo-bay", ... }
  }

Every cross-reference (current_location_id, item.location_id, puzzle.location_id,
connected_location_ids, item_ids, unlock_item_id, reward_item_id, required_solved_puzzle_ids)
must use the kebab-case id strings, NOT display names.

## Referential Integrity (CRITICAL — check before responding)

1. current_location_id is a key in locations AND matches a location's id field.
2. win_condition.target_location_id is a key in locations.
3. All ids in required_solved_puzzle_ids are keys in puzzles.
4. All connected_location_ids in each location are keys in locations (bidirectional).
5. All item_ids in each location are keys in items.
6. All item.location_id values are a key in locations or the string "inventory".
7. If item.unlock_item_id is set, it is a key in items.
8. All puzzle.location_id values are keys in locations.
9. If puzzle.reward_item_id is set, it is a key in items.
10. inventory is empty [].

Any violation causes rejection and retry. Verify all references before responding.
""".strip()


# ── Generation ────────────────────────────────────────────────────────────────

class ScenarioGenerationError(Exception):
    pass


async def generate(username: str) -> WorldState:
    """Generate a fresh WorldState.

    Retries up to 2 times on failure, then silently falls back to Level 1.
    """
    for attempt in range(3):
        try:
            return await _call_gemini(username)
        except Exception as exc:
            logger.warning(
                "Scenario generation attempt %d/3 failed for user %s: %s",
                attempt + 1, username, exc,
            )

    logger.error(
        "Scenario generation failed after 3 attempts for user %s; using Level 1 fallback",
        username,
    )
    return _load_level1_fallback(username)


def _normalize_world_state_dict(data: dict) -> dict:
    """Normalise locations/items/puzzles dicts so keys match the internal id field.

    Gemini may use display names as dict keys ("Cryo Bay") while the id field
    is kebab-case ("cryo-bay"), OR it may use the kebab-case key directly but
    omit the id field inside the object.  Both cases are handled:
    - If obj has an 'id' field → re-key using obj['id']
    - If obj lacks 'id' → inject the existing dict key as the id
    """
    data = dict(data)
    for field in ("locations", "items", "puzzles"):
        blob = data.get(field)
        if not isinstance(blob, dict):
            continue
        normalized: dict = {}
        for old_key, obj in blob.items():
            if not isinstance(obj, dict):
                continue
            obj = dict(obj)
            # Use id field if present, otherwise treat the existing key as the id
            obj_id = obj.get("id") or old_key
            obj["id"] = obj_id  # ensure id field exists
            normalized[obj_id] = obj
        data[field] = normalized
    return data


async def _call_gemini(username: str) -> WorldState:
    client = genai.Client()  # fresh client each call avoids event-loop issues in tests
    user_prompt = f"Generate an escape room scenario. The player's username is: {username}"

    config = types.GenerateContentConfig(
        system_instruction=_SYSTEM_PROMPT,
        response_mime_type="application/json",
        # response_schema omitted: after stripping additionalProperties for Gemini
        # compatibility, dict[str, Location/Item/Puzzle] collapses to {type:object}
        # with no value guidance. The system prompt provides the full JSON structure.
    )

    response = await client.aio.models.generate_content(
        model=_MODEL,
        contents=user_prompt,
        config=config,
    )

    _log_usage(_MODEL, response)

    raw = response.text or ""
    data = _normalize_world_state_dict(json.loads(raw))
    ws = WorldState.model_validate(data)
    ws.session_id = username
    return ws


def _log_usage(model: str, response) -> None:
    usage = getattr(response, "usage_metadata", None)
    if usage:
        logger.info(
            "llm_call model=%s input=%d output=%d cached=%d",
            model,
            getattr(usage, "prompt_token_count", 0),
            getattr(usage, "candidates_token_count", 0),
            getattr(usage, "cached_content_token_count", 0),
        )


# ── Level 1 fallback ─────────────────────────────────────────────────────────

def _load_level1_fallback(username: str) -> WorldState:
    """Convert level/1.json into a WorldState. This is a fixed baseline experience."""
    return WorldState(
        session_id=username,
        current_location_id="studio",
        locations={
            "studio": Location(
                id="studio",
                name="Studio",
                description=(
                    "A cramped 6m² studio. You wake up lying on a comfortable recliner. "
                    "In front of you is a classic long black oak desk. "
                    "To the left is a large french window letting in fresh air. "
                    "To the right is a door with a digital lock. "
                    "The low white ceiling feels close. You need to escape."
                ),
                item_ids=["recliner", "office-desk", "notebook"],
                connected_location_ids=["corridor"],
            ),
            "corridor": Location(
                id="corridor",
                name="Corridor",
                description="The corridor outside the studio. You made it.",
                item_ids=[],
                connected_location_ids=["studio"],
            ),
        },
        items={
            "recliner": Item(
                id="recliner",
                name="Recliner",
                description="A comfortable recliner. You woke up on it.",
                location_id="studio",
                is_takeable=False,
            ),
            "office-desk": Item(
                id="office-desk",
                name="Office Desk",
                description="A classic long black oak desk. A worn notebook rests on top.",
                location_id="studio",
                is_takeable=False,
            ),
            "notebook": Item(
                id="notebook",
                name="Notebook",
                description="Nothing on it except a small number handwritten in the margin: 79.",
                location_id="studio",
                is_takeable=True,
            ),
        },
        puzzles={
            "door-lock": Puzzle(
                id="door-lock",
                location_id="studio",
                description=(
                    "A digital door lock with a 4-digit keypad. "
                    "Someone has scrawled a clue on the ceiling in faint letters: "
                    "'Ang unang duha ka numero mao ang 45' (The first two numbers are 45)."
                ),
                solution="4579",
            )
        },
        win_condition=WinCondition(
            description="Unlock the door lock and escape to the corridor.",
            target_location_id="corridor",
            required_solved_puzzle_ids=["door-lock"],
        ),
        history=[
            {
                "action": "",
                "narration": (
                    "Where am I? You wake up lying on a comfortable recliner in a cramped studio. "
                    "In front of you is a long oak desk with something on it. "
                    "A large window lets in fresh air on your left. "
                    "On your right, a door — locked. "
                    "The ceiling has a faint message you can almost make out. "
                    "You need to escape."
                ),
            }
        ],
    )

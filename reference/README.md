# Reference: Phase 1 Python Engine

This directory contains the **read-only reference implementation** of EscapeBot engine
from the Phase 1 Python Discord bot project.

**Purpose**: Ground truth for porting to TypeScript in `src/lib/engine/`.

**Source**: github.com/Su-Terry/EscapeBot (commit at time of copy)

## Port philosophy

When porting any module from `reference/engine/` to `src/lib/engine/`:

1. **Logic: 1:1 translation** (preserve game semantics)
2. **Naming: snake_case → camelCase**
3. **Stack upgrades**:
   - Pydantic → Zod
   - JSON file storage → Drizzle + Postgres
   - Google Gemini SDK → Vercel AI SDK
   - Discord adapter → Server Action / API route
4. **System prompt strings**: copy verbatim (LLM behavior depends on exact wording)

## Do not modify

This directory is reference only. Edits go in `src/lib/engine/`.

## Key files

- `models.py` → Pydantic models (WorldState, Item, Location, Puzzle, Player)
- `rule_enforcer.py` → validates LLM-proposed state changes
- `scenario_generator.py` → generates new scenario via Gemini 2.5 Pro
- `turn_handler.py` → processes player input via Gemini 2.5 Flash
- `session_store.py` → JSON file persistence (TO BE REPLACED with Drizzle)
- `__init__.py` → orchestration (generate, process_turn entry points)

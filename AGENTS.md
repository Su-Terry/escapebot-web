# EscapeBot Web — Agent Instructions

This is the TypeScript / Next.js 15 web version of EscapeBot, an LLM-driven
Chinese text escape room game.

## Project context

Phase 1 was a Python Discord bot. Phase 2 is this web app — same game logic,
new stack. Python reference code lives in `reference/engine/`.

## Stack

- Next.js 16 (App Router, Turbopack, Server Actions, React 19)
- TypeScript strict mode
- Tailwind CSS v4 (PostCSS plugin, no `tailwind.config.ts`)
- shadcn/ui for components
- Drizzle ORM + Neon Postgres
- Vercel AI SDK + Google Gemini (`@ai-sdk/google`)
- Clerk for auth (Discord OAuth)
- Deploy: Vercel

## Conventions

- Path alias: `@/*` → `src/*`
- camelCase for TS (Python ref uses snake_case — convert during port)
- Server Actions preferred over REST API routes
- Zod schemas for all I/O validation
- No legacy React patterns (no class components, no `useEffect` for data fetching,
  prefer Server Components when possible)

## Port from Python

When porting code from `reference/engine/`:
- 1:1 logic translation, not refactor
- Pydantic models → Zod schemas
- JSON file storage → Drizzle + Postgres
- Google Gemini SDK → Vercel AI SDK
- Discord adapter → Server Action / API route
- Preserve system prompt strings verbatim (Chinese content unchanged)

## Don'ts

- No `tailwind.config.ts` (Tailwind v4 uses CSS-only config via `@theme`)
- No `pages/` directory (App Router only)
- No Redux / Zustand unless explicitly needed (Server Components + useState should cover most)
- Don't add `useMemo` / `useCallback` proactively (React Compiler / good React practice handles it)

## Game-specific knowledge

EscapeBot is an LLM-driven text escape room. Key concepts:
- `WorldState`: full game state (locations, items, puzzles, player)
- Scenario Generator: LLM call that creates a new scenario (~30-60s)
- Turn Handler: LLM call per player action (~3-5s) — produces narration + state changes
- Rule Enforcer: validates LLM-proposed state changes against game rules
- Game flow: `escape N` → generate scenario → loop (player action → turn handler → rule enforcer → narration) → win condition met → end

When in doubt, read `reference/engine/__init__.py` for the orchestration logic.

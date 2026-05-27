import { z } from "zod";

// ── Location ──────────────────────────────────────────────────────────────────

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  itemIds: z.array(z.string()).default([]),
  connectedLocationIds: z.array(z.string()).default([]),
  /** Puzzle IDs that must all be solved before the player can enter this location */
  lockedByPuzzleIds: z.array(z.string()).default([]),
});
export type Location = z.infer<typeof LocationSchema>;

// ── Item ──────────────────────────────────────────────────────────────────────

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** sentinel: "inventory" */
  locationId: z.string(),
  isTakeable: z.boolean(),
  isLocked: z.boolean().default(false),
  /** item required in inventory to take this */
  unlockItemId: z.string().nullable().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

// ── Puzzle ────────────────────────────────────────────────────────────────────

export const PuzzleSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  description: z.string(),
  /** server-side only — stripped before sending to LLM */
  solution: z.string(),
  isSolved: z.boolean().default(false),
  /** item placed in location on solve */
  rewardItemId: z.string().nullable().optional(),
});
export type Puzzle = z.infer<typeof PuzzleSchema>;

// ── WinCondition ──────────────────────────────────────────────────────────────

export const WinConditionSchema = z.object({
  description: z.string(),
  targetLocationId: z.string(),
  requiredSolvedPuzzleIds: z.array(z.string()).default([]),
  isMet: z.boolean().default(false),
});
export type WinCondition = z.infer<typeof WinConditionSchema>;

// ── StateChange ───────────────────────────────────────────────────────────────

export const StateChangeTypeSchema = z.enum([
  "move_player",
  "take_item",
  "use_item",
  "move_item",
  "solve_puzzle",
]);
export type StateChangeType = z.infer<typeof StateChangeTypeSchema>;

export const StateChangeSchema = z.object({
  type: StateChangeTypeSchema,
  itemId: z.string().nullable().optional(),
  fromLocation: z.string().nullable().optional(),
  toLocation: z.string().nullable().optional(),
  puzzleId: z.string().nullable().optional(),
  /** LLM must actively fill; default null */
  attemptedSolution: z.string().nullable().optional(),
});
export type StateChange = z.infer<typeof StateChangeSchema>;

// ── TurnResult ────────────────────────────────────────────────────────────────

export const TurnResultSchema = z.object({
  narration: z.string(),
  stateChanges: z.array(StateChangeSchema).default([]),
  isWon: z.boolean().default(false),
});
export type TurnResult = z.infer<typeof TurnResultSchema>;

// ── WorldState ────────────────────────────────────────────────────────────────

// TODO: port @model_validator _check_referential_integrity — verify refs across locations/items/puzzles/inventory
// TODO: port safe_context() as standalone safeContext(state: WorldState): Omit<WorldState, never> — strips puzzle solutions before LLM context

export const WorldStateSchema = z.object({
  sessionId: z.string(),
  currentLocationId: z.string(),
  locations: z.record(z.string(), LocationSchema),
  items: z.record(z.string(), ItemSchema),
  inventory: z.array(z.string()).default([]),
  puzzles: z.record(z.string(), PuzzleSchema),
  winCondition: WinConditionSchema,
  turnCount: z.number().int().default(0),
  isWon: z.boolean().default(false),
  /** Short atmospheric title for the whole scenario, e.g. 「廢棄的深空研究站」 */
  scenarioTitle: z.string().default(""),
  /** [{action, narration}, …] */
  history: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type WorldState = z.infer<typeof WorldStateSchema>;

// Scenario-generation validator — enforces minimum content counts so that an
// empty-but-schema-valid LLM response is rejected and retried.
// Not used in turnHandler or sessionStore, which work with any valid WorldState.
export const validatedWorldStateSchema = WorldStateSchema
  .refine((ws) => Object.keys(ws.locations).length >= 3, {
    message: "Scenario requires at least 3 locations",
  })
  .refine((ws) => Object.keys(ws.items).length >= 4, {
    message: "Scenario requires at least 4 items",
  })
  .refine((ws) => Object.keys(ws.puzzles).length >= 2, {
    message: "Scenario requires at least 2 puzzles",
  });

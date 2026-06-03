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
  /** true until player examines the parent item — not shown in scene or sent to LLM */
  hidden: z.boolean().default(false),
  /** id of the item (furniture/container) that, when examined, reveals this item */
  belongsTo: z.string().nullable().default(null),
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

// ── PuzzleGraph (Phase 3a) ────────────────────────────────────────────────────
//
// Represents the causal inference chain of a single puzzle.
// Generated alongside WorldState; stored in ws.puzzleGraphs for downstream use (3c judge).
//
// Validation scope (3a): structural self-consistency only.
//   - All ClueNode.sourceRef references exist in ws.items or ws.locations.
//   - SolutionNode is forward-reachable from ClueNodes via declared edges.
//   - No edge goes directly from ClueNodes-only to SolutionNode (path length ≥ 2).
// NOT validated in 3a: whether groundingProof text actually appears in the
//   referenced description. That is Phase 3b (groundingProof vs description cross-check).

export const InferenceTypeSchema = z.enum([
  "extract",         // value directly readable from clue description text
  "combine",         // multiple values joined by an explicit rule in a description
  "order-by-index",  // items sorted by numeric positions given explicitly in descriptions
  "order-by-rule",   // items sorted by a rule explicitly stated in a description (no real-world knowledge)
]);
export type InferenceType = z.infer<typeof InferenceTypeSchema>;

export const PuzzleNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["clue", "inference", "solution"]),
  label: z.string(),
  /**
   * clue nodes only: the item.id or location.id whose description provides raw information.
   * MUST NOT be a puzzle.id — puzzle descriptions are mechanism hints, not clues.
   */
  sourceRef: z.string().optional(),
});
export type PuzzleNode = z.infer<typeof PuzzleNodeSchema>;

export const PuzzleEdgeSchema = z.object({
  from: z.array(z.string()),  // all premise node ids (hyperedge: all must be reachable)
  to: z.string(),             // conclusion node id
  inferenceType: InferenceTypeSchema,
  /**
   * Specific text from an item/location description that enables this inference.
   * 3a does NOT verify this against description text — that is 3b.
   * 3a only checks that the graph is structurally self-consistent (reachability, path length).
   * Inspect groundingProof manually in stress-gen dump to catch LLM fabrication early.
   */
  groundingProof: z.string(),
});
export type PuzzleEdge = z.infer<typeof PuzzleEdgeSchema>;

export const PuzzleGraphSchema = z.object({
  puzzleId: z.string(),
  nodes: z.record(z.string(), PuzzleNodeSchema),
  edges: z.array(PuzzleEdgeSchema),
  solutionNodeId: z.string(),
});
export type PuzzleGraph = z.infer<typeof PuzzleGraphSchema>;

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
  "examine_item",
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

// ── TurnResult (legacy — combined intent+narration, kept for handleTurn compat) ─

export const TurnResultSchema = z.object({
  narration: z.string(),
  stateChanges: z.array(StateChangeSchema).default([]),
  isWon: z.boolean().default(false),
});
export type TurnResult = z.infer<typeof TurnResultSchema>;

// ── Verdict (judge output for solve_puzzle) ───────────────────────────────────

export const VerdictSchema = z.object({
  verdict: z.enum(["solved", "ambiguous", "wrong"]),
  /** Logging only — never shown to players. */
  reason: z.string(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

// ── NarrationResult (Phase 4 output) ─────────────────────────────────────────

export const NarrationResultSchema = z.object({
  narration: z.string(),
  /**
   * Structured list of what this narration describes.
   * Format: "apply:{type}", "reject:{type}", "apply:solve_puzzle:solved",
   *         "reject:solve_puzzle:{verdict}", "query"
   * Engine cross-checks against actual appliedChanges + rejectedChanges.
   */
  acknowledgedOutcomes: z.array(z.string()).default([]),
});
export type NarrationResult = z.infer<typeof NarrationResultSchema>;

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
  /**
   * Phase 3a: causal inference graphs, one per puzzle. Keyed by puzzle.id.
   * Optional for backward compat — old sessions without this field remain valid.
   * Generated at scenario creation; consumed by judge (Phase 3c).
   */
  puzzleGraphs: z.record(z.string(), PuzzleGraphSchema).optional(),
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

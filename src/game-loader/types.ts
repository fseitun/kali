import type { GameState, PrimitiveAction, SquareData } from "@/orchestrator/types";

/**
 * Metadata about a game module.
 */
export interface GameMetadata {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  /** Win condition / objective for LLM context. */
  objective: string;
  /** Initial habitat label for game.currentHabitat. Default "Start". */
  initialHabitat?: string;
  /** Optional short summary for NARRATE explanations (2-3 sentences). Not sent as full rules. */
  summary?: string;
  /**
   * Optional few-shot examples for the LLM (user line + primitive actions). Up to 6 are sent.
   * When empty or omitted, Kalimba falls back to built-in examples; other games have none unless set here or in code.
   */
  llmExamples?: Array<{ user: string; actions: PrimitiveAction[] }>;
}

/**
 * Display configuration for state formatting.
 */
export interface StateDisplayConfig {
  primary?: string[];
  secondary?: string[];
  hidden?: string[];
}

/**
 * State display metadata for controlling what gets shown in logs.
 */
export interface StateDisplayMetadata {
  game?: StateDisplayConfig;
  players?: StateDisplayConfig;
  board?: StateDisplayConfig;
}

/**
 * Deterministic encounter question used during animal encounters.
 */
export interface EncounterQuestion {
  kali: string;
  question: string;
  options: [string, string, string, string];
  correctOption: string;
}

/**
 * Per-animal encounter question bank grouped by locale.
 */
export interface EncounterQuestionBankByAnimal {
  "es-AR"?: EncounterQuestion[];
  "en-US"?: EncounterQuestion[];
}

/**
 * Internal segment after normalizing `HabitatDefinition`: one index or inclusive `[lo, hi]`.
 */
export type HabitatSegment = number | [number, number];

/**
 * How each habitat name maps to square indices (merged at load). **Flat only** — no nested arrays.
 *
 * - **Single index:** `130`
 * - **One inclusive range:** `[0, 39]`
 * - **Several ranges:** flat pairs back-to-back, e.g. `[0, 5, 10, 12]` → 0–5 and 10–12
 */
export type HabitatDefinition = number | readonly number[];

/**
 * Raw config input. Squares-only format; board, game, and players are derived at load.
 */
export interface GameConfigInput {
  metadata: GameMetadata;
  soundEffects?: Record<string, string>;
  customActions?: string[];
  stateDisplay?: StateDisplayMetadata;
  /** Deterministic encounter question bank by animal name and locale. */
  encounterQuestions?: Record<string, EncounterQuestionBankByAnimal>;
  /**
   * When non-empty, every square `0..win` must appear exactly once across all habitats.
   * Merged onto `board.squares[n].habitat` at load (overrides any `habitat` on authored squares).
   */
  habitat?: Record<string, HabitatDefinition>;
  /** Squares 0..boardLength with explicit next/prev. Board, game, and players derived from this. */
  squares?: Record<string, SquareData>;
}

/**
 * Complete game module definition loaded from JSON.
 */
export interface GameModule {
  metadata: GameMetadata;
  initialState: GameState;
  soundEffects?: Record<string, string>;
  customActions?: string[];
  stateDisplay?: StateDisplayMetadata;
}

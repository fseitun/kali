export enum GamePhase {
  SETUP = "SETUP",
  PLAYING = "PLAYING",
  FINISHED = "FINISHED",
}

/**
 * Core game metadata that all games have.
 */
export interface GameMeta {
  name: string;
  phase: GamePhase;
  turn: string | null;
  winner: string | null;
  playerOrder: string[];
  [key: string]: unknown; // Allow game-specific fields
}

/**
 * Base player structure that all games have.
 */
export interface Player {
  id: string;
  name: string;
  position: number;
  [key: string]: unknown; // Allow game-specific fields (activeChoices, instruments, etc.)
}

/**
 * Board configuration with common fields.
 * winPosition, magicDoorPosition, magicDoorTarget are derived from squares at runtime (board-helpers).
 */
export interface BoardConfig {
  squares?: Record<string, SquareData>;
  [key: string]: unknown; // Allow game-specific fields
}

/**
 * Square data for board squares.
 * Mechanics are inferred from properties (effect, destination, item, name+power, etc.); optional `kind` overrides.
 * Graph topology: next/prev define edges; nextOnLanding/prevOnLanding apply only when the square is the final step of a roll.
 */
export interface SquareData {
  name?: string;
  power?: number;
  habitat?: string;
  effect?: string;
  destination?: number;
  item?: string;
  instrument?: string;
  heart?: boolean;
  /**
   * Kalimba ocean–forest portal (e.g. square 82): marks the one-shot 82→45 penalty square for BoardEffectsHandler.
   */
  oceanForestOneShotPortal?: boolean;
  /**
   * Forward edges: either a single path `number[]` or a fork map (target index string → phrases for that branch).
   */
  next?: number[] | Record<string, string[]>;
  /** Backward edges: linear `number[]` or fork map (target index → phrases), same shape as `next`. */
  prev?: number[] | Record<string, string[]>;
  /** Jump applied only when this square is the final step of a roll (e.g. 93→97) */
  nextOnLanding?: number[];
  /** Applied on backward roll endings when not overridden by retreat inversion (see BoardEffectsHandler / board-traversal). */
  prevOnLanding?: number[];
  [key: string]: unknown; // Allow game-specific fields
}

/**
 * Decision points for player choices.
 * When positionOptions is set, the answer maps to a target position.
 */
export interface DecisionPoint {
  position: number;
  prompt: string;
  /** Maps answer to target position for branch choices (e.g. 96 → 97 or 99) */
  positionOptions?: Record<string, number>;
  /** Per-target phrases for fork resolution (includes implicit target number strings). */
  choiceKeywords?: Record<string, string[]>;
  /** When omitted, treated as forward (normal dice). Backward uses `prev` forks. */
  direction?: "forward" | "backward";
}

/**
 * Complete game state structure.
 * All games have game, players, and optionally board.
 * decisionPoints are derived from board.squares at runtime (getDecisionPoints).
 */
export interface GameState {
  game: GameMeta;
  players: Record<string, Player>;
  board?: BoardConfig;
  [key: string]: unknown; // Allow additional top-level fields
}

/**
 * Context passed through orchestrator execution. Distinguishes top-level (user-initiated)
 * from nested calls (from board effects or decision-point enforcement).
 */
export interface ExecutionContext {
  /** When true, call originated from board effects or decision-point enforcement, not user. */
  isNestedCall?: boolean;
  /** When true, skip decision point enforcement after actions (e.g. proactive start). */
  skipDecisionPointEnforcement?: boolean;
  /** Set when power check fails and turn was advanced; app should announce next player. */
  turnAdvancedAfterPowerCheckFail?: { playerId: string; name: string; position: number };
  /**
   * Set when magic door open attempt finished; same shape as power-check mechanical advance for app TTS.
   */
  turnAdvancedAfterMagicDoorOpen?: { playerId: string; name: string; position: number };
  /**
   * Set when power-check win used Kalimba §2B full graph advance; orchestrator advanced `game.turn`
   * mechanically so the app announces the next player (same UX as `turnAdvancedAfterPowerCheckFail`).
   */
  turnAdvancedAfterPowerCheckWin?: { playerId: string; name: string; position: number };
  /** After magic door open attempt, skip LLM movement NARRATE in the same batch (orchestrator spoke outcome). */
  skipTrailingNarrateAfterMagicDoorAttempt?: boolean;
  /** Set when power check/revenge was handled; skip trailing NARRATE from LLM (orchestrator speaks pass/fail). */
  skipTrailingNarrateForPowerCheck?: boolean;
  /**
   * Allows turn advancement despite `skipTrailingNarrateForPowerCheck` after power-check/revenge
   * resolution: (1) skip-turn trap on the landing square, (2) power/revenge win where the
   * winning roll already advanced the token along the graph (Kalimba §2B/C), or (3) stable
   * `winJumpTo` landing (token still on the jump target after `checkAndApplyBoardMoves`).
   * See `RiddlePowerCheckHandler.handlePowerCheckWin`.
   */
  advanceTurnDespitePowerCheckSuppress?: boolean;
  /** Set when we just spoke a NARRATE that asks for the current decision; skip enforceDecisionPoints this round. */
  justNarratedDecisionAsk?: boolean;
  /** Paths (e.g. players.p1.position) set by PLAYER_ROLLED this run; SET_STATE for these is ignored to avoid overwriting the roll. */
  positionPathsSetByRoll?: Set<string>;
  /** Set when checkAndApplyBoardMoves applies a ladder/teleport; the square the player came from. */
  arrivedViaTeleportFrom?: number;
  /**
   * When set to a square index, `checkAndApplyBoardMoves` ignores that square's `nextOnLanding` / numeric
   * `destination` once (used so a player placed on 45 after a golden-fox bump does not immediately chain 45→82).
   */
  suppressNextOnLandingAtPosition?: number;
  /**
   * Set when the player landed on Golden Fox (`jumpToLeader`) and ended on a different square after
   * board moves (including leader-square portal). Used so `NARRATE` can speak the real final cell.
   */
  jumpToLeaderRelocated?: { toPosition: number };
  /**
   * Set when movement ended past the magic door and the orchestrator bounced the token back.
   * Consumed on the next movement `NARRATE` in the same batch for deterministic rule + position TTS.
   */
  magicDoorBounce?: {
    playerId: string;
    doorPosition: number;
    overshotPosition: number;
    finalPosition: number;
  };
  /**
   * Set when a skull-square teleport sends the current player back to the snake head.
   * Consumed on the next movement `NARRATE` in the same batch for deterministic explanation.
   */
  skullReturnToSnakeHead?: {
    playerId: string;
    fromSquare: number;
    toSquare: number;
  };
  /**
   * After a completed movement PLAYER_ROLLED (non-nested), the graph-resolved landing square for the
   * next NARRATE in the same batch. Consumed in executeNarrate for deterministic position TTS; cleared
   * if the batch ends without a matching NARRATE.
   */
  pendingMovementRollNarration?: { playerId: string; roll: number; square: number };
}

/**
 * Classifiers for successful primitive batches that may need app-layer voice fallback when the LLM omitted NARRATE.
 */
export interface VoiceOutcomeHints {
  /**
   * Fork or branch choice was stored via PLAYER_ANSWERED or SET_STATE on activeChoices without PLAYER_ROLLED,
   * and the batch contained no NARRATE.
   */
  forkChoiceResolvedWithoutNarrate?: boolean;
}

/**
 * Discriminated union describing how the app should handle turn advancement
 * after the orchestrator finishes processing a transcript.
 */
export type TurnAdvance =
  | { kind: "none" }
  | { kind: "callAdvanceTurn" }
  | { kind: "alreadyAdvanced"; nextPlayer: { playerId: string; name: string; position: number } };

/**
 * Result of orchestrator transcript or direct primitive execution (gameplay paths).
 */
export interface OrchestratorGameplayResult {
  success: boolean;
  turnAdvance: TurnAdvance;
  /** Present on successful top-level runs when the batch matches a silent-success pattern for voice policy. */
  voiceOutcomeHints?: VoiceOutcomeHints;
}

/** Shared failure result — no turn advance, no voice hints. */
export const FAILED_RESULT: OrchestratorGameplayResult = {
  success: false,
  turnAdvance: { kind: "none" },
};

export type ActionHandler = (action: PrimitiveAction, context: ExecutionContext) => Promise<void>;

/**
 * Union type of all primitive actions that the orchestrator can execute.
 *
 * Design Philosophy:
 * - LLM is a thin interface that reports events, not calculates state
 * - Orchestrator owns all game logic and state calculations
 * - Primitives are deterministic and testable
 */
export type PrimitiveAction =
  | NarrateAction
  | ResetGameAction
  | SetStateAction
  | PlayerRolledAction
  | PlayerAnsweredAction
  | AskRiddleAction;

/**
 * Speaks text aloud via TTS and optionally plays a sound effect.
 * LLM's primary job: natural language generation.
 */
export interface NarrateAction {
  action: "NARRATE";
  text: string;
  soundEffect?: string;
}

/**
 * Resets the game state to initial conditions.
 * Management action for starting new games.
 */
export interface ResetGameAction {
  action: "RESET_GAME";
  keepPlayerNames: boolean;
}

/**
 * Sets a value in game state using dot-notation path.
 * Used ONLY for user corrections/overrides (e.g., "we're both at position 50").
 * NOT for calculated state changes (those use event-based primitives like PLAYER_ROLLED).
 */
export interface SetStateAction {
  action: "SET_STATE";
  path: string;
  value: unknown;
}

/**
 * Reports that a player rolled dice and the resulting value.
 * Orchestrator calculates position change (position += value).
 * playerId is inferred from game.turn (current player).
 */
export interface PlayerRolledAction {
  action: "PLAYER_ROLLED";
  value: number;
}

/**
 * Reports a player's answer to a question posed by orchestrator.
 * Context is maintained by orchestrator (single-threaded conversation).
 * Used for: path choices, fight/flee decisions, riddle answers, etc.
 */
export interface PlayerAnsweredAction {
  action: "PLAYER_ANSWERED";
  answer: string;
}

/**
 * Asks a structured riddle with exactly four options during an animal encounter.
 * Orchestrator stores options and correctOption (and optional synonyms); when user answers with PLAYER_ANSWERED,
 * strict match (option text + synonyms) deterministically resolves the outcome.
 * The riddle MUST be about the animal kingdom (e.g. animals, habitats, behavior, diet, classification); it does not have to be this square's animal/habitat.
 */
export interface AskRiddleAction {
  action: "ASK_RIDDLE";
  text: string;
  options: [string, string, string, string];
  /** Exact text of the correct option (must equal one of the four options after normalization). */
  correctOption: string;
  /** Optional synonyms or common ways to say the correct option; strict match treats these as correct without calling the LLM. */
  correctOptionSynonyms?: string[];
}

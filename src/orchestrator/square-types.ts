/**
 * Special square kinds for Kalimba.
 * All squares in board.squares are special squares; `kind` encodes the primary mechanic.
 */

export const SPECIAL_SQUARE_KINDS = [
  "animal",
  "trap",
  "portal",
  "heart",
  "protectionItem",
  "hazard",
  "goldenFox",
  "magicDoor",
  "skull",
  "win",
  "rollAdvance",
  "rollDirectional",
] as const;

export type SpecialSquareKind = (typeof SPECIAL_SQUARE_KINDS)[number];

/**
 * Derives the square kind from config data. Supports legacy `type`+`effect` and new `kind` field.
 */
export function getSquareKind(squareData: Record<string, unknown>): SpecialSquareKind | null {
  const kind = squareData.kind as SpecialSquareKind | undefined;
  if (kind && SPECIAL_SQUARE_KINDS.includes(kind)) {
    return kind;
  }

  const type = squareData.type as string | undefined;
  const effect = squareData.effect as string | undefined;

  if (type === "animal") return "animal";
  if (type === "portal") return "portal";
  if (type === "item") {
    const item = squareData.item as string | undefined;
    if (item === "scimitar") return "heart";
    if (item === "torch" || item === "anti-wasp") return "protectionItem";
  }
  if (type === "hazard") {
    if (effect === "skipTurn") return "trap";
    if (effect === "checkTorch" || effect === "checkAntiWasp") return "hazard";
  }
  if (type === "special") {
    if (effect === "jumpToLeader") return "goldenFox";
    if (effect === "magicDoorCheck") return "magicDoor";
    if (effect === "returnTo187") return "skull";
    if (effect === "win") return "win";
    if (effect === "roll2d6Advance") return "rollAdvance";
    if (
      effect === "roll1d6Directional" ||
      effect === "roll2d6Directional" ||
      effect === "roll3d6Directional"
    ) {
      return "rollDirectional";
    }
  }

  return null;
}

/**
 * Squares that require power check + riddle before rewards. Rewards (points, heart, instrument)
 * must NOT be applied on landing; LLM applies after encounter resolution.
 */
export function isDeferredRewardKind(kind: SpecialSquareKind | null): boolean {
  return kind === "animal" || kind === "rollAdvance";
}

/**
 * Animal encounter flow: power check, then riddle, then rewards.
 */
export function isAnimalEncounterKind(kind: SpecialSquareKind | null): boolean {
  return kind === "animal";
}

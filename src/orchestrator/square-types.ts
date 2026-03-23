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
  "rollDirectional",
] as const;

export type SpecialSquareKind = (typeof SPECIAL_SQUARE_KINDS)[number];

function resolveItemKind(item: string | undefined): SpecialSquareKind | null {
  if (item === "scimitar") {
    return "heart";
  }
  if (item === "torch" || item === "anti-wasp") {
    return "protectionItem";
  }
  return null;
}

function resolveHazardKind(effect: string | undefined): SpecialSquareKind | null {
  if (effect === "skipTurn") {
    return "trap";
  }
  if (effect === "checkTorch" || effect === "checkAntiWasp") {
    return "hazard";
  }
  return null;
}

const SPECIAL_EFFECT_MAP: Record<string, SpecialSquareKind> = {
  jumpToLeader: "goldenFox",
  magicDoorCheck: "magicDoor",
  returnTo187: "skull",
  win: "win",
};

const ROLL_DIRECTIONAL_EFFECTS = ["roll1d6Directional", "roll2d6Directional", "roll3d6Directional"];

function resolveSpecialKind(effect: string | undefined): SpecialSquareKind | null {
  if (effect && SPECIAL_EFFECT_MAP[effect]) {
    return SPECIAL_EFFECT_MAP[effect];
  }
  if (effect && ROLL_DIRECTIONAL_EFFECTS.includes(effect)) {
    return "rollDirectional";
  }
  return null;
}

const TYPE_RESOLVERS: Record<
  string,
  (effect: string | undefined, item: string | undefined) => SpecialSquareKind | null
> = {
  animal: () => "animal",
  portal: () => "portal",
  item: (_effect, item) => resolveItemKind(item),
  hazard: (effect) => resolveHazardKind(effect),
  special: (effect) => resolveSpecialKind(effect),
};

function getSquareKindFromTypeEffect(
  type: string | undefined,
  effect: string | undefined,
  item: string | undefined,
): SpecialSquareKind | null {
  const fn = TYPE_RESOLVERS[type ?? ""];
  return fn ? fn(effect, item) : null;
}

/**
 * Derives the square kind from config data. Prefers `kind` if present; otherwise derives from type/effect/item.
 */
export function getSquareKind(squareData: Record<string, unknown>): SpecialSquareKind | null {
  const kind = squareData.kind as SpecialSquareKind | undefined;
  if (kind && SPECIAL_SQUARE_KINDS.includes(kind)) {
    return kind;
  }
  const type = squareData.type as string | undefined;
  const effect = squareData.effect as string | undefined;
  const item = squareData.item as string | undefined;
  return getSquareKindFromTypeEffect(type, effect, item);
}

/**
 * Squares that require power check + riddle before rewards. Rewards (points, heart, instrument)
 * must NOT be applied on landing; LLM applies after encounter resolution.
 */
export function isDeferredRewardKind(kind: SpecialSquareKind | null): boolean {
  return kind === "animal";
}

/**
 * Animal encounter flow: power check, then riddle, then rewards.
 */
export function isAnimalEncounterKind(kind: SpecialSquareKind | null): boolean {
  return kind === "animal";
}

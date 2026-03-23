/**
 * Special square kinds for Kalimba.
 * All squares in board.squares are special squares; `kind` encodes the primary mechanic.
 * Mechanics are derived from properties. Precedence (first match wins):
 * 1. Explicit `kind` 2. `effect` 3. `destination` (number) → portal 4. `item` 5. `name`+`power` (no effect) → animal 6. null
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

const SPECIAL_EFFECT_MAP: Record<string, SpecialSquareKind> = {
  jumpToLeader: "goldenFox",
  magicDoorCheck: "magicDoor",
  returnTo187: "skull",
  win: "win",
};

const ROLL_DIRECTIONAL_EFFECTS = ["roll1d6Directional", "roll2d6Directional", "roll3d6Directional"];

function kindFromEffect(effect: string | undefined): SpecialSquareKind | null {
  if (!effect) {
    return null;
  }
  if (effect === "skipTurn") {
    return "trap";
  }
  if (effect === "checkTorch" || effect === "checkAntiWasp") {
    return "hazard";
  }
  if (SPECIAL_EFFECT_MAP[effect]) {
    return SPECIAL_EFFECT_MAP[effect];
  }
  if (ROLL_DIRECTIONAL_EFFECTS.includes(effect)) {
    return "rollDirectional";
  }
  return null;
}

function isPortalSquare(sq: Record<string, unknown>): boolean {
  return (
    typeof sq.destination === "number" ||
    (Array.isArray(sq.nextOnLanding) && sq.nextOnLanding.length > 0)
  );
}

/**
 * Derives the square kind from config data.
 * Order: kind → effect → destination → item → animal (name+power, no effect) → null.
 */
export function getSquareKind(squareData: Record<string, unknown>): SpecialSquareKind | null {
  const kind = squareData.kind as SpecialSquareKind | undefined;
  if (kind && SPECIAL_SQUARE_KINDS.includes(kind)) {
    return kind;
  }
  const effect = squareData.effect as string | undefined;
  const fromEffect = kindFromEffect(effect);
  if (fromEffect) {
    return fromEffect;
  }
  if (isPortalSquare(squareData)) {
    return "portal";
  }
  const item = squareData.item as string | undefined;
  const fromItem = resolveItemKind(item);
  if (fromItem) {
    return fromItem;
  }
  const name = squareData.name as string | undefined;
  const power = squareData.power;
  if (typeof power === "number" && typeof name === "string" && name.length > 0 && !effect) {
    return "animal";
  }
  return null;
}

const MECHANIC_CHECKS: Array<(sq: Record<string, unknown>) => boolean> = [
  (sq) => typeof sq.destination === "number",
  (sq) => Array.isArray(sq.nextOnLanding) && sq.nextOnLanding.length > 0,
  (sq) => !!sq.effect && typeof sq.effect === "string",
  (sq) => sq.heart === true,
  (sq) => typeof sq.instrument === "string" && sq.instrument.length > 0,
  (sq) => typeof sq.item === "string" && sq.item.length > 0,
];

function hasMechanicField(sq: Record<string, unknown>): boolean {
  return MECHANIC_CHECKS.some((check) => check(sq));
}

/**
 * Returns true if the square triggers the landing pipeline (effects, narration).
 * True when any mechanic field is present; false for topology/flavor-only squares.
 */
export function squareTriggersLandingPipeline(
  sq: Record<string, unknown> | null | undefined,
): boolean {
  if (!sq || typeof sq !== "object" || Object.keys(sq).length === 0) {
    return false;
  }
  return getSquareKind(sq) !== null || hasMechanicField(sq);
}

/**
 * Squares that require power check + riddle before rewards. Rewards (heart, instrument)
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

export function isRollDirectionalKind(kind: SpecialSquareKind | null): boolean {
  return kind === "rollDirectional";
}

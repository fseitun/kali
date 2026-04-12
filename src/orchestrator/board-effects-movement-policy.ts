/**
 * Returns true when a teleport moved the player backward from the landing square.
 *
 * @param landingPosition - Position where the player originally landed
 * @param currentPosition - Position after teleport resolution step
 * @returns True when current position is lower than landing position
 */
export function isBackwardTeleportApplied(
  landingPosition: number,
  currentPosition: number,
): boolean {
  return typeof currentPosition === "number" && currentPosition < landingPosition;
}

/**
 * Returns true when a jump-to-leader move should also resolve the leader square portal.
 *
 * @param landingSquareData - Square config where the player landed
 * @param landingPosition - Landing position before jump-to-leader
 * @param currentPosition - Position after jump-to-leader application
 * @returns True when effect is jumpToLeader and the player actually moved
 */
export function shouldApplyLeaderSquarePortal(
  landingSquareData: Record<string, unknown> | undefined,
  landingPosition: number,
  currentPosition: number,
): boolean {
  return (
    landingSquareData?.effect === "jumpToLeader" &&
    typeof currentPosition === "number" &&
    currentPosition !== landingPosition
  );
}

/**
 * Reads a forward portal target from square config.
 *
 * @param squareData - Square config
 * @returns Destination from destination or nextOnLanding[0], otherwise undefined
 */
export function readSquarePortalForwardTarget(
  squareData: Record<string, unknown>,
): number | undefined {
  if (typeof squareData.destination === "number") {
    return squareData.destination;
  }
  if (Array.isArray(squareData.nextOnLanding) && squareData.nextOnLanding.length > 0) {
    const destination = squareData.nextOnLanding[0];
    return typeof destination === "number" ? destination : undefined;
  }
  return undefined;
}

/**
 * Kalimba ocean-forest one-shot portal check (82 -> 45).
 *
 * @param squareData - Square config
 * @param landingPosition - Landing position before portal
 * @param portalTarget - Computed portal destination
 * @returns True when the movement matches the one-shot 82->45 rule
 */
export function isKalimbaOceanForestPortal82Hop(
  squareData: Record<string, unknown> | undefined,
  landingPosition: number,
  portalTarget: number,
): boolean {
  return (
    landingPosition === 82 && portalTarget === 45 && squareData?.oceanForestOneShotPortal === true
  );
}

/**
 * Determines whether a backward teleport should be suppressed.
 *
 * @param fromPosition - Current/landing position
 * @param destination - Teleport destination
 * @param retreatEffectsReversed - Player retreat reversal flag
 * @returns True when destination is backward and retreat effects are reversed
 */
export function shouldSkipBackwardTeleport(
  fromPosition: number,
  destination: number,
  retreatEffectsReversed: boolean,
): boolean {
  return destination < fromPosition && retreatEffectsReversed;
}

/**
 * Computes magic-door bounce destination when overshooting the door before opening it.
 *
 * @param overshotPosition - Current post-roll position
 * @param magicDoorPosition - Position of the magic door
 * @param winPosition - Win square position
 * @param hasOpenedDoor - Whether player already opened the magic door
 * @returns Bounce target position or undefined if no bounce applies
 */
export function computeMagicDoorBounceDestination(
  overshotPosition: number,
  magicDoorPosition: number | undefined,
  winPosition: number,
  hasOpenedDoor: boolean,
): number | undefined {
  if (hasOpenedDoor || typeof magicDoorPosition !== "number") {
    return undefined;
  }
  if (overshotPosition <= magicDoorPosition || overshotPosition >= winPosition) {
    return undefined;
  }
  return magicDoorPosition - (overshotPosition - magicDoorPosition);
}

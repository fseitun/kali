import type { DomainEvent, GameState, NarrationPlan } from "./types";
import { t } from "@/i18n/translations";

function playerName(state: Readonly<GameState>, playerId: string): string {
  const raw = state.players[playerId]?.name;
  return typeof raw === "string" ? raw : "";
}

function findLatestEvent(
  events: DomainEvent[],
  predicate: (event: DomainEvent) => boolean,
): DomainEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (predicate(event)) {
      return event;
    }
  }
  return undefined;
}

function findLatestMovementForPlayer(
  events: DomainEvent[],
  playerId: string,
): Extract<DomainEvent, { kind: "movementRollResolved" }> | undefined {
  const event = findLatestEvent(
    events,
    (candidate) => candidate.kind === "movementRollResolved" && candidate.playerId === playerId,
  );
  return event?.kind === "movementRollResolved" ? event : undefined;
}

function resolveGoldenFoxPlan(
  state: Readonly<GameState>,
  events: DomainEvent[],
): NarrationPlan | undefined {
  const fox = findLatestEvent(events, (event) => event.kind === "goldenFoxRelocated");
  if (fox?.kind !== "goldenFoxRelocated") {
    return undefined;
  }
  return {
    text: t("game.goldenFoxJump", {
      name: playerName(state, fox.playerId),
      square: fox.toPosition,
    }),
    source: "deterministic",
    consumedEventIds: [fox.eventId],
  };
}

function resolveMagicDoorPlan(options: {
  state: Readonly<GameState>;
  events: DomainEvent[];
  hasIncomingNarration: boolean;
}): NarrationPlan | undefined {
  const { state, events, hasIncomingNarration } = options;
  const turn = state.game.turn;
  const bounce = findLatestEvent(
    events,
    (event) => event.kind === "magicDoorBounce" && hasIncomingNarration && turn === event.playerId,
  );
  if (bounce?.kind !== "magicDoorBounce") {
    return undefined;
  }
  const movement = findLatestMovementForPlayer(events, bounce.playerId);
  return {
    text: t("game.magicDoorBounce", {
      name: playerName(state, bounce.playerId),
      door: bounce.doorPosition,
      overshot: bounce.overshotPosition,
      final: bounce.finalPosition,
    }),
    source: "deterministic",
    consumedEventIds: movement ? [bounce.eventId, movement.eventId] : [bounce.eventId],
  };
}

function resolveSkullPlan(options: {
  state: Readonly<GameState>;
  events: DomainEvent[];
  hasIncomingNarration: boolean;
}): NarrationPlan | undefined {
  const { state, events, hasIncomingNarration } = options;
  const turn = state.game.turn;
  const skull = findLatestEvent(
    events,
    (event) =>
      event.kind === "skullReturnToSnakeHead" && hasIncomingNarration && turn === event.playerId,
  );
  if (skull?.kind !== "skullReturnToSnakeHead") {
    return undefined;
  }
  const movement = findLatestMovementForPlayer(events, skull.playerId);
  return {
    text: t("game.skullReturnToSnakeHead", {
      name: playerName(state, skull.playerId),
      from: skull.fromSquare,
      to: skull.toSquare,
    }),
    source: "deterministic",
    consumedEventIds: movement ? [skull.eventId, movement.eventId] : [skull.eventId],
  };
}

function resolveMovementPlan(options: {
  state: Readonly<GameState>;
  events: DomainEvent[];
  hasIncomingNarration: boolean;
}): NarrationPlan | undefined {
  const { state, events, hasIncomingNarration } = options;
  const turn = state.game.turn;
  const movement = findLatestEvent(
    events,
    (event) =>
      event.kind === "movementRollResolved" && hasIncomingNarration && turn === event.playerId,
  );
  if (movement?.kind !== "movementRollResolved") {
    return undefined;
  }
  return {
    text: t("game.rollMovementLanded", {
      name: playerName(state, movement.playerId),
      roll: movement.roll,
      square: movement.square,
    }),
    source: "deterministic",
    consumedEventIds: [movement.eventId],
  };
}

/**
 * Resolves a deterministic narration plan based on emitted domain events.
 */
export function resolveNarrationPlan(options: {
  state: Readonly<GameState>;
  events: DomainEvent[];
  incomingNarrationText: string | undefined;
}): NarrationPlan | undefined {
  const { state, events, incomingNarrationText } = options;
  const hasIncomingNarration = Boolean(
    incomingNarrationText && incomingNarrationText.trim() !== "",
  );

  return (
    resolveGoldenFoxPlan(state, events) ??
    resolveMagicDoorPlan({ state, events, hasIncomingNarration }) ??
    resolveSkullPlan({ state, events, hasIncomingNarration }) ??
    resolveMovementPlan({ state, events, hasIncomingNarration })
  );
}

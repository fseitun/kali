import { describe, expect, it } from "vitest";
import { resolveNarrationPlan } from "./narration-policy";
import type { DomainEvent, GameState } from "./types";
import { GamePhase } from "./types";
import { setLocale, t } from "@/i18n/translations";

function buildState(turn = "p1"): GameState {
  return {
    game: {
      name: "Kalimba",
      phase: GamePhase.PLAYING,
      turn,
      winner: null,
      playerOrder: ["p1", "p2"],
    },
    players: {
      p1: { id: "p1", name: "Alice", position: 0 },
      p2: { id: "p2", name: "Bob", position: 0 },
    },
  };
}

describe("resolveNarrationPlan", () => {
  it("Expected outcome: Prioritizes golden fox relocation over other events", () => {
    setLocale("en-US");
    const state = buildState();
    const events: DomainEvent[] = [
      { eventId: 1, kind: "movementRollResolved", playerId: "p1", roll: 4, square: 54 },
      { eventId: 2, kind: "goldenFoxRelocated", playerId: "p1", toPosition: 80 },
    ];

    const plan = resolveNarrationPlan({
      state,
      events,
    });

    expect(plan?.text).toBe(t("game.goldenFoxJump", { name: "Alice", square: 80 }));
    expect(plan?.consumedEventIds).toEqual([2]);
  });

  it("Expected outcome: Uses magic door bounce deterministic line over the plain movement line", () => {
    setLocale("en-US");
    const state = buildState();
    const events: DomainEvent[] = [
      { eventId: 1, kind: "movementRollResolved", playerId: "p1", roll: 6, square: 188 },
      {
        eventId: 2,
        kind: "magicDoorBounce",
        playerId: "p1",
        doorPosition: 186,
        overshotPosition: 188,
        finalPosition: 184,
      },
    ];

    const plan = resolveNarrationPlan({
      state,
      events,
    });

    expect(plan?.text).toBe(
      t("game.magicDoorBounce", { name: "Alice", door: 186, overshot: 188, final: 184 }),
    );
    expect(plan?.consumedEventIds).toEqual([2, 1]);
  });

  it("Expected outcome: Falls back to movement narration when no higher-priority event exists", () => {
    setLocale("en-US");
    const state = buildState();
    const events: DomainEvent[] = [
      { eventId: 1, kind: "movementRollResolved", playerId: "p1", roll: 3, square: 12 },
    ];

    const plan = resolveNarrationPlan({
      state,
      events,
    });

    expect(plan?.text).toBe(t("game.rollMovementLanded", { name: "Alice", roll: 3, square: 12 }));
    expect(plan?.consumedEventIds).toEqual([1]);
  });

  it("Expected outcome: Resolves movement narration even when no NARRATE accompanies the roll", () => {
    setLocale("en-US");
    const state = buildState();
    const events: DomainEvent[] = [
      { eventId: 1, kind: "movementRollResolved", playerId: "p1", roll: 3, square: 12 },
    ];

    const plan = resolveNarrationPlan({ state, events });

    expect(plan?.text).toBe(t("game.rollMovementLanded", { name: "Alice", roll: 3, square: 12 }));
  });

  it("Expected outcome: Returns undefined when the events belong to another player", () => {
    setLocale("en-US");
    const state = buildState("p2");
    const events: DomainEvent[] = [
      { eventId: 1, kind: "movementRollResolved", playerId: "p1", roll: 3, square: 12 },
    ];

    expect(resolveNarrationPlan({ state, events })).toBeUndefined();
  });

  it("Expected outcome: Consumes only matching event instances when multiple same-kind events exist", () => {
    setLocale("en-US");
    const state = buildState();
    const events: DomainEvent[] = [
      { eventId: 1, kind: "movementRollResolved", playerId: "p1", roll: 2, square: 10 },
      { eventId: 2, kind: "movementRollResolved", playerId: "p2", roll: 5, square: 25 },
      {
        eventId: 3,
        kind: "magicDoorBounce",
        playerId: "p1",
        doorPosition: 186,
        overshotPosition: 188,
        finalPosition: 184,
      },
    ];

    const plan = resolveNarrationPlan({
      state,
      events,
    });

    expect(plan?.text).toBe(
      t("game.magicDoorBounce", { name: "Alice", door: 186, overshot: 188, final: 184 }),
    );
    expect(plan?.consumedEventIds).toEqual([3, 1]);
    expect(plan?.consumedEventIds).not.toContain(2);
  });
});

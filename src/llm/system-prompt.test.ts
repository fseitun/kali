import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatStateContext, SYSTEM_PROMPT } from "./system-prompt";
import * as localeManager from "@/i18n/locale-manager";

describe("SYSTEM_PROMPT", () => {
  it("slim base prompt is smaller than legacy (~2.5k+) and has an upper bound", () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThanOrEqual(1100);
    expect(SYSTEM_PROMPT.length).toBeLessThanOrEqual(4000);
  });

  it("includes guidance rule: when user asks what to do, NARRATE only and do not emit primitives", () => {
    expect(SYSTEM_PROMPT).toMatch(/Guidance|what do I do|help/);
    expect(SYSTEM_PROMPT).toContain("NARRATE only");
    expect(SYSTEM_PROMPT).toContain("do not emit PLAYER_ROLLED");
    expect(SYSTEM_PROMPT).toContain("PLAYER_ANSWERED");
    expect(SYSTEM_PROMPT).toContain("SET_STATE");
  });

  it("distinguishes movement dice from POWER CHECK / REVENGE rolls in conventions", () => {
    expect(SYSTEM_PROMPT).toContain("⚠️ POWER CHECK");
    expect(SYSTEM_PROMPT).toContain("⚠️ REVENGE");
    expect(SYSTEM_PROMPT).toMatch(/1d6, 2d6, 3d6/);
  });

  it("warns against NDJSON (two root objects) vs a single JSON array", () => {
    expect(SYSTEM_PROMPT).toMatch(/Wrong.*two root objects|single array/i);
    expect(SYSTEM_PROMPT).toContain("ASK_RIDDLE");
  });
});

describe("formatStateContext (es-AR)", () => {
  beforeEach(() => {
    vi.spyOn(localeManager, "getLocale").mockReturnValue("es-AR");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("only shows DECISION for current turn player", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 0, activeChoices: { 0: 1 } },
        p2: { id: "p2", name: "Bob", position: 0, activeChoices: {} },
      },
      board: { squares: { "0": { next: [1, 15], prev: [] } } },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    // p1 has activeChoices set, so no DECISION for anyone. p2 has no choice but it's p1's turn
    expect(result).not.toContain("DECISION (Bob)");
  });

  it("shows DECISION for current turn player when they have pending path choice", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
        p2: { id: "p2", name: "Bob", position: 0, activeChoices: {} },
      },
      board: { squares: { "0": { next: [1, 15], prev: [] } } },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("DECISION (Alice)");
    expect(result).toContain("izquierda"); // Inferred prompt for fork at 0
    expect(result).toContain("Si pregunta qué hacer o pide ayuda");
    expect(result).toContain("NO emitas PLAYER_ANSWERED");
    expect(result).toContain("[current]");
    expect(result).not.toContain("DECISION (Bob)");
  });

  it("includes branch hints when decision point has choiceKeywords", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
      },
      board: {
        squares: {
          "0": { next: { "1": ["izquierda"], "15": ["derecha"] }, prev: [] },
        },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("Pistas de la config (no exhaustivas)");
    expect(result).toContain("objetivo 1:");
    expect(result).toContain("izquierda");
    expect(result).toContain("uno de: 1, 15");
  });

  it("shows DECISION for p2 when it is p2's turn and they have pending path choice", () => {
    const state = {
      game: { turn: "p2", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 3, activeChoices: { 0: 1 } },
        p2: { id: "p2", name: "Bob", position: 0, activeChoices: {} },
      },
      board: { squares: { "0": { next: [1, 15], prev: [] } } },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("DECISION (Bob)");
    expect(result).toContain("[current]");
    expect(result).not.toContain("DECISION (Alice)");
  });

  it("shows POWER CHECK hint when pending powerCheck for current player", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pending: {
          kind: "powerCheck",
          position: 21,
          power: 2,
          playerId: "p1",
          riddleCorrect: false,
        },
      },
      players: {
        p1: { id: "p1", name: "fico", position: 21, activeChoices: { 0: 15 } },
        p2: { id: "p2", name: "pedro", position: 6, activeChoices: { 0: 1 } },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("POWER CHECK (fico)");
    expect(result).toContain("powerCheck");
    expect(result).toContain("PLAYER_ANSWERED");
    expect(result).toContain("1–6");
    expect(result).toContain("del dado");
    expect(result).not.toContain("2–12");
    expect(result).toContain("NO NARRATES la tirada");
    expect(result).toContain("El orquestador anuncia si pasó o no");
    expect(result).not.toContain("Sumás");
    expect(result).not.toContain("confirm the roll");
  });

  it("POWER CHECK after correct riddle uses 2d6 (2–12) wording", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pending: {
          kind: "powerCheck",
          position: 21,
          power: 2,
          playerId: "p1",
          riddleCorrect: true,
        },
      },
      players: {
        p1: { id: "p1", name: "fico", position: 21, activeChoices: {} },
        p2: { id: "p2", name: "pedro", position: 6, activeChoices: {} },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("2–12");
    expect(result).toContain("2d6");
    expect(result).not.toContain("del dado (1–6)");
  });

  it("RIDDLE phase includes power-check dice, habitat hint, and narration shape", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pending: {
          kind: "riddle",
          position: 7,
          power: 3,
          playerId: "p1",
          phase: "riddle",
        },
      },
      players: {
        p1: { id: "p1", name: "Nachito", position: 7, activeChoices: {} },
      },
      board: {
        squares: {
          "7": {
            name: "Eagle",
            power: 3,
            powerCheckDiceIfRiddleCorrect: 3,
            powerCheckDiceIfRiddleWrong: 2,
            habitat: "desert",
          },
        },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("RIDDLE (Nachito)");
    expect(result).toContain("3d6");
    expect(result).toContain("fuerza del animal 3");
    expect(result).toContain("2d6");
    expect(result).toContain("no digas «prueba de poder»");
    expect(result).toContain("dato de casilla: desert");
    expect(result).toContain("Escuchá con atención");
    expect(result).toContain("Opciones:");
    expect(result).toContain("superar al animal");
  });

  it("RIDDLE phase with stored options still includes encounter hints and anti-leak", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pending: {
          kind: "riddle",
          position: 7,
          power: 3,
          playerId: "p1",
          phase: "riddle",
          riddlePrompt: "¿Qué ave…?",
          riddleOptions: ["Águila", "Halcón", "Búho", "Pingüino"],
          correctOption: "Águila",
        },
      },
      players: {
        p1: { id: "p1", name: "Sofi", position: 7, activeChoices: {} },
      },
      board: {
        squares: {
          "7": {
            power: 3,
            powerCheckDiceIfRiddleCorrect: 3,
            powerCheckDiceIfRiddleWrong: 2,
            habitat: "desert",
          },
        },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("Opciones actuales: Águila, Halcón, Búho, Pingüino");
    expect(result).toContain("3d6");
    expect(result).toContain("fuerza del animal 3");
    expect(result).toContain("NO incluyas la respuesta correcta");
  });

  it("POWER CHECK on Águila (3d6) after correct riddle uses 3–18 wording", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pending: {
          kind: "powerCheck",
          position: 7,
          power: 3,
          playerId: "p1",
          riddleCorrect: true,
        },
      },
      players: {
        p1: { id: "p1", name: "fico", position: 7, activeChoices: {} },
        p2: { id: "p2", name: "pedro", position: 6, activeChoices: {} },
      },
      board: {
        squares: {
          "7": {
            name: "Águila",
            power: 3,
            powerCheckDiceIfRiddleCorrect: 3,
            powerCheckDiceIfRiddleWrong: 2,
          },
        },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("3–18");
    expect(result).toContain("3d6");
    expect(result).not.toContain("del dado (1–6)");
  });

  it("shows REVENGE hint with anti-pattern when pending kind=revenge", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pending: {
          kind: "revenge",
          position: 21,
          power: 4,
          playerId: "p1",
        },
      },
      players: {
        p1: { id: "p1", name: "Alice", position: 21 },
        p2: { id: "p2", name: "Bob", position: 5 },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("REVENGE (Alice)");
    expect(result).toContain("phase=revenge");
    expect(result).toContain("≥ 4");
    expect(result).toContain("NO NARRATES la tirada");
    expect(result).toContain("El orquestador anuncia el resultado");
    expect(result).toContain("Si pregunta qué hacer");
    expect(result).toContain("tire un dado y diga el número");
    expect(result).toContain("necesita 4 o más");
  });

  it("orders players by game.playerOrder when present", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING", playerOrder: ["p2", "p1"] },
      players: {
        p1: { id: "p1", name: "Alice", position: 0 },
        p2: { id: "p2", name: "Bob", position: 0 },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    const playersIndex = result.indexOf("Players:");
    expect(playersIndex).toBeGreaterThanOrEqual(0);
    const afterPlayers = result.slice(playersIndex);
    expect(afterPlayers).toMatch(/Players: p2:.*\|.*p1:/);
    expect(afterPlayers).not.toMatch(/Players: p1:.*\|.*p2:/);
  });

  it("without forLog truncates nested objects to {...}", () => {
    const state = {
      game: {
        turn: "p2",
        phase: "PLAYING",
        pending: { kind: "powerCheck", power: 7, playerId: "p2" },
      },
      players: {
        p1: { id: "p1", position: 32, activeChoices: { 32: 99 }, name: "fico" },
        p2: { id: "p2", position: 26, activeChoices: {}, name: "pepe" },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("pending={...}");
    expect(result).toContain("activeChoices={...}");
  });

  it("with forLog: true expands pending and activeChoices", () => {
    const state = {
      game: {
        turn: "p2",
        phase: "PLAYING",
        pending: { kind: "powerCheck", power: 7, playerId: "p2" },
      },
      players: {
        p1: { id: "p1", position: 32, activeChoices: { 32: 99 }, name: "fico" },
        p2: { id: "p2", position: 26, activeChoices: {}, name: "pepe" },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state, { forLog: true });

    expect(result).toContain("kind=powerCheck");
    expect(result).toContain("power=7");
    expect(result).toContain("playerId=p2");
    expect(result).not.toContain("pending={...}");
    expect(result).toContain("32=99");
    expect(result).not.toMatch(/activeChoices=\{\s*\.\.\.\s*\}/);
  });
});

describe("formatStateContext (en-US)", () => {
  beforeEach(() => {
    vi.spyOn(localeManager, "getLocale").mockReturnValue("en-US");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses English decision and branch-hint wording", () => {
    const state = {
      game: { turn: "p1", phase: "PLAYING" },
      players: {
        p1: { id: "p1", name: "Alice", position: 0, activeChoices: {} },
      },
      board: {
        squares: {
          "0": { next: { "1": ["left"], "15": ["right"] }, prev: [] },
        },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("If the user asks what to do or for help");
    expect(result).toContain("Branch hints from config (not exhaustive)");
    expect(result).toContain("target 1:");
  });

  it("uses English power-check roll instructions for 1d6", () => {
    const state = {
      game: {
        turn: "p1",
        phase: "PLAYING",
        pending: {
          kind: "powerCheck",
          position: 21,
          power: 2,
          playerId: "p1",
          riddleCorrect: false,
        },
      },
      players: {
        p1: { id: "p1", name: "fico", position: 21, activeChoices: {} },
      },
    } as Record<string, unknown>;

    const result = formatStateContext(state);

    expect(result).toContain("on the die");
    expect(result).toContain("The orchestrator announces pass/fail");
  });
});

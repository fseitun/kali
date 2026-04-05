import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameLoader, expandHabitatConfig, resolveInitialState } from "./game-loader";
import type { GameModule, HabitatDefinition } from "./types";
import { GamePhase } from "@/orchestrator/types";

// Mock SpeechService
const mockSpeechService = {
  loadSound: vi.fn(),
};

vi.mock("../services/speech-service", () => ({
  SpeechService: vi.fn().mockImplementation(() => mockSpeechService),
}));

// Mock Logger
vi.mock("../utils/logger", () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("Product scenario: Game Loader", () => {
  let gameLoader: GameLoader;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gameLoader = new GameLoader("/test/games");
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Product scenario: Load Game", () => {
    it("Expected outcome: Should load valid game module", async () => {
      const mockConfig = {
        metadata: {
          id: "test-game",
          name: "Test Game",
          minPlayers: 2,
          maxPlayers: 4,
          objective: "Test objective",
        },
        squares: {
          "0": { next: [1], prev: [] },
          "1": { effect: "win", next: [], prev: [0] },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      const result = await gameLoader.loadGame("test-game");

      expect(mockFetch).toHaveBeenCalledWith("/test/games/test-game/config.json");
      expect(result.metadata).toEqual(mockConfig.metadata);
      expect(result.initialState).toBeDefined();
      expect(result.initialState.game.phase).toBe(GamePhase.SETUP);
      expect(result.initialState.board?.squares).toBeDefined();
    });

    it("Expected outcome: Should throw error for failed fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      await expect(gameLoader.loadGame("nonexistent")).rejects.toThrow(
        "Failed to load game module: Not Found",
      );
    });

    it("Expected outcome: Should throw error for network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(gameLoader.loadGame("test-game")).rejects.toThrow("Network error");
    });

    it("Expected outcome: Should validate game module metadata", async () => {
      const invalidModule = {
        metadata: { objective: "Test objective" },
        squares: { "0": { next: [1], prev: [] } },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidModule),
      });

      await expect(gameLoader.loadGame("invalid")).rejects.toThrow(
        "Invalid game module: missing metadata",
      );
    });

    it("Expected outcome: Should validate metadata objective", async () => {
      const invalidModule = {
        metadata: {
          id: "test-game",
          name: "Test Game",
          minPlayers: 2,
          maxPlayers: 4,
        },
        squares: { "0": { next: [1], prev: [] } },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidModule),
      });

      await expect(gameLoader.loadGame("invalid")).rejects.toThrow(
        "Invalid game module: missing metadata.objective",
      );
    });

    it("Expected outcome: Should validate game config has squares", async () => {
      const invalidModule = {
        metadata: {
          id: "test-game",
          name: "Test Game",
          minPlayers: 2,
          maxPlayers: 4,
          objective: "Test objective",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidModule),
      });

      await expect(gameLoader.loadGame("invalid")).rejects.toThrow(
        "Invalid game config: squares required",
      );
    });

    it("Expected outcome: Should validate metadata id and name", async () => {
      const invalidModule = {
        metadata: { objective: "Test objective" },
        squares: { "0": { next: [1], prev: [] } },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidModule),
      });

      await expect(gameLoader.loadGame("invalid")).rejects.toThrow(
        "Invalid game module: missing metadata",
      );
    });
  });

  describe("Product scenario: Load Sound Effects", () => {
    it("Expected outcome: Should load all sound effects successfully", async () => {
      const gameModule: GameModule = {
        metadata: {
          id: "test-game",
          name: "Test Game",
          minPlayers: 2,
          maxPlayers: 4,
          objective: "Test objective",
        },
        initialState: {
          game: {
            name: "Test Game",
            phase: GamePhase.SETUP,
            turn: null,
            playerOrder: [],
            winner: null,
          },
          players: {},
        },
        soundEffects: {
          ladder_up: "/sounds/ladder.mp3",
          snake_down: "/sounds/snake.mp3",
          dice_roll: "/sounds/dice.mp3",
        },
      };

      mockSpeechService.loadSound.mockResolvedValue(undefined);

      await gameLoader.loadSoundEffects(gameModule, mockSpeechService as unknown as never);

      expect(mockSpeechService.loadSound).toHaveBeenCalledTimes(3);
      expect(mockSpeechService.loadSound).toHaveBeenCalledWith("ladder_up", "/sounds/ladder.mp3");
      expect(mockSpeechService.loadSound).toHaveBeenCalledWith("snake_down", "/sounds/snake.mp3");
      expect(mockSpeechService.loadSound).toHaveBeenCalledWith("dice_roll", "/sounds/dice.mp3");
    });

    it("Expected outcome: Should handle missing sound effects", async () => {
      const gameModule: GameModule = {
        metadata: {
          id: "test-game",
          name: "Test Game",
          minPlayers: 2,
          maxPlayers: 4,
          objective: "Test objective",
        },
        initialState: {
          game: {
            name: "Test Game",
            phase: GamePhase.SETUP,
            turn: null,
            playerOrder: [],
            winner: null,
          },
          players: {},
        },
      };

      await gameLoader.loadSoundEffects(gameModule, mockSpeechService as unknown as never);

      expect(mockSpeechService.loadSound).not.toHaveBeenCalled();
    });

    it("Expected outcome: Should handle sound loading failures gracefully", async () => {
      const gameModule: GameModule = {
        metadata: {
          id: "test-game",
          name: "Test Game",
          minPlayers: 2,
          maxPlayers: 4,
          objective: "Test objective",
        },
        initialState: {
          game: {
            name: "Test Game",
            phase: GamePhase.SETUP,
            turn: null,
            playerOrder: [],
            winner: null,
          },
          players: {},
        },
        soundEffects: {
          good_sound: "/sounds/good.mp3",
          bad_sound: "/sounds/bad.mp3",
        },
      };

      mockSpeechService.loadSound
        .mockResolvedValueOnce(undefined) // Good sound loads successfully
        .mockRejectedValueOnce(new Error("Failed to load")); // Bad sound fails

      // Should not throw even if some sounds fail
      await expect(
        gameLoader.loadSoundEffects(gameModule, mockSpeechService as unknown as never),
      ).resolves.not.toThrow();

      expect(mockSpeechService.loadSound).toHaveBeenCalledTimes(2);
    });

    it("Expected outcome: Should handle empty sound effects object", async () => {
      const gameModule: GameModule = {
        metadata: {
          id: "test-game",
          name: "Test Game",
          minPlayers: 2,
          maxPlayers: 4,
          objective: "Test objective",
        },
        initialState: {
          game: {
            name: "Test Game",
            phase: GamePhase.SETUP,
            turn: null,
            playerOrder: [],
            winner: null,
          },
          players: {},
        },
        soundEffects: {},
      };

      await gameLoader.loadSoundEffects(gameModule, mockSpeechService as unknown as never);

      expect(mockSpeechService.loadSound).not.toHaveBeenCalled();
    });
  });
});

describe("Product scenario: Expand Habitat Config", () => {
  it("Expected outcome: Expands inclusive ranges and single indices", () => {
    const m = expandHabitatConfig({ alpha: [0, 1], beta: 2 }, 2);
    expect(m[0]).toBe("alpha");
    expect(m[1]).toBe("alpha");
    expect(m[2]).toBe("beta");
  });

  it("Expected outcome: Accepts several ranges as flat lo,hi pairs", () => {
    const m = expandHabitatConfig({ mix: [0, 1, 2, 4] }, 4);
    expect(m[0]).toBe("mix");
    expect(m[1]).toBe("mix");
    expect(m[2]).toBe("mix");
    expect(m[3]).toBe("mix");
    expect(m[4]).toBe("mix");
  });

  it("Expected outcome: Throws when two habitats claim the same square", () => {
    expect(() => expandHabitatConfig({ a: [0, 1], b: 1 }, 2)).toThrow(/assigned to both/);
  });

  it("Expected outcome: Throws when squares are missing from the map", () => {
    expect(() => expandHabitatConfig({ only: [0, 0] }, 2)).toThrow(/missing squares/);
  });

  it("Expected outcome: Rejects nested arrays (no segment list wrapper)", () => {
    const nested = { bad: [[0, 1]] } as unknown as Record<string, HabitatDefinition>;
    expect(() => expandHabitatConfig(nested, 2)).toThrow(/must not use nested arrays/);
  });

  it("Expected outcome: Throws on odd length flat numeric list (length > 1)", () => {
    expect(() => expandHabitatConfig({ bad: [0, 1, 2] }, 4)).toThrow(/even length/);
  });
});

describe("Product scenario: Resolve Initial State sparse next/prev", () => {
  it("Expected outcome: Fills omitted square keys with {} for linear only indices", () => {
    const state = resolveInitialState({
      metadata: {
        id: "t",
        name: "T",
        minPlayers: 1,
        maxPlayers: 2,
        objective: "o",
      },
      squares: {
        "0": { next: [1], prev: [] },
        "3": { next: [], prev: [2], effect: "win" },
      },
    });
    expect(state.board?.squares?.["1"]).toEqual({});
    expect(state.board?.squares?.["2"]).toEqual({});
    expect(state.board?.squares?.["3"]?.effect).toBe("win");
  });

  it("Expected outcome: Allows middle squares with no next/prev when 0 and win are explicit", () => {
    const state = resolveInitialState({
      metadata: {
        id: "t",
        name: "T",
        minPlayers: 1,
        maxPlayers: 2,
        objective: "o",
      },
      squares: {
        "0": { next: [1], prev: [] },
        "1": {},
        "2": { next: [], prev: [1], effect: "win" },
      },
    });
    expect(state.board?.squares?.["1"]).toEqual({});
  });

  it("Expected outcome: Rejects win square without explicit next", () => {
    expect(() =>
      resolveInitialState({
        metadata: {
          id: "t",
          name: "T",
          minPlayers: 1,
          maxPlayers: 2,
          objective: "o",
        },
        squares: {
          "0": { next: [1], prev: [] },
          "1": { effect: "win", prev: [0] },
        },
      }),
    ).toThrow(/explicit next/);
  });
});

describe("Product scenario: Resolve Initial State with config habitat", () => {
  it("Expected outcome: Merges expanded habitat onto each square", () => {
    const state = resolveInitialState({
      metadata: {
        id: "t",
        name: "T",
        minPlayers: 1,
        maxPlayers: 2,
        objective: "win at 1",
      },
      habitat: { h0: [0, 0], h1: [1, 1] },
      squares: {
        "0": { next: [1], prev: [] },
        "1": { effect: "win", next: [], prev: [0] },
      },
    });
    expect(state.board?.squares?.["0"]?.habitat).toBe("h0");
    expect(state.board?.squares?.["1"]?.habitat).toBe("h1");
  });
});

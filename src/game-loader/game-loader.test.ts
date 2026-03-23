import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameLoader } from "./game-loader";
import type { GameModule } from "./types";
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

describe("GameLoader", () => {
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

  describe("loadGame", () => {
    it("should load valid game module", async () => {
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

    it("should throw error for failed fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      await expect(gameLoader.loadGame("nonexistent")).rejects.toThrow(
        "Failed to load game module: Not Found",
      );
    });

    it("should throw error for network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(gameLoader.loadGame("test-game")).rejects.toThrow("Network error");
    });

    it("should validate game module metadata", async () => {
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

    it("should validate metadata objective", async () => {
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

    it("should validate game config has squares", async () => {
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

    it("should validate metadata id and name", async () => {
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

  describe("loadSoundEffects", () => {
    it("should load all sound effects successfully", async () => {
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

    it("should handle missing sound effects", async () => {
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

    it("should handle sound loading failures gracefully", async () => {
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

    it("should handle empty sound effects object", async () => {
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

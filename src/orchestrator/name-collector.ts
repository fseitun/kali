import type { GameMetadata } from "@/game-loader/types";
import { t, getNumberWords, parseConfirmation } from "@/i18n/translations";
import type { LLMClient } from "@/llm/LLMClient";
import type { ISpeechService } from "@/services/speech-service";
import { Logger } from "@/utils/logger";
import {
  validateName,
  findNameConflicts,
  generateNickname,
  areNamesSimilar,
} from "@/utils/name-helper";

/**
 * Handles the voice-based player name collection phase at game start.
 * Uses LLM for intelligent name extraction and conversational awareness.
 *
 * SEPARATION OF CONCERNS: This class only collects names via voice interaction.
 * It does NOT mutate game state - that's the orchestrator's responsibility.
 */
export class NameCollector {
  private collectedNames: string[] = [];
  private playerCount = 0;
  private minPlayers: number;
  private maxPlayers: number;

  constructor(
    private speechService: ISpeechService,
    private gameName: string,
    private enableDirectTranscription: () => void,
    private llmClient: LLMClient,
    gameMetadata: GameMetadata,
  ) {
    this.minPlayers = gameMetadata.minPlayers;
    this.maxPlayers = gameMetadata.maxPlayers;
  }

  /**
   * Runs the complete name collection flow.
   * @param onTranscript - Callback to receive transcriptions from speech recognition
   * @param options - Optional: skipReadyMessage true to skip "Arranquemos. X, vos empezás." when the first turn will announce immediately (e.g. fork at 0)
   * @returns Promise that resolves with array of collected player names in turn order
   */
  async collectNames(
    onTranscript: (handler: (text: string) => void) => void,
    options?: { skipReadyMessage?: boolean },
  ): Promise<string[]> {
    try {
      Logger.info("Starting name collection phase");

      await this.speechService.speak(t("setup.welcome", { game: this.gameName }));

      this.playerCount = await this.askPlayerCount(onTranscript);
      Logger.info(`Collecting names for ${this.playerCount} players`);

      for (let i = 0; i < this.playerCount; i++) {
        if (i === 0) {
          this.enableDirectTranscription();
          Logger.info("Direct transcription enabled for name collection");
        }
        const name = await this.askPlayerName(i + 1, onTranscript);
        this.collectedNames.push(name);
        Logger.info(`Collected name for player ${i + 1}: ${name}`);
      }

      await this.resolveConflicts(onTranscript);

      if (!options?.skipReadyMessage) {
        await this.speechService.speak(t("setup.ready", { name: this.collectedNames[0] }));
      }

      return this.collectedNames;
    } catch (error) {
      Logger.error("Name collection error:", error);
      throw error;
    }
  }

  /**
   * Handles off-topic response: logs urgent message if present, speaks fallback, returns true.
   * Caller should return when this returns true.
   */
  private async handleOffTopic(
    analysis: { isOnTopic: boolean; urgentMessage?: string },
    fallbackMessage: string,
  ): Promise<boolean> {
    if (analysis.isOnTopic) {
      return false;
    }
    if (analysis.urgentMessage) {
      Logger.info(`LLM debug: ${analysis.urgentMessage}`);
    }
    await this.speechService.speak(fallbackMessage);
    return true;
  }

  private async askPlayerCount(
    onTranscript: (handler: (text: string) => void) => void,
  ): Promise<number> {
    return new Promise<number>((resolve) => {
      const handler = async (text: string): Promise<void> => {
        Logger.info(`Player count handler received: "${text}"`);

        const deterministicCount = this.extractPlayerCountDeterministic(text);
        if (deterministicCount !== null) {
          if (deterministicCount >= this.minPlayers && deterministicCount <= this.maxPlayers) {
            resolve(deterministicCount);
            return;
          }
          await this.speechService.speak(
            t("setup.playerCountInvalid", {
              min: this.minPlayers,
              max: this.maxPlayers,
            }),
          );
          return;
        }

        const llmCount = await this.llmClient.extractPlayerCount(
          text,
          this.minPlayers,
          this.maxPlayers,
        );
        if (llmCount !== null && llmCount >= this.minPlayers && llmCount <= this.maxPlayers) {
          resolve(llmCount);
          return;
        }

        const analysis = await this.llmClient.analyzeResponse(
          text,
          `expecting player count number from ${this.minPlayers} to ${this.maxPlayers}`,
        );
        if (
          await this.handleOffTopic(
            analysis,
            t("setup.playerCount", { min: this.minPlayers, max: this.maxPlayers }),
          )
        ) {
          return;
        }

        await this.speechService.speak(
          t("setup.playerCountInvalid", {
            min: this.minPlayers,
            max: this.maxPlayers,
          }),
        );
      };

      onTranscript(handler);

      void this.speechService.speak(
        t("setup.playerCount", { min: this.minPlayers, max: this.maxPlayers }),
      );
    });
  }

  private normalizeForNumberExtraction(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private extractPlayerCountDeterministic(text: string): number | null {
    const normalized = this.normalizeForNumberExtraction(text);
    if (normalized === "") {
      return null;
    }
    const digitMatch = normalized.match(/\b\d+\b/);
    if (digitMatch) {
      const parsed = Number.parseInt(digitMatch[0], 10);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
    const numberWords = getNumberWords().map((word) => this.normalizeForNumberExtraction(word));
    const tokens = normalized.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const value = numberWords.indexOf(token);
      if (value !== -1) {
        return value;
      }
    }
    return null;
  }

  private async askPlayerName(
    playerNumber: number,
    onTranscript: (handler: (text: string) => void) => void,
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      const handler = async (text: string): Promise<void> => {
        Logger.info(`Name handler for player ${playerNumber} received: "${text}"`);

        const analysis = await this.llmClient.analyzeResponse(text, "expecting person name");
        if (await this.handleOffTopic(analysis, t("setup.playerName", { number: playerNumber }))) {
          return;
        }

        const extractedName = await this.llmClient.extractName(text);

        // Fallback: if LLM failed but transcript looks like a simple valid name, use it
        const nameToTry = extractedName ?? text.trim();
        if (nameToTry) {
          const validation = validateName(nameToTry);
          if (validation.valid) {
            await this.speechService.speak(t("setup.nameConfirmYes", { name: validation.cleaned }));
            resolve(validation.cleaned);
            return;
          }
        }

        await this.speechService.speak(t("setup.extractionFailed"));
        await this.speechService.speak(t("setup.playerName", { number: playerNumber }));
      };

      onTranscript(handler);

      void this.speechService.speak(t("setup.playerName", { number: playerNumber }));
    });
  }

  private async resolveConflicts(
    onTranscript: (handler: (text: string) => void) => void,
  ): Promise<void> {
    const conflictIndices = findNameConflicts(this.collectedNames);

    if (conflictIndices.length === 0) {
      return;
    }

    Logger.info("Resolving name conflicts:", conflictIndices);

    for (const index of conflictIndices) {
      if (
        index > 0 &&
        areNamesSimilar(this.collectedNames[index], this.collectedNames[index - 1])
      ) {
        const baseName = this.collectedNames[index];
        const usedNames = this.collectedNames.slice(0, index);
        const suggestion = generateNickname(baseName, usedNames);

        await this.speechService.speak(t("setup.nameConflict", { name: baseName, suggestion }));

        const response = await this.waitForConfirmation(onTranscript, suggestion, baseName);
        this.collectedNames[index] = response;
      }
    }

    const allNames = this.collectedNames.join(", ").replace(/, ([^,]*)$/, " y $1");
    await this.speechService.speak(t("setup.allNamesReady", { names: allNames }));
  }

  private async waitForConfirmation(
    onTranscript: (handler: (text: string) => void) => void,
    suggestion: string,
    original: string,
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      const handler = async (text: string): Promise<void> => {
        Logger.info(`Conflict resolution handler received: "${text}"`);

        const analysis = await this.llmClient.analyzeResponse(
          text,
          "expecting yes/no confirmation for suggested name",
        );
        if (
          await this.handleOffTopic(
            analysis,
            t("setup.nameConflict", { name: original, suggestion }),
          )
        ) {
          return;
        }

        const confirmation = parseConfirmation(text);
        if (confirmation === "yes") {
          await this.speechService.speak(t("setup.nameConflictPerfect"));
          resolve(suggestion);
        } else if (confirmation === "no") {
          await this.speechService.speak(t("setup.nameConflictAlternative"));
          await this.resolveAlternativeName(onTranscript, original, resolve);
        } else {
          resolve(suggestion);
        }
      };

      onTranscript(handler);
    });
  }

  private async resolveAlternativeName(
    onTranscript: (handler: (text: string) => void) => void,
    fallback: string,
    resolve: (value: string) => void,
  ): Promise<void> {
    const handler = async (text: string): Promise<void> => {
      Logger.info(`Alternative name handler received: "${text}"`);

      const analysis = await this.llmClient.analyzeResponse(
        text,
        "expecting alternative person name",
      );
      if (await this.handleOffTopic(analysis, t("setup.nameConflictAlternative"))) {
        return;
      }

      const extractedName = await this.llmClient.extractName(text);

      if (extractedName) {
        const validation = validateName(extractedName);
        if (validation.valid && !this.collectedNames.includes(validation.cleaned)) {
          await this.speechService.speak(t("setup.nameConfirmYes", { name: validation.cleaned }));
          resolve(validation.cleaned);
          return;
        }
      }

      const kindName = generateNickname(fallback, this.collectedNames);
      await this.speechService.speak(t("setup.nameConflictFallback", { name: kindName }));
      resolve(kindName);
    };

    onTranscript(handler);
  }
}

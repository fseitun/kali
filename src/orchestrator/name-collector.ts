import type { GameMetadata } from "../game-loader/types";
import { t, getNumberWords, getConfirmationWords } from "../i18n";
import type { LLMClient } from "../llm/LLMClient";
import type { SpeechService } from "../services/speech-service";
import { Logger } from "../utils/logger";
import {
  validateName,
  findNameConflicts,
  generateNickname,
  areNamesSimilar,
} from "../utils/name-helper";

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
  private timeoutHandle: number | null = null;
  private minPlayers: number;
  private maxPlayers: number;

  constructor(
    private speechService: SpeechService,
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
   * @returns Promise that resolves with array of collected player names in turn order
   */
  async collectNames(
    onTranscript: (handler: (text: string) => void) => void,
  ): Promise<string[]> {
    try {
      Logger.info("Starting name collection phase");

      await this.speechService.speak(
        t("setup.welcome", { game: this.gameName }),
      );

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

      await this.speechService.speak(
        t("setup.ready", { name: this.collectedNames[0] }),
      );

      Logger.info("Name collection complete");

      return this.collectedNames;
    } catch (error) {
      Logger.error("Name collection error:", error);
      throw error;
    }
  }

  private async askPlayerCount(
    onTranscript: (handler: (text: string) => void) => void,
  ): Promise<number> {
    return new Promise<number>((resolve) => {
      const handler = async (text: string): Promise<void> => {
        Logger.info(`Player count handler received: "${text}"`);
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }

        const analysis = await this.llmClient.analyzeResponse(
          text,
          `expecting player count number from ${this.minPlayers} to ${this.maxPlayers}`,
        );
        if (!analysis.isOnTopic) {
          if (analysis.urgentMessage) {
            Logger.info(`LLM debug: ${analysis.urgentMessage}`);
          }
          await this.speechService.speak(
            t("setup.playerCount", {
              min: this.minPlayers,
              max: this.maxPlayers,
            }),
          );
          this.setupTimeout(() => resolve(this.minPlayers), 10000);
          return;
        }

        const lower = text.toLowerCase().trim();
        let count = 0;

        const numberWords = getNumberWords();

        for (let i = 0; i <= 10; i++) {
          if (lower.includes(String(i)) || lower.includes(numberWords[i])) {
            count = i;
            break;
          }
        }

        if (count >= this.minPlayers && count <= this.maxPlayers) {
          resolve(count);
        } else {
          await this.speechService.speak(
            t("setup.playerCountInvalid", {
              min: this.minPlayers,
              max: this.maxPlayers,
            }),
          );
          this.setupTimeout(() => resolve(this.minPlayers), 10000);
        }
      };

      onTranscript(handler);
      this.setupTimeout(async () => {
        Logger.info("Player count timeout - no response received");
        await this.speechService.speak(
          t("setup.playerCountTimeout", { count: this.minPlayers }),
        );
        resolve(this.minPlayers);
      }, 10000);

      void this.speechService.speak(
        t("setup.playerCount", { min: this.minPlayers, max: this.maxPlayers }),
      );
    });
  }

  private async askPlayerName(
    playerNumber: number,
    onTranscript: (handler: (text: string) => void) => void,
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      let attempts = 0;

      const handler = async (text: string): Promise<void> => {
        Logger.info(
          `Name handler for player ${playerNumber} received: "${text}"`,
        );
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }

        const analysis = await this.llmClient.analyzeResponse(
          text,
          "expecting person name",
        );
        if (!analysis.isOnTopic) {
          if (analysis.urgentMessage) {
            Logger.info(`LLM debug: ${analysis.urgentMessage}`);
          }
          await this.speechService.speak(
            t("setup.playerName", { number: playerNumber }),
          );
          this.setupTimeout(
            () => this.handleNameTimeout(playerNumber, resolve, onTranscript),
            10000,
          );
          return;
        }

        const extractedName = await this.llmClient.extractName(text);

        if (extractedName) {
          const validation = validateName(extractedName);
          if (validation.valid) {
            await this.confirmName(
              validation.cleaned,
              onTranscript,
              playerNumber,
              resolve,
            );
            return;
          }
        }

        attempts++;
        if (attempts < 2) {
          await this.speechService.speak(t("setup.extractionFailed"));
          await this.speechService.speak(
            t("setup.playerName", { number: playerNumber }),
          );
          this.setupTimeout(
            () => this.handleNameTimeout(playerNumber, resolve, onTranscript),
            10000,
          );
        } else {
          await this.handleNameTimeout(playerNumber, resolve, onTranscript);
        }
      };

      onTranscript(handler);
      this.setupTimeout(async () => {
        Logger.info(
          `Name timeout for player ${playerNumber} - no valid response`,
        );
        await this.handleNameTimeout(playerNumber, resolve, onTranscript);
      }, 10000);

      void this.speechService.speak(
        t("setup.playerName", { number: playerNumber }),
      );
    });
  }

  private async confirmName(
    name: string,
    onTranscript: (handler: (text: string) => void) => void,
    playerNumber: number,
    resolve: (value: string) => void,
  ): Promise<void> {
    const confirmHandler = async (text: string): Promise<void> => {
      Logger.info(`Confirmation handler received: "${text}"`);
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      const analysis = await this.llmClient.analyzeResponse(
        text,
        "expecting yes/no confirmation",
      );
      if (!analysis.isOnTopic) {
        if (analysis.urgentMessage) {
          Logger.info(`LLM debug: ${analysis.urgentMessage}`);
        }
        await this.speechService.speak(t("setup.nameConfirm", { name }));
        this.setupTimeout(() => resolve(name), 10000);
        return;
      }

      const lower = text.toLowerCase().trim();
      const confirmWords = getConfirmationWords();

      if (confirmWords.yes.some((word) => lower.includes(word))) {
        await this.speechService.speak(t("setup.nameConfirmYes", { name }));
        resolve(name);
      } else if (confirmWords.no.some((word) => lower.includes(word))) {
        await this.speechService.speak(t("setup.nameConfirmRetry"));
        this.retryNameCollection(onTranscript, playerNumber, resolve);
      } else {
        await this.speechService.speak(t("setup.nameConfirmYes", { name }));
        resolve(name);
      }
    };

    onTranscript(confirmHandler);
    this.setupTimeout(async () => {
      Logger.info("Confirmation timeout - assuming yes");
      await this.speechService.speak(t("setup.nameConfirmYes", { name }));
      resolve(name);
    }, 10000);

    void this.speechService.speak(t("setup.nameConfirm", { name }));
  }

  private async retryNameCollection(
    onTranscript: (handler: (text: string) => void) => void,
    playerNumber: number,
    resolve: (value: string) => void,
  ): Promise<void> {
    const handler = async (text: string): Promise<void> => {
      Logger.info(`Retry name handler received: "${text}"`);
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      const analysis = await this.llmClient.analyzeResponse(
        text,
        "expecting person name",
      );
      if (!analysis.isOnTopic) {
        if (analysis.urgentMessage) {
          Logger.info(`LLM debug: ${analysis.urgentMessage}`);
        }
        await this.speechService.speak(t("setup.nameConfirmRetry"));
        this.setupTimeout(
          () => this.handleNameTimeout(playerNumber, resolve, onTranscript),
          10000,
        );
        return;
      }

      const extractedName = await this.llmClient.extractName(text);

      if (extractedName) {
        const validation = validateName(extractedName);
        if (validation.valid) {
          await this.confirmName(
            validation.cleaned,
            onTranscript,
            playerNumber,
            resolve,
          );
          return;
        }
      }

      await this.handleNameTimeout(playerNumber, resolve, onTranscript);
    };

    onTranscript(handler);
    this.setupTimeout(async () => {
      Logger.info("Retry timeout - using fallback name");
      await this.handleNameTimeout(playerNumber, resolve, onTranscript);
    }, 10000);
  }

  private async handleNameTimeout(
    playerNumber: number,
    resolve: (value: string) => void,
    onTranscript?: (handler: (text: string) => void) => void,
  ): Promise<void> {
    const kindName = generateNickname(
      `Player${playerNumber}`,
      this.collectedNames,
    );

    if (!onTranscript) {
      await this.speechService.speak(
        t("setup.nameTimeout", { name: kindName }),
      );
      resolve(kindName);
      return;
    }

    await this.confirmFriendlyName(
      kindName,
      onTranscript,
      playerNumber,
      resolve,
    );
  }

  private async confirmFriendlyName(
    name: string,
    onTranscript: (handler: (text: string) => void) => void,
    playerNumber: number,
    resolve: (value: string) => void,
  ): Promise<void> {
    const confirmHandler = async (text: string): Promise<void> => {
      Logger.info(`Friendly name confirmation handler received: "${text}"`);
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      const analysis = await this.llmClient.analyzeResponse(
        text,
        "expecting yes/no confirmation",
      );
      if (!analysis.isOnTopic) {
        if (analysis.urgentMessage) {
          Logger.info(`LLM debug: ${analysis.urgentMessage}`);
        }
        await this.speechService.speak(t("setup.nameConfirm", { name }));
        this.setupTimeout(() => resolve(name), 10000);
        return;
      }

      const lower = text.toLowerCase().trim();
      const confirmWords = getConfirmationWords();

      if (confirmWords.yes.some((word) => lower.includes(word))) {
        await this.speechService.speak(t("setup.nameConfirmYes", { name }));
        resolve(name);
      } else if (confirmWords.no.some((word) => lower.includes(word))) {
        await this.speechService.speak(t("setup.nameConfirmRetry"));
        this.retryNameCollection(onTranscript, playerNumber, resolve);
      } else {
        await this.speechService.speak(t("setup.nameConfirmYes", { name }));
        resolve(name);
      }
    };

    onTranscript(confirmHandler);
    this.setupTimeout(async () => {
      Logger.info("Friendly name confirmation timeout - assuming yes");
      await this.speechService.speak(t("setup.nameConfirmYes", { name }));
      resolve(name);
    }, 10000);

    void this.speechService.speak(
      t("setup.nameTimeout", { name }) + " " + t("setup.nameConfirm", { name }),
    );
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
        areNamesSimilar(
          this.collectedNames[index],
          this.collectedNames[index - 1],
        )
      ) {
        const baseName = this.collectedNames[index];
        const usedNames = this.collectedNames.slice(0, index);
        const suggestion = generateNickname(baseName, usedNames);

        await this.speechService.speak(
          t("setup.nameConflict", { name: baseName, suggestion }),
        );

        const response = await this.waitForConfirmation(
          onTranscript,
          suggestion,
          baseName,
        );
        this.collectedNames[index] = response;
      }
    }

    const allNames = this.collectedNames
      .join(", ")
      .replace(/, ([^,]*)$/, " y $1");
    await this.speechService.speak(
      t("setup.allNamesReady", { names: allNames }),
    );

    await new Promise<void>((resolve) => {
      const handler = (): void => {
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
        }
        resolve();
      };

      onTranscript(handler);
      this.setupTimeout(() => resolve(), 3000);
    });
  }

  private async waitForConfirmation(
    onTranscript: (handler: (text: string) => void) => void,
    suggestion: string,
    original: string,
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      const handler = async (text: string): Promise<void> => {
        Logger.info(`Conflict resolution handler received: "${text}"`);
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }

        const analysis = await this.llmClient.analyzeResponse(
          text,
          "expecting yes/no confirmation for suggested name",
        );
        if (!analysis.isOnTopic) {
          if (analysis.urgentMessage) {
            Logger.info(`LLM debug: ${analysis.urgentMessage}`);
          }
          await this.speechService.speak(
            t("setup.nameConflict", { name: original, suggestion }),
          );
          this.setupTimeout(() => resolve(suggestion), 10000);
          return;
        }

        const lower = text.toLowerCase().trim();
        const confirmWords = getConfirmationWords();

        if (confirmWords.yes.some((word) => lower.includes(word))) {
          await this.speechService.speak(t("setup.nameConflictPerfect"));
          resolve(suggestion);
        } else if (confirmWords.no.some((word) => lower.includes(word))) {
          await this.speechService.speak(t("setup.nameConflictAlternative"));
          await this.resolveAlternativeName(onTranscript, original, resolve);
        } else {
          resolve(suggestion);
        }
      };

      onTranscript(handler);
      this.setupTimeout(() => {
        Logger.info("Conflict resolution timeout - using suggestion");
        resolve(suggestion);
      }, 10000);
    });
  }

  private async resolveAlternativeName(
    onTranscript: (handler: (text: string) => void) => void,
    fallback: string,
    resolve: (value: string) => void,
  ): Promise<void> {
    const handler = async (text: string): Promise<void> => {
      Logger.info(`Alternative name handler received: "${text}"`);
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      const analysis = await this.llmClient.analyzeResponse(
        text,
        "expecting alternative person name",
      );
      if (!analysis.isOnTopic) {
        if (analysis.urgentMessage) {
          Logger.info(`LLM debug: ${analysis.urgentMessage}`);
        }
        await this.speechService.speak(t("setup.nameConflictAlternative"));
        this.setupTimeout(() => {
          const kindName = generateNickname(fallback, this.collectedNames);
          resolve(kindName);
        }, 10000);
        return;
      }

      const extractedName = await this.llmClient.extractName(text);

      if (extractedName) {
        const validation = validateName(extractedName);
        if (
          validation.valid &&
          !this.collectedNames.includes(validation.cleaned)
        ) {
          await this.speechService.speak(
            t("setup.nameConfirmYes", { name: validation.cleaned }),
          );
          resolve(validation.cleaned);
          return;
        }
      }

      const kindName = generateNickname(fallback, this.collectedNames);
      await this.speechService.speak(
        t("setup.nameConflictFallback", { name: kindName }),
      );
      resolve(kindName);
    };

    onTranscript(handler);
    this.setupTimeout(async () => {
      Logger.info("Alternative name timeout - using fallback");
      const kindName = generateNickname(fallback, this.collectedNames);
      await this.speechService.speak(
        t("setup.nameConflictFallback", { name: kindName }),
      );
      resolve(kindName);
    }, 10000);
  }

  private setupTimeout(callback: () => void, ms: number): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    this.timeoutHandle = window.setTimeout(callback, ms);
  }
}

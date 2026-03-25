import type { LLMClient } from "./LLMClient";
import { formatStateContext } from "./state-context";
import { buildSystemPrompt } from "./system-prompt";
import type { ApiCallOptions, ApiCallResult } from "./types";
import { CONFIG } from "@/config";
import { buildValidateRiddleAnswerPrompt } from "@/i18n/riddle-judge-prompt";
import type { GameState, PrimitiveAction } from "@/orchestrator/types";
import { safeParse, parseArray, tryCoalesceNdjsonObjectArray } from "@/utils/json-parser";
import { Logger } from "@/utils/logger";
import { Profiler } from "@/utils/profiler";

type PromptPurpose = "getActions" | "extractName" | "analyzeResponse" | "validateRiddleAnswer";

export abstract class BaseLLMClient implements LLMClient {
  protected systemPrompt: string = "";
  private lastTranscript: string = "";
  private lastTranscriptTime: number = 0;
  private readonly deduplicationWindowMs = 2000;

  onRetry?: (attempt: number, maxAttempts: number) => void;

  abstract makeApiCall(prompt: string, options: ApiCallOptions): Promise<ApiCallResult>;

  private isTransientError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      /429|Too Many|Model busy/i.test(msg) ||
      /503|Service Unavailable/i.test(msg) ||
      /abort|timeout/i.test(msg)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logPrompt(purpose: PromptPurpose, prompt: string): void {
    const len = prompt.length;
    Logger.prompt(`[${purpose}] (${len} chars)`, {
      purpose,
      fullPrompt: prompt,
      promptLength: len,
    });
  }

  private logPromptResponse(purpose: PromptPurpose, content: string, durationMs?: number): void {
    const len = content.length;
    const durationSuffix = durationMs != null ? ` — ${Math.round(durationMs)}ms` : "";
    Logger.prompt(`[${purpose}] response (${len} chars)${durationSuffix}`, {
      purpose: `${purpose}Response`,
      fullResponse: content,
      responseLength: len,
      ...(durationMs != null && { durationMs }),
    });
  }

  setGameRules(rules: string): void {
    this.systemPrompt = buildSystemPrompt(rules);
    Logger.info("System prompt updated with game rules");
  }

  private async getActionsFirstAttempt(
    transcript: string,
    state: GameState,
    lastBotUtterance?: string,
  ): Promise<PrimitiveAction[]> {
    const actions = await this.attemptLLMCall(transcript, state, lastBotUtterance);
    if (actions.length > 0) {
      this.recordTranscript(transcript);
      return actions;
    }
    Logger.warn("LLM returned empty actions on first attempt");
    return [];
  }

  private async getActionsRetry(
    transcript: string,
    state: GameState,
    lastBotUtterance: string | undefined,
    error: unknown,
  ): Promise<PrimitiveAction[]> {
    const isTransient = this.isTransientError(error);
    Logger.error("LLM attempt 1 failed:", error);
    Logger.info(isTransient ? "Retrying (transient error)..." : "Retrying with error feedback...");
    if (isTransient) {
      this.onRetry?.(1, 2);
      await this.delay(CONFIG.LLM.RETRY_DELAY_MS);
    }
    const retryTranscript = isTransient
      ? transcript
      : `[RETRY: Previous response failed - ${error instanceof Error ? error.message : String(error)}] Original command: "${transcript}"`;
    const actions = await this.attemptLLMCall(retryTranscript, state, lastBotUtterance);
    if (actions.length > 0) {
      this.recordTranscript(transcript);
      return actions;
    }
    Logger.warn("LLM returned empty actions on retry");
    return [];
  }

  async getActions(
    transcript: string,
    state: GameState,
    lastBotUtterance?: string,
  ): Promise<PrimitiveAction[]> {
    if (!this.systemPrompt) {
      throw new Error("Game rules not set. Call setGameRules() first.");
    }
    if (this.isDuplicate(transcript)) {
      Logger.debug("Duplicate request detected, ignoring");
      return [];
    }
    try {
      return await this.getActionsFirstAttempt(transcript, state, lastBotUtterance);
    } catch (error) {
      try {
        return await this.getActionsRetry(transcript, state, lastBotUtterance, error);
      } catch (retryError) {
        Logger.error("LLM retry attempt failed:", retryError);
        Logger.warn("All LLM retries exhausted");
        return [];
      }
    }
  }

  /**
   * Builds the user message for the interpreter. Order matches long-context guidance
   * (large factual block first, latest utterance last): game_state, optional last_utterance, user_command.
   */
  private async attemptLLMCall(
    transcript: string,
    state: GameState,
    lastBotUtterance?: string,
  ): Promise<PrimitiveAction[]> {
    const stateContext = formatStateContext(state as Record<string, unknown>);
    const lastUtteranceBlock =
      lastBotUtterance != null && lastBotUtterance !== ""
        ? `<last_utterance>\n${lastBotUtterance}\n</last_utterance>\n\n`
        : "";
    const userMessage = `<game_state>\n${stateContext}\n</game_state>\n\n${lastUtteranceBlock}<user_command>\n${transcript}\n</user_command>`;
    const fullPrompt = `${this.systemPrompt}\n\n${userMessage}`;

    this.logPrompt("getActions", fullPrompt);
    Profiler.start("llm.network");
    const startTime = performance.now();
    const result = await this.makeApiCall(fullPrompt, {
      temperature: 0.7,
      maxTokens: 512,
      contextParts: { systemPrompt: this.systemPrompt, userMessage },
      timeoutMs: CONFIG.LLM.GET_ACTIONS_TIMEOUT_MS,
    });
    const durationMs = performance.now() - startTime;
    Profiler.end("llm.network");

    const content = result.content;

    if (!content) {
      Logger.error("No content in LLM response");
      return [];
    }

    this.logPromptResponse("getActions", content, durationMs);
    Profiler.start("llm.parsing");
    const actions = this.extractActions(content);
    Profiler.end("llm.parsing");

    return actions;
  }

  async extractName(transcript: string): Promise<string | null> {
    try {
      const prompt = `Extract the person's name from this text. If someone says 'call me X', 'my name is X', 'llámame X', 'me llamo X', 'I am X', 'soy X', or similar, return ONLY the name X as plain text. If the text is just a name with no preamble, return that name. If unclear or no name present, return the word "null". Do not explain, just return the name or "null".

Text: "${transcript}"

Name:`;

      this.logPrompt("extractName", prompt);
      const startTime = performance.now();
      const result = await this.makeApiCall(prompt, {
        temperature: 0.3,
        maxTokens: 50,
      });
      const durationMs = performance.now() - startTime;

      const content = result.content;
      if (content) {
        this.logPromptResponse("extractName", content, durationMs);
      }
      const cleaned = content.trim().toLowerCase();

      if (cleaned === "null" || cleaned === "" || cleaned.length > 50) {
        return null;
      }

      return content.trim();
    } catch (error) {
      Logger.error("extractName error:", error);
      return null;
    }
  }

  async analyzeResponse(
    transcript: string,
    expectedContext: string,
  ): Promise<{ isOnTopic: boolean; urgentMessage?: string }> {
    try {
      const prompt = `Context: ${expectedContext}

User said: "${transcript}"

Analyze if the user's response is on-topic for the context. If it expresses something urgent, unexpected, or off-topic (like an injury, emergency, complaint, request for help, or anything unrelated to the question), return JSON with isOnTopic=false and a brief urgentMessage summarizing what they said. If it's a reasonable response to the context (even if wrong), return isOnTopic=true.

Return ONLY valid JSON in this format:
{"isOnTopic": true}
or
{"isOnTopic": false, "urgentMessage": "brief summary"}

JSON:`;

      this.logPrompt("analyzeResponse", prompt);
      const startTime = performance.now();
      const apiResult = await this.makeApiCall(prompt, {
        temperature: 0.3,
        maxTokens: 100,
        responseFormatJson: true,
      });
      const durationMs = performance.now() - startTime;

      const content = apiResult.content;
      if (content) {
        this.logPromptResponse("analyzeResponse", content, durationMs);
      }

      const markdownMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const jsonString = markdownMatch ? markdownMatch[1].trim() : content.trim();

      const parseResult = safeParse(jsonString);
      if (!parseResult.success) {
        Logger.error("Invalid JSON in analyzeResponse:", parseResult.error);
        return { isOnTopic: true };
      }

      const parsed = parseResult.data as {
        isOnTopic?: boolean;
        urgentMessage?: string;
      };
      return {
        isOnTopic: parsed.isOnTopic !== false,
        urgentMessage: parsed.urgentMessage,
      };
    } catch (error) {
      Logger.error("analyzeResponse error:", error);
      return { isOnTopic: true };
    }
  }

  async validateRiddleAnswer(
    userAnswer: string,
    options: [string, string, string, string],
    correctOption: string,
  ): Promise<{ correct: boolean }> {
    try {
      const prompt = buildValidateRiddleAnswerPrompt(userAnswer, options, correctOption);

      this.logPrompt("validateRiddleAnswer", prompt);
      const startTime = performance.now();
      const apiResult = await this.makeApiCall(prompt, {
        temperature: 0.2,
        maxTokens: 20,
        responseFormatJson: true,
      });
      const durationMs = performance.now() - startTime;

      const content = apiResult.content;
      if (content) {
        this.logPromptResponse("validateRiddleAnswer", content, durationMs);
      }

      const markdownMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const jsonString = markdownMatch ? markdownMatch[1].trim() : content.trim();

      const parseResult = safeParse(jsonString);
      if (!parseResult.success) {
        Logger.error("Invalid JSON in validateRiddleAnswer:", parseResult.error);
        return { correct: false };
      }

      const parsed = parseResult.data as { correct?: boolean };
      return { correct: parsed.correct === true };
    } catch (error) {
      Logger.error("validateRiddleAnswer error:", error);
      return { correct: false };
    }
  }

  protected extractActions(content: string): PrimitiveAction[] {
    try {
      const trimmed = content.trim();
      let result = parseArray<PrimitiveAction>(trimmed);

      if (!result.success) {
        const repaired = tryCoalesceNdjsonObjectArray(trimmed);
        if (repaired) {
          result = parseArray<PrimitiveAction>(repaired);
        }
      }

      if (!result.success) {
        throw new Error(
          `Invalid JSON: ${result.error}. Make sure to return PURE JSON array with no markdown or code blocks.`,
        );
      }

      return this.normalizeExtractedActions(result.data);
    } catch (error) {
      // If parsing fails, throw error with helpful message for retry
      if (error instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON: ${error.message}. Make sure to return PURE JSON array with no markdown or code blocks.`,
          { cause: error },
        );
      }
      throw new Error(error instanceof Error ? error.message : String(error), {
        cause: error,
      });
    }
  }

  /** Models often emit numeric `answer` for rolls; orchestrator validators require a string. */
  private normalizeExtractedActions(actions: PrimitiveAction[]): PrimitiveAction[] {
    return actions.map((a) => {
      if (
        a &&
        typeof a === "object" &&
        "action" in a &&
        a.action === "PLAYER_ANSWERED" &&
        "answer" in a
      ) {
        const ans = (a as { answer?: unknown }).answer;
        if (typeof ans === "number" && Number.isFinite(ans)) {
          return { ...a, answer: String(ans) } as PrimitiveAction;
        }
      }
      return a;
    });
  }

  private isDuplicate(transcript: string): boolean {
    // Never deduplicate system-injected prompts (decision point enforcer, etc.)
    if (transcript.startsWith("[SYSTEM:")) {
      return false;
    }
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastTranscriptTime;

    if (
      transcript.toLowerCase() === this.lastTranscript.toLowerCase() &&
      timeSinceLastRequest < this.deduplicationWindowMs
    ) {
      return true;
    }

    return false;
  }

  private recordTranscript(transcript: string): void {
    this.lastTranscript = transcript;
    this.lastTranscriptTime = Date.now();
  }
}

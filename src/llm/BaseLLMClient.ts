import type { LLMClient } from "./LLMClient";
import { formatStateContext } from "./state-context";
import { buildSystemPrompt } from "./system-prompt";
import type { ApiCallOptions, ApiCallResult } from "./types";
import { CONFIG } from "@/config";
import type { GameState, PrimitiveAction } from "@/orchestrator/types";
import { safeParse, parseArray } from "@/utils/json-parser";
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

  private logPromptResponse(purpose: PromptPurpose, content: string): void {
    const len = content.length;
    Logger.prompt(`[${purpose}] response (${len} chars)`, {
      purpose: `${purpose}Response`,
      fullResponse: content,
      responseLength: len,
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

  private async attemptLLMCall(
    transcript: string,
    state: GameState,
    lastBotUtterance?: string,
  ): Promise<PrimitiveAction[]> {
    const stateContext = formatStateContext(state as Record<string, unknown>);
    const contextLine =
      lastBotUtterance != null && lastBotUtterance !== ""
        ? `Last thing Kali said: "${lastBotUtterance}"\n\n`
        : "";
    const userMessage = `${stateContext}\n\n${contextLine}User Command: "${transcript}"`;
    const fullPrompt = `${this.systemPrompt}\n\n${userMessage}`;

    this.logPrompt("getActions", fullPrompt);
    Profiler.start("llm.network");
    const result = await this.makeApiCall(fullPrompt, {
      temperature: 0.7,
      maxTokens: 512,
      contextParts: { systemPrompt: this.systemPrompt, userMessage },
      timeoutMs: CONFIG.LLM.GET_ACTIONS_TIMEOUT_MS,
    });
    Profiler.end("llm.network");

    const content = result.content;

    if (!content) {
      Logger.error("No content in LLM response");
      return [];
    }

    this.logPromptResponse("getActions", content);
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
      const result = await this.makeApiCall(prompt, {
        temperature: 0.3,
        maxTokens: 50,
      });

      const content = result.content;
      if (content) {
        this.logPromptResponse("extractName", content);
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
      const apiResult = await this.makeApiCall(prompt, {
        temperature: 0.3,
        maxTokens: 100,
        responseFormatJson: true,
      });

      const content = apiResult.content;
      if (content) {
        this.logPromptResponse("analyzeResponse", content);
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
      const optionsList = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
      const prompt = `Eres un juez de respuestas a una pregunta de trivia. Idioma: español (Argentina).

Opciones de la pregunta (exactamente 4):
${optionsList}

La opción correcta es: "${correctOption}"

El usuario respondió: "${userAnswer}"

¿La respuesta del usuario es correcta? Considera sinónimos, paráfrasis y expresiones equivalentes. Responde ÚNICAMENTE con un JSON válido: {"correct": true} o {"correct": false}. Sin explicación.

JSON:`;

      this.logPrompt("validateRiddleAnswer", prompt);
      const apiResult = await this.makeApiCall(prompt, {
        temperature: 0.2,
        maxTokens: 20,
        responseFormatJson: true,
      });

      const content = apiResult.content;
      if (content) {
        this.logPromptResponse("validateRiddleAnswer", content);
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
      // Try pure JSON first (no markdown extraction)
      const trimmed = content.trim();
      const result = parseArray<PrimitiveAction>(trimmed);

      if (!result.success) {
        throw new Error(
          `Invalid JSON: ${result.error}. Make sure to return PURE JSON array with no markdown or code blocks.`,
        );
      }

      return result.data;
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

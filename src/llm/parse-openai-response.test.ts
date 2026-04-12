import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseOpenAIResponse } from "./parse-openai-response";
import { Logger } from "@/utils/logger";

describe("Product scenario: Parse OpenAI Response", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Expected outcome: Throws for non object payload", () => {
    expect(() => parseOpenAIResponse(null, "DeepInfra")).toThrow(
      "Invalid DeepInfra API response format",
    );
    expect(() => parseOpenAIResponse("not-an-object", "Groq")).toThrow(
      "Invalid Groq API response format",
    );
  });

  it("Expected outcome: Returns content when choices payload is valid", () => {
    const result = parseOpenAIResponse(
      {
        choices: [{ message: { content: '[{"action":"NARRATE","text":"ok"}]' } }],
      },
      "OpenRouter",
    );

    expect(result).toBe('[{"action":"NARRATE","text":"ok"}]');
  });

  it("Expected outcome: Returns empty string and logs when content is missing", () => {
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    const payload = { choices: [{ message: {} }] };

    const result = parseOpenAIResponse(payload, "DeepInfra");

    expect(result).toBe("");
    expect(errorSpy).toHaveBeenCalledWith("No content in DeepInfra response:", payload);
  });
});

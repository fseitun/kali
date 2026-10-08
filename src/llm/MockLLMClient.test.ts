import { describe, expect, it } from "vitest";
import { MockLLMClient } from "./MockLLMClient";
import type { GameState, PrimitiveAction } from "@/orchestrator/types";

const state = {} as GameState;

describe("Product scenario: Mock LLM Client", () => {
  it("Expected outcome: Serves scripted responses in order", async () => {
    const script: PrimitiveAction[][] = [
      [{ action: "NARRATE", text: "one" }],
      [{ action: "NARRATE", text: "two" }],
    ];
    const client = new MockLLMClient("scripted", script);

    expect(await client.getActions("a", state)).toEqual(script[0]);
    expect(await client.getActions("b", state)).toEqual(script[1]);
  });

  it("Expected outcome: Fails loudly instead of replaying when the script runs out", async () => {
    const client = new MockLLMClient("scripted", [[{ action: "NARRATE", text: "one" }]]);

    await client.getActions("a", state);

    await expect(client.getActions("b", state)).rejects.toThrow(/exhausted at call #2/);
  });

  it("Expected outcome: Keeps accents when extracting a name", async () => {
    const client = new MockLLMClient("scripted", []);

    expect(await client.extractName("me llamo Sofía")).toBe("Sofía");
    expect(await client.extractName("Martín")).toBe("Martín");
    expect(await client.extractName("my name is José")).toBe("José");
  });
});

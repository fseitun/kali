import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Product scenario: LLM Client Factory", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function buildWithProvider(provider: string): Promise<unknown> {
    vi.doMock("@/config", () => ({
      CONFIG: { LLM_PROVIDER: provider },
    }));

    vi.doMock("./DeepInfraClient", () => ({
      DeepInfraClient: class DeepInfraClient {},
    }));
    vi.doMock("./MockLLMClient", () => ({
      MockLLMClient: class MockLLMClient {},
    }));

    const { createLLMClient } = await import("./llm-client-factory");
    return createLLMClient();
  }

  it.each([
    ["deepinfra", "DeepInfraClient"],
    ["mock", "MockLLMClient"],
  ])(
    "Expected outcome: Creates %s provider instance",
    async (provider: string, expectedCtor: string) => {
      const instance = await buildWithProvider(provider);
      expect((instance as { constructor: { name: string } }).constructor.name).toBe(expectedCtor);
    },
  );

  it("Expected outcome: Throws for unknown provider", async () => {
    await expect(buildWithProvider("unknown-provider")).rejects.toThrow(
      "Unknown LLM provider: unknown-provider",
    );
  });
});

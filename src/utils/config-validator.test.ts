import { describe, it, expect } from "vitest";
import { ConfigValidationError } from "./config-validator";

describe("Product scenario: Config validator", () => {
  describe("Product scenario: Config Validation Error", () => {
    it("Expected outcome: Should be instance of Error", () => {
      const error = new ConfigValidationError("test message");
      expect(error).toBeInstanceOf(Error);
    });

    it("Expected outcome: Should have correct name", () => {
      const error = new ConfigValidationError("test message");
      expect(error.name).toBe("ConfigValidationError");
    });

    it("Expected outcome: Should preserve message", () => {
      const message = "test validation error";
      const error = new ConfigValidationError(message);
      expect(error.message).toBe(message);
    });

    it("Expected outcome: Should be throwable", () => {
      expect(() => {
        throw new ConfigValidationError("test error");
      }).toThrow(ConfigValidationError);
    });

    it("Expected outcome: Should preserve stack trace", () => {
      const error = new ConfigValidationError("test message");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("ConfigValidationError");
    });
  });
});

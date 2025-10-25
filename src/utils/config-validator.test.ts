import { describe, it, expect } from "vitest";
import { ConfigValidationError } from "./config-validator";

describe("config-validator", () => {
  describe("ConfigValidationError", () => {
    it("should be instance of Error", () => {
      const error = new ConfigValidationError("test message");
      expect(error).toBeInstanceOf(Error);
    });

    it("should have correct name", () => {
      const error = new ConfigValidationError("test message");
      expect(error.name).toBe("ConfigValidationError");
    });

    it("should preserve message", () => {
      const message = "test validation error";
      const error = new ConfigValidationError(message);
      expect(error.message).toBe(message);
    });

    it("should be throwable", () => {
      expect(() => {
        throw new ConfigValidationError("test error");
      }).toThrow(ConfigValidationError);
    });

    it("should preserve stack trace", () => {
      const error = new ConfigValidationError("test message");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("ConfigValidationError");
    });
  });
});

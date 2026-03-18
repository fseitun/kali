import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePositiveIntEnv } from "./parse-positive-int-env";

describe("parsePositiveIntEnv", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns default when value is undefined", () => {
    expect(parsePositiveIntEnv(undefined, 60_000)).toBe(60_000);
  });

  it("returns default when value is null", () => {
    expect(parsePositiveIntEnv(null, 60_000)).toBe(60_000);
  });

  it("returns default when value is empty string", () => {
    expect(parsePositiveIntEnv("", 60_000)).toBe(60_000);
  });

  it("returns default when value is whitespace-only", () => {
    expect(parsePositiveIntEnv("  \t  ", 60_000)).toBe(60_000);
  });

  it("parses plain digits", () => {
    expect(parsePositiveIntEnv("60000", 60_000)).toBe(60_000);
    expect(parsePositiveIntEnv("90000", 90_000)).toBe(90_000);
    expect(parsePositiveIntEnv("1", 100)).toBe(1);
  });

  it("normalizes underscores (e.g. 10_000)", () => {
    expect(parsePositiveIntEnv("10_000", 60_000)).toBe(10_000);
    expect(parsePositiveIntEnv("60_000", 60_000)).toBe(60_000);
  });

  it("normalizes commas", () => {
    expect(parsePositiveIntEnv("60,000", 60_000)).toBe(60_000);
  });

  it("returns default for non-numeric string", () => {
    expect(parsePositiveIntEnv("abc", 60_000)).toBe(60_000);
    expect(parsePositiveIntEnv("60 seconds", 60_000)).toBe(60_000);
  });

  it("returns default for negative value", () => {
    expect(parsePositiveIntEnv("-1", 60_000)).toBe(60_000);
  });

  it("returns default for zero", () => {
    expect(parsePositiveIntEnv("0", 60_000)).toBe(60_000);
  });

  it("returns default for float (non-integer)", () => {
    expect(parsePositiveIntEnv("60.5", 60_000)).toBe(60_000);
  });

  it("warns when value is invalid and envKey is provided", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parsePositiveIntEnv("invalid", 60_000, "VITE_LLM_REQUEST_TIMEOUT_MS");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("VITE_LLM_REQUEST_TIMEOUT_MS"));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid VITE_LLM_REQUEST_TIMEOUT_MS: "invalid"'),
    );
  });

  it("does not warn when envKey is omitted", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parsePositiveIntEnv("invalid", 60_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when value is valid", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parsePositiveIntEnv("60000", 60_000, "VITE_LLM_REQUEST_TIMEOUT_MS");
    expect(warn).not.toHaveBeenCalled();
  });
});

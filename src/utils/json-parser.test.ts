import { describe, expect, it } from "vitest";
import { extractSequentialJsonValues, tryCoalesceNdjsonObjectArray } from "./json-parser";

describe("json-parser NDJSON helpers", () => {
  it("extractSequentialJsonValues parses two root objects", () => {
    const s = '{"action":"NARRATE","text":"a"}\n{"action":"PLAYER_ROLLED","value":3}';
    const values = extractSequentialJsonValues(s);
    expect(values).toHaveLength(2);
    expect(values[0]).toEqual({ action: "NARRATE", text: "a" });
    expect(values[1]).toEqual({ action: "PLAYER_ROLLED", value: 3 });
  });

  it("handles newline inside string in first object", () => {
    const s = '{"action":"NARRATE","text":"line1\\nline2"}\n{"action":"PLAYER_ROLLED","value":1}';
    const values = extractSequentialJsonValues(s);
    expect(values).toHaveLength(2);
    expect((values[0] as { text: string }).text).toBe("line1\nline2");
  });

  it("returns empty when trailing junk after valid JSON", () => {
    const s = '{"a":1}\n{"b":2}\nextra';
    expect(extractSequentialJsonValues(s)).toEqual([]);
  });

  it("tryCoalesceNdjsonObjectArray returns null for single object", () => {
    expect(tryCoalesceNdjsonObjectArray('{"x":1}')).toBeNull();
  });

  it("tryCoalesceNdjsonObjectArray returns array string for two objects", () => {
    const s = '{"a":1}\n{"b":2}';
    const coalesced = tryCoalesceNdjsonObjectArray(s);
    expect(coalesced).toBe('[{"a":1},{"b":2}]');
  });

  it("tryCoalesceNdjsonObjectArray returns null when first value is array", () => {
    const s = '[1,2]\n{"a":1}';
    expect(tryCoalesceNdjsonObjectArray(s)).toBeNull();
  });
});

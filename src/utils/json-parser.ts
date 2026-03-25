/**
 * Safe JSON parsing utilities with proper error handling.
 */

/**
 * Safely parses JSON text with error handling.
 * @param text - The JSON string to parse
 * @returns Either success with parsed data or failure with error message
 */
export function safeParse<T = unknown>(
  text: string,
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(text) as T;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Safely parses JSON text expecting an array.
 * @param text - The JSON string to parse
 * @returns Either success with parsed array or failure with error message
 */
export function parseArray<T = unknown>(
  text: string,
): { success: true; data: T[] } | { success: false; error: string } {
  const result = safeParse<T[]>(text);
  if (!result.success) {
    return result;
  }

  if (!Array.isArray(result.data)) {
    return {
      success: false,
      error: `Expected array, got ${typeof result.data}`,
    };
  }

  return { success: true, data: result.data };
}

type JsonScanState = { stack: string[]; inString: boolean; escape: boolean };

function scanInsideString(state: JsonScanState, ch: string): null {
  if (ch === "\\") {
    state.escape = true;
  } else if (ch === '"') {
    state.inString = false;
  }
  return null;
}

function scanOutsideString(state: JsonScanState, ch: string): "closed" | "invalid" | null {
  if (ch === '"') {
    state.inString = true;
    return null;
  }
  if (ch === "{") {
    state.stack.push("}");
    return null;
  }
  if (ch === "[") {
    state.stack.push("]");
    return null;
  }
  if (ch === "}" || ch === "]") {
    const expected = state.stack.pop();
    if (ch !== expected) {
      return "invalid";
    }
    if (state.stack.length === 0) {
      return "closed";
    }
    return null;
  }
  return null;
}

function jsonScanStep(state: JsonScanState, ch: string): "closed" | "invalid" | null {
  if (state.escape) {
    state.escape = false;
    return null;
  }
  if (state.inString) {
    return scanInsideString(state, ch);
  }
  return scanOutsideString(state, ch);
}

/**
 * Consumes one JSON value starting at `start` (after optional whitespace).
 * Handles strings with escapes and nested `{}` / `[]`.
 */
function consumeJsonValue(input: string, start: number): { end: number; slice: string } | null {
  let i = start;
  const len = input.length;
  while (i < len && /\s/.test(input[i])) {
    i++;
  }
  if (i >= len) {
    return null;
  }
  const valueStart = i;
  const c = input[i];
  if (c !== "{" && c !== "[") {
    return null;
  }

  const state: JsonScanState = {
    stack: [c === "{" ? "}" : "]"],
    inString: false,
    escape: false,
  };
  i++;

  for (; i < len; i++) {
    const step = jsonScanStep(state, input[i]);
    if (step === "invalid") {
      return null;
    }
    if (step === "closed") {
      return { end: i + 1, slice: input.slice(valueStart, i + 1) };
    }
  }
  return null;
}

/**
 * Parses sequential top-level JSON values (e.g. NDJSON: `{...}\n{...}`).
 * Stops when remaining text is only whitespace or a non-JSON prefix appears.
 */
export function extractSequentialJsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  let pos = 0;
  const len = text.length;
  while (pos < len) {
    while (pos < len && /\s/.test(text[pos])) {
      pos++;
    }
    if (pos >= len) {
      break;
    }
    const consumed = consumeJsonValue(text, pos);
    if (!consumed) {
      break;
    }
    const parsed = safeParse(consumed.slice);
    if (!parsed.success) {
      break;
    }
    values.push(parsed.data);
    pos = consumed.end;
  }
  while (pos < len && /\s/.test(text[pos])) {
    pos++;
  }
  if (pos < len) {
    return [];
  }
  return values;
}

/**
 * If the model returned two or more top-level JSON objects instead of an array,
 * coalesce them into a JSON array string for normal parsing.
 */
export function tryCoalesceNdjsonObjectArray(text: string): string | null {
  const trimmed = text.trim();
  const values = extractSequentialJsonValues(trimmed);
  if (values.length < 2) {
    return null;
  }
  if (!values.every((v) => v !== null && typeof v === "object" && !Array.isArray(v))) {
    return null;
  }
  return JSON.stringify(values);
}

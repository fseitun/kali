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

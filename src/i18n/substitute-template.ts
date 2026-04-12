/**
 * Replaces `{key}` placeholders in a template string.
 */
export function substituteTemplateVars(
  template: string,
  vars: Record<string, string | number>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

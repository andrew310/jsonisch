/**
 * Eslint-style `{{ placeholder }}` interpolation (ANALYSIS-eslint.md §1.5).
 * An unsupplied placeholder is left literally in place rather than blanked.
 */
export function interpolate(
  text: string,
  data?: Readonly<Record<string, string | number>>,
): string {
  return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (full, key: string) => {
    if (!data || !Object.prototype.hasOwnProperty.call(data, key)) return full;
    return String(data[key]);
  });
}

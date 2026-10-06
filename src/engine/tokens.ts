/** A quoted stretch of a line: first and last token index, both included. */
export type TokenRange = [start: number, end: number];

/** Splits a line on whitespace. Tokens are numbered from 0; every quote is cut by these indexes. */
export function tokenize(text: string): string[] {
  const trimmed = text.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/u);
}

/** True when `range` is two whole numbers that name at least one existing token. */
export function isValidRange(range: unknown, tokenCount: number): range is TokenRange {
  if (!Array.isArray(range) || range.length !== 2) return false;
  const [start, end] = range as unknown[];
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    (start as number) >= 0 &&
    (end as number) >= (start as number) &&
    (end as number) < tokenCount
  );
}

/** The quoted words, exactly as stored; null when the range does not fit the line. */
export function sliceTokens(tokens: string[], range: unknown): string | null {
  if (!isValidRange(range, tokens.length)) return null;
  return tokens.slice(range[0], range[1] + 1).join(" ");
}

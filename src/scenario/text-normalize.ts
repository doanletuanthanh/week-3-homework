/**
 * Lower-case, without Vietnamese diacritics ("Đám cưới" becomes "dam cuoi"). Look-alike forms
 * (full-width letters) are folded and invisible format characters removed, so neither can hide a
 * word from a match.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

/** Normalized words and numbers of a text, in order; punctuation and spacing are dropped. */
export function tokenize(text: string): string[] {
  return normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * True when the words of `term` occur in `text` next to each other and in the same order,
 * ignoring case and diacritics. Whole words only: "app" is not found in "apple".
 */
export function containsTerm(text: string, term: string): boolean {
  const needle = tokenize(term);
  if (needle.length === 0) return false;
  const haystack = tokenize(text);
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }
  return false;
}

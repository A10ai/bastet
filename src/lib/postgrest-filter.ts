/**
 * Helpers for building PostgREST filter strings safely.
 *
 * `.or("first_name.ilike.%" + term + "%,...")` hands the raw search term to
 * PostgREST's filter grammar, where `,` `(` `)` `.` and `"` have meaning.
 * A term such as `x%,email.like.a*` becomes an extra predicate on any
 * column. Values are therefore reduced to a conservative character set and
 * wrapped in double quotes (PostgREST's quoting for reserved characters).
 */

const MAX_TERM_LENGTH = 80;

/** Strip filter-grammar and LIKE wildcards; keep letters, digits, space and a few punctuation marks. */
export function sanitizeSearchTerm(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} @._'+-]/gu, "")
    .trim()
    .slice(0, MAX_TERM_LENGTH);
}

/**
 * Build the argument for `.or()` that matches `term` case-insensitively in
 * any of `columns`. Returns null when the term is empty after sanitising so
 * the caller can skip the filter.
 */
export function ilikeAnyFilter(columns: readonly string[], raw: string | null | undefined): string | null {
  const term = sanitizeSearchTerm(raw);
  if (!term) return null;
  // Double quotes are removed by sanitizeSearchTerm, so the value cannot
  // close the quoted literal early.
  const value = `"%${term}%"`;
  return columns.map((c) => `${c}.ilike.${value}`).join(",");
}

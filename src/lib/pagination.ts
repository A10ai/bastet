/**
 * Pagination for list endpoints.
 *
 * Supabase caps a query at 1,000 rows silently; without explicit paging a
 * list that grows past that just loses rows. Every list route now accepts
 * `limit` and `offset` (or `page`) and returns `meta.total`.
 */
export interface Pagination {
  limit: number;
  offset: number;
}

export function parsePagination(
  searchParams: URLSearchParams,
  opts: { defaultLimit?: number; maxLimit?: number } = {}
): Pagination {
  const defaultLimit = opts.defaultLimit ?? 200;
  const maxLimit = opts.maxLimit ?? 1000;
  const rawLimit = parseInt(searchParams.get("limit") || "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  const rawOffset = parseInt(searchParams.get("offset") || "", 10);
  const rawPage = parseInt(searchParams.get("page") || "", 10);
  let offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  if (!offset && Number.isFinite(rawPage) && rawPage > 1) offset = (rawPage - 1) * limit;
  return { limit, offset };
}

export function paginationMeta(p: Pagination, total: number | null, returned: number) {
  const t = total ?? p.offset + returned;
  return { total: t, limit: p.limit, offset: p.offset, has_more: p.offset + returned < t };
}

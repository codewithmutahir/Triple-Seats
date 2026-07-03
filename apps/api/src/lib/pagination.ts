export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function parsePagination(
  query: Record<string, unknown>,
  defaultPageSize = DEFAULT_PAGE_SIZE
) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const requestedSize =
    parseInt(String(query.pageSize ?? defaultPageSize), 10) || defaultPageSize;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize));
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export type PaginatedMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function formatShowingRange(opts: {
  page: number;
  pageSize: number;
  total: number;
  itemLabel: string;
  itemLabelPlural?: string;
}) {
  const { page, pageSize, total, itemLabel, itemLabelPlural = `${itemLabel}s` } = opts;

  if (total === 0) return `No ${itemLabelPlural} found`;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const label = total === 1 ? itemLabel : itemLabelPlural;

  return `Showing ${start}–${end} of ${total} ${label}`;
}

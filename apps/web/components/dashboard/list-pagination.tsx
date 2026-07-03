"use client";

import { Button } from "@/components/ui/button";
import { formatShowingRange } from "@/lib/list-pagination";

type ListPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  itemLabel: string;
  itemLabelPlural?: string;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

export function ListPagination({
  page,
  totalPages,
  total,
  pageSize,
  itemLabel,
  itemLabelPlural,
  loading = false,
  onPageChange
}: ListPaginationProps) {
  if (total === 0) return null;

  const hasMultiplePages = totalPages > 1;
  const summary = formatShowingRange({ page, pageSize, total, itemLabel, itemLabelPlural });

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        {summary}
        {hasMultiplePages ? ` · Page ${page} of ${totalPages}` : null}
      </p>
      {hasMultiplePages ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

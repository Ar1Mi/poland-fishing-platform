import { useId } from 'react';
import { barShare } from './BarList';

export interface MonthColumn {
  /** `YYYY-MM`. */
  month: string;
  value: number;
  /** Read by screen readers in place of the column, e.g. `październik 2026: 4 zezwolenia`. */
  label: string;
  /** Under the column from 640 px, e.g. `paź`. */
  shortLabel: string;
  /** Under the column on a phone, e.g. `p`: thirteen short names do not fit 375 px. */
  narrowLabel: string;
}

/**
 * A column per month (at most 13 — fits 375 px). Each column is a list item whose text is its
 * label; the column and the short month under it are decoration for the eye.
 */
export function MonthColumns({ title, columns }: { title: string; columns: MonthColumn[] }) {
  const titleId = useId();
  const max = Math.max(0, ...columns.map((column) => column.value));
  return (
    <figure className="flex flex-col gap-3" aria-labelledby={titleId}>
      <figcaption id={titleId} className="caption text-muted-foreground">
        {title}
      </figcaption>
      <ol className="flex h-40 items-stretch gap-1">
        {columns.map((column) => (
          <li key={column.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="sr-only">{column.label}</span>
            {/* The top padding keeps room for the value over the tallest column. */}
            <div aria-hidden className="flex w-full flex-1 items-end justify-center pt-5">
              <div
                className="relative w-full max-w-8 rounded-t-sm bg-primary"
                style={{ height: `${barShare(column.value, max)}%` }}
              >
                {column.value > 0 && (
                  <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 font-mono text-label text-muted-foreground">
                    {column.value}
                  </span>
                )}
              </div>
            </div>
            <span aria-hidden className="w-full text-center text-label">
              <span className="sm:hidden">{column.narrowLabel}</span>
              <span className="hidden sm:inline">{column.shortLabel}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

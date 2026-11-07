// Paginated lists (docs/05-api.md → «Общие правила»): `?page=1&pageSize=20`, at most 100,
// answered with `{ items, total, page, pageSize }`.

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Pages needed for `total` items; an empty list still has its first page. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

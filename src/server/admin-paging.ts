/** Rows per page of every admin list. There is no bulk export: a page is all one read returns. */
export const ADMIN_PAGE_ROWS = 50;

export type AdminPage<T> = { rows: T[]; page: number; pages: number; total: number };

/** A URL can repeat a key (`?a=1&a=2`), which Next hands over as a list: the first value counts. */
export const firstParam = (raw: string | string[] | undefined): string | undefined => (Array.isArray(raw) ? raw[0] : raw);

/** The 1-based page from a URL; anything that is not a positive whole number is page 1. */
export function pageNumber(raw: string | string[] | undefined): number {
  const page = Number(firstParam(raw));
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

export const pageWindow = (page: number) => ({ offset: (page - 1) * ADMIN_PAGE_ROWS, limit: ADMIN_PAGE_ROWS });

export const pageOf = <T>(rows: T[], page: number, total: number): AdminPage<T> => ({
  rows,
  page,
  pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_ROWS)),
  total,
});

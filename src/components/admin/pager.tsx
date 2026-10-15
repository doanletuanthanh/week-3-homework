import Link from "next/link";

type Props = {
  page: number;
  pages: number;
  total: number;
  /** The list's own path. */
  path: string;
  /** The filters the list was opened with, kept on every page link. */
  params?: Record<string, string | undefined>;
};

/** Previous and next links of a server-paginated admin list. */
export function Pager({ page, pages, total, path, params = {} }: Props) {
  const hrefOf = (target: number) => {
    const query = new URLSearchParams(Object.entries({ ...params, page: target > 1 ? String(target) : undefined }).filter((entry): entry is [string, string] => Boolean(entry[1])));
    const search = query.toString();
    return search ? `${path}?${search}` : path;
  };
  return (
    <nav className="adm-meta body-sm" aria-label="Phân trang">
      <span className="c-variant">
        Trang {page}/{pages} · {total} dòng
      </span>
      {page > 1 && <Link href={hrefOf(page - 1)}>← Trang trước</Link>}
      {page < pages && <Link href={hrefOf(page + 1)}>Trang sau →</Link>}
    </nav>
  );
}

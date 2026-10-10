"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorRetry } from "@/components/ui/error-retry";
import type { SessionListItem } from "@/server/session-list";
import { SessionRow } from "./session-row";

type Props = { initialItems: SessionListItem[]; initialNextOffset: number | null };

type Page = { items: SessionListItem[]; nextOffset: number | null };

/**
 * The learner's sessions, newest first. The first page comes with the page; "Tải thêm" adds the
 * next twenty. A failed load keeps the rows already shown and offers the standard retry.
 */
export function SessionList({ initialItems, initialNextOffset }: Props) {
  const [items, setItems] = useState(initialItems);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [loading, setLoading] = useState(false);
  /** Null while nothing has failed; otherwise how many retries failed after the first failure. */
  const [failedRetries, setFailedRetries] = useState<number | null>(null);
  /** The rows the last "Tải thêm" added: where they start and how many they are. */
  const [added, setAdded] = useState<{ from: number; count: number } | null>(null);
  const rows = useRef<HTMLUListElement>(null);

  // The button that was pressed may be gone with the last page: focus goes on to the first new row.
  useEffect(() => {
    if (added) rows.current?.children[added.from]?.querySelector("a")?.focus();
  }, [added]);

  async function loadMore() {
    if (nextOffset === null || loading) return;
    setLoading(true);
    let page: Page | null = null;
    try {
      const response = await fetch(`/api/sessions?offset=${nextOffset}`, { headers: { accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      // The sign-in ran out: sign in, then come back to this page.
      if (!response.ok && body.redirectTo) return window.location.assign(body.redirectTo);
      if (response.ok) page = body as Page;
    } catch {
      // Handled below as a failed load.
    }
    setLoading(false);
    if (!page) return setFailedRetries((failed) => (failed === null ? 0 : failed + 1));

    const loaded = page;
    setFailedRetries(null);
    // A session started in another tab since the page opened shifts the list: no row is shown twice.
    const fresh = loaded.items.filter((item) => !items.some((shown) => shown.id === item.id));
    setItems([...items, ...fresh]);
    setAdded(fresh.length > 0 ? { from: items.length, count: fresh.length } : null);
    setNextOffset(loaded.nextOffset);
  }

  return (
    <section className="card slist" aria-label="Danh sách buổi">
      <div className="shead" aria-hidden="true">
        <span />
        <span>Buổi</span>
        <span>Ngày</span>
        <span>Kết quả</span>
        <span className="shead-state">Trạng thái</span>
      </div>
      <ul className="srows" ref={rows}>
        {items.map((item) => (
          <SessionRow key={item.id} item={item} />
        ))}
      </ul>
      {/* Always on the page, so the rows a load added are read out. The total makes each load's line a new one. */}
      <p className="sr" aria-live="polite">
        {added && `Đã thêm ${added.count} buổi, đang hiện ${added.from + added.count} buổi.`}
      </p>
      {nextOffset !== null && (
        <div className="smore">
          {failedRetries === null ? (
            <button type="button" className="btn btn-surface btn-md smore-btn" onClick={() => void loadMore()} disabled={loading}>
              {loading ? "Đang tải…" : "Tải thêm"}
            </button>
          ) : (
            <ErrorRetry variant="inline" failedRetries={failedRetries} retrying={loading} onRetry={() => void loadMore()} />
          )}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
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
    setItems((current) => [...current, ...loaded.items.filter((item) => !current.some((shown) => shown.id === item.id))]);
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
      <ul className="srows">
        {items.map((item) => (
          <SessionRow key={item.id} item={item} />
        ))}
      </ul>
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

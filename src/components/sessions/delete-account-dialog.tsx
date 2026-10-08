"use client";

import { useId, useState } from "react";
import { LockIcon, TrashIcon } from "@/components/icons";
import { sendJson } from "@/components/interview/turn-request";
import { Dialog } from "@/components/ui/dialog";
import { ErrorRetry, MAX_RETRIES } from "@/components/ui/error-retry";
import { DELETE_ACCOUNT, DELETE_CONFIRM_WORD } from "@/strings/product-strings";

type Props = {
  /** A scenario is being prepared for the learner: the account waits for it to finish. */
  blocked: boolean;
};

/**
 * "Xóa tài khoản và toàn bộ dữ liệu" (FR-66). The dialog says what goes and what stays, and the
 * button that deletes is locked until the learner has typed the word. A failure deletes nothing
 * and leaves the dialog as it was, with the standard retry.
 */
export function DeleteAccountDialog({ blocked }: Props) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  /** Null while nothing has failed; otherwise how many retries failed after the first failure. */
  const [failedRetries, setFailedRetries] = useState<number | null>(null);
  const [mustWait, setMustWait] = useState(blocked);

  // The word carries an accent, which some keyboards type as two characters.
  const confirmed = typed.normalize("NFC").trim() === DELETE_CONFIRM_WORD;
  const exhausted = failedRetries !== null && failedRetries >= MAX_RETRIES;

  function close() {
    if (deleting) return;
    setOpen(false);
    setTyped("");
    setFailedRetries(null);
  }

  async function remove() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    const outcome = await sendJson("/api/account", "DELETE", { confirm: DELETE_CONFIRM_WORD });
    if (outcome.ok) {
      // A full load: the header and every cached page belong to an account that no longer exists.
      return window.location.replace("/");
    }
    if (outcome.redirectTo) return window.location.assign(outcome.redirectTo);
    setDeleting(false);
    if (outcome.error === "generating") {
      setMustWait(true);
      setOpen(false);
      return;
    }
    setFailedRetries((failed) => (failed === null ? 0 : failed + 1));
  }

  return (
    <>
      <div className="acct-delete">
        <button type="button" className="btn btn-ghost-danger btn-md" onClick={() => setOpen(true)} disabled={mustWait}>
          <TrashIcon size={16} />
          Xóa tài khoản và toàn bộ dữ liệu
        </button>
        {mustWait && (
          <span className="body-sm c-outline acct-wait">
            <LockIcon size={14} />
            Đợi kịch bản đang chuẩn bị xong rồi xóa.
          </span>
        )}
      </div>

      <Dialog open={open} onClose={close} labelledBy="delete-title" role="alertdialog">
        <span className="dlg-mark dlg-mark-danger">
          <TrashIcon size={22} />
        </span>
        <h2 id="delete-title" className="headline-md">
          {DELETE_ACCOUNT.title}
        </h2>
        <div className="dlg-text">
          <p className="body-md c-variant">{DELETE_ACCOUNT.body}</p>
          <p className="body-sm c-variant">{DELETE_ACCOUNT.kept}</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <div className="field dlg-field">
            <label htmlFor={inputId}>Gõ {DELETE_CONFIRM_WORD} để xác nhận</label>
            <input
              id={inputId}
              className="input"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={deleting}
            />
          </div>
          {failedRetries !== null && <ErrorRetry variant="inline" failedRetries={failedRetries} retrying={deleting} onRetry={() => void remove()} />}
          <div className="dlg-actions">
            <button type="button" className="btn btn-tonal btn-md" onClick={close} disabled={deleting}>
              Hủy
            </button>
            <button type="submit" className="btn btn-danger btn-md" disabled={!confirmed || deleting || exhausted}>
              {!deleting && <TrashIcon size={16} />}
              {deleting ? "Đang xóa…" : "Xóa vĩnh viễn"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

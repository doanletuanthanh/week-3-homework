"use client";

import { AlertIcon, NoteIcon } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  /** The end request is on its way: both buttons are locked. */
  ending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** "Kết thúc buổi" asks first: ending freezes the notes for good. */
export function EndSessionDialog({ open, ending, error, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} labelledBy="end-title" role="alertdialog">
      <span className="dlg-mark">
        <NoteIcon size={22} />
      </span>
      <h2 id="end-title" className="headline-md">
        Kết thúc và đóng băng ghi chú?
      </h2>
      {error && (
        <p className="ferr" role="alert">
          <AlertIcon size={16} />
          {error}
        </p>
      )}
      <div className="dlg-actions">
        <button type="button" className="btn btn-tonal btn-md" onClick={onCancel} disabled={ending}>
          Hỏi tiếp
        </button>
        <button type="button" className="btn btn-primary btn-md" onClick={onConfirm} disabled={ending}>
          {ending ? "Đang kết thúc…" : "Kết thúc buổi"}
        </button>
      </div>
    </Dialog>
  );
}

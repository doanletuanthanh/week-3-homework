"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  /** Esc was pressed. The dialog stays open until `open` turns false. */
  onClose: () => void;
  /** Id of the element that names the dialog. */
  labelledBy: string;
  role?: "dialog" | "alertdialog";
  children: ReactNode;
};

/**
 * A modal dialog on the native element: the browser keeps focus inside it, makes the page behind
 * it inert, and gives focus back to the button that opened it.
 */
export function Dialog({ open, onClose, labelledBy, role = "dialog", children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="dlg"
      role={role}
      aria-labelledby={labelledBy}
      // A second Esc makes the browser close the dialog by itself: it stays open while `open` says so.
      onClose={(event) => {
        if (open) event.currentTarget.showModal();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

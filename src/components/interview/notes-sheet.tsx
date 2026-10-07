"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { ChevronDownIcon, NoteIcon } from "@/components/icons";
import { useIsMobile } from "@/hooks/use-is-mobile";

/** A downward drag of the sheet's handle this long closes it. */
const SWIPE_CLOSE_PX = 48;

type Props = {
  /** Only matters on mobile: on desktop the notepad is always beside the chat. */
  open: boolean;
  onClose: () => void;
  /** The button that opened the sheet; focus goes back to it on close. */
  opener: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

/**
 * Where the notes live. Desktop: a fixed notepad beside the chat. Mobile: a sheet that slides
 * over the lower part of the screen; Esc, "Thu", a downward swipe or a tap outside closes it.
 */
export function NotesSheet({ open, onClose, opener, children }: Props) {
  const mobile = useIsMobile();
  const sheet = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    if (open) sheet.current?.querySelector("textarea")?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open, opener]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      onClose();
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (dragFrom.current !== null && event.clientY - dragFrom.current > SWIPE_CLOSE_PX) onClose();
    dragFrom.current = null;
  }

  return (
    <aside ref={sheet} className="iv-notes" role={mobile ? "dialog" : undefined} aria-label="Ghi chú" onKeyDown={onKeyDown}>
      <div className="notepad">
        {/* The handle of the sheet. It keeps the pointer, so the drag is followed past its own edge. */}
        <div
          className="grab-zone"
          aria-hidden="true"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragFrom.current = event.clientY;
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (dragFrom.current = null)}
        >
          <span className="grab" />
        </div>
        <div className="notepad-h">
          <h2 className="label-lg notepad-title">
            <NoteIcon className="c-secondary" />
            Ghi chú
          </h2>
          <button type="button" className="btn btn-tonal btn-sm notes-close" onClick={onClose}>
            <ChevronDownIcon size={16} />
            Thu
          </button>
        </div>
        {children}
      </div>
    </aside>
  );
}

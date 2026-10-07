"use client";

import { RetryIcon } from "@/components/icons";
import { MAX_CANVAS_CHARS } from "@/config/limits";

type Props = {
  value: string;
  onChange: (text: string) => void;
  /** Two saves in a row failed. The text stays on screen and saving goes on. */
  saveFailing: boolean;
  /** The end request is on its way with the notes as they are: nothing typed now would be kept. */
  readOnly: boolean;
};

/**
 * The notes canvas: one block of free text. It is saved without a word, and nothing reads it,
 * counts it or suggests anything for it before the session ends.
 */
export function NotesCanvas({ value, onChange, saveFailing, readOnly }: Props) {
  return (
    <>
      <textarea
        className="ruled"
        aria-label="Ghi chú"
        placeholder="Ghi điều bạn thấy quan trọng…"
        maxLength={MAX_CANVAS_CHARS}
        autoComplete="off"
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="body-sm c-variant notes-status" role="status">
        {saveFailing && (
          <>
            <RetryIcon size={14} />
            Ghi chú chưa lưu được, đang thử lại
          </>
        )}
      </p>
    </>
  );
}

"use client";

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { SendIcon } from "@/components/icons";
import { MAX_QUESTION_CHARS } from "@/config/limits";
import { isMobileViewport } from "@/hooks/use-is-mobile";

/**
 * Desktop: Enter sends and Shift+Enter breaks the line. Mobile: Enter always breaks the line and
 * the send button sends. An Enter that confirms an input-method composition never sends.
 */
export function enterSends(event: { key: string; shiftKey: boolean; isComposing: boolean }, mobile: boolean): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && !mobile;
}

/** A question can be sent when it has something other than whitespace in it. */
export function canSend(text: string): boolean {
  return text.trim() !== "";
}

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** Locked while a reply is being written and once the session has ended. */
  disabled: boolean;
  placeholder: string;
};

/** The question box. */
export function Composer({ value, onChange, onSend, disabled, placeholder }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const wasDisabled = useRef(disabled);

  useEffect(() => {
    // A locked field loses focus. It gets it back with the reply, unless the learner went
    // somewhere else meanwhile (the notes).
    if (wasDisabled.current && !disabled && document.activeElement === document.body) textarea.current?.focus();
    wasDisabled.current = disabled;
  }, [disabled]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (enterSends({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing }, isMobileViewport())) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        ref={textarea}
        aria-label="Câu hỏi của bạn"
        placeholder={placeholder}
        rows={1}
        maxLength={MAX_QUESTION_CHARS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
      />
      <button type="submit" className="send" aria-label="Gửi" disabled={disabled || !canSend(value)}>
        <SendIcon />
      </button>
    </form>
  );
}

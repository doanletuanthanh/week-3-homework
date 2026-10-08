"use client";

import { AlertIcon, RetryIcon, WarningIcon } from "@/components/icons";

/** After this many retries have failed too, the screen stops offering one (PRD §6.0). */
export const MAX_RETRIES = 3;

export const NOT_CONNECTED = "Không kết nối được.";
export const INCIDENT = "InterviewLab đang gặp sự cố. Tiến độ của bạn đã được lưu; quay lại sau ít phút.";

type Props = {
  /** How many retries have failed since the first failure. */
  failedRetries: number;
  onRetry: () => void;
  /** A retry is on its way: the button says so and is locked. */
  retrying?: boolean;
  /** `card` stands in for content that could not load; `inline` sits next to the action that failed. */
  variant?: "card" | "inline";
};

/**
 * The standard error (PRD §6.0): "Không kết nối được." with "Thử lại", and once three retries have
 * failed as well, the incident line with no button. It holds no state, so whatever the learner had
 * typed stays where it is.
 */
export function ErrorRetry({ failedRetries, onRetry, retrying = false, variant = "card" }: Props) {
  const exhausted = failedRetries >= MAX_RETRIES;
  const button = (
    <button type="button" className={`btn btn-primary ${variant === "card" ? "btn-md" : "btn-sm"}`} onClick={onRetry} disabled={retrying}>
      {!retrying && <RetryIcon size={16} />}
      {retrying ? "Đang thử lại…" : "Thử lại"}
    </button>
  );

  if (variant === "inline") {
    return (
      <div className="err-inline" role="alert">
        <p className="ferr">
          <AlertIcon size={16} />
          {exhausted ? INCIDENT : NOT_CONNECTED}
        </p>
        {!exhausted && button}
      </div>
    );
  }
  return (
    <div className="st-card" role="alert">
      <span className={exhausted ? "st-ic st-ic-amber" : "st-ic"}>{exhausted ? <WarningIcon size={24} /> : <AlertIcon size={24} />}</span>
      {exhausted ? <p className="body-lg st-text">{INCIDENT}</p> : <p className="headline-sm">{NOT_CONNECTED}</p>}
      {!exhausted && button}
    </div>
  );
}

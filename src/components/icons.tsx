import type { ReactNode } from "react";

type IconProps = { size?: number; strokeWidth?: number; className?: string };

function icon(paths: ReactNode) {
  return function Icon({ size = 18, strokeWidth = 2, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
        style={{ flex: "none" }}
      >
        {paths}
      </svg>
    );
  };
}

export const ArrowRightIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const ArrowLeftIcon = icon(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const ChevronRightIcon = icon(<path d="M9 6l6 6-6 6" />);
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const CrossIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const LockIcon = icon(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
export const UnlockIcon = icon(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.6-1.8" />
  </>,
);
export const ShieldIcon = icon(
  <>
    <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </>,
);
export const GoogleIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 12h5.5a5.5 5.5 0 1 1-1.7-4" />
  </>,
);
export const AlertIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5.5M12 16.4v.1" />
  </>,
);
export const WarningIcon = icon(
  <>
    <path d="M12 3.8 21.2 19.5H2.8z" />
    <path d="M12 10v4.2M12 16.9v.1" />
  </>,
);
export const SaveIcon = icon(
  <>
    <path d="M5 4.5h11l3.5 3.5v11.5H5z" />
    <path d="M8 4.5v5h7v-5M8 19.5v-6h8v6" />
  </>,
);
export const EyeIcon = icon(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const SparkIcon = icon(
  <>
    <path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z" />
    <path d="M18.5 16v4M16.5 18h4" />
  </>,
);
export const PulseIcon = icon(<path d="M3 12h4l3-7 4 14 3-7h4" />);
export const NoPersonIcon = icon(
  <>
    <circle cx="10" cy="8.5" r="3.5" />
    <path d="M3.5 19.5c1.2-3.4 3.6-5 6.5-5 1.4 0 2.7.4 3.8 1.1" />
    <path d="M16 15.5l4 4M20 15.5l-4 4" />
  </>,
);
export const UserIcon = icon(
  <>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" />
  </>,
);
export const GridIcon = icon(
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>,
);
export const ChatIcon = icon(<path d="M4.5 5h15v10.5H9L4.5 19.5z" />);
export const LayersIcon = icon(
  <>
    <path d="M12 3.5 21 8.5 12 13.5 3 8.5z" />
    <path d="M3 13l9 5 9-5" />
  </>,
);
export const ReplayIcon = icon(
  <>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4.5 4.5v4h4" />
  </>,
);
export const SendIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const NoteIcon = icon(
  <>
    <path d="M6 3.5h9l3.5 3.5v13.5H6z" />
    <path d="M15 3.5V7h3.5M9 11h6M9 14.5h6M9 18h3.5" />
  </>,
);
export const StopIcon = icon(<rect x="7" y="7" width="10" height="10" rx="1.5" />);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />);
export const RetryIcon = icon(
  <>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </>,
);

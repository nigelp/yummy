import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  basket: (
    <>
      <path d="M4 10.5h16l-1.4 8.2a2.2 2.2 0 0 1-2.2 1.8H7.6a2.2 2.2 0 0 1-2.2-1.8L4 10.5Z" />
      <path d="M8.2 10.5 12 4l3.8 6.5" />
      <path d="M9.6 14.2v3M14.4 14.2v3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9 12 3.4Z" />
      <path d="M18.6 15.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </>
  ),
  book: (
    <>
      <path d="M5 5.6A2.6 2.6 0 0 1 7.6 3H19v16.5H7.6A2.6 2.6 0 0 0 5 22V5.6Z" />
      <path d="M19 19.5v2H7.6" />
      <path d="M9 7.5h6" />
    </>
  ),
  list: (
    <>
      <path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9" />
      <circle cx="2.6" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="2.6" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
      <path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" />
      <path d="M7.5 13.2h2M14.5 13.2h2M7.5 16.8h2M14.5 16.8h2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m4.5 12.5 4.6 4.5L19.5 6.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  heart: (
    <path d="M12 20.3s-7.8-4.7-7.8-10A4.5 4.5 0 0 1 12 7.4a4.5 4.5 0 0 1 7.8 2.9c0 5.3-7.8 10-7.8 10Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3.1 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.2" r="3.4" />
      <path d="M3.2 20a5.8 5.8 0 0 1 11.6 0" />
      <path d="M15.6 5.2a3.2 3.2 0 0 1 0 6.2M16.4 14.4a5.3 5.3 0 0 1 4.4 5.2" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.2" r="7.6" />
      <path d="M12 9.6v3.8l2.6 1.6M9.5 2.6h5" />
      <path d="M18.4 5.6l1.6-1.6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  link: (
    <>
      <path d="M10.4 13.6a4.2 4.2 0 0 0 6 0l2.4-2.4a4.2 4.2 0 1 0-6-6L11.6 6.4" />
      <path d="M13.6 10.4a4.2 4.2 0 0 0-6 0l-2.4 2.4a4.2 4.2 0 1 0 6 6l1.2-1.2" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20h4.2L20 8.2a2.4 2.4 0 0 0-3.4-3.4L4.8 16.6 4 20Z" />
      <path d="m14.8 6.6 2.6 2.6" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.6h2.6L8 6.2h8l1.4 2.4H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.6H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.6Z" />
      <circle cx="12" cy="13.8" r="3.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11M8.4 10.4 12 14l3.6-3.6" />
      <path d="M4 17v2.2A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8V17" />
    </>
  ),
  upload: (
    <>
      <path d="M12 14V3M8.4 6.6 12 3l3.6 3.6" />
      <path d="M4 17v2.2A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8V17" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="m15.8 15.8 4.4 4.4" />
    </>
  ),
  shuffle: (
    <>
      <path d="M4 6.5h3.2c1.6 0 2.6 1 3.5 2.3l3 4.6c.9 1.3 1.9 2.3 3.5 2.3H20" />
      <path d="M17.4 13.1 20 15.7l-2.6 2.6" />
      <path d="M4 17.5h3.2c1.6 0 2.6-1 3.5-2.3l.7-1.1M14.3 9.3l.4-.6c.9-1.3 1.9-2.2 3.5-2.2H20" />
      <path d="M17.4 3.9 20 6.5l-2.6 2.6" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3.8M8.6 7.2 12 3.8l3.4 3.4" />
      <path d="M5 13.5v5.2A1.8 1.8 0 0 0 6.8 20.5h10.4a1.8 1.8 0 0 0 1.8-1.8v-5.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.1A1.9 1.9 0 0 0 9.3 21h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  chevronLeft: <path d="m14.5 5-7 7 7 7" />,
  chevronRight: <path d="m9.5 5 7 7-7 7" />,
  chevronDown: <path d="m5 9.5 7 7 7-7" />,
  arrowRight: <path d="M4.5 12h14M13.5 6.5l5.5 5.5-5.5 5.5" />,
  flame: (
    <path d="M12 21c3.9 0 6.5-2.5 6.5-6 0-4.4-3.6-6.3-3.6-9.6 0-.8-.4-1.6-1.2-2 .2 2.4-1.1 3.6-2.2 4.6-1.3 1.2-2.6 2.5-2.6 4.4 0 1.1.5 2 1.3 2.6-.2-1.7.6-2.9 1.6-3.8.1 2.5 3.5 3.4 3.5 6.4 0 2-1.4 3.4-3.3 3.4Z" />
  ),
  leaf: (
    <>
      <path d="M5.2 19c-.9-6.2 3.3-12.8 13.6-14.2.8 8.9-4.3 14.4-10.9 14.4-1.1 0-2-.1-2.7-.2Z" />
      <path d="M4.5 20.5c2.5-4.1 5.2-7 9.4-9.3" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8.5V5.6A1.6 1.6 0 0 1 5.6 4h3M20 8.5V5.6A1.6 1.6 0 0 0 18.4 4h-3M4 15.5v3A1.6 1.6 0 0 0 5.6 20h3M20 15.5v3a1.6 1.6 0 0 1-1.6 1.5h-3" />
      <path d="M8 12h8" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  spoon: (
    <>
      <path d="M14.5 4.2c2.2 1.2 2.6 4.2 1 6.7-1.3 2-3.4 2.9-4.8 2L6.4 20a1.7 1.7 0 0 1-2.4-2.4l7.1-4.3c-.9-1.4 0-3.5 2-4.8 1.5-1 3.6-1.2 4.6-.6Z" />
    </>
  ),
};

export function Icon({
  name,
  size = 21,
  strokeWidth = 1.7,
  className,
  fill = false,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  fill?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.sparkle}
    </svg>
  );
}

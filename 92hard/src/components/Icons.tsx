/** Line icons on a 24-unit grid, drawn in the current text colour. */
const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  today: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M8 12.3l2.8 2.8L16.2 9.5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
    </>
  ),
  // A whiteboard on its stand, with writing on it.
  board: (
    <>
      <rect x="3.5" y="3.5" width="17" height="12.5" rx="2" />
      <path d="M7.5 7.8h6M7.5 11.6h9M8.5 20.5l3.5-4.5 3.5 4.5" />
    </>
  ),
  close: <path d="M7 7l10 10M17 7L7 17" />,
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

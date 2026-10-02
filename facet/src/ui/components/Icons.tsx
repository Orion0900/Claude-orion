import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
})

export const Back = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)
export const Close = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const Gear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </svg>
)
export const Camera = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
    <circle cx="12" cy="13" r="3.6" />
  </svg>
)
export const Photo = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5-5-8 9" />
  </svg>
)
export const Share = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7" />
  </svg>
)
export const Trash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
)
export const Check = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
export const Alert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l9.5 17h-19L12 3z" />
    <path d="M12 10v4M12 17.2v.1" />
  </svg>
)
export const Info = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.1" />
  </svg>
)
export const Chevron = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)
export const ChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)
export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const Minus = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
)
export const Clock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
export const Flip = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h13l-3-3M20 17H7l3 3" />
  </svg>
)
export const Timer = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2M9 2h6" />
  </svg>
)
export const Lock = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 018 0v3" />
  </svg>
)
export const Reset = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 102.3-5.7M4 4v4h4" />
  </svg>
)
export const Profile = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 3c4 0 7 2.6 7 6.5 0 1 .9 1.9 1.8 3.1.4.5 0 1.1-.6 1.2l-1.2.2V16c0 1.3-1 2.2-2.3 2.1l-1.7-.1V21" />
    <path d="M9 3C6 3 4 5.4 4 8.5c0 2.3 1 3.7 2 5V21" />
  </svg>
)
export const Sparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
  </svg>
)
export const Grid = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9h16M4 15h16M9 4v16M15 4v16" />
  </svg>
)
export const Print = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2" />
    <rect x="7" y="14" width="10" height="7" />
  </svg>
)
export const Compare = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="8" height="14" rx="1.5" />
    <rect x="13" y="5" width="8" height="14" rx="1.5" />
  </svg>
)

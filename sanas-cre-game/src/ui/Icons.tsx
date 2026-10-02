import type { PropertyType } from '../engine/types'

export type IconName =
  | 'desk' | 'deals' | 'portfolio' | 'funds' | 'firm' | 'close' | 'chevron' | 'arrow' | 'crane' | 'check'
  | 'alert' | 'plus' | 'minus' | 'trophy' | 'map' | 'help' | 'letter' | 'spark' | 'back'

const PATHS: Record<IconName, string> = {
  desk: 'M3 4h18v12H3zM8 20h8M12 16v4',
  deals: 'M3 12l4-4 5 3 4-4 5 5M3 12v6h18v-6M7 15h2M11 15h2',
  portfolio: 'M4 21V7l6-3v17M10 21V9l10 3v9M2 21h20M6 9h2M6 13h2M6 17h2M13 14h2M13 18h2M17 15h1M17 18h1',
  funds: 'M12 3v9l7.5 4.5M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  firm: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2.5 20c.5-4 2.8-6 5.5-6s5 2 5.5 6M13.5 14.6c.9-.4 1.9-.6 3-.6 2.6 0 4.5 1.8 5 6',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  crane: 'M5 21V5h2v16M2 21h8M7 5h13M7 5l4 4M17 5v6M15.5 11h3v2h-3z',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 4l9 16H3zM12 10v4M12 17.5v.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5',
  letter: 'M4 5h16v14H4zM4 6l8 6 8-6',
  spark: 'M3 17l5-6 4 3 4-6 5 4',
}

export function Icon({ name, size = 20, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  )
}

/** A small elevation of each kind of building, in its sector's color. */
export function BuildingGlyph({ type, size = 36 }: { type: PropertyType; size?: number }) {
  const body = (() => {
    switch (type) {
      case 'office':
        return (
          <>
            <rect x="11" y="3" width="14" height="30" rx="1" />
            <rect x="16" y="1" width="4" height="3" />
            <g className="glyph-cut">
              <rect x="14" y="7" width="2" height="22" />
              <rect x="20" y="7" width="2" height="22" />
            </g>
          </>
        )
      case 'multifamily':
        return (
          <>
            <rect x="7" y="9" width="22" height="24" rx="1" />
            <g className="glyph-cut">
              {[13, 19, 25].map((y) => [10, 16, 22].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="3" />))}
            </g>
          </>
        )
      case 'industrial':
        return (
          <>
            <path d="M2 33V17l8-4v4l8-4v4l8-4v4l8-4v20z" />
            <g className="glyph-cut">
              <rect x="6" y="25" width="5" height="8" />
              <rect x="14" y="25" width="5" height="8" />
              <rect x="22" y="25" width="5" height="8" />
            </g>
          </>
        )
      case 'retail':
        return (
          <>
            <rect x="3" y="15" width="30" height="18" rx="1" />
            <path d="M2 15l3-6h26l3 6z" />
            <g className="glyph-cut">
              <rect x="7" y="21" width="8" height="12" />
              <rect x="19" y="21" width="10" height="7" />
            </g>
          </>
        )
      case 'hotel':
        return (
          <>
            <rect x="10" y="7" width="16" height="26" rx="1" />
            <rect x="13" y="1" width="10" height="5" rx="1" />
            <g className="glyph-cut">
              {[11, 16, 21, 26].map((y) => <rect key={y} x="13" y={y} width="10" height="2" />)}
            </g>
          </>
        )
      case 'datacenter':
        return (
          <>
            <rect x="4" y="12" width="28" height="21" rx="1" />
            <circle cx="11" cy="9" r="3" />
            <circle cx="20" cy="9" r="3" />
            <g className="glyph-cut">
              <rect x="8" y="17" width="20" height="2" />
              <rect x="8" y="22" width="20" height="2" />
              <rect x="8" y="27" width="20" height="2" />
            </g>
          </>
        )
      case 'storage':
        return (
          <>
            <path d="M3 33V15l15-6 15 6v18z" />
            <g className="glyph-cut">
              <rect x="7" y="19" width="6" height="14" />
              <rect x="15" y="19" width="6" height="14" />
              <rect x="23" y="19" width="6" height="14" />
            </g>
          </>
        )
      case 'lifescience':
        return (
          <>
            <rect x="5" y="11" width="26" height="22" rx="1" />
            <rect x="9" y="5" width="3" height="6" />
            <rect x="15" y="3" width="3" height="8" />
            <g className="glyph-cut">
              <rect x="9" y="16" width="18" height="5" />
              <rect x="9" y="24" width="18" height="5" />
            </g>
          </>
        )
    }
  })()
  return (
    <svg className={`glyph t-${type}`} width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      {body}
    </svg>
  )
}

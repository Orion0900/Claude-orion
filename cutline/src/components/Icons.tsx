/** Line icons, 24px grid, drawn in the current text colour. */
import type { ReactNode, SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: Props & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const BackIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
)

export const CloseIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
)

export const GearIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.38.37.72.68.97.3.25.69.38 1.08.38H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
)

export const PlusIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const FilmIcon = (p: Props) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
  </Icon>
)

export const CameraIcon = (p: Props) => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="3" />
    <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
  </Icon>
)

export const PlayIcon = (p: Props) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M7 4.8v14.4a1 1 0 0 0 1.53.85l11.2-7.2a1 1 0 0 0 0-1.7L8.53 3.95A1 1 0 0 0 7 4.8z" />
  </Icon>
)

export const PauseIcon = (p: Props) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4.2" height="15" rx="1.2" />
    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" />
  </Icon>
)

export const UndoIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
)

export const RedoIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
)

export const CaptionsIcon = (p: Props) => (
  <Icon {...p}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
    <path d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17.5 10.2a2.3 2.3 0 1 0 0 3.6" />
  </Icon>
)

export const ScissorsIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
  </Icon>
)

export const SparklesIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9z" />
    <path d="M19 3v4M17 5h4M5 17v3M3.5 18.5h3" />
  </Icon>
)

export const FrameIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M7 2v15a2 2 0 0 0 2 2h13" />
    <path d="M2 7h15a2 2 0 0 1 2 2v13" />
  </Icon>
)

export const MusicIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Icon>
)

export const MoreIcon = (p: Props) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </Icon>
)

export const TrashIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </Icon>
)

export const ShareIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 15V3M8 7l4-4 4 4" />
    <path d="M20 13v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5" />
  </Icon>
)

export const DownloadIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 3v12M8 11l4 4 4-4" />
    <path d="M20 17v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1" />
  </Icon>
)

export const CheckIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)

export const FlipIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M20 7h-9.5A5.5 5.5 0 0 0 5 12.5" />
    <path d="m17 4 3 3-3 3" />
    <path d="M4 17h9.5a5.5 5.5 0 0 0 5.5-5.5" />
    <path d="m7 20-3-3 3-3" />
  </Icon>
)

export const TextIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M4 7V5h16v2M9 19h6M12 5v14" />
  </Icon>
)

export const WandIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m15 4 5 5L8 21l-5-5z" />
    <path d="m12 7 5 5" />
  </Icon>
)

export const GlobeIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19M12 2.5a14.5 14.5 0 0 0 0 19" />
  </Icon>
)

export const MegaphoneIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </Icon>
)

export const ClipIcon = (p: Props) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M9 5v14M15 5v14" />
    <path d="M11 10.5v3l2.5-1.5z" fill="currentColor" stroke="none" />
  </Icon>
)

export const SpellIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m4 15 4-10 4 10M5.5 11.5h5" />
    <path d="m13 17 3 3 5-6" />
  </Icon>
)

export const KeyIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5l2 2" />
  </Icon>
)

export const SmileIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  </Icon>
)

export const StarIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9z" />
  </Icon>
)

export const ReturnIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 10 4 15l5 5" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
  </Icon>
)

export const RestoreIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
)

export const EditIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Icon>
)

export const CopyIcon = (p: Props) => (
  <Icon {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
)

export const ZoomIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7.5" />
    <path d="m21 21-4.6-4.6M11 8v6M8 11h6" />
  </Icon>
)

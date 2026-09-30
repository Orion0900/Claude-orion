/**
 * Where everything sits on screen, and the perspective of the note highway.
 *
 * The highway is a flat plane seen by a pinhole camera: a note `z` of the way
 * to the far end (0 at the strike line, 1 at the far edge) is drawn at scale
 * d / (z + d), so notes speed up and grow as they come at you, like a real
 * 3D highway, with nothing but a divide per point.
 */

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Layout {
  width: number
  height: number
  portrait: boolean
  insets: Insets
  cx: number
  /** Screen y of the strike line (z = 0). */
  strikeY: number
  /** Screen y of the far end (z = 1). */
  farY: number
  horizonY: number
  /** Width of one lane at the strike line. */
  lane: number
  /** Perspective constant. */
  d: number
  /** Most negative z drawn: the bit of highway below the strike line. */
  zNear: number
  /** In guitar mode, touches below this y land on the frets; above it they strum. */
  fretTop: number
  /** Where the side HUD panels are centred, and how wide each may be. */
  hud: { y: number; leftX: number; rightX: number; width: number }
}

export function computeLayout(width: number, height: number, insets: Insets): Layout {
  const portrait = height >= width * 1.05
  const usable = width - insets.left - insets.right
  let lane: number
  let strikeY: number
  let farY: number
  let ratio: number
  if (portrait) {
    lane = Math.min((usable * 0.96) / 5, (height * 0.6) / 5)
    strikeY = height - insets.bottom - Math.max(58, lane * 0.95)
    farY = insets.top + Math.max(48, height * 0.07)
    ratio = 0.3
  } else {
    lane = Math.min((usable * 0.6) / 5, (height * 1.25) / 5)
    strikeY = height - insets.bottom - Math.max(40, lane * 0.55)
    farY = insets.top + Math.max(6, height * 0.03)
    ratio = 0.4
  }
  const d = ratio / (1 - ratio)
  const horizonY = (farY - ratio * strikeY) / (1 - ratio)
  const cx = insets.left + usable / 2
  const partial: Omit<Layout, 'hud' | 'fretTop' | 'zNear'> = {
    width,
    height,
    portrait,
    insets,
    cx,
    strikeY,
    farY,
    horizonY,
    lane,
    d,
  }
  const zNear = zAtY(partial as Layout, Math.min(height, strikeY + lane * 0.9))
  const fretTop = strikeY - lane * 0.75

  let hud: Layout['hud']
  if (portrait) {
    // Up the highway there's room either side of it; sit the panels where
    // each gets at least 96 px.
    const room = 96
    const scale = Math.min(0.62, Math.max(ratio, (cx - insets.left - room - 8) / (2.5 * lane)))
    const y = horizonY + (strikeY - horizonY) * scale
    const half = 2.5 * lane * scale
    const width = Math.max(room, cx - half - insets.left - 12)
    const leftX = insets.left + 6 + width / 2
    hud = { y, leftX, rightX: 2 * cx - leftX, width }
  } else {
    const half = 2.5 * lane
    const width = Math.max(90, cx - half - insets.left - 16)
    hud = { y: strikeY - lane * 0.9, leftX: insets.left + 8 + width / 2, rightX: 2 * cx - (insets.left + 8 + width / 2), width }
  }
  return { ...partial, zNear, fretTop, hud }
}

export function scaleAt(layout: Layout, z: number): number {
  return layout.d / (z + layout.d)
}

export function yAt(layout: Layout, z: number): number {
  return layout.horizonY + (layout.strikeY - layout.horizonY) * scaleAt(layout, z)
}

/** Screen x of a point `laneX` lanes right of the highway's centre line. */
export function xAt(layout: Layout, laneX: number, z: number): number {
  return layout.cx + laneX * layout.lane * scaleAt(layout, z)
}

export function zAtY(layout: Layout, y: number): number {
  const scale = (y - layout.horizonY) / (layout.strikeY - layout.horizonY)
  return layout.d / Math.max(1e-6, scale) - layout.d
}

/** Which lane column (0-4, left to right on screen) a touch belongs to, following the perspective. */
export function laneAtPoint(layout: Layout, x: number, y: number): number {
  const scale = Math.min(1.35, Math.max(0.05, (y - layout.horizonY) / (layout.strikeY - layout.horizonY)))
  const laneX = (x - layout.cx) / (layout.lane * scale)
  return Math.min(4, Math.max(0, Math.floor(laneX + 2.5)))
}

/** Centre of a lane column in lanes from the middle: -2 … 2. */
export function laneCenter(column: number): number {
  return column - 2
}

import { SCREEN_H, SCREEN_W } from './gfx'

/**
 * Where the game screen goes on the page, as a pure function so the phone
 * layouts can be tested without a browser. The numbers here match the
 * touch-pad sizes in styles.css.
 */

/** The notch, Dynamic Island and home-bar margins the page must keep clear. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface LayoutInput {
  /** Viewport size in CSS pixels. */
  vw: number
  vh: number
  dpr: number
  /** On-screen controls are shown. */
  touch: boolean
  insets: Insets
}

export interface LayoutResult {
  portrait: boolean
  /** CSS pixels per game pixel. */
  scale: number
  /** The screen's size in CSS pixels. */
  width: number
  height: number
}

/**
 * Sideways, each control column (D-pad left; A, B right; SELECT and START in
 * the bottom corners) needs this much room inside the safe area.
 */
export const SIDE_COLUMN = 162
/** Upright, the gap above the screen and the room the controls need below it. */
export const TOP_GAP = 12
export const PAD_MIN_HEIGHT = 250

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export function computeLayout(i: LayoutInput): LayoutResult {
  const portrait = i.vh > i.vw
  const safeW = Math.max(0, i.vw - i.insets.left - i.insets.right)
  const safeH = Math.max(0, i.vh - i.insets.top - i.insets.bottom)
  let availW = safeW
  let availH = safeH
  if (i.touch) {
    if (portrait) availH = safeH - TOP_GAP - PAD_MIN_HEIGHT
    else {
      // Insets are mirrored so the screen stays centred between the columns.
      const side = Math.max(i.insets.left, i.insets.right)
      availW = i.vw - 2 * (side + SIDE_COLUMN)
      availH = safeH - 8
    }
  }
  const fit = Math.max(0.5, Math.min(availW / SCREEN_W, availH / SCREEN_H))
  // On ordinary screens whole-number scales keep every pixel the same size.
  // High-density screens (every iPhone) have pixels to spare, so a
  // fractional scale stays crisp there and the game uses all the room it has.
  const scale = i.dpr >= 2 || fit < 2 ? fit : Math.floor(fit)
  return { portrait, scale, width: Math.floor(SCREEN_W * scale), height: Math.floor(SCREEN_H * scale) }
}

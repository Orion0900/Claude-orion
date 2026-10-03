import { computeLayout, NO_INSETS, PAD_MIN_HEIGHT, SIDE_COLUMN, TOP_GAP, type Insets } from './layout'

/** Sizes in CSS pixels, as Safari reports them with the notch/island/home-bar insets. */
const PHONES: { name: string; vw: number; vh: number; portrait: Insets; landscape: Insets }[] = [
  { name: 'iPhone SE', vw: 375, vh: 667, portrait: NO_INSETS, landscape: NO_INSETS },
  { name: 'iPhone 13 mini', vw: 375, vh: 812, portrait: { top: 50, right: 0, bottom: 34, left: 0 }, landscape: { top: 0, right: 50, bottom: 21, left: 50 } },
  { name: 'iPhone 15 Pro', vw: 393, vh: 852, portrait: { top: 59, right: 0, bottom: 34, left: 0 }, landscape: { top: 0, right: 59, bottom: 21, left: 59 } },
  { name: 'iPhone 15 Pro Max', vw: 430, vh: 932, portrait: { top: 59, right: 0, bottom: 34, left: 0 }, landscape: { top: 0, right: 59, bottom: 21, left: 59 } },
]

/** Where the landscape controls sit, mirroring styles.css. */
const DPAD_RIGHT = (inset: number) => inset + 14 + 128
const FACE_LEFT = (vw: number, inset: number) => vw - inset - 12 - 140

describe('screen layout', () => {
  for (const p of PHONES) {
    it(`${p.name}, upright: full width under the island, with room for the buttons below`, () => {
      const l = computeLayout({ vw: p.vw, vh: p.vh, dpr: 3, touch: true, insets: p.portrait })
      expect(l.portrait).toBe(true)
      expect(l.width).toBeLessThanOrEqual(p.vw)
      expect(l.width).toBeGreaterThan(p.vw - 2)
      const below = p.vh - p.portrait.top - TOP_GAP - l.height - p.portrait.bottom
      expect(below).toBeGreaterThanOrEqual(PAD_MIN_HEIGHT)
    })

    it(`${p.name}, sideways: the screen sits clear of the D-pad and the A/B buttons`, () => {
      const vw = p.vh
      const vh = p.vw
      const ins = p.landscape
      const l = computeLayout({ vw, vh, dpr: 3, touch: true, insets: ins })
      expect(l.portrait).toBe(false)
      const left = ins.left + (vw - ins.left - ins.right - l.width) / 2
      const right = left + l.width
      expect(left).toBeGreaterThan(DPAD_RIGHT(ins.left))
      expect(right).toBeLessThan(FACE_LEFT(vw, ins.right))
      expect(l.height).toBeLessThanOrEqual(vh - ins.top - ins.bottom)
      // Big enough to read: at least 1.4 screen pixels per game pixel.
      expect(l.scale).toBeGreaterThan(1.4)
    })
  }

  it('keeps every game pixel the same size on an ordinary desktop screen', () => {
    const l = computeLayout({ vw: 1920, vh: 1080, dpr: 1, touch: false, insets: NO_INSETS })
    expect(l.scale).toBe(6)
    expect([l.width, l.height]).toEqual([1440, 960])
  })

  it('fills the window on a high-density desktop screen', () => {
    const l = computeLayout({ vw: 1440, vh: 900, dpr: 2, touch: false, insets: NO_INSETS })
    expect(l.scale).toBeCloseTo(5.625, 3)
  })

  it('never collapses to nothing in a tiny window', () => {
    const l = computeLayout({ vw: 100, vh: 80, dpr: 1, touch: true, insets: NO_INSETS })
    expect(l.width).toBeGreaterThan(0)
    expect(l.height).toBeGreaterThan(0)
  })

  it('leaves the side columns the size the CSS controls need', () => {
    expect(SIDE_COLUMN).toBeGreaterThan(14 + 128)
    expect(SIDE_COLUMN).toBeGreaterThan(12 + 140)
  })
})

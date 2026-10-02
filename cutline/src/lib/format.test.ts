import { aspectRatio, fitInside, needsBackground, outputSize, placement } from './format'

const portrait = { width: 1080, height: 1920 }
const landscape = { width: 1920, height: 1080 }
const fill = { fit: 'fill' as const, zoom: 1, focusX: 0.5, focusY: 0.5 }
const fit = { ...fill, fit: 'fit' as const }

describe('output size', () => {
  it('puts 1080 on the short side', () => {
    expect(outputSize('9:16', landscape, 1080)).toEqual({ width: 1080, height: 1920 })
    expect(outputSize('16:9', portrait, 1080)).toEqual({ width: 1920, height: 1080 })
    expect(outputSize('1:1', portrait, 720)).toEqual({ width: 720, height: 720 })
    expect(outputSize('4:5', portrait, 1080)).toEqual({ width: 1080, height: 1350 })
  })

  it('keeps the original shape and never upscales it', () => {
    expect(outputSize('source', { width: 640, height: 360 }, 1080)).toEqual({ width: 640, height: 360 })
    expect(outputSize('source', { width: 2160, height: 3840 }, 1080)).toEqual({ width: 1080, height: 1920 })
  })

  it('always gives even dimensions', () => {
    const size = outputSize('source', { width: 721, height: 1279 }, 1080)
    expect(size.width % 2).toBe(0)
    expect(size.height % 2).toBe(0)
  })

  it('falls back to portrait for an unknown source shape', () => {
    expect(aspectRatio('source', { width: 0, height: 0 })).toBeCloseTo(9 / 16)
  })
})

describe('placement', () => {
  it('fills a portrait frame from a portrait source exactly', () => {
    expect(placement(portrait, portrait, fill)).toEqual({ x: 0, y: 0, width: 1080, height: 1920 })
  })

  it('crops a landscape source to fill a portrait frame, centred', () => {
    const rect = placement(landscape, portrait, fill)
    expect(rect.height).toBeCloseTo(1920)
    expect(rect.width).toBeCloseTo(3413.33, 1)
    expect(rect.x + rect.width / 2).toBeCloseTo(540)
    expect(needsBackground(rect, portrait)).toBe(false)
  })

  it('fits a landscape source with room above and below', () => {
    const rect = placement(landscape, portrait, fit)
    expect(rect.width).toBeCloseTo(1080)
    expect(rect.y).toBeGreaterThan(0)
    expect(needsBackground(rect, portrait)).toBe(true)
  })

  it('moves toward the focus point but never past an edge', () => {
    const left = placement(landscape, portrait, { ...fill, focusX: 0 })
    expect(left.x).toBe(0)
    const right = placement(landscape, portrait, { ...fill, focusX: 1 })
    expect(right.x + right.width).toBeCloseTo(1080)
    const nearLeft = placement(landscape, portrait, { ...fill, focusX: 0.3 })
    expect(nearLeft.x + 0.3 * nearLeft.width).toBeCloseTo(540)
  })

  it('punches in about the focus point where it already sits on screen', () => {
    const rect = placement(portrait, portrait, { ...fill, focusY: 0.4 }, 0.2)
    expect(rect.width).toBeCloseTo(1296)
    // Unzoomed, the face at 40% of the picture is at 40% of the screen; it stays there.
    expect(rect.y + 0.4 * rect.height).toBeCloseTo(768)
    expect(rect.x + 0.5 * rect.width).toBeCloseTo(540)
  })

  it('keeps a punch-in covering the frame even at an edge focus', () => {
    const rect = placement(landscape, portrait, { ...fill, focusX: 0 }, 0.3)
    expect(rect.x).toBe(0)
    expect(rect.y).toBeLessThanOrEqual(0)
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(1920)
  })

  it('centres the focus point under manual zoom', () => {
    const rect = placement(portrait, portrait, { ...fill, zoom: 2, focusX: 0.5, focusY: 0.4 })
    expect(rect.y + 0.4 * rect.height).toBeCloseTo(960)
  })

  it('ignores zoom below 1 and negative punch-ins', () => {
    expect(placement(portrait, portrait, { ...fill, zoom: 0.5 }, -1)).toEqual(placement(portrait, portrait, fill))
  })
})

describe('fitting the preview', () => {
  it('fits by height in a wide box and by width in a tall one', () => {
    expect(fitInside({ width: 400, height: 400 }, 9 / 16)).toEqual({ width: 225, height: 400 })
    expect(fitInside({ width: 300, height: 900 }, 9 / 16)).toEqual({ width: 300, height: 300 / (9 / 16) })
  })
})

import { MAPS } from './maps'
import { MAX_BAKED, MapPainter } from './render'
import { World } from './WorldMap'

/** Just enough of a canvas for baking to run outside a browser. */
function fakeCanvas() {
  const c = {
    width: 0,
    height: 0,
    getContext: () => ({
      imageSmoothingEnabled: true,
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      drawImage: () => {},
    }),
  }
  return c
}

beforeAll(() => {
  ;(globalThis as unknown as { document: unknown }).document = { createElement: fakeCanvas }
})

afterAll(() => {
  delete (globalThis as unknown as { document?: unknown }).document
})

describe('map painter', () => {
  const world = new World(MAPS)

  it('bakes the maps next door ahead of time, within the time it is given', () => {
    const p = new MapPainter(world)
    const route1 = world.map('route1')
    // No time at all: nothing is baked yet.
    p.prebake([route1], 0)
    expect(p.isBaked(route1)).toBe(false)
    // Plenty of time: it's ready to draw.
    p.prebake([route1], Infinity)
    expect(p.isBaked(route1)).toBe(true)
  })

  it('keeps only so many maps baked, letting the oldest go', () => {
    const p = new MapPainter(world)
    const ids = [...MAPS.keys()].slice(0, MAX_BAKED + 4)
    for (const id of ids) p.prebake([world.map(id)], Infinity)
    expect(p.size).toBe(MAX_BAKED)
    expect(p.isBaked(world.map(ids[0]))).toBe(false)
    expect(p.isBaked(world.map(ids[ids.length - 1]))).toBe(true)
  })

  it('lets every baked map go on a flush', () => {
    const p = new MapPainter(world)
    p.prebake([world.map('driftwood')], Infinity)
    p.flush()
    expect(p.size).toBe(0)
  })
})

import { analyzeProfile, placeFromAnchors, PROFILE_POINTS, PROFILE_SPECS, templatePoints, type ProfilePoints } from './profile'

const value = (a: ReturnType<typeof analyzeProfile>, id: string) => a.metrics.find((m) => m.id === id)!.value

/** A profile facing right: the template at 20 px per cm. */
function rightFacing(): ProfilePoints {
  return templatePoints(20, { x: 450, y: 390 })
}

describe('profile placement', () => {
  it('places every point from the three anchors, keeping the anchors', () => {
    const t = templatePoints(17, { x: 300, y: 500 })
    const p = placeFromAnchors({ prn: t.prn, me: t.me, ea: t.ea })
    expect(Object.keys(p).sort()).toEqual(PROFILE_POINTS.map((q) => q.id).sort())
    for (const { id } of PROFILE_POINTS) {
      expect(p[id].x).toBeCloseTo(t[id].x, 6)
      expect(p[id].y).toBeCloseTo(t[id].y, 6)
    }
    // The nose bridge sits above and behind the tip; the chin point in front of the chin's underside.
    expect(p.n.y).toBeLessThan(p.prn.y)
    expect(p.n.x).toBeLessThan(p.prn.x)
    expect(p.pg.x).toBeGreaterThan(p.me.x)
  })

  it('mirrors the template for a face looking left', () => {
    const t = templatePoints(20, { x: 550, y: 390 }, 'left')
    const p = placeFromAnchors({ prn: t.prn, me: t.me, ea: t.ea })
    expect(p.pg.x).toBeCloseTo(t.pg.x, 6)
    expect(p.n.x).toBeGreaterThan(p.prn.x)
    expect(p.go.x).toBeGreaterThan(p.pg.x)
  })
})

describe('profile analysis', () => {
  it('reads the average profile as near its ideals', () => {
    const a = analyzeProfile(rightFacing(), 'female', null)
    expect(a.facing).toBe('right')
    expect(a.scaleFrom).toBe('average')
    expect(a.metrics.map((m) => m.id).sort()).toEqual(Object.keys(PROFILE_SPECS).sort())
    // The template is an average profile: every angle lands in range.
    for (const m of a.metrics) expect([m.id, m.band]).toEqual([m.id, 'ideal'])
  })

  it('gives the same angles for the same face facing either way', () => {
    const right = analyzeProfile(rightFacing(), 'male', null)
    const mirrored = Object.fromEntries(Object.entries(rightFacing()).map(([k, p]) => [k, { x: 1000 - p.x, y: p.y }])) as ProfilePoints
    const left = analyzeProfile(mirrored, 'male', null)
    expect(left.facing).toBe('left')
    for (const m of right.metrics) expect(value(left, m.id)).toBeCloseTo(m.value, 6)
  })

  it('measures lips against the E-line: behind is negative', () => {
    const p = rightFacing()
    const base = value(analyzeProfile(p, 'female', 112), 'eLineUpper')
    // Push the upper lip 3 mm forward (the face is 112 mm n–me tall).
    const mmPerPx = 112 / Math.hypot(p.n.x - p.me.x, p.n.y - p.me.y)
    const fuller = { ...p, ls: { x: p.ls.x + 3 / mmPerPx, y: p.ls.y } }
    const after = value(analyzeProfile(fuller, 'female', 112), 'eLineUpper')
    expect(after).toBeGreaterThan(base + 2)
    expect(after).toBeLessThan(base + 3.1)
  })

  it('reads a concave profile past 180°', () => {
    const p = rightFacing()
    // Push the chin well forward of the forehead–nose-base line.
    const forward = { ...p, pg: { x: p.pg.x + 70, y: p.pg.y } }
    expect(value(analyzeProfile(forward, 'female', null), 'convexity')).toBeGreaterThan(180)
  })

  it('opens the chin–neck angle past 90° as the chin’s underside rises', () => {
    const p = rightFacing()
    const lifted = { ...p, c: { x: p.c.x, y: p.c.y - 30 } }
    const dropped = { ...p, c: { x: p.c.x, y: p.c.y + 30 } }
    expect(value(analyzeProfile(lifted, 'female', null), 'mentocervical')).toBeGreaterThan(95)
    expect(value(analyzeProfile(dropped, 'female', null), 'mentocervical')).toBeLessThan(80)
  })

  it('reads a retreating chin as a more convex profile', () => {
    const p = rightFacing()
    const back = { ...p, pg: { x: p.pg.x - 25, y: p.pg.y } }
    expect(value(analyzeProfile(back, 'female', null), 'convexity')).toBeLessThan(value(analyzeProfile(p, 'female', null), 'convexity'))
  })
})

import { describe, expect, it } from 'vitest'
import { destination } from './geo'
import { greenDepth, hazardsAlongLine, manualCourse, parseOverpass, setHoleTarget, targetOf, type OverpassResponse } from './course'

const TEE = { lat: 42.3601, lng: -71.0589 }
const box = (centre: { lat: number; lng: number }, half: number) => [
  destination(destination(centre, 0, half), 270, half),
  destination(destination(centre, 0, half), 90, half),
  destination(destination(centre, 180, half), 90, half),
  destination(destination(centre, 180, half), 270, half),
]
const geom = (points: Array<{ lat: number; lng: number }>) => points.map((p) => ({ lat: p.lat, lon: p.lng }))

describe('parseOverpass', () => {
  const greenCentre = destination(TEE, 0, 350)
  const response: OverpassResponse = {
    elements: [
      { type: 'way', id: 1, tags: { leisure: 'golf_course', name: 'Pine Valley' }, geometry: geom(box(TEE, 800)) },
      { type: 'way', id: 2, tags: { golf: 'hole', ref: '1', par: '4', dist: '380 yd' }, geometry: geom([TEE, greenCentre]) },
      { type: 'way', id: 3, tags: { golf: 'green' }, geometry: geom(box(greenCentre, 15)) },
      { type: 'way', id: 4, tags: { golf: 'bunker' }, geometry: geom(box(destination(TEE, 0, 300), 10)) },
      { type: 'way', id: 5, tags: { natural: 'water' }, geometry: geom(box(destination(TEE, 0, 200), 20)) },
      { type: 'way', id: 6, tags: { golf: 'green', ref: '2' }, geometry: geom(box(destination(TEE, 90, 400), 15)) },
      { type: 'node', id: 7, tags: { golf: 'pin', ref: '2' }, lat: destination(TEE, 90, 402).lat, lon: destination(TEE, 90, 402).lng },
    ],
  }
  const parsed = parseOverpass(response)

  it('names the course and lists holes in order', () => {
    expect(parsed.name).toBe('Pine Valley')
    expect(parsed.holes.map((h) => h.number)).toEqual([1, 2])
  })

  it('matches an unnumbered green to the hole line ending on it', () => {
    const hole = parsed.holes[0]
    expect(hole.par).toBe(4)
    expect(hole.length).toBeCloseTo(380 * 0.9144, 3)
    expect(hole.outline).toHaveLength(4)
    expect(hole.green.lat).toBeCloseTo(greenCentre.lat, 5)
    expect(hole.tee).toEqual(TEE)
  })

  it('builds a hole from a numbered green and its pin', () => {
    const hole = parsed.holes[1]
    expect(hole.pin).not.toBeNull()
    expect(targetOf(hole)).toEqual(hole.pin)
  })

  it('keeps bunkers and water as hazards', () => {
    expect(parsed.hazards.map((h) => h.kind).sort()).toEqual(['bunker', 'water'])
  })

  it('finds the hazards on the line and the depth of the green', () => {
    const hole = parsed.holes[0]
    const along = hazardsAlongLine(TEE, targetOf(hole), parsed.hazards)
    expect(along.map((h) => h.kind)).toEqual(['water', 'bunker'])
    expect(along[0].from).toBeCloseTo(180, -1)
    expect(along[0].to).toBeCloseTo(220, -1)
    const depth = greenDepth(TEE, hole)
    expect(depth?.front).toBeCloseTo(335, -1)
    expect(depth?.back).toBeCloseTo(365, -1)
  })
})

describe('manual course', () => {
  it('creates and moves holes by tapping', () => {
    let course = manualCourse()
    course = setHoleTarget(course, 3, destination(TEE, 0, 100))
    course = setHoleTarget(course, 1, destination(TEE, 0, 200))
    expect(course.holes.map((h) => h.number)).toEqual([1, 3])
    course = setHoleTarget(course, 1, destination(TEE, 0, 250))
    expect(course.holes).toHaveLength(2)
    expect(targetOf(course.holes[0])).toEqual(destination(TEE, 0, 250))
  })
})

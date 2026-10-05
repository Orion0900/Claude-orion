import { describe, expect, it } from 'vitest'
import { destination } from './geo'
import {
  greenDepth,
  hazardsAlongLine,
  manualCourse,
  holeNumbers,
  nearestHole,
  normalizeCourse,
  parseOverpass,
  parseOverpassCourses,
  setHoleTarget,
  stepHole,
  targetOf,
  type OverpassResponse,
} from './course'

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

describe('parseOverpassCourses', () => {
  const club = destination(TEE, 0, 0)
  const muni = destination(TEE, 90, 1500)
  const greenA = destination(club, 0, 300)
  const greenB = destination(muni, 0, 300)
  const response: OverpassResponse = {
    elements: [
      { type: 'way', id: 10, tags: { leisure: 'golf_course', name: 'Riverside Club' }, geometry: geom(box(club, 600)) },
      { type: 'way', id: 11, tags: { golf: 'hole', ref: '1', par: '4' }, geometry: geom([club, greenA]) },
      { type: 'way', id: 12, tags: { golf: 'green' }, geometry: geom(box(greenA, 15)) },
      { type: 'way', id: 13, tags: { golf: 'bunker' }, geometry: geom(box(destination(club, 0, 250), 10)) },
      { type: 'way', id: 20, tags: { leisure: 'golf_course', name: 'Town Muni' }, geometry: geom(box(muni, 600)) },
      { type: 'way', id: 21, tags: { golf: 'hole', ref: '1', par: '3' }, geometry: geom([muni, greenB]) },
      { type: 'way', id: 22, tags: { golf: 'green' }, geometry: geom(box(greenB, 15)) },
    ],
  }

  it('keeps two nearby courses apart', () => {
    const courses = parseOverpassCourses(response)
    expect(courses.map((c) => c.name).sort()).toEqual(['Riverside Club', 'Town Muni'])
    for (const course of courses) expect(course.holes).toHaveLength(1)
  })

  it('files each hazard under the course that contains it', () => {
    const courses = parseOverpassCourses(response)
    expect(courses.find((c) => c.name === 'Riverside Club')?.hazards).toHaveLength(1)
    expect(courses.find((c) => c.name === 'Town Muni')?.hazards).toHaveLength(0)
  })

  it('names holes outside any outline after the nearest course relation', () => {
    const stray = destination(TEE, 180, 900)
    const strayGreen = destination(stray, 180, 200)
    const courses = parseOverpassCourses({
      elements: [
        { type: 'relation', id: 99, tags: { leisure: 'golf_course', name: 'Lakeside Links' }, center: { lat: stray.lat, lon: stray.lng } },
        { type: 'way', id: 30, tags: { golf: 'hole', ref: '7' }, geometry: geom([stray, strayGreen]) },
        { type: 'way', id: 31, tags: { golf: 'green' }, geometry: geom(box(strayGreen, 15)) },
      ],
    })
    expect(courses).toHaveLength(1)
    expect(courses[0].name).toBe('Lakeside Links')
    expect(courses[0].holes[0].number).toBe(7)
  })

  it('is empty when nothing golf-shaped is nearby', () => {
    expect(parseOverpassCourses({ elements: [] })).toEqual([])
  })
})

describe('nearestHole', () => {
  it('picks the hole whose tee you are standing on', () => {
    const courses = parseOverpassCourses({
      elements: [
        { type: 'way', id: 40, tags: { golf: 'hole', ref: '1' }, geometry: geom([TEE, destination(TEE, 0, 300)]) },
        { type: 'way', id: 41, tags: { golf: 'green' }, geometry: geom(box(destination(TEE, 0, 300), 15)) },
        { type: 'way', id: 42, tags: { golf: 'hole', ref: '2' }, geometry: geom([destination(TEE, 90, 800), destination(TEE, 90, 1100)]) },
        { type: 'way', id: 43, tags: { golf: 'green' }, geometry: geom(box(destination(TEE, 90, 1100), 15)) },
      ],
    })
    expect(nearestHole(courses[0], destination(TEE, 90, 780))?.number).toBe(2)
    expect(nearestHole(courses[0], TEE)?.number).toBe(1)
  })
})

describe('holeNumbers and stepHole', () => {
  const flag = destination(TEE, 0, 300)

  it('steps through every hole of a hand-built course, flag or not', () => {
    const course = setHoleTarget(manualCourse(), 1, flag)
    expect(holeNumbers(course)).toHaveLength(18)
    expect(stepHole(course, 1, 1)).toBe(2)
    expect(stepHole(course, 18, 1)).toBe(1)
    expect(stepHole(course, 1, -1)).toBe(18)
  })

  it('keeps holes added past eighteen on a hand-built course', () => {
    const course = setHoleTarget(manualCourse(), 19, flag)
    expect(holeNumbers(course)).toHaveLength(19)
    expect(stepHole(course, 18, 1)).toBe(19)
  })

  it('only visits mapped holes on a mapped course, wrapping round', () => {
    const course = { ...setHoleTarget(setHoleTarget(manualCourse(), 3, flag), 7, flag), source: 'osm' as const }
    expect(holeNumbers(course)).toEqual([3, 7])
    expect(stepHole(course, 3, 1)).toBe(7)
    expect(stepHole(course, 7, 1)).toBe(3)
    expect(stepHole(course, 3, -1)).toBe(7)
    expect(stepHole({ ...course, holes: [] }, 5, 1)).toBe(5)
  })
})

describe('normalizeCourse', () => {
  it('passes a good save through unchanged', () => {
    const course = setHoleTarget(manualCourse(), 1, TEE)
    expect(normalizeCourse(JSON.parse(JSON.stringify(course)))).toEqual(course)
  })

  it('rejects saves that are not a course', () => {
    expect(normalizeCourse(null)).toBeNull()
    expect(normalizeCourse('course')).toBeNull()
    expect(normalizeCourse({ name: 'No holes' })).toBeNull()
  })

  it('drops holes and hazards it cannot draw, and fills in what an old save lacks', () => {
    const course = normalizeCourse({
      id: 'osm-way-1',
      name: 'Old save',
      holes: [{ number: 2, green: TEE }, { number: 1 }, null, { number: 'x', green: TEE }],
      hazards: [{ kind: 'water', polygon: [TEE, TEE, TEE] }, { kind: 'lava', polygon: [] }, { kind: 'bunker' }],
    })
    expect(course?.source).toBe('osm')
    expect(course?.holes).toEqual([{ number: 2, par: null, length: null, tee: null, green: TEE, outline: null, pin: null }])
    expect(course?.hazards).toHaveLength(1)
    expect(normalizeCourse({ id: 'manual-abc', holes: [] })?.source).toBe('manual')
  })
})

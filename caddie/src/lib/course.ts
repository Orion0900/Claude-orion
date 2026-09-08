/**
 * Holes and hazards, from OpenStreetMap or from the player's own taps.
 *
 * OSM maps courses with `golf=hole` ways drawn tee to green, `golf=green`,
 * `golf=tee` and `golf=bunker` areas, water as `golf=water_hazard` or plain
 * `natural=water`, and the occasional `golf=pin` node. Not every course has
 * all of it, so anything can be missing and the app still has to work.
 */
import { centroid, haversine, polygonCrossings, type LatLng } from './geo'
import type { HazardInterval, HazardKind } from './advisor'

export interface Hole {
  number: number
  par: number | null
  /** Tee-to-green length in meters, when the map says. */
  length: number | null
  tee: LatLng | null
  /** Middle of the green. */
  green: LatLng
  outline: LatLng[] | null
  /** Where the flag is today, if known; the green centre otherwise. */
  pin: LatLng | null
}

export interface Hazard {
  kind: HazardKind
  polygon: LatLng[]
}

export interface Course {
  id: string
  name: string
  holes: Hole[]
  hazards: Hazard[]
  source: 'osm' | 'manual'
}

export function targetOf(hole: Hole): LatLng {
  return hole.pin ?? hole.green
}

/** Where the line from the ball to the target crosses hazards, nearest first. */
export function hazardsAlongLine(from: LatLng, to: LatLng, hazards: Hazard[]): HazardInterval[] {
  const out: HazardInterval[] = []
  for (const hazard of hazards) {
    for (const [a, b] of polygonCrossings(from, to, hazard.polygon)) {
      if (b - a < 1) continue
      out.push({ kind: hazard.kind, from: a, to: b })
    }
  }
  return out.sort((a, b) => a.from - b.from)
}

/**
 * Distances to the front and back of the green along the line to the
 * target, extended past it so the back edge is found too.
 */
export function greenDepth(from: LatLng, hole: Hole): { front: number; back: number } | null {
  if (!hole.outline) return null
  const target = targetOf(hole)
  const d = haversine(from, target)
  if (d === 0) return null
  // Walk 80 m past the target: no green is deeper than that.
  const t = (d + 80) / d
  const beyond = { lat: from.lat + (target.lat - from.lat) * t, lng: from.lng + (target.lng - from.lng) * t }
  const crossings = polygonCrossings(from, beyond, hole.outline)
  if (crossings.length === 0) return null
  return { front: crossings[0][0], back: crossings[crossings.length - 1][1] }
}

// ---- OpenStreetMap ---------------------------------------------------------

interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
  lat?: number
  lon?: number
  geometry?: Array<{ lat: number; lon: number }>
}

export interface OverpassResponse {
  elements: OsmElement[]
}

const toLatLng = (g: { lat: number; lon: number }): LatLng => ({ lat: g.lat, lng: g.lon })

function holeNumber(tags: Record<string, string> | undefined): number | null {
  const raw = tags?.ref ?? tags?.name
  if (!raw) return null
  const n = parseInt(raw.replace(/\D+/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseLength(tags: Record<string, string> | undefined): number | null {
  const raw = tags?.dist ?? tags?.length
  if (!raw) return null
  const value = parseFloat(raw)
  if (!Number.isFinite(value)) return null
  return /yd|yard/i.test(raw) ? value * 0.9144 : /ft|feet/i.test(raw) ? value * 0.3048 : value
}

/**
 * Turn an Overpass answer into holes and hazards. Greens are matched to holes
 * by number when both are numbered, otherwise by being where the hole way
 * ends. Holes with no way of their own are still listed if a numbered green
 * exists.
 */
export function parseOverpass(response: OverpassResponse): { name: string | null; holes: Hole[]; hazards: Hazard[] } {
  const ways = response.elements.filter((e) => e.type === 'way' && e.geometry && e.geometry.length > 1)
  const nodes = response.elements.filter((e) => e.type === 'node' && e.lat !== undefined && e.lon !== undefined)

  const courseWay = ways.find((w) => w.tags?.leisure === 'golf_course' && w.tags?.name)
  const name = courseWay?.tags?.name ?? null

  const greens = ways
    .filter((w) => w.tags?.golf === 'green')
    .map((w) => {
      const outline = (w.geometry as NonNullable<OsmElement['geometry']>).map(toLatLng)
      return { number: holeNumber(w.tags), outline, centre: centroid(outline) }
    })
  const tees = ways
    .filter((w) => w.tags?.golf === 'tee')
    .map((w) => ({ number: holeNumber(w.tags), centre: centroid((w.geometry as NonNullable<OsmElement['geometry']>).map(toLatLng)) }))
  const pins = nodes
    .filter((n) => n.tags?.golf === 'pin')
    .map((n) => ({ number: holeNumber(n.tags), point: { lat: n.lat as number, lng: n.lon as number } }))

  const usedGreens = new Set<number>()
  const holes: Hole[] = []

  for (const way of ways.filter((w) => w.tags?.golf === 'hole')) {
    const number = holeNumber(way.tags)
    if (number === null) continue
    const line = (way.geometry as NonNullable<OsmElement['geometry']>).map(toLatLng)
    const end = line[line.length - 1]
    // Prefer a green with the same number; otherwise the nearest one to
    // where the hole line ends, if it's plausibly that hole's green.
    let greenIndex = greens.findIndex((g, i) => g.number === number && !usedGreens.has(i))
    if (greenIndex === -1) {
      let best = Infinity
      greens.forEach((g, i) => {
        if (usedGreens.has(i) || g.number !== null) return
        const d = haversine(g.centre, end)
        if (d < best && d < 60) {
          best = d
          greenIndex = i
        }
      })
    }
    const green = greenIndex >= 0 ? greens[greenIndex] : null
    if (green) usedGreens.add(greenIndex)
    const pin = pins.find((p) => p.number === number)?.point ?? null
    const tee = tees.find((t) => t.number === number)?.centre ?? line[0]
    holes.push({
      number,
      par: way.tags?.par ? parseInt(way.tags.par, 10) || null : null,
      length: parseLength(way.tags),
      tee,
      green: green?.centre ?? end,
      outline: green?.outline ?? null,
      pin,
    })
  }

  // Numbered greens without a hole way still make a hole.
  greens.forEach((g, i) => {
    if (usedGreens.has(i) || g.number === null || holes.some((h) => h.number === g.number)) return
    holes.push({
      number: g.number,
      par: null,
      length: null,
      tee: tees.find((t) => t.number === g.number)?.centre ?? null,
      green: g.centre,
      outline: g.outline,
      pin: pins.find((p) => p.number === g.number)?.point ?? null,
    })
  })

  const hazards: Hazard[] = ways
    .filter((w) => {
      const golf = w.tags?.golf
      return golf === 'bunker' || golf === 'water_hazard' || golf === 'lateral_water_hazard' || w.tags?.natural === 'water'
    })
    .map((w) => ({
      kind: w.tags?.golf === 'bunker' ? 'bunker' : 'water',
      polygon: (w.geometry as NonNullable<OsmElement['geometry']>).map(toLatLng),
    }))

  holes.sort((a, b) => a.number - b.number)
  return { name, holes, hazards }
}

/** A course the player builds by dropping pins, one hole at a time. */
export function manualCourse(name = 'My course'): Course {
  return { id: `manual-${Date.now().toString(36)}`, name, holes: [], hazards: [], source: 'manual' }
}

/** Set (or move) a hole's target. Creates the hole if it doesn't exist. */
export function setHoleTarget(course: Course, number: number, target: LatLng): Course {
  const existing = course.holes.find((h) => h.number === number)
  const holes = existing
    ? course.holes.map((h) => (h.number === number ? { ...h, pin: target, green: h.outline ? h.green : target } : h))
    : [...course.holes, { number, par: null, length: null, tee: null, green: target, outline: null, pin: target }]
  return { ...course, holes: holes.sort((a, b) => a.number - b.number) }
}

export function setHoleTee(course: Course, number: number, tee: LatLng): Course {
  if (!course.holes.some((h) => h.number === number)) return course
  return { ...course, holes: course.holes.map((h) => (h.number === number ? { ...h, tee } : h)) }
}

export function setHolePar(course: Course, number: number, par: number | null): Course {
  return { ...course, holes: course.holes.map((h) => (h.number === number ? { ...h, par } : h)) }
}

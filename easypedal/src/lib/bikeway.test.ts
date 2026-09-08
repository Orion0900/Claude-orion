import { describe, expect, it } from 'vitest'
import {
  bikewayLabel,
  bikewayShare,
  breakdownEdges,
  busyShare,
  classifyEdge,
  isSafe,
  UNSAFE_TOLERANCE_METERS,
  type RoadEdge,
} from './bikeway'

const edge = (over: Partial<RoadEdge>): RoadEdge => ({
  path: [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ],
  length: 100,
  use: 'road',
  roadClass: 'residential',
  cycleLane: 'none',
  ...over,
})

describe('classifyEdge', () => {
  it('treats a cycleway as protected', () => {
    expect(classifyEdge({ use: 'cycleway', roadClass: 'service_other', cycleLane: 'none' })).toBe('protected')
  })

  it('treats a separated lane on any road as protected', () => {
    expect(classifyEdge({ use: 'road', roadClass: 'primary', cycleLane: 'separated' })).toBe('protected')
  })

  it('treats a painted lane as a lane, whatever the road', () => {
    expect(classifyEdge({ use: 'road', roadClass: 'primary', cycleLane: 'dedicated' })).toBe('lane')
  })

  it('never softens a trunk road with a shared marking', () => {
    expect(classifyEdge({ use: 'road', roadClass: 'trunk', cycleLane: 'shared' })).toBe('unsafe')
    expect(classifyEdge({ use: 'road', roadClass: 'motorway', cycleLane: 'none' })).toBe('unsafe')
  })

  it('treats car-free ways as paths', () => {
    expect(classifyEdge({ use: 'footway', roadClass: 'service_other', cycleLane: 'none' })).toBe('path')
    expect(classifyEdge({ use: 'track', roadClass: 'service_other', cycleLane: 'none' })).toBe('path')
  })

  it('treats residential streets and shared markings as quiet', () => {
    expect(classifyEdge({ use: 'road', roadClass: 'residential', cycleLane: 'none' })).toBe('quiet')
    expect(classifyEdge({ use: 'living_street', roadClass: 'residential', cycleLane: 'none' })).toBe('quiet')
    expect(classifyEdge({ use: 'road', roadClass: 'secondary', cycleLane: 'shared' })).toBe('quiet')
  })

  it('treats through roads without a lane as busy', () => {
    expect(classifyEdge({ use: 'road', roadClass: 'tertiary', cycleLane: 'none' })).toBe('busy')
    expect(classifyEdge({ use: 'road', roadClass: 'primary', cycleLane: 'none' })).toBe('busy')
  })

  it('is case-insensitive', () => {
    expect(classifyEdge({ use: 'Cycleway', roadClass: 'Residential', cycleLane: 'None' })).toBe('protected')
  })
})

describe('breakdownEdges', () => {
  it('adds up metres by kind', () => {
    const breakdown = breakdownEdges([
      edge({ use: 'cycleway', length: 300 }),
      edge({ length: 100 }),
      edge({ roadClass: 'primary', length: 50 }),
    ])
    expect(breakdown.total).toBe(450)
    expect(breakdown.meters.protected).toBe(300)
    expect(breakdown.meters.quiet).toBe(100)
    expect(breakdown.meters.busy).toBe(50)
  })

  it('merges neighbouring edges of the same kind into one segment', () => {
    const a = edge({ use: 'cycleway', path: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }] })
    const b = edge({ use: 'cycleway', path: [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }] })
    const c = edge({ path: [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }] })
    const { segments } = breakdownEdges([a, b, c])
    expect(segments).toHaveLength(2)
    expect(segments[0].kind).toBe('protected')
    expect(segments[0].length).toBe(200)
    // The shared junction vertex is kept once, so the line is continuous.
    expect(segments[0].path).toHaveLength(3)
    expect(segments[1].kind).toBe('quiet')
  })

  it('handles no edges at all', () => {
    const breakdown = breakdownEdges([])
    expect(breakdown.total).toBe(0)
    expect(bikewayShare(breakdown)).toBe(0)
    expect(isSafe(breakdown)).toBe(true)
  })
})

describe('shares and safety', () => {
  it('counts protected, lane and path as bike infrastructure', () => {
    const breakdown = breakdownEdges([
      edge({ use: 'cycleway', length: 200 }),
      edge({ cycleLane: 'dedicated', length: 200 }),
      edge({ use: 'path', length: 100 }),
      edge({ length: 500 }),
    ])
    expect(bikewayShare(breakdown)).toBeCloseTo(0.5)
    expect(busyShare(breakdown)).toBe(0)
  })

  it('tolerates a few metres of highway but not a stretch of it', () => {
    const crossing = breakdownEdges([edge({ roadClass: 'trunk', length: UNSAFE_TOLERANCE_METERS })])
    expect(isSafe(crossing)).toBe(true)
    const stretch = breakdownEdges([edge({ roadClass: 'trunk', length: 500 })])
    expect(isSafe(stretch)).toBe(false)
  })

  it('labels the share in plain words', () => {
    expect(bikewayLabel(0.95)).toContain('Almost all')
    expect(bikewayLabel(0.75)).toContain('Mostly')
    expect(bikewayLabel(0.5)).toContain('half')
    expect(bikewayLabel(0.2)).toContain('Some')
    expect(bikewayLabel(0.05)).toContain('Few')
  })
})

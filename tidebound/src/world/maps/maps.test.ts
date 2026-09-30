import { SPECIES_IDS } from '../../data/dex'
import { BUILDING_SIZE, TERRAIN } from '../terrain'
import { World, WorldMap } from '../WorldMap'
import type { Side } from '../mapTypes'
import { ALL_MAPS, MAPS } from './index'

const OPPOSITE: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' }

describe('maps', () => {
  it('have unique ids', () => {
    expect(new Set(ALL_MAPS.map((m) => m.id)).size).toBe(ALL_MAPS.length)
  })

  for (const def of ALL_MAPS) {
    describe(def.id, () => {
      const map = new WorldMap(def)

      it('parses: every row the same width, every character in the legend', () => {
        expect(map.w).toBeGreaterThan(0)
        expect(map.h).toBeGreaterThan(0)
      })

      it('warps lead somewhere real', () => {
        for (const w of def.warps ?? []) {
          expect(map.inside(w.x, w.y), `${def.id} warp at ${w.x},${w.y}`).toBe(true)
          const to = MAPS.get(w.to)
          expect(to, `${def.id} warps to missing map ${w.to}`).toBeDefined()
          const tm = new WorldMap(to!)
          expect(tm.inside(w.tx, w.ty), `${def.id} → ${w.to} ${w.tx},${w.ty} is off the map`).toBe(true)
          const walkable = !tm.solid(w.tx, w.ty) || !!tm.doorAt(w.tx, w.ty)
          expect(walkable, `${def.id} → ${w.to} lands on a solid cell ${w.tx},${w.ty}`).toBe(true)
        }
      })

      it('doors lead to a doormat that leads back', () => {
        for (const b of def.buildings ?? []) {
          const size = BUILDING_SIZE[b.kind]
          expect(b.x + size.w <= map.w && b.y + size.h <= map.h, `${def.id} ${b.kind} fits`).toBe(true)
          const dx = b.x + size.door.x
          const dy = b.y + size.door.y
          if (dy + 1 < map.h) expect(TERRAIN[map.kind(dx, dy + 1)!].walk, `${def.id} ${b.kind} door has room in front`).toBe(true)
          if (!b.to) continue
          const inside = MAPS.get(b.to.map)
          expect(inside, `${def.id} door to missing ${b.to.map}`).toBeDefined()
          const back = inside!.warps?.find((w) => w.x === b.to!.x && w.y === b.to!.y)
          expect(back, `${b.to.map} has no warp at ${b.to.x},${b.to.y}`).toBeDefined()
          expect(back!.to).toBe(def.id)
          expect([back!.tx, back!.ty]).toEqual([dx, dy])
        }
      })

      it('connections are two-way and line up', () => {
        for (const [side, c] of Object.entries(def.connections ?? {}) as [Side, { map: string; offset: number }][]) {
          const other = MAPS.get(c.map)
          expect(other, `${def.id} connects to missing ${c.map}`).toBeDefined()
          const back = other!.connections?.[OPPOSITE[side]]
          expect(back?.map, `${c.map} doesn't connect back to ${def.id}`).toBe(def.id)
          expect(back!.offset + c.offset, `${def.id} ↔ ${c.map} offsets`).toBe(0)
        }
      })

      it('people and items stand on the map', () => {
        for (const n of def.npcs ?? []) {
          expect(map.inside(n.x, n.y), `${def.id} npc ${n.id}`).toBe(true)
          if (!n.prop) expect(!map.solid(n.x, n.y), `${def.id} npc ${n.id} stands in a wall at ${n.x},${n.y}`).toBe(true)
        }
        for (const i of def.items ?? []) {
          expect(map.inside(i.x, i.y)).toBe(true)
          expect(!map.solid(i.x, i.y), `${def.id} item ${i.id} in a wall`).toBe(true)
        }
        const ids = (def.npcs ?? []).map((n) => n.id)
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('encounters name real species at sane levels', () => {
        for (const table of Object.values(def.encounters ?? {})) {
          if (!table) continue
          for (const s of table.slots) {
            expect(SPECIES_IDS).toContain(s.species)
            expect(s.min).toBeGreaterThan(0)
            expect(s.max).toBeGreaterThanOrEqual(s.min)
            expect(s.max).toBeLessThanOrEqual(100)
          }
        }
      })
    })
  }

  it('connected maps agree on the seam', () => {
    const world = new World(MAPS)
    for (const def of ALL_MAPS) {
      const m = world.map(def.id)
      for (const side of ['north', 'south', 'east', 'west'] as const) {
        const n = world.neighbor(m, side)
        if (!n) continue
        // Walking off this edge must land inside the neighbour somewhere.
        let overlap = 0
        if (side === 'north' || side === 'south') {
          const y = side === 'north' ? -1 : m.h
          for (let x = 0; x < m.w; x++) if (world.locate(m, x, y)) overlap++
        } else {
          const x = side === 'west' ? -1 : m.w
          for (let y = 0; y < m.h; y++) if (world.locate(m, x, y)) overlap++
        }
        expect(overlap, `${def.id} ${side} seam`).toBeGreaterThan(0)
      }
    }
  })
})

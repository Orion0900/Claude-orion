import { DEX, dex, preEvolution, SPECIES_IDS, type SpeciesId } from './dex'
import { isMove, move, MOVES } from './moves'
import { baseStatTotal, SPECIES, species } from './species'

const STARTERS: readonly SpeciesId[] = ['leafolin', 'frondolin', 'canopangol', 'kindlet', 'cinderam', 'volcaram', 'narlet', 'narwhelm', 'tidelance']
const FINAL_STARTERS: readonly SpeciesId[] = ['canopangol', 'volcaram', 'tidelance']

const isFirstStage = (id: SpeciesId) => !preEvolution(id) && !!dex(id).evolves
const isMiddle = (id: SpeciesId) => !!preEvolution(id) && !!dex(id).evolves
const isFinal = (id: SpeciesId) => !!preEvolution(id) && !dex(id).evolves

describe('species data', () => {
  it('covers every species in the dex, in order, with its dex types', () => {
    expect(SPECIES.map((s) => s.id)).toEqual([...SPECIES_IDS])
    for (const id of SPECIES_IDS) expect(species(id).types).toEqual(dex(id).types)
    expect(() => species('nope' as SpeciesId)).toThrow()
  })

  it('follows the stat budgets in DESIGN.md', () => {
    for (const id of SPECIES_IDS) {
      const bst = baseStatTotal(id)
      const range: [number, number] =
        id === 'atollus' ? [600, 600]
        : id === 'tempestwyrm' ? [560, 560]
        : id === 'brandger' ? [440, 460]
        : FINAL_STARTERS.includes(id) ? [525, 535]
        : isFirstStage(id) ? [290, 320]
        : isMiddle(id) ? [400, 430]
        : isFinal(id) ? [440, 500]
        : [0, 0]
      expect(bst, id).toBeGreaterThanOrEqual(range[0])
      expect(bst, id).toBeLessThanOrEqual(range[1])
      for (const v of Object.values(species(id).base)) {
        expect(v, id).toBeGreaterThanOrEqual(20)
        expect(v, id).toBeLessThanOrEqual(135)
      }
    }
  })

  it('gives the starters their leans', () => {
    const b = (id: SpeciesId) => species(id).base
    // LEAFOLIN defensive and bulky, KINDLET attacking, NARLET special and sturdy.
    expect(b('leafolin').def).toBeGreaterThan(b('kindlet').def)
    expect(b('leafolin').def).toBeGreaterThan(b('narlet').def)
    expect(b('kindlet').atk).toBeGreaterThan(b('leafolin').atk)
    expect(b('kindlet').atk).toBeGreaterThan(b('narlet').atk)
    expect(b('narlet').spa).toBeGreaterThan(b('narlet').atk)
    expect(b('canopangol').def).toBe(Math.max(...Object.values(b('canopangol'))))
    expect(b('volcaram').atk).toBe(Math.max(...Object.values(b('volcaram'))))
    expect(b('tidelance').spa).toBe(Math.max(...Object.values(b('tidelance'))))
  })

  it('uses the catch rates from the brief', () => {
    for (const id of SPECIES_IDS) {
      const r = species(id).catchRate
      if (STARTERS.includes(id)) expect(r, id).toBe(45)
      else if (id === 'atollus') expect(r).toBe(3)
      else if (id === 'driftwyrm') expect(r).toBe(45)
      else if (isFirstStage(id)) {
        expect(r, id).toBeGreaterThanOrEqual(190)
        expect(r, id).toBeLessThanOrEqual(255)
      } else {
        expect(r, id).toBeGreaterThanOrEqual(45)
        expect(r, id).toBeLessThanOrEqual(90)
      }
    }
  })

  it('yields more experience from later stages', () => {
    for (const d of DEX) {
      expect(species(d.id).xpYield).toBeGreaterThan(0)
      if (d.evolves) expect(species(d.evolves.into).xpYield).toBeGreaterThan(species(d.id).xpYield)
    }
  })

  it('has learnsets of existing moves, in level order, within 1–60', () => {
    for (const s of SPECIES) {
      expect(s.learnset.length, s.id).toBeGreaterThanOrEqual(6)
      let prev = 1
      const seen = new Set<string>()
      for (const e of s.learnset) {
        expect(isMove(e.move), `${s.id} ${e.move}`).toBe(true)
        expect(e.move).not.toBe('struggle')
        expect(e.level).toBeGreaterThanOrEqual(prev)
        expect(e.level).toBeLessThanOrEqual(60)
        expect(seen.has(e.move), `${s.id} learns ${e.move} twice`).toBe(false)
        seen.add(e.move)
        prev = e.level
      }
    }
  })

  it('starts every species with a damaging move and at most four moves at level 1', () => {
    for (const s of SPECIES) {
      const first = s.learnset.filter((e) => e.level === 1)
      expect(first.length, s.id).toBeGreaterThan(0)
      expect(first.length, s.id).toBeLessThanOrEqual(4)
      expect(first.some((e) => move(e.move).category !== 'status'), s.id).toBe(true)
    }
  })

  it('teaches type-appropriate moves that get stronger with level', () => {
    for (const s of SPECIES) {
      const moves = s.learnset.map((e) => ({ level: e.level, m: move(e.move) }))
      for (const t of s.types) expect(moves.some((x) => x.m.type === t && x.m.category !== 'status'), `${s.id} ${t}`).toBe(true)
      const stab = moves.filter((x) => s.types.includes(x.m.type) && x.m.category !== 'status')
      const early = Math.max(...stab.filter((x) => x.level <= 10).map((x) => x.m.power), 0)
      const late = Math.max(...stab.map((x) => x.m.power))
      expect(late, s.id).toBeGreaterThanOrEqual(80)
      expect(late, s.id).toBeGreaterThan(early)
      // Some coverage beyond its own types.
      expect(moves.some((x) => !s.types.includes(x.m.type) && x.m.category !== 'status' && x.m.type !== 'normal') || s.types.includes('normal'), s.id).toBe(true)
    }
  })

  it('makes every move but STRUGGLE learnable by some species', () => {
    const learnable = new Set(SPECIES.flatMap((s) => s.learnset.map((e) => e.move)))
    for (const m of MOVES) if (m.id !== 'struggle') expect(learnable.has(m.id), m.id).toBe(true)
  })

  it('keeps evolution lines consistent with the dex', () => {
    for (const d of DEX) {
      if (!d.evolves) continue
      expect(SPECIES_IDS).toContain(d.evolves.into)
      expect(d.evolves.level).toBeGreaterThan(1)
      expect(d.evolves.level).toBeLessThanOrEqual(60)
      expect(baseStatTotal(d.evolves.into), d.id).toBeGreaterThan(baseStatTotal(d.id))
      expect(species(d.evolves.into).growth, d.id).toBe(species(d.id).growth)
      // The evolved form knows the line's level-1 moves, so a new form never loses its start.
      const firsts = species(d.id).learnset.filter((e) => e.level === 1).map((e) => e.move)
      const later = species(d.evolves.into).learnset.map((e) => e.move)
      for (const m of firsts) expect(later, `${d.evolves.into} ${m}`).toContain(m)
    }
  })
})

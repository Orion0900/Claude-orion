import { Rng } from '../core/rng'
import { DEX, SPECIES_IDS } from '../data/dex'
import { move } from '../data/moves'
import { species } from '../data/species'
import {
  applyItem,
  calcStats,
  createCreature,
  creatureView,
  defaultMoves,
  displayName,
  evolutionFor,
  evolve,
  giveXp,
  healFull,
  itemWouldWork,
  learnMove,
  levelUp,
  maxHp,
  movesLearnedAt,
  useItemInField,
  xpFraction,
  xpToNextLevel,
  gainEffort,
  normalizeCreature,
} from './creature'
import { hpStat, otherStat, xpForLevel } from './formulas'
import { NATURES, natureMultiplier, natureOf } from './natures'
import { ALL_31, beast } from './testkit'

describe('createCreature', () => {
  it('is deterministic for a seed', () => {
    const a = createCreature('kindlet', 12, new Rng(5), { ot: 'ORI', metPlace: 'ROUTE 1' })
    const b = createCreature('kindlet', 12, new Rng(5), { ot: 'ORI', metPlace: 'ROUTE 1' })
    expect(a).toEqual(b)
    expect(createCreature('kindlet', 12, new Rng(6)).uid).not.toBe(a.uid)
  })

  it('rolls IVs, fills HP and PP, and records where it came from', () => {
    const c = createCreature('narlet', 20, new Rng(77), { ot: 'ORI', metPlace: 'DRIFTWOOD' })
    for (const v of Object.values(c.ivs)) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(31)
    }
    expect(c.hp).toBe(maxHp(c))
    for (const s of c.moves) expect(s.pp).toBe(move(s.id).pp)
    expect(c).toMatchObject({ species: 'narlet', level: 20, status: null, sleepTurns: 0, nickname: null, ot: 'ORI', metPlace: 'DRIFTWOOD', metLevel: 20 })
    expect(c.xp).toBe(xpForLevel(species('narlet').growth, 20))
  })

  it('knows the last four moves learnable by its level', () => {
    expect(defaultMoves('leafolin', 1)).toEqual(['bump', 'chirrup'])
    expect(defaultMoves('leafolin', 16)).toEqual(['chirrup', 'seedFlick', 'sapSip', 'dozeDust'])
    expect(createCreature('leafolin', 16, new Rng(1)).moves.map((m) => m.id)).toEqual(['chirrup', 'seedFlick', 'sapSip', 'dozeDust'])
    for (const id of SPECIES_IDS) {
      for (const lv of [1, 5, 17, 33, 60, 100]) {
        const c = createCreature(id, lv, new Rng(lv))
        expect(c.moves.length).toBeGreaterThanOrEqual(1)
        expect(c.moves.length).toBeLessThanOrEqual(4)
        expect(new Set(c.moves.map((m) => m.id)).size).toBe(c.moves.length)
      }
    }
  })

  it('takes a fixed moveset, fixed IVs and a forced shiny', () => {
    const c = createCreature('volcaram', 40, new Rng(3), { moves: ['bump', 'magmaSurge'], ivs: { atk: 31, spe: 0 }, shiny: true, nickname: 'BLAZE' })
    expect(c.moves).toEqual([
      { id: 'bump', pp: 35 },
      { id: 'magmaSurge', pp: 5 },
    ])
    expect(c.ivs.atk).toBe(31)
    expect(c.ivs.spe).toBe(0)
    expect(c.shiny).toBe(true)
    expect(displayName(c)).toBe('BLAZE')
    // The same rolls happen with or without options.
    const plain = createCreature('volcaram', 40, new Rng(3))
    expect(plain.uid).toBe(c.uid)
    expect(plain.ivs.hp).toBe(c.ivs.hp)
  })

  it('is shiny about 1 time in 1024', () => {
    const rng = new Rng(2024)
    let shiny = 0
    const n = 30720
    for (let i = 0; i < n; i++) if (createCreature('tubbara', 3, rng).shiny) shiny++
    expect(shiny).toBeGreaterThan(10)
    expect(shiny).toBeLessThan(55)
  })
})

describe('stats and experience', () => {
  it('computes stats from base, IVs, level and nature', () => {
    const c = createCreature('kindlet', 50, new Rng(1), { ivs: ALL_31 })
    const b = species('kindlet').base
    const n = natureOf(c)
    const m = (k: 'atk' | 'def' | 'spa' | 'spd' | 'spe') => natureMultiplier(n, k)
    expect(calcStats(c)).toEqual({
      hp: hpStat(b.hp, 31, 50),
      atk: otherStat(b.atk, 31, 50, 0, m('atk')),
      def: otherStat(b.def, 31, 50, 0, m('def')),
      spa: otherStat(b.spa, 31, 50, 0, m('spa')),
      spd: otherStat(b.spd, 31, 50, 0, m('spd')),
      spe: otherStat(b.spe, 31, 50, 0, m('spe')),
    })
    expect(maxHp(c)).toBe(calcStats(c).hp)
  })

  it('gives every beast a fixed nature that nudges two stats', () => {
    const c = createCreature('kindlet', 50, new Rng(7), { ivs: ALL_31 })
    expect(natureOf(c)).toBe(natureOf({ uid: c.uid }))
    const names = new Set(NATURES.map((x) => x.name))
    expect(names.size).toBe(25)
    expect(NATURES.filter((x) => !x.up && !x.down)).toHaveLength(5)
    for (const x of NATURES) expect(!!x.up).toBe(!!x.down)
    // Over many beasts every nature turns up.
    const seen = new Set<string>()
    for (let s = 0; s < 2000; s++) seen.add(natureOf(createCreature('pufflet', 5, new Rng(s))).name)
    expect(seen.size).toBe(25)
  })

  it('earns effort by defeating beasts, within the caps', () => {
    const c = createCreature('kindlet', 30, new Rng(3), { ivs: ALL_31 })
    const atkBefore = calcStats(c).atk
    // CINDERAM, a middle stage, gives 2 points in its best stat.
    const y = species('cinderam').effort
    expect(Object.values(y).reduce((a, b) => a + (b ?? 0), 0)).toBe(2)
    for (let i = 0; i < 400; i++) gainEffort(c, 'cinderam')
    const total = Object.values(c.evs).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(510)
    for (const v of Object.values(c.evs)) expect(v).toBeLessThanOrEqual(255)
    const k = Object.keys(y)[0] as keyof typeof c.evs
    expect(c.evs[k]).toBe(255)
    if (k === 'atk') expect(calcStats(c).atk).toBeGreaterThan(atkBefore)
  })

  it('effort yields grow with evolution', () => {
    const sum = (id: Parameters<typeof species>[0]) => Object.values(species(id).effort).reduce((a, b) => a + (b ?? 0), 0)
    expect([sum('leafolin'), sum('frondolin'), sum('canopangol')]).toEqual([1, 2, 3])
    expect(sum('atollus')).toBe(3)
  })

  it('repairs beasts from older saves', () => {
    const c = createCreature('narlet', 12, new Rng(5)) as Partial<ReturnType<typeof createCreature>>
    delete c.evs
    delete c.item
    const fixed = normalizeCreature(c as ReturnType<typeof createCreature>)
    expect(fixed.evs).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
    expect(fixed.item).toBeNull()
    expect(fixed.hp).toBeLessThanOrEqual(maxHp(fixed))
  })

  it('tracks progress through a level', () => {
    const c = beast('leafolin', 10)
    expect(xpFraction(c)).toBe(0)
    c.xp = (xpForLevel('medium', 10) + xpForLevel('medium', 11)) / 2
    expect(xpFraction(c)).toBeCloseTo(0.5)
    expect(xpToNextLevel(c)).toBe(xpForLevel('medium', 11) - c.xp)
    const top = beast('leafolin', 100)
    expect(xpFraction(top)).toBe(0)
    expect(xpToNextLevel(top)).toBe(0)
  })

  it('levels up, raising HP by as much as max HP', () => {
    const c = beast('kindlet', 10)
    c.hp -= 5
    const before = maxHp(c)
    const up = levelUp(c)
    expect(c.level).toBe(11)
    expect(up.before.hp).toBe(before)
    expect(up.after).toEqual(calcStats(c))
    expect(c.hp).toBe(maxHp(c) - 5)
    expect(c.xp).toBeGreaterThanOrEqual(xpForLevel('medium', 11))
  })

  it('gives experience across several levels and reports new moves', () => {
    const c = beast('leafolin', 12)
    const ups = giveXp(c, xpForLevel('medium', 17) - c.xp)
    expect(ups.map((u) => u.level)).toEqual([13, 14, 15, 16, 17])
    expect(ups.find((u) => u.level === 13)?.moves).toEqual(['dozeDust'])
    expect(ups.find((u) => u.level === 17)?.moves).toEqual(['frondSlash'])
    expect(c.level).toBe(17)
    expect(giveXp(c, 0)).toEqual([])
    const top = beast('tubbara', 100)
    expect(giveXp(top, 5000)).toEqual([])
    expect(top.xp).toBe(xpForLevel('medium', 100))
  })

  it('lists moves learned at a level', () => {
    expect(movesLearnedAt('leafolin', 1)).toEqual(['bump', 'chirrup'])
    expect(movesLearnedAt('leafolin', 17)).toEqual(['frondSlash'])
    expect(movesLearnedAt('leafolin', 18)).toEqual([])
  })

  it('learns moves into free slots or over an old one', () => {
    const c = createCreature('kindlet', 5, new Rng(1))
    expect(c.moves.length).toBe(3)
    expect(learnMove(c, 'hotCharge')).toEqual({ ok: true })
    expect(learnMove(c, 'hotCharge')).toEqual({ ok: false })
    expect(learnMove(c, 'magmaSurge')).toEqual({ ok: false })
    expect(learnMove(c, 'magmaSurge', 0)).toEqual({ ok: true, forgot: 'bump' })
    expect(c.moves[0]).toEqual({ id: 'magmaSurge', pp: 5 })
  })

  it('builds the HUD view', () => {
    const c = beast('zappet', 7)
    expect(creatureView(c)).toMatchObject({ species: 'zappet', name: 'ZAPPET', level: 7, hp: c.hp, maxHp: maxHp(c), types: ['volt'] })
    expect(creatureView(c, false).xpFraction).toBe(0)
  })
})

describe('evolution', () => {
  it('matches the dex: ready at the evolution level, not before', () => {
    for (const d of DEX) {
      if (!d.evolves) {
        expect(evolutionFor(beast(d.id, 100))).toBeNull()
        continue
      }
      expect(evolutionFor(beast(d.id, d.evolves.level - 1))).toBeNull()
      expect(evolutionFor(beast(d.id, d.evolves.level))).toBe(d.evolves.into)
      expect(evolutionFor(beast(d.id, 100))).toBe(d.evolves.into)
    }
  })

  it('keeps the damage taken and reports new moves', () => {
    const c = beast('leafolin', 16)
    c.hp -= 7
    const res = evolve(c)
    expect(res).toEqual({ from: 'leafolin', into: 'frondolin', newMoves: ['frondSlash'] })
    expect(c.species).toBe('frondolin')
    expect(c.hp).toBe(maxHp(c) - 7)
    expect(displayName(c)).toBe('FRONDOLIN')
    expect(evolve(beast('brandger', 30))).toBeNull()
  })

  it('leaves a fainted beast fainted', () => {
    const c = beast('pebblit', 25)
    c.hp = 0
    evolve(c, 'cragoyle')
    expect(c.species).toBe('cragoyle')
    expect(c.hp).toBe(0)
  })
})

describe('healing and field items', () => {
  it('heals fully at a Haven', () => {
    const c = beast('narlet', 20)
    c.hp = 1
    c.status = 'slp'
    c.sleepTurns = 2
    c.moves[0].pp = 0
    healFull(c)
    expect(c.hp).toBe(maxHp(c))
    expect(c.status).toBeNull()
    expect(c.sleepTurns).toBe(0)
    expect(c.moves[0].pp).toBe(move(c.moves[0].id).pp)
  })

  it('uses SALVE, and refuses when it would do nothing', () => {
    const c = beast('tubbara', 30)
    const max = maxHp(c)
    expect(useItemInField(c, 'salve')).toEqual({ ok: false, text: "It won't have any effect." })
    c.hp = max - 5
    expect(useItemInField(c, 'salve')).toEqual({ ok: true, text: 'TUBBARA recovered 5 HP!' })
    expect(c.hp).toBe(max)
    c.hp = 10
    useItemInField(c, 'salve')
    expect(c.hp).toBe(30)
    c.hp = 0
    expect(useItemInField(c, 'hyperSalve').ok).toBe(false)
    expect(c.hp).toBe(0)
  })

  it('cures, revives and restores PP', () => {
    const c = beast('wombit', 20)
    expect(useItemInField(c, 'remedy').ok).toBe(false)
    c.status = 'par'
    expect(useItemInField(c, 'remedy')).toEqual({ ok: true, text: 'WOMBIT was cured of paralysis.' })
    expect(c.status).toBeNull()

    c.status = 'tox'
    c.hp = 3
    expect(useItemInField(c, 'fullSalve')).toEqual({ ok: true, text: `WOMBIT recovered ${maxHp(c) - 3} HP! WOMBIT was cured of poison.` })
    expect(c.hp).toBe(maxHp(c))
    expect(c.status).toBeNull()
    c.status = 'brn'
    expect(useItemInField(c, 'fullSalve')).toEqual({ ok: true, text: "WOMBIT's burn was healed." })

    c.hp = 0
    expect(useItemInField(c, 'revivalSeed')).toEqual({ ok: true, text: 'WOMBIT was revived!' })
    expect(c.hp).toBe(Math.floor(maxHp(c) / 2))
    expect(useItemInField(c, 'revivalSeed').ok).toBe(false)

    expect(useItemInField(c, 'ppDrop').ok).toBe(false)
    c.moves[0].pp = 0
    expect(useItemInField(c, 'ppDrop')).toEqual({ ok: true, text: "WOMBIT's PP was restored." })
    expect(c.moves[0].pp).toBe(Math.min(10, move(c.moves[0].id).pp))
  })

  it('refuses non-healing items and can check without changing anything', () => {
    const c = beast('wombit', 20)
    expect(useItemInField(c, 'orb')).toEqual({ ok: false, text: "That can't be used on a beast." })
    expect(useItemInField(c, 'muskSpray').ok).toBe(false)
    c.hp = 5
    expect(itemWouldWork(c, 'salve')).toBe(true)
    expect(c.hp).toBe(5)
    expect(applyItem(c, 'salve', 'Foe WOMBIT').text).toBe('Foe WOMBIT recovered 20 HP!')
  })
})

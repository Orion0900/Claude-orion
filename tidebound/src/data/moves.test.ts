import { TYPES } from './types'
import { isMove, move, MOVES, STRUGGLE, type MoveData, type MoveFx } from './moves'

const FX: readonly MoveFx[] = ['strike', 'slash', 'bite', 'projectile', 'beam', 'burst', 'rain', 'wave', 'drain', 'aura', 'spin', 'shake']
const STAGES = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva']
const STATUSES = ['psn', 'tox', 'brn', 'par', 'slp', 'frz']

const damaging = (m: MoveData) => m.category !== 'status'
const isFixed = (m: MoveData) => m.effects.some((e) => e.kind === 'fixed')
const isMulti = (m: MoveData) => m.effects.some((e) => e.kind === 'multiHit')

describe('moves', () => {
  it('has about ninety moves with unique ids and names', () => {
    expect(MOVES.length).toBeGreaterThanOrEqual(85)
    expect(MOVES.length).toBeLessThanOrEqual(110)
    expect(new Set(MOVES.map((m) => m.id)).size).toBe(MOVES.length)
    expect(new Set(MOVES.map((m) => m.name)).size).toBe(MOVES.length)
  })

  it('looks moves up by id', () => {
    expect(move('bump').name).toBe('BUMP')
    expect(isMove('bump')).toBe(true)
    expect(isMove('nope')).toBe(false)
    expect(() => move('nope')).toThrow()
  })

  it('has upper-case names of twelve characters at most', () => {
    for (const m of MOVES) {
      expect(m.name, m.id).toMatch(/^[A-Z][A-Z .'-]*[A-Z]$/)
      expect(m.name.length, m.id).toBeLessThanOrEqual(12)
    }
  })

  it('has a short description for the summary screen', () => {
    for (const m of MOVES) {
      expect(m.desc.length, m.id).toBeGreaterThan(10)
      expect(m.desc.length, m.id).toBeLessThanOrEqual(60)
    }
  })

  it('has sane numbers', () => {
    for (const m of MOVES) {
      expect(TYPES).toContain(m.type)
      expect(FX, m.id).toContain(m.fx)
      expect(m.accuracy).toBeGreaterThanOrEqual(0)
      expect(m.accuracy).toBeLessThanOrEqual(100)
      expect(m.pp).toBeGreaterThanOrEqual(1)
      expect(m.pp).toBeLessThanOrEqual(40)
      expect(Math.abs(m.priority)).toBeLessThanOrEqual(1)
      if (m.category === 'status' || isFixed(m)) expect(m.power, m.id).toBe(0)
      else expect(m.power, m.id).toBeGreaterThan(0)
      if (m.target === 'self') {
        expect(m.category, m.id).toBe('status')
        expect(m.accuracy, m.id).toBe(0)
      }
    }
  })

  it('has well-formed effects', () => {
    for (const m of MOVES) {
      for (const e of m.effects) {
        switch (e.kind) {
          case 'status':
            expect(STATUSES).toContain(e.status)
            expect(e.chance).toBeGreaterThan(0)
            expect(e.chance).toBeLessThanOrEqual(100)
            break
          case 'stages':
            for (const [k, v] of Object.entries(e.stages)) {
              expect(STAGES).toContain(k)
              expect(v).not.toBe(0)
            }
            if (m.target === 'self') expect(e.who, m.id).toBe('self')
            break
          case 'flinch':
            expect(e.chance).toBeGreaterThan(0)
            expect(e.chance).toBeLessThan(100)
            break
          case 'recoil':
          case 'drain':
          case 'heal':
            expect(e.fraction).toBeGreaterThan(0)
            expect(e.fraction).toBeLessThanOrEqual(1)
            break
          case 'multiHit':
            expect(e.min).toBeGreaterThanOrEqual(2)
            expect(e.max).toBeGreaterThanOrEqual(e.min)
            expect(e.max).toBeLessThanOrEqual(5)
            break
          case 'rest':
            expect(e.turns).toBeGreaterThanOrEqual(1)
            break
          default:
            break
        }
      }
      // Status moves always do something.
      if (m.category === 'status') expect(m.effects.length, m.id).toBeGreaterThan(0)
    }
  })

  it('gives every type weak, medium and strong damaging moves plus a status move', () => {
    for (const t of TYPES) {
      const ofType = MOVES.filter((m) => m.type === t && m.id !== STRUGGLE)
      const hits = ofType.filter(damaging)
      const weak = hits.filter((m) => m.power <= 50 || isMulti(m) || isFixed(m))
      const medium = hits.filter((m) => m.power >= 55 && m.power <= 85)
      const strong = hits.filter((m) => m.power >= 90)
      expect(weak.length, `${t} weak`).toBeGreaterThan(0)
      expect(medium.length, `${t} medium`).toBeGreaterThan(0)
      expect(strong.length, `${t} strong`).toBeGreaterThan(0)
      expect(ofType.filter((m) => m.category === 'status').length, `${t} status`).toBeGreaterThan(0)
    }
  })

  it('covers every kind of effect', () => {
    const kinds = new Set(MOVES.flatMap((m) => m.effects.map((e) => e.kind)))
    for (const k of ['status', 'stages', 'flinch', 'recoil', 'drain', 'multiHit', 'heal', 'highCrit', 'fixed', 'rest']) expect(kinds).toContain(k)
    expect(MOVES.some((m) => m.priority > 0)).toBe(true)
    expect(MOVES.some((m) => m.category === 'physical')).toBe(true)
    expect(MOVES.some((m) => m.category === 'special')).toBe(true)
  })

  it('has STRUGGLE: 50 power, typeless, never misses, ¼ recoil', () => {
    const s = move(STRUGGLE)
    expect(s.name).toBe('STRUGGLE')
    expect(s.power).toBe(50)
    expect(s.typeless).toBe(true)
    expect(s.accuracy).toBe(0)
    expect(s.effects).toContainEqual({ kind: 'recoil', fraction: 1 / 4 })
    expect(MOVES.filter((m) => m.typeless).map((m) => m.id)).toEqual([STRUGGLE])
  })

  it('uses original names, not ones from other monster games', () => {
    const taken = [
      'TACKLE', 'SCRATCH', 'POUND', 'EMBER', 'WATER GUN', 'BUBBLE', 'VINE WHIP', 'RAZOR LEAF', 'THUNDERSHOCK', 'THUNDERBOLT',
      'THUNDER', 'ICE BEAM', 'BLIZZARD', 'FLAMETHROWER', 'FIRE BLAST', 'SURF', 'HYDRO PUMP', 'EARTHQUAKE', 'ROCK SLIDE',
      'ROCK THROW', 'PSYCHIC', 'CONFUSION', 'BITE', 'CRUNCH', 'QUICK ATTACK', 'GROWL', 'LEER', 'TAIL WHIP', 'SAND ATTACK',
      'HARDEN', 'REST', 'RECOVER', 'ABSORB', 'MEGA DRAIN', 'TOXIC', 'SLEEP POWDER', 'THUNDER WAVE', 'SWORDS DANCE', 'AGILITY',
      'GUST', 'PECK', 'KARATE CHOP', 'SHADOW BALL', 'LICK', 'SLUDGE', 'SLUDGE BOMB', 'SPARK', 'BODY SLAM', 'DOUBLE-EDGE',
      'TAKE DOWN', 'HYPER BEAM', 'WING ATTACK', 'AERIAL ACE', 'BRICK BREAK', 'CLOSE COMBAT', 'DRAGON CLAW', 'OUTRAGE',
      'TWISTER', 'METAL CLAW', 'IRON TAIL', 'FLASH CANNON', 'X-SCISSOR', 'BUG BITE', 'STRING SHOT', 'PIN MISSILE', 'MUD-SLAP',
      'DIG', 'ICE SHARD', 'AQUA JET', 'WATERFALL', 'HEAT WAVE', 'FLARE BLITZ', 'ROCK TOMB', 'STONE EDGE', 'SWIFT', 'HYPER VOICE',
      'SLASH', 'CUT', 'SING', 'HYPNOSIS', 'SPORE', 'WILL-O-WISP', 'CALM MIND', 'BULK UP', 'NASTY PLOT', 'ROOST', 'SYNTHESIS',
      'SELF-DESTRUCT', 'EXPLOSION', 'FURY SWIPES', 'NIGHT SHADE', 'SONIC BOOM', 'DRAGON RAGE', 'SUPER FANG', 'ASTONISH',
      'SCALD', 'RAPID SPIN', 'SCREECH', 'SMOKESCREEN', 'DOUBLE TEAM', 'MINIMIZE', 'WITHDRAW', 'DEFENSE CURL', 'GROWTH',
    ]
    for (const m of MOVES) if (m.id !== STRUGGLE) expect(taken, m.name).not.toContain(m.name)
  })
})

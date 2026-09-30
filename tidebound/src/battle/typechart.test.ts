import design from '../../docs/DESIGN.md?raw'
import { TYPES, TYPE_NAME, type TypeId } from '../data/types'
import { chartMatrix, effectiveness, typeMultiplier } from './typechart'

/** The chart as written in docs/DESIGN.md: attack row → defender column → multiplier. */
function parseDesignChart(): Map<TypeId, Map<TypeId, number>> {
  const lines = design.split('\n')
  const header = lines.find((l) => l.startsWith('| Attack'))
  if (!header) throw new Error('type chart header not found in DESIGN.md')
  const cols = header.split('|').slice(2, -1).map((s) => s.trim())
  const colTypes = cols.map((abbr) => {
    const t = TYPES.find((x) => TYPE_NAME[x].slice(0, 3) === abbr)
    if (!t) throw new Error(`unknown column ${abbr}`)
    return t
  })
  const out = new Map<TypeId, Map<TypeId, number>>()
  for (const t of TYPES) {
    const row = lines.find((l) => l.startsWith(`| ${TYPE_NAME[t]} |`))
    if (!row) throw new Error(`row ${TYPE_NAME[t]} not found`)
    const cells = row.split('|').slice(2, -1).map((s) => s.trim())
    expect(cells).toHaveLength(17)
    const m = new Map<TypeId, number>()
    cells.forEach((c, i) => m.set(colTypes[i], c === '' ? 1 : c === '½' ? 0.5 : Number(c)))
    out.set(t, m)
  }
  return out
}

describe('type chart', () => {
  it('matches every cell of the table in docs/DESIGN.md', () => {
    const chart = parseDesignChart()
    for (const a of TYPES) for (const d of TYPES) expect([a, d, typeMultiplier(a, d)]).toEqual([a, d, chart.get(a)!.get(d)])
  })

  it('has the two deliberate differences: VOLT beats METAL, TOXIC beats TIDE', () => {
    expect(effectiveness('volt', ['metal'])).toBe(2)
    expect(effectiveness('toxic', ['tide'])).toBe(2)
  })

  it('has the usual immunities', () => {
    expect(effectiveness('normal', ['spirit'])).toBe(0)
    expect(effectiveness('spirit', ['normal'])).toBe(0)
    expect(effectiveness('brawl', ['spirit'])).toBe(0)
    expect(effectiveness('volt', ['earth'])).toBe(0)
    expect(effectiveness('earth', ['gale'])).toBe(0)
    expect(effectiveness('mind', ['shade'])).toBe(0)
    expect(effectiveness('toxic', ['metal'])).toBe(0)
  })

  it('spot checks single types', () => {
    expect(effectiveness('tide', ['flame'])).toBe(2)
    expect(effectiveness('flame', ['tide'])).toBe(0.5)
    expect(effectiveness('leaf', ['tide'])).toBe(2)
    expect(effectiveness('frost', ['wyrm'])).toBe(2)
    expect(effectiveness('wyrm', ['metal'])).toBe(0.5)
    expect(effectiveness('normal', ['normal'])).toBe(1)
  })

  it('multiplies dual types', () => {
    // CANOPANGOL leaf/earth: FROST hits both halves, GALE only the leaf.
    expect(effectiveness('frost', ['leaf', 'earth'])).toBe(4)
    expect(effectiveness('gale', ['leaf', 'earth'])).toBe(2)
    // VOLCARAM flame/stone: tide 4x, flame 0.25x.
    expect(effectiveness('tide', ['flame', 'stone'])).toBe(4)
    expect(effectiveness('flame', ['flame', 'stone'])).toBe(0.25)
    // SAWBLADON metal/tide: volt conducts through both.
    expect(effectiveness('volt', ['metal', 'tide'])).toBe(4)
    // SPINEFIN toxic/tide: toxic fouls the water but not itself.
    expect(effectiveness('toxic', ['toxic', 'tide'])).toBe(1)
    // An immunity wins over a weakness.
    expect(effectiveness('toxic', ['metal', 'tide'])).toBe(0)
    expect(effectiveness('earth', ['stone', 'gale'])).toBe(0)
    // TEMPESTWYRM wyrm/gale: frost 4x.
    expect(effectiveness('frost', ['wyrm', 'gale'])).toBe(4)
  })

  it('only produces the documented effectiveness values', () => {
    const allowed = new Set([0, 0.25, 0.5, 1, 2, 4])
    for (const a of TYPES) for (const d1 of TYPES) for (const d2 of TYPES) {
      expect(allowed.has(effectiveness(a, d1 === d2 ? [d1] : [d1, d2]))).toBe(true)
    }
  })

  it('exposes the matrix in TYPES order', () => {
    const m = chartMatrix()
    expect(m).toHaveLength(17)
    expect(m[TYPES.indexOf('volt')][TYPES.indexOf('metal')]).toBe(2)
  })
})

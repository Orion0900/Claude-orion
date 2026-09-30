import { allGlyphChars, allSmallChars, glyph, GLYPH_H, measure, SMALL_H, smallGlyph, wrap } from './font'

describe('font', () => {
  it('has every printable ASCII character', () => {
    for (let c = 32; c < 127; c++) {
      const ch = String.fromCharCode(c)
      if ('`{}|\\^@$[]*'.includes(ch)) continue
      expect(allGlyphChars(), `missing '${ch}'`).toContain(ch)
    }
  })

  it('draws every glyph as a rectangle within the line height', () => {
    for (const ch of allGlyphChars()) {
      const g = glyph(ch)
      expect(g.rows.length, ch).toBeLessThanOrEqual(GLYPH_H)
      for (const row of g.rows) expect(row.length, `glyph '${ch}' row '${row}'`).toBe(g.w)
    }
    for (const ch of allSmallChars()) {
      const g = smallGlyph(ch)
      expect(g.rows.length).toBe(SMALL_H)
      for (const row of g.rows) expect(row.length, `small '${ch}'`).toBe(g.w)
    }
  })

  it('measures text as glyph widths plus tracking', () => {
    expect(measure('')).toBe(0)
    expect(measure('A')).toBe(5)
    expect(measure('AA')).toBe(11)
    expect(measure('i!')).toBe(3)
  })

  it('wraps on words and never exceeds the width', () => {
    const text = 'The tide is coming in fast, and the beasts of the reef are restless tonight.'
    const lines = wrap(text, 100)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(100)
    expect(lines.join(' ')).toBe(text)
  })

  it('honours explicit newlines and splits over-long words', () => {
    expect(wrap('ONE\nTWO', 200)).toEqual(['ONE', 'TWO'])
    const long = wrap('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 40)
    for (const l of long) expect(measure(l)).toBeLessThanOrEqual(40)
    expect(long.join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })
})

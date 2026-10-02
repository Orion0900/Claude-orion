import { mixColor, parseColor, withAlpha } from './color'

describe('colour helpers', () => {
  it('parses hex, rgb() and a few names', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1])
    expect(parseColor('#FF8000')).toEqual([255, 128, 0, 1])
    expect(parseColor('#00000080')?.[3]).toBeCloseTo(0.5, 2)
    expect(parseColor('rgba(0, 0, 0, 0.6)')).toEqual([0, 0, 0, 0.6])
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 0.5])
    expect(parseColor('white')).toEqual([255, 255, 255, 1])
    expect(parseColor('hsl(10, 50%, 50%)')).toBeNull()
    expect(parseColor('#12')).toBeNull()
  })

  it('mixes towards another colour', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)')
    expect(mixColor('#ff0000', '#0000ff', 0)).toBe('rgb(255,0,0)')
    // Unparseable colours pass through rather than turning black.
    expect(mixColor('rebeccapurple', '#fff', 0.2)).toBe('rebeccapurple')
  })

  it('fades a colour', () => {
    expect(withAlpha('#ffffff', 0.5)).toBe('rgba(255,255,255,0.5)')
    expect(withAlpha('rgba(0,0,0,0.5)', 0.5)).toBe('rgba(0,0,0,0.25)')
    expect(withAlpha('papayawhip', 0.5)).toBe('papayawhip')
  })
})

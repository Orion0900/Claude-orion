import { money, moneyDraft, moneyField, parseMoney, parsePercent, percent, percentField } from './money'

describe('money', () => {
  it('shows whole dollars, rounded to the nearest', () => {
    expect(money(7800)).toBe('$7,800')
    expect(money(4.99)).toBe('$5')
    expect(money(4.49)).toBe('$4')
    expect(money(1846.15)).toBe('$1,846')
    expect(money(0)).toBe('$0')
    expect(money(-53)).toBe('-$53')
    expect(money(-0.2)).toBe('$0')
  })

  it('rounds away floating point dust', () => {
    expect(money(3852.9999999)).toBe('$3,853')
  })

  it('writes amounts for a field after the $ sign', () => {
    expect(moneyField(7800)).toBe('7,800')
    expect(moneyField(4.5)).toBe('5')
    expect(moneyDraft(7800)).toBe('7800')
    expect(moneyDraft(4.4)).toBe('4')
  })
})

describe('parseMoney', () => {
  it('reads what people type, to the dollar', () => {
    expect(parseMoney('1500')).toBe(1500)
    expect(parseMoney('$1,500')).toBe(1500)
    expect(parseMoney(' 80 ')).toBe(80)
    expect(parseMoney('4.99')).toBe(5)
    expect(parseMoney('.4')).toBe(0)
    expect(parseMoney('12.')).toBe(12)
  })

  it('gives null for text that is not an amount yet', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('.')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('1.2.3')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
  })
})

describe('percent', () => {
  it('shows one decimal place and drops a trailing .0', () => {
    expect(percent(4000 / 7800)).toBe('51.3%')
    expect(percent(3800 / 7800)).toBe('48.7%')
    expect(percent(0.5)).toBe('50%')
    expect(percentField(1)).toBe('100')
    expect(percentField(NaN)).toBe('0')
  })

  it('reads a typed percent back as a fraction', () => {
    expect(parsePercent('51.3')).toBeCloseTo(0.513)
    expect(parsePercent('50%')).toBe(0.5)
    expect(parsePercent('')).toBeNull()
    expect(parsePercent('x')).toBeNull()
  })
})

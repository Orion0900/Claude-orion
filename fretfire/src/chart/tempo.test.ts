import { TempoMap, normalizeSignatures, normalizeTempos } from './tempo'

describe('TempoMap', () => {
  it('converts ticks to seconds at a steady tempo', () => {
    const map = new TempoMap(192, [{ tick: 0, bpm: 120 }])
    expect(map.tickToTime(0)).toBe(0)
    expect(map.tickToTime(192)).toBeCloseTo(0.5)
    expect(map.tickToTime(768)).toBeCloseTo(2)
    expect(map.timeToTick(1)).toBeCloseTo(384)
  })

  it('follows tempo changes both ways', () => {
    const map = new TempoMap(192, [
      { tick: 0, bpm: 120 },
      { tick: 384, bpm: 60 },
    ])
    expect(map.tickToTime(384)).toBeCloseTo(1)
    expect(map.tickToTime(576)).toBeCloseTo(2)
    expect(map.timeToTick(2)).toBeCloseTo(576)
    expect(map.bpmAt(0.5)).toBe(120)
    expect(map.bpmAt(1.5)).toBe(60)
    expect(map.timeToBeat(2)).toBeCloseTo(3)
    expect(map.beatToTime(3)).toBeCloseTo(2)
  })

  it('shifts everything by the offset', () => {
    const map = new TempoMap(480, [{ tick: 0, bpm: 150 }], 0.25)
    expect(map.tickToTime(0)).toBeCloseTo(0.25)
    expect(map.tickToTime(480)).toBeCloseTo(0.65)
    expect(map.timeToTick(0.25)).toBeCloseTo(0)
  })

  it('draws beat lines with measures from the time signature', () => {
    const map = new TempoMap(192, [{ tick: 0, bpm: 120 }], 0, [
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 768, numerator: 3, denominator: 4 },
    ])
    const lines = map.beatLines(3.4)
    expect(lines.map((l) => l.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3])
    expect(lines.map((l) => l.measure)).toEqual([true, false, false, false, true, false, false])
  })

  it('assumes 120 BPM and 4/4 when a chart leaves them out', () => {
    expect(normalizeTempos([{ tick: 960, bpm: 90 }])).toEqual([
      { tick: 0, bpm: 120 },
      { tick: 960, bpm: 90 },
    ])
    expect(normalizeSignatures([])).toEqual([{ tick: 0, numerator: 4, denominator: 4 }])
  })

  it('ignores broken tempo events', () => {
    const tempos = normalizeTempos([
      { tick: 0, bpm: 0 },
      { tick: 0, bpm: 140 },
      { tick: -5, bpm: 100 },
      { tick: 10, bpm: Number.NaN },
    ])
    expect(tempos).toEqual([{ tick: 0, bpm: 140 }])
  })
})

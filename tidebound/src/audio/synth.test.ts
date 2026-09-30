import { pulseSeries, tableSeries, WAVE_TABLES } from './synth'

const magnitude = ([re, im]: [Float32Array, Float32Array], h: number): number => Math.hypot(re[h], im[h])

describe('chip waveforms', () => {
  it('builds pulse waves whose missing harmonics match their duty cycle', () => {
    const square = pulseSeries(0.5, 32)
    for (const h of [2, 4, 6, 8]) expect(magnitude(square, h)).toBeLessThan(1e-6)
    expect(magnitude(square, 3) / magnitude(square, 1)).toBeCloseTo(1 / 3, 5)
    const quarter = pulseSeries(0.25, 32)
    for (const h of [4, 8, 12]) expect(magnitude(quarter, h)).toBeLessThan(1e-6)
    expect(magnitude(quarter, 2)).toBeGreaterThan(0.1)
    const eighth = pulseSeries(0.125, 32)
    for (const h of [8, 16, 24]) expect(magnitude(eighth, h)).toBeLessThan(1e-6)
  })

  it('keeps the wave channel to 32 steps of 4 bits', () => {
    for (const table of Object.values(WAVE_TABLES)) {
      expect(table).toHaveLength(32)
      for (const v of table) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(15)
      }
    }
  })

  it('transforms the stepped triangle into odd harmonics falling as 1/n²', () => {
    const tri = tableSeries(WAVE_TABLES.tri, 64)
    const f = magnitude(tri, 1)
    expect(magnitude(tri, 2) / f).toBeLessThan(0.02)
    expect(magnitude(tri, 3) / f).toBeCloseTo(1 / 9, 1)
    // The staircase leaves faint images around the 32nd harmonic: the gritty handheld edge.
    expect(magnitude(tri, 31) / f).toBeGreaterThan(0.0005)
    expect(magnitude(tri, 0)).toBe(0)
  })
})

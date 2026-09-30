import { DEX, preEvolution, SPECIES_IDS } from '../data/dex'
import { cryParams, lineage, sizeOf } from './cries'

const semitones = (a: number, b: number): number => 12 * Math.log2(a / b)

describe('cries', () => {
  it('are deterministic', () => {
    for (const id of SPECIES_IDS) {
      expect(cryParams(id)).toEqual(cryParams(id))
      expect(cryParams(id, true)).toEqual(cryParams(id, true))
    }
  })

  it('are made of sane, finite numbers', () => {
    for (const id of SPECIES_IDS) {
      for (const faint of [false, true]) {
        const c = cryParams(id, faint)
        expect(c.duration).toBeGreaterThan(0.2)
        expect(c.duration).toBeLessThan(2.5)
        expect(c.pitch).toBeGreaterThan(80)
        expect(c.pitch).toBeLessThan(2000)
        expect(c.voices.length).toBeGreaterThan(0)
        for (const v of c.voices) {
          expect(v.at).toBeGreaterThanOrEqual(0)
          expect(v.dur).toBeGreaterThan(0.02)
          expect(v.at + v.dur).toBeLessThanOrEqual(c.duration + 1e-9)
          expect(v.gain).toBeGreaterThan(0)
          // Thin pulses with a tremolo carry little energy, so their gain runs higher.
          expect(v.gain).toBeLessThanOrEqual(0.5)
          expect(v.path.length).toBeGreaterThan(1)
          let prev = -1
          for (const [at, hz] of v.path) {
            expect(Number.isFinite(hz)).toBe(true)
            expect(hz).toBeGreaterThan(20)
            expect(hz).toBeLessThan(12000)
            expect(at).toBeGreaterThan(prev)
            expect(at).toBeLessThanOrEqual(v.dur + 1e-9)
            prev = at
          }
        }
        for (const n of c.noise) {
          expect(n.gain).toBeGreaterThan(0)
          expect(n.gain).toBeLessThan(0.3)
          expect(n.dur).toBeGreaterThan(0)
        }
      }
    }
  })

  it('differ from species to species', () => {
    const sig = (id: (typeof SPECIES_IDS)[number]): string => {
      const c = cryParams(id)
      return JSON.stringify({ pitch: Math.round(c.pitch), dur: Math.round(c.duration * 100), contours: c.contours, waves: c.voices.map((v) => v.wave) })
    }
    const seen = new Map<string, string>()
    for (const id of SPECIES_IDS) {
      const s = sig(id)
      expect(seen.get(s), `${id} sounds like ${seen.get(s)}`).toBeUndefined()
      seen.set(s, id)
    }
    // And not merely by a hair: every pair differs in contour, timbre or by a clear pitch or length step.
    for (let i = 0; i < SPECIES_IDS.length; i++) {
      for (let j = i + 1; j < SPECIES_IDS.length; j++) {
        const a = cryParams(SPECIES_IDS[i])
        const b = cryParams(SPECIES_IDS[j])
        const sameShape = JSON.stringify(a.contours) === JSON.stringify(b.contours) && a.voices[0].wave === b.voices[0].wave
        if (!sameShape) continue
        const apart = Math.abs(semitones(a.pitch, b.pitch)) >= 0.5 || Math.abs(a.duration - b.duration) >= 0.04
        expect(apart, `${SPECIES_IDS[i]} vs ${SPECIES_IDS[j]}`).toBe(true)
      }
    }
  })

  it('make evolutions sound like deeper, bigger relatives', () => {
    for (const d of DEX) {
      const pre = preEvolution(d.id)
      if (!pre) continue
      const young = cryParams(pre)
      const grown = cryParams(d.id)
      // Same family voice...
      expect(grown.contours).toEqual(young.contours)
      expect(lineage(d.id).root).toBe(lineage(pre).root)
      expect(grown.stage).toBe(young.stage + 1)
      // ...but lower and longer.
      expect(semitones(grown.pitch, young.pitch), `${d.id} vs ${pre}`).toBeLessThan(-3)
      expect(grown.duration).toBeGreaterThan(young.duration)
    }
  })

  it('scale with size: the tiny squeak, the huge boom', () => {
    expect(sizeOf(0.3, 0.1)).toBe(0)
    expect(sizeOf(10, 1000)).toBe(1)
    const tiny = cryParams('clionette')
    const huge = cryParams('atollus')
    expect(tiny.pitch).toBeGreaterThan(huge.pitch * 4)
    expect(huge.duration).toBeGreaterThan(tiny.duration)
  })

  it('fall lower and die away when fainting', () => {
    for (const id of SPECIES_IDS) {
      const c = cryParams(id)
      const f = cryParams(id, true)
      expect(f.faint).toBe(true)
      expect(f.pitch).toBeLessThan(c.pitch)
      expect(f.duration).toBeGreaterThan(c.duration)
      // Every syllable sags at its end.
      const last = (v: (typeof f.voices)[number]) => v.path[v.path.length - 1][1]
      expect(last(f.voices[0])).toBeLessThan(last(c.voices[0]))
    }
  })

  it('take their timbre from their types', () => {
    const byWave = (id: (typeof SPECIES_IDS)[number]) => cryParams(id).voices[0].wave
    expect(byWave('zappet')).toBe('pulse12') // volt buzz
    expect(cryParams('zappet').voices[0].tremDepth).toBeGreaterThan(0)
    expect(byWave('kindlet')).toBe('saw') // flame rasp
    expect(cryParams('kindlet').noise.some((n) => n.crackle > 0)).toBe(true)
    expect(byWave('tatterling')).toBe('soft') // spirit wail
    expect(cryParams('tatterling').voices[0].vibDepth).toBeGreaterThan(100)
    expect(cryParams('sawfry').voices.some((v) => v.wave === 'soft' && v.path[0][1] > cryParams('sawfry').pitch * 2)).toBe(true) // metal ring
    expect(cryParams('tempestwyrm').voices.some((v) => v.wave === 'saw' && v.path[0][1] < cryParams('tempestwyrm').pitch)).toBe(true) // wyrm growl
  })
})

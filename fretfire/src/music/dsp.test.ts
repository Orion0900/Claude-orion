import { Biquad, Limiter, PluckedString, makeRng, softClip } from './dsp'
import { arrange } from './arrange'
import { renderSong } from './render'
import type { SongDef } from './types'

const SR = 32000

/** Fundamental from the autocorrelation peak, refined by parabolic interpolation. */
function pitchOf(signal: Float32Array, minHz: number, maxHz: number): number {
  const minLag = Math.floor(SR / maxHz)
  const maxLag = Math.ceil(SR / minHz)
  const corr = (lag: number) => {
    let sum = 0
    for (let i = 0; i + lag < signal.length; i++) sum += signal[i] * signal[i + lag]
    return sum
  }
  let best = minLag
  let bestValue = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = corr(lag)
    if (v > bestValue) {
      bestValue = v
      best = lag
    }
  }
  const a = corr(best - 1)
  const b = corr(best)
  const c = corr(best + 1)
  const shift = (a - c) / (2 * (a - 2 * b + c))
  return SR / (best + shift)
}

function ring(freq: number, tone: number, seconds = 0.25): Float32Array {
  const s = new PluckedString(SR)
  s.pluck(freq, 0.8, 0.7, tone, makeRng(3))
  s.setDecay(4)
  const skip = Math.round(0.05 * SR)
  for (let i = 0; i < skip; i++) s.tick()
  const out = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < out.length; i++) out[i] = s.tick()
  return out
}

const cents = (a: number, b: number) => 1200 * Math.log2(a / b)

describe('PluckedString', () => {
  for (const freq of [82.41, 110, 220, 440, 880]) {
    for (const tone of [0.45, 0.9]) {
      it(`plays ${freq} Hz in tune with loop tone ${tone}`, () => {
        const measured = pitchOf(ring(freq, tone), freq * 0.7, freq * 1.4)
        expect(Math.abs(cents(measured, freq))).toBeLessThan(6)
      })
    }
  }

  it('glides to a new pitch without being plucked again', () => {
    const s = new PluckedString(SR)
    s.pluck(220, 0.8, 0.7, 0.9, makeRng(1))
    s.setDecay(6)
    for (let i = 0; i < SR * 0.05; i++) s.tick()
    s.setPitch(330, 0.005)
    for (let i = 0; i < SR * 0.05; i++) s.tick()
    const out = new Float32Array(SR * 0.2)
    for (let i = 0; i < out.length; i++) out[i] = s.tick()
    expect(Math.abs(cents(pitchOf(out, 250, 450), 330))).toBeLessThan(8)
  })

  it('falls silent and goes idle once damped', () => {
    const s = new PluckedString(SR)
    s.pluck(110, 0.8, 0.7, 0.6, makeRng(1))
    s.damp(0.05)
    for (let i = 0; i < SR && s.active; i++) s.tick()
    expect(s.active).toBe(false)
  })
})

describe('building blocks', () => {
  it('soft-clips smoothly into ±1', () => {
    expect(softClip(0)).toBe(0)
    expect(softClip(10)).toBe(1)
    expect(softClip(-10)).toBe(-1)
    expect(softClip(0.1)).toBeCloseTo(0.1, 2)
    for (let x = -3; x < 3; x += 0.01) expect(softClip(x + 0.01)).toBeGreaterThanOrEqual(softClip(x))
  })

  it('low-passes', () => {
    const lp = Biquad.lowpass(SR, 500)
    let peak = 0
    for (let i = 0; i < SR / 10; i++) {
      const y = lp.process(Math.sin((2 * Math.PI * 8000 * i) / SR))
      if (i > 100) peak = Math.max(peak, Math.abs(y))
    }
    expect(peak).toBeLessThan(0.01)
  })

  it('holds peaks under the ceiling', () => {
    const l = new Float32Array(1000).map((_, i) => (i % 100 === 0 ? 2 : 0.1))
    const r = l.slice()
    new Limiter(SR, 0.5).process(l, r, l.length)
    expect(Math.max(...l)).toBeLessThanOrEqual(0.5 + 1e-6)
  })
})

describe('renderSong', () => {
  const song: SongDef = {
    id: 'test',
    title: 'Test',
    artist: 'Test',
    genre: '',
    year: '',
    bpm: 120,
    root: 28,
    scale: 'minor',
    leadRoot: 64,
    intensity: 1,
    drive: 1,
    sections: [
      { name: 'A', bars: 2, chords: 'i VI', drums: 'rock', bass: 'root8', rhythm: 'chug8', pad: true, lead: "8: 1 3 5 1' - - . . | P1 - - - 5 - 3 -" },
      { name: 'B', bars: 1, chords: 'i', drums: 'half', bass: 'whole', rhythm: 'ring', ending: true },
    ],
  }

  it('renders finite, normalized stems, deterministically', () => {
    const a = renderSong(arrange(song), SR)
    const b = renderSong(arrange(song), SR)
    let peak = 0
    let leadEnergyLate = 0
    let broken = 0
    for (let i = 0; i < a.length; i++) {
      const x = a.lead[0][i] + a.backing[0][i]
      if (!Number.isFinite(x)) broken++
      peak = Math.max(peak, Math.abs(x))
      // The lead has nothing to play in section B, a second or so after its last note.
      if (i > SR * 7) leadEnergyLate += a.lead[0][i] ** 2
    }
    expect(broken).toBe(0)
    expect(peak).toBeLessThanOrEqual(0.9)
    expect(peak).toBeGreaterThan(0.5)
    expect(leadEnergyLate).toBeLessThan(1)
    expect(a.backing[1]).toEqual(b.backing[1])
  })
})

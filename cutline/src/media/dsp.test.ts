import {
  addSegment,
  analyzeLoudness,
  downmixToMono,
  duckingGains,
  fadeEdges,
  fadeInGain,
  mixMusic,
  remixChannels,
  resample,
  Resampler,
  rmsEnvelope,
  softLimit,
} from './dsp'

const sine = (freq: number, rate: number, seconds: number, amplitude = 1, phase = 0) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amplitude * Math.sin(2 * Math.PI * freq * (i / rate) + phase))

const rms = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0
  for (let i = from; i < to; i++) s += x[i] * x[i]
  return Math.sqrt(s / (to - from))
}

describe('analyzeLoudness', () => {
  it('measures RMS per 10 ms frame', () => {
    const env = rmsEnvelope(sine(1000, 48000, 1, 0.5), 48000)
    expect(env.length).toBe(100)
    for (const v of env) expect(v).toBeCloseTo(0.5 / Math.SQRT2, 3)
  })

  it('scales the loud part to 1 and keeps silence at 0, whatever the level', () => {
    const rate = 16000
    const make = (gain: number) => {
      const x = new Float32Array(rate * 2)
      x.set(sine(300, rate, 1, gain), rate / 2)
      return x
    }
    const loud = analyzeLoudness(make(0.8), rate)
    const quiet = analyzeLoudness(make(0.05), rate)
    expect(loud.frameDuration).toBeCloseTo(0.01, 12)
    expect(loud.envelope.length).toBe(200)
    expect(loud.envelope[10]).toBe(0)
    expect(loud.envelope[100]).toBeCloseTo(1, 2)
    for (let i = 0; i < 200; i++) expect(quiet.envelope[i]).toBeCloseTo(loud.envelope[i], 2)
  })

  it('keeps a silent track at 0 instead of blowing up its noise', () => {
    const silent = analyzeLoudness(new Float32Array(16000), 16000)
    expect(Math.max(...silent.envelope)).toBe(0)
    const hiss = analyzeLoudness(Float32Array.from({ length: 16000 }, (_, i) => (i % 2 ? 1e-5 : -1e-5)), 16000)
    expect(Math.max(...hiss.envelope)).toBeLessThan(0.02)
  })

  it('covers a short last frame', () => {
    const { envelope } = analyzeLoudness(new Float32Array(1005).fill(0.1), 1000, 0.01)
    expect(envelope.length).toBe(101)
  })
})

describe('channels', () => {
  it('downmixes by averaging', () => {
    expect(Array.from(downmixToMono([Float32Array.of(1, 0), Float32Array.of(0, 1)]))).toEqual([0.5, 0.5])
  })

  it('spreads mono and folds surround', () => {
    const mono = Float32Array.of(0.25)
    expect(remixChannels([mono], 2)).toEqual([mono, mono])
    const six = Array.from({ length: 6 }, (_, i) => Float32Array.of(i))
    expect(remixChannels(six, 2).map((c) => c[0])).toEqual([(0 + 2 + 4) / 3, (1 + 3 + 5) / 3])
  })
})

describe('Resampler', () => {
  it('turns 48 kHz speech-band audio into 16 kHz at the same level and pitch', () => {
    const out = resample(sine(1000, 48000, 1, 0.5), 48000, 16000)
    expect(out.length).toBe(16000)
    const ideal = sine(1000, 16000, 1, 0.5)
    let err = 0
    for (let i = 200; i < 15800; i++) err = Math.max(err, Math.abs(out[i] - ideal[i]))
    expect(err).toBeLessThan(0.005)
  })

  it('filters out what 16 kHz can’t hold instead of folding it into the speech band', () => {
    const out = resample(sine(10000, 48000, 1, 0.5), 48000, 16000)
    expect(rms(out, 200, 15800)).toBeLessThan(0.5 / Math.SQRT2 / 100) // > 40 dB down
  })

  it('upsamples 44.1 kHz music to 48 kHz cleanly', () => {
    const out = resample(sine(440, 44100, 0.5, 0.8), 44100, 48000)
    expect(out.length).toBe(24000)
    const ideal = sine(440, 48000, 0.5, 0.8)
    let err = 0
    for (let i = 200; i < 23800; i++) err = Math.max(err, Math.abs(out[i] - ideal[i]))
    expect(err).toBeLessThan(0.002)
  })

  it('handles rate pairs with no small common factor', () => {
    const out = resample(sine(500, 44100, 0.5), 44100, 47999)
    const ideal = sine(500, 47999, 0.5)
    let err = 0
    for (let i = 300; i < out.length - 300; i++) err = Math.max(err, Math.abs(out[i] - ideal[i]))
    expect(err).toBeLessThan(0.003)
  })

  it('keeps a constant constant, and can work in slices', () => {
    const dc = new Float32Array(4800).fill(0.3)
    const r = new Resampler(48000, 16000)
    const whole = r.process(dc, new Float32Array(1600))
    for (let i = 100; i < 1500; i++) expect(whole[i]).toBeCloseTo(0.3, 5)
    const slice = r.process(dc, new Float32Array(100), 700, 800)
    expect(Array.from(slice)).toEqual(Array.from(whole.subarray(700, 800)))
  })
})

describe('joins', () => {
  it('rising and falling edges over the same samples add up to exactly 1', () => {
    for (let i = 0; i < 480; i++) expect(fadeInGain(i, 480) + fadeInGain(479 - i, 480)).toBeCloseTo(1, 12)
    expect(fadeInGain(0, 480)).toBeLessThan(0.0001)
  })

  it('crossfading two pieces of one continuous signal gives back the signal', () => {
    const signal = sine(220, 8000, 1)
    const out = [new Float32Array(8000)]
    const half = 40
    const join = 3000
    addSegment(out, [signal.subarray(0, join + half)], 0, 0, half * 2)
    addSegment(out, [signal.subarray(join - half)], join - half, half * 2, 0)
    for (let i = 0; i < 8000; i++) expect(out[0][i]).toBeCloseTo(signal[i], 6)
  })

  it('drops what falls outside the output and fills every channel', () => {
    const out = [new Float32Array(4), new Float32Array(4)]
    addSegment(out, [Float32Array.of(1, 2, 3, 4, 5, 6)], -2)
    expect(Array.from(out[0])).toEqual([3, 4, 5, 6])
    expect(Array.from(out[1])).toEqual([3, 4, 5, 6])
  })

  it('fades the very ends', () => {
    const x = [new Float32Array(100).fill(1)]
    fadeEdges(x, 10, 10)
    expect(x[0][0]).toBeLessThan(0.05)
    expect(x[0][99]).toBeLessThan(0.05)
    expect(x[0][50]).toBe(1)
  })
})

describe('duckingGains', () => {
  const frame = 0.01
  const env = new Float32Array(600).fill(0.001)
  for (let i = 200; i < 400; i++) env[i] = 0.2

  it('sits at the duck level under speech and at 1 well away from it', () => {
    const g = duckingGains(env, frame)
    expect(g[50]).toBeCloseTo(1, 3)
    expect(g[300]).toBeCloseTo(0.25, 2)
    expect(g[599]).toBeGreaterThan(0.9)
  })

  it('starts ducking ahead of the speech and lets go gradually', () => {
    const g = duckingGains(env, frame)
    expect(g[199]).toBeLessThan(0.75) // already well down when the first word lands
    expect(g[185]).toBeGreaterThan(0.95) // but not long before it
    // Release: 300 ms time constant, so 63% of the way back after 0.3 s.
    const back = (g[430] - 0.25) / 0.75
    expect(back).toBeGreaterThan(0.55)
    expect(back).toBeLessThan(0.7)
  })

  it('judges loudness against the recording’s own speech level', () => {
    const quiet = env.map((v) => v * 0.05)
    const a = duckingGains(env, frame)
    const b = duckingGains(quiet, frame)
    expect(b[300]).toBeCloseTo(a[300], 2)
  })
})

describe('mixMusic', () => {
  it('loops quiet music under the speech, ducked, fading out at the end', () => {
    const out = [new Float32Array(1000)]
    const music = [new Float32Array(300).fill(1)]
    const ducking = new Float32Array(100).fill(1)
    ducking.fill(0.25, 40, 60)
    mixMusic(out, { channels: music, volume: 0.5, ducking, frameLength: 10, seamFade: 4, endFade: 50 })
    expect(out[0][100]).toBeCloseTo(0.5, 5)
    expect(out[0][500]).toBeCloseTo(0.125, 5) // ducked
    expect(out[0][300]).toBeLessThan(0.1) // a loop seam
    expect(out[0][650]).toBeCloseTo(0.5, 5) // second loop
    expect(out[0][999]).toBeLessThan(0.01)
  })
})

describe('softLimit', () => {
  it('leaves normal levels alone and keeps peaks under full scale', () => {
    const x = [Float32Array.of(0.5, -0.89, 0.95, 1.5, -3)]
    const touched = softLimit(x)
    expect(touched).toBe(3)
    expect(x[0][0]).toBe(0.5)
    expect(x[0][1]).toBeCloseTo(-0.89, 6)
    expect(x[0][2]).toBeGreaterThan(0.9)
    expect(x[0][2]).toBeLessThan(0.95)
    expect(x[0][3]).toBeLessThan(1)
    expect(x[0][3]).toBeGreaterThan(x[0][2])
    expect(x[0][4]).toBeGreaterThanOrEqual(-1)
  })
})

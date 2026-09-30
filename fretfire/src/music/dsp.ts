/**
 * Small, allocation-free DSP building blocks for rendering the built-in songs
 * sample by sample. Plain JavaScript on typed arrays, so it runs the same in a
 * worker, on the main thread and under Node in tests.
 */

/** Seeded PRNG (mulberry32): the same seed always renders the same song. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A cheap tanh: a Padé approximant that meets ±1 at ±3 and stays there. */
export function softClip(x: number): number {
  if (x <= -3) return -1
  if (x >= 3) return 1
  const x2 = x * x
  return (x * (27 + x2)) / (27 + 9 * x2)
}

/** RBJ-cookbook biquad in transposed direct form II. */
export class Biquad {
  private z1 = 0
  private z2 = 0

  private constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}

  static lowpass(sampleRate: number, freq: number, q = Math.SQRT1_2): Biquad {
    const { cos, alpha } = omega(sampleRate, freq, q)
    const a0 = 1 + alpha
    return new Biquad((1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0)
  }

  static highpass(sampleRate: number, freq: number, q = Math.SQRT1_2): Biquad {
    const { cos, alpha } = omega(sampleRate, freq, q)
    const a0 = 1 + alpha
    return new Biquad((1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0)
  }

  static bandpass(sampleRate: number, freq: number, q = 1): Biquad {
    const { cos, alpha } = omega(sampleRate, freq, q)
    const a0 = 1 + alpha
    return new Biquad(alpha / a0, 0, -alpha / a0, (-2 * cos) / a0, (1 - alpha) / a0)
  }

  static peaking(sampleRate: number, freq: number, q: number, gainDb: number): Biquad {
    const { cos, alpha } = omega(sampleRate, freq, q)
    const A = Math.pow(10, gainDb / 40)
    const a0 = 1 + alpha / A
    return new Biquad((1 + alpha * A) / a0, (-2 * cos) / a0, (1 - alpha * A) / a0, (-2 * cos) / a0, (1 - alpha / A) / a0)
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }

  processBlock(buf: Float32Array, from: number, to: number): void {
    const { b0, b1, b2, a1, a2 } = this
    let { z1, z2 } = this
    for (let i = from; i < to; i++) {
      const x = buf[i]
      const y = b0 * x + z1
      z1 = b1 * x - a1 * y + z2
      z2 = b2 * x - a2 * y
      buf[i] = y
    }
    this.z1 = z1
    this.z2 = z2
  }
}

function omega(sampleRate: number, freq: number, q: number) {
  const w = (2 * Math.PI * Math.min(freq, sampleRate * 0.49)) / sampleRate
  return { cos: Math.cos(w), alpha: Math.sin(w) / (2 * q) }
}

const KS_SIZE = 4096
const KS_MASK = KS_SIZE - 1

/**
 * A Karplus-Strong plucked string: a burst of noise circulating through a
 * delay line tuned to the pitch, losing a little brightness each pass. The
 * delay can glide, which gives hammer-ons, slides and vibrato for free.
 */
export class PluckedString {
  private readonly buf = new Float32Array(KS_SIZE)
  private write = 0
  private delay = 100
  private target = 100
  private glide = 1
  private lp = 0
  /** Loop filter: 1 is bright and long, 0.3 is dark and short. */
  private tone = 0.7
  private freq = 110
  /** Gain on each trip round the loop. */
  private loss = 0.999
  /** Multiplies the delay each sample, for vibrato. */
  bend = 1
  active = false
  /** A slow peak follower, so a string that has died away can stop costing anything. */
  private level = 0

  constructor(private readonly sampleRate: number) {}

  /** Excite the string. `keep` is how much of the old vibration survives (0 = fully damped). */
  pluck(freq: number, amp: number, pick: number, tone: number, noise: () => number, keep = 0): void {
    this.tone = tone
    this.setPitch(freq, 0)
    this.delay = this.target
    const length = Math.min(KS_MASK, Math.ceil(this.delay) + 2)
    // Low-passed noise, then the mean removed so nothing builds up as DC.
    let state = 0
    let sum = 0
    const start = this.write - length
    const burst = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      state += pick * (noise() * 2 - 1 - state)
      burst[i] = state
      sum += state
    }
    const mean = sum / length
    for (let i = 0; i < length; i++) {
      const j = (start + i) & KS_MASK
      this.buf[j] = this.buf[j] * keep + (burst[i] - mean) * amp
    }
    if (keep === 0) this.lp = 0
    this.active = true
    this.level = Math.max(this.level, amp)
  }

  /** Retune; with glide > 0 the pitch slides there over roughly that many seconds. */
  setPitch(freq: number, glideSeconds: number): void {
    this.freq = freq
    const compensation = (1 - this.tone) / this.tone
    this.target = Math.min(KS_MASK - 2, Math.max(2, this.sampleRate / freq - compensation))
    this.glide = glideSeconds > 0 ? 1 - Math.exp(-1 / (glideSeconds * this.sampleRate)) : 1
  }

  /** How long the string rings, as seconds to fall 60 dB (on top of the loop filter's own loss). */
  setDecay(seconds: number): void {
    this.loss = Math.exp(-6.9078 / (Math.max(0.001, seconds) * this.freq))
  }

  /** Mutes the string over about `seconds`; never lengthens the ring. */
  damp(seconds: number): void {
    this.loss = Math.min(this.loss, Math.exp(-6.9078 / (Math.max(0.001, seconds) * this.freq)))
  }

  tick(): number {
    if (this.delay !== this.target) {
      this.delay += (this.target - this.delay) * this.glide
      if (Math.abs(this.target - this.delay) < 1e-4) this.delay = this.target
    }
    const read = this.write - this.delay * this.bend
    const i0 = Math.floor(read)
    const frac = read - i0
    const s = this.buf[i0 & KS_MASK] * (1 - frac) + this.buf[(i0 + 1) & KS_MASK] * frac
    this.lp += this.tone * (s - this.lp)
    this.buf[this.write & KS_MASK] = this.lp * this.loss
    this.write++
    const mag = s < 0 ? -s : s
    this.level = mag > this.level ? mag : this.level * 0.9995
    if (this.level < 1e-5) this.silence()
    return s
  }

  /** Clears the string so a silent one costs nothing until plucked again. */
  silence(): void {
    this.buf.fill(0)
    this.lp = 0
    this.level = 0
    this.active = false
  }
}

/** A band-limited sawtooth (PolyBLEP), for the pads. */
export class Saw {
  private phase: number
  private inc = 0

  constructor(
    private readonly sampleRate: number,
    phase = 0,
  ) {
    this.phase = phase
  }

  setFreq(freq: number): void {
    this.inc = freq / this.sampleRate
  }

  tick(): number {
    const t = this.phase
    const dt = this.inc
    let y = 2 * t - 1
    if (t < dt) {
      const x = t / dt
      y -= x + x - x * x - 1
    } else if (t > 1 - dt) {
      const x = (t - 1) / dt
      y -= x * x + x + x + 1
    }
    this.phase += dt
    if (this.phase >= 1) this.phase -= 1
    return y
  }
}

class Comb {
  private readonly buf: Float32Array
  private index = 0
  private store = 0

  constructor(
    length: number,
    private readonly feedback: number,
    private readonly damp: number,
  ) {
    this.buf = new Float32Array(Math.max(1, length))
  }

  process(x: number): number {
    const y = this.buf[this.index]
    this.store = y * (1 - this.damp) + this.store * this.damp
    this.buf[this.index] = x + this.store * this.feedback
    if (++this.index >= this.buf.length) this.index = 0
    return y
  }
}

class Allpass {
  private readonly buf: Float32Array
  private index = 0

  constructor(length: number) {
    this.buf = new Float32Array(Math.max(1, length))
  }

  process(x: number): number {
    const b = this.buf[this.index]
    this.buf[this.index] = x + b * 0.5
    if (++this.index >= this.buf.length) this.index = 0
    return b - x
  }
}

/** A small Freeverb-style room: four combs and two allpasses per side. */
export class Reverb {
  private readonly left: Comb[]
  private readonly right: Comb[]
  private readonly apLeft: Allpass[]
  private readonly apRight: Allpass[]

  constructor(sampleRate: number, size = 0.8, damp = 0.3) {
    const k = sampleRate / 44100
    const combs = [1116, 1277, 1422, 1557]
    const allpasses = [556, 441]
    this.left = combs.map((c) => new Comb(Math.round(c * k), size, damp))
    this.right = combs.map((c) => new Comb(Math.round((c + 23) * k), size, damp))
    this.apLeft = allpasses.map((a) => new Allpass(Math.round(a * k)))
    this.apRight = allpasses.map((a) => new Allpass(Math.round((a + 23) * k)))
  }

  /** Adds the wet signal for a mono send into outL/outR. */
  process(send: Float32Array, outL: Float32Array, outR: Float32Array, n: number, wet: number): void {
    const [c0, c1, c2, c3] = this.left
    const [d0, d1, d2, d3] = this.right
    const [a0, a1] = this.apLeft
    const [b0, b1] = this.apRight
    for (let i = 0; i < n; i++) {
      const x = send[i] * 0.2
      let l = c0.process(x) + c1.process(x) + c2.process(x) + c3.process(x)
      let r = d0.process(x) + d1.process(x) + d2.process(x) + d3.process(x)
      l = a1.process(a0.process(l))
      r = b1.process(b0.process(r))
      outL[i] += l * wet
      outR[i] += r * wet
    }
  }
}

/**
 * Keeps peaks under `ceiling`: instant attack, smooth release. Lets the mix
 * sit louder without a stray crash-and-kick spike setting the level.
 */
export class Limiter {
  private env = 0
  private readonly release: number

  constructor(
    sampleRate: number,
    private readonly ceiling: number,
    releaseSeconds = 0.08,
  ) {
    this.release = Math.exp(-1 / (releaseSeconds * sampleRate))
  }

  /** Limits a stereo pair in place, linked so the image doesn't wander. */
  process(left: Float32Array, right: Float32Array, n: number): void {
    const { ceiling, release } = this
    let env = this.env
    for (let i = 0; i < n; i++) {
      const l = left[i]
      const r = right[i]
      const peak = Math.max(l < 0 ? -l : l, r < 0 ? -r : r)
      env = peak > env ? peak : env * release + peak * (1 - release)
      if (env > ceiling) {
        const g = ceiling / env
        left[i] = l * g
        right[i] = r * g
      }
    }
    this.env = env
  }
}

/** A feedback delay with a darkening repeat, for the lead guitar. */
export class Echo {
  private readonly buf: Float32Array
  private index = 0
  private lp = 0

  constructor(
    samples: number,
    private readonly feedback: number,
  ) {
    this.buf = new Float32Array(Math.max(1, Math.round(samples)))
  }

  process(x: number): number {
    const y = this.buf[this.index]
    this.lp += 0.35 * (y - this.lp)
    this.buf[this.index] = x + this.lp * this.feedback
    if (++this.index >= this.buf.length) this.index = 0
    return y
  }
}

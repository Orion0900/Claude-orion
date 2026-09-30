import { Biquad, Echo, Limiter, PluckedString, Reverb, Saw, makeRng, softClip } from './dsp'
import { makeDrumBank, type DrumBank } from './drums'
import { midiToFreq } from './theory'
import type { ChordHit, DrumHit, DrumKind, LeadNote, Score, Tone } from './types'

/**
 * Renders a score to two stereo stems: the lead guitar the player is charted
 * on, and everything else. The game mutes the lead stem on a miss, exactly
 * like a separate guitar track in Clone Hero.
 *
 * Plucked-string guitars and bass through soft-clipping amps and cabinet
 * filters, a synthesised drum kit, pads, echo and room. Rendering happens in
 * blocks so a caller can spread it out and report progress.
 */

export interface RenderedSong {
  sampleRate: number
  length: number
  lead: [Float32Array, Float32Array]
  backing: [Float32Array, Float32Array]
}

const BLOCK = 512

const DRUM_MIX: Record<DrumKind, { gain: number; pan: number; send: number }> = {
  kick: { gain: 0.8, pan: 0, send: 0.02 },
  snare: { gain: 0.55, pan: 0.02, send: 0.3 },
  hat: { gain: 0.2, pan: 0.35, send: 0.03 },
  open: { gain: 0.2, pan: 0.35, send: 0.05 },
  crash: { gain: 0.24, pan: 0, send: 0.12 },
  ride: { gain: 0.2, pan: -0.3, send: 0.05 },
  tomHi: { gain: 0.5, pan: -0.35, send: 0.2 },
  tomMid: { gain: 0.5, pan: 0, send: 0.2 },
  tomLo: { gain: 0.55, pan: 0.35, send: 0.2 },
  stick: { gain: 0.35, pan: 0, send: 0.04 },
}

const BASS_LEVEL = 0.5
const RHYTHM_LEVEL = 0.26
const LEAD_LEVEL = 0.62
const PAD_LEVEL = 0.1

interface Timed<T> {
  start: number
  end: number
  ev: T
}

interface DrumVoice {
  left: Float32Array
  right: Float32Array
  pos: number
  gl: number
  gr: number
  send: number
}

interface PadVoice {
  saws: Saw[]
  gain: number
  start: number
  end: number
  env: number
}

export class SongRenderer {
  readonly length: number
  readonly out: RenderedSong
  private pos = 0

  private readonly spb: number
  private readonly noise: () => number
  private readonly bank: DrumBank
  private readonly drums: Timed<DrumHit>[]
  private readonly bass: Timed<Tone>[]
  private readonly rhythm: Timed<ChordHit>[]
  private readonly lead: Timed<LeadNote>[]
  private readonly pad: Timed<ChordHit>[]
  private next = { drums: 0, bass: 0, rhythm: 0, lead: 0, pad: 0 }
  private variant = 0

  private readonly drumVoices: DrumVoice[] = []
  private readonly padVoices: PadVoice[] = []
  private readonly bassString: PluckedString
  private bassEnd = -1
  private readonly rhythmStrings: PluckedString[]
  private rhythmEnd = -1
  private readonly leadStrings: PluckedString[]
  private leadNote: Timed<LeadNote> | null = null
  private leadReleased = true
  private vibStart = 0
  private vibDepth = 0
  /** Vibrato LFO as a rotating phasor: no sin() per sample. */
  private vibSin = 0
  private vibCos = 1
  private vibRamp = 0

  private readonly buses = {
    backL: new Float32Array(BLOCK),
    backR: new Float32Array(BLOCK),
    send: new Float32Array(BLOCK),
    bass: new Float32Array(BLOCK),
    rhythm: new Float32Array(BLOCK),
    lead: new Float32Array(BLOCK),
    leadL: new Float32Array(BLOCK),
    leadR: new Float32Array(BLOCK),
    padL: new Float32Array(BLOCK),
    padR: new Float32Array(BLOCK),
  }
  private readonly allBuses = Object.values(this.buses)
  /** Samples of pad filter tail still to run after the last pad voice. */
  private padTail = 0

  private readonly bassLp: Biquad
  private readonly rhythmChain: Biquad[]
  private readonly rhythmCab: Biquad[]
  private readonly haas: Float32Array
  private haasIndex = 0
  private readonly leadChain: Biquad[]
  private readonly leadCab: Biquad[]
  private readonly echoL: Echo
  private readonly echoR: Echo
  private readonly padLp: [Biquad, Biquad]
  private readonly room: Reverb
  private readonly leadRoom: Reverb
  private readonly backLimiter: Limiter
  private readonly leadLimiter: Limiter
  private readonly rhythmDrive: number
  private readonly leadDrive: number

  constructor(
    score: Score,
    readonly sampleRate: number,
    seed = 7,
  ) {
    const sr = sampleRate
    this.spb = (sr * 60) / score.bpm
    this.length = Math.ceil(score.lengthBeats * this.spb)
    this.out = {
      sampleRate: sr,
      length: this.length,
      lead: [new Float32Array(this.length), new Float32Array(this.length)],
      backing: [new Float32Array(this.length), new Float32Array(this.length)],
    }
    const rng = makeRng(seed)
    this.noise = rng
    this.bank = makeDrumBank(sr, seed)
    const at = (beat: number) => Math.round(beat * this.spb)
    const timed = <T extends { beat: number }>(list: T[], length: (e: T) => number): Timed<T>[] =>
      list.map((ev) => ({ start: at(ev.beat), end: at(ev.beat + length(ev)), ev }))
    this.drums = timed(score.drums, () => 0)
    this.bass = timed(score.bass, (e) => e.length)
    this.rhythm = timed(score.rhythm, (e) => e.length)
    this.lead = timed(score.lead, (e) => e.length)
    this.pad = timed(score.pad, (e) => e.length)

    this.bassString = new PluckedString(sr)
    this.rhythmStrings = [0, 1, 2].map(() => new PluckedString(sr))
    this.leadStrings = [0, 1, 2].map(() => new PluckedString(sr))

    this.bassLp = Biquad.lowpass(sr, 950)
    this.rhythmChain = [Biquad.highpass(sr, 90), Biquad.peaking(sr, 750, 0.8, 4)]
    this.rhythmCab = [Biquad.lowpass(sr, 4800), Biquad.lowpass(sr, 5600), Biquad.peaking(sr, 420, 1.2, -4)]
    this.haas = new Float32Array(Math.round(0.013 * sr))
    this.leadChain = [Biquad.highpass(sr, 160), Biquad.peaking(sr, 1100, 0.7, 6)]
    this.leadCab = [Biquad.lowpass(sr, 5200), Biquad.lowpass(sr, 6400)]
    this.echoL = new Echo(0.75 * this.spb, 0.3)
    this.echoR = new Echo(0.5 * this.spb, 0.3)
    this.padLp = [Biquad.lowpass(sr, 1600), Biquad.lowpass(sr, 1600)]
    this.room = new Reverb(sr, 0.8, 0.3)
    this.leadRoom = new Reverb(sr, 0.78, 0.35)
    this.backLimiter = new Limiter(sr, 0.9)
    this.leadLimiter = new Limiter(sr, 0.6)
    this.rhythmDrive = 3 + 5 * score.drive
    this.leadDrive = 3 + 4 * score.drive
  }

  get progress(): number {
    return this.length ? this.pos / this.length : 1
  }

  get done(): boolean {
    return this.pos >= this.length
  }

  /** Renders at least `samples` more samples. */
  step(samples: number): void {
    const stop = Math.min(this.length, this.pos + samples)
    while (this.pos < stop) {
      const n = Math.min(BLOCK, this.length - this.pos)
      this.block(this.pos, n)
      this.pos += n
    }
  }

  /** Scales both stems together so their sum peaks just under full scale. Returns the gain used. */
  normalize(): number {
    const { lead, backing } = this.out
    let peak = 0
    for (let c = 0; c < 2; c++) {
      const l = lead[c]
      const b = backing[c]
      for (let i = 0; i < this.length; i++) peak = Math.max(peak, Math.abs(l[i] + b[i]))
    }
    const gain = peak > 0 ? Math.min(4, 0.89 / peak) : 1
    for (const buf of [...lead, ...backing]) for (let i = 0; i < buf.length; i++) buf[i] *= gain
    return gain
  }

  private block(s0: number, n: number): void {
    const b = this.buses
    for (const buf of this.allBuses) buf.fill(0, 0, n)
    this.renderDrums(s0, n)
    this.renderBass(s0, n)
    this.renderRhythm(s0, n)
    this.renderLead(s0, n)
    this.renderPad(s0, n)

    // Whole-block passes through each amp and filter keep the loops tight.
    this.bassLp.processBlock(b.bass, 0, n)
    this.amp(b.rhythm, this.rhythmChain, this.rhythmDrive, this.rhythmCab, n)
    this.amp(b.lead, this.leadChain, this.leadDrive, this.leadCab, n)
    const pads = this.padVoices.length > 0 || this.padTail > 0
    if (pads) {
      this.padLp[0].processBlock(b.padL, 0, n)
      this.padLp[1].processBlock(b.padR, 0, n)
      this.padTail = this.padVoices.length ? this.sampleRate : this.padTail - n
    }

    const haas = this.haas
    let h = this.haasIndex
    for (let i = 0; i < n; i++) {
      const bass = softClip(b.bass[i] * 1.6) * BASS_LEVEL
      const r = b.rhythm[i]
      const delayed = haas[h]
      haas[h] = r
      if (++h >= haas.length) h = 0
      const padL = b.padL[i] * PAD_LEVEL
      const padR = b.padR[i] * PAD_LEVEL
      b.backL[i] += bass + r * RHYTHM_LEVEL + padL
      b.backR[i] += bass + delayed * RHYTHM_LEVEL + padR
      b.send[i] += r * 0.06 + (padL + padR) * 2
      const l = b.lead[i]
      const dry = l * LEAD_LEVEL
      b.leadL[i] = dry + this.echoL.process(l) * 0.07
      b.leadR[i] = dry + this.echoR.process(l) * 0.07
    }
    this.haasIndex = h
    this.room.process(b.send, b.backL, b.backR, n, 0.3)
    this.leadRoom.process(b.lead, b.leadL, b.leadR, n, 0.12)
    this.backLimiter.process(b.backL, b.backR, n)
    this.leadLimiter.process(b.leadL, b.leadR, n)

    const [outL, outR] = this.out.lead
    const [backL, backR] = this.out.backing
    for (let i = 0; i < n; i++) {
      outL[s0 + i] = b.leadL[i]
      outR[s0 + i] = b.leadR[i]
      backL[s0 + i] = b.backL[i]
      backR[s0 + i] = b.backR[i]
    }
  }

  /** Pre-shape, clip and cabinet-filter a guitar bus in place. */
  private amp(bus: Float32Array, pre: Biquad[], drive: number, cab: Biquad[], n: number): void {
    for (const f of pre) f.processBlock(bus, 0, n)
    for (let i = 0; i < n; i++) bus[i] = softClip(bus[i] * drive)
    for (const f of cab) f.processBlock(bus, 0, n)
  }

  private renderDrums(s0: number, n: number): void {
    const b = this.buses
    while (this.next.drums < this.drums.length && this.drums[this.next.drums].start < s0 + n) {
      const { start, ev } = this.drums[this.next.drums++]
      const variants = this.bank[ev.kind]
      const left = variants[this.variant++ % variants.length]
      const right = ev.kind === 'crash' ? variants[this.variant % variants.length] : left
      const mix = DRUM_MIX[ev.kind]
      const g = mix.gain * ev.velocity
      this.drumVoices.push({ left, right, pos: s0 - start, gl: g * (1 - mix.pan), gr: g * (1 + mix.pan), send: g * mix.send })
    }
    for (let v = this.drumVoices.length - 1; v >= 0; v--) {
      const voice = this.drumVoices[v]
      const { left, right, gl, gr, send } = voice
      for (let i = Math.max(0, -voice.pos); i < n; i++) {
        const p = voice.pos + i
        if (p >= left.length) break
        const x = left[p]
        b.backL[i] += x * gl
        b.backR[i] += right[p] * gr
        b.send[i] += x * send
      }
      voice.pos += n
      if (voice.pos >= left.length) this.drumVoices.splice(v, 1)
    }
  }

  private renderBass(s0: number, n: number): void {
    const out = this.buses.bass
    const string = this.bassString
    for (let i = 0; i < n; i++) {
      const s = s0 + i
      while (this.next.bass < this.bass.length && this.bass[this.next.bass].start <= s) {
        const note = this.bass[this.next.bass++]
        string.pluck(midiToFreq(note.ev.pitch), 0.8 * note.ev.velocity, 0.5, 0.45, this.noise, 0)
        string.setDecay(2.5)
        this.bassEnd = note.end
      }
      if (s === this.bassEnd) string.damp(0.05)
      if (string.active) out[i] = string.tick()
    }
  }

  private renderRhythm(s0: number, n: number): void {
    const out = this.buses.rhythm
    const strings = this.rhythmStrings
    for (let i = 0; i < n; i++) {
      const s = s0 + i
      while (this.next.rhythm < this.rhythm.length && this.rhythm[this.next.rhythm].start <= s) {
        const hit = this.rhythm[this.next.rhythm++]
        const { pitches, muted, velocity } = hit.ev
        pitches.forEach((pitch, k) => {
          const freq = midiToFreq(pitch) * (1 + (k - 1) * 0.0008)
          if (muted) {
            strings[k].pluck(freq, 0.5 * velocity, 0.3, 0.42, this.noise, 0)
            strings[k].setDecay(0.2)
          } else {
            strings[k].pluck(freq, 0.45 * velocity, 0.6, 0.68, this.noise, 0)
            strings[k].setDecay(2.8)
          }
        })
        this.rhythmEnd = hit.end
      }
      if (s === this.rhythmEnd) for (const str of strings) str.damp(0.05)
      let sum = 0
      for (let k = 0; k < 3; k++) if (strings[k].active) sum += strings[k].tick()
      out[i] = sum
    }
  }

  private renderLead(s0: number, n: number): void {
    const out = this.buses.lead
    const strings = this.leadStrings
    const w = (2 * Math.PI * 5.6) / this.sampleRate
    const rotCos = Math.cos(w)
    const rotSin = Math.sin(w)
    const rampStep = 1 / (0.3 * this.sampleRate)
    for (let i = 0; i < n; i++) {
      const s = s0 + i
      while (this.next.lead < this.lead.length && this.lead[this.next.lead].start <= s) {
        this.startLead(this.lead[this.next.lead++], s)
      }
      const note = this.leadNote
      if (note && !this.leadReleased && s >= note.end) {
        for (const str of strings) str.damp(0.07)
        this.leadReleased = true
      }
      if (this.vibDepth > 0 && s >= this.vibStart) {
        const sin = this.vibSin * rotCos + this.vibCos * rotSin
        this.vibCos = this.vibCos * rotCos - this.vibSin * rotSin
        this.vibSin = sin
        if (this.vibRamp < 1) this.vibRamp += rampStep
        // 2^(-c/1200) to first order, plenty for ±24 cents.
        strings[0].bend = 1 - this.vibDepth * this.vibRamp * sin * 0.000577623
      }
      let sum = 0
      for (let k = 0; k < 3; k++) if (strings[k].active) sum += strings[k].tick()
      out[i] = sum
    }
  }

  private startLead(note: Timed<LeadNote>, s: number): void {
    const prev = this.leadNote
    const strings = this.leadStrings
    const { pitches, power } = note.ev
    const legato =
      prev !== null &&
      !this.leadReleased &&
      s - prev.end <= 1 &&
      s - prev.start <= 0.36 * this.spb &&
      !power &&
      !prev.ev.power &&
      prev.ev.pitches[0] !== pitches[0]
    const freq = midiToFreq(pitches[0])
    strings[0].bend = 1
    if (legato) strings[0].setPitch(freq, 0.005)
    else strings[0].pluck(freq, 0.7, 0.8, 0.9, this.noise, 0.1)
    strings[0].setDecay(5)
    if (power) {
      for (let k = 1; k < 3; k++) {
        strings[k].bend = 1
        strings[k].pluck(midiToFreq(pitches[k]), k === 1 ? 0.55 : 0.4, 0.75, 0.85, this.noise, 0)
        strings[k].setDecay(4)
      }
    } else {
      strings[1].damp(0.03)
      strings[2].damp(0.03)
    }
    const beats = note.ev.length
    this.vibDepth = !power && beats >= 0.75 ? 24 : 0
    this.vibStart = s + Math.min(0.22 * this.sampleRate, 0.35 * (note.end - note.start))
    this.vibSin = 0
    this.vibCos = 1
    this.vibRamp = 0
    this.leadNote = note
    this.leadReleased = false
  }

  private renderPad(s0: number, n: number): void {
    const b = this.buses
    const sr = this.sampleRate
    while (this.next.pad < this.pad.length && this.pad[this.next.pad].start < s0 + n) {
      const hit = this.pad[this.next.pad++]
      const saws: Saw[] = []
      for (const pitch of hit.ev.pitches) {
        for (const cents of [-6, 6]) {
          const saw = new Saw(sr, this.noise())
          saw.setFreq(midiToFreq(pitch) * Math.pow(2, cents / 1200))
          saws.push(saw)
        }
      }
      this.padVoices.push({ saws, gain: hit.ev.velocity / hit.ev.pitches.length, start: hit.start, end: hit.end, env: 0 })
    }
    const attack = 1 / (0.15 * sr)
    const release = Math.exp(-1 / (0.35 * sr))
    for (let v = this.padVoices.length - 1; v >= 0; v--) {
      const voice = this.padVoices[v]
      let { env } = voice
      for (let i = Math.max(0, voice.start - s0); i < n; i++) {
        const s = s0 + i
        env = s < voice.end ? Math.min(1, env + attack) : env * release
        let l = 0
        let r = 0
        for (let k = 0; k < voice.saws.length; k += 2) {
          l += voice.saws[k].tick()
          r += voice.saws[k + 1].tick()
        }
        b.padL[i] += l * env * voice.gain
        b.padR[i] += r * env * voice.gain
      }
      voice.env = env
      if (s0 + n > voice.end && env < 1e-4) this.padVoices.splice(v, 1)
    }
  }
}

/** Renders a whole score in one go and normalizes it (tests, workers). */
export function renderSong(score: Score, sampleRate: number, seed = 7): RenderedSong {
  const renderer = new SongRenderer(score, sampleRate, seed)
  renderer.step(renderer.length)
  renderer.normalize()
  return renderer.out
}

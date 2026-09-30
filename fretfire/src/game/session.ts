import type { TempoMap } from '../chart/tempo'
import { FRET_MASK, OPEN_BIT, OPEN_LANE, gemCount, type Note, type Track } from '../chart/types'

/**
 * Judging and scoring for one play of one track, with no clock, audio or
 * drawing: the game feeds it timestamped input and asks it to catch up to the
 * present. Everything here runs identically in tests.
 */

/** Tap: touching a lane plays the gems on it. Guitar: hold frets and strum, like a controller. */
export type InputScheme = 'tap' | 'guitar'

export interface SessionOptions {
  scheme: InputScheme
  /** Seconds either side of a note in which it can be hit. */
  window: number
  /** Taps and strums that hit nothing break the streak. */
  ghostPenalty: boolean
  /** An empty rock meter ends the song. */
  canFail: boolean
}

export const DEFAULT_WINDOW = 0.075
export const NOTE_POINTS = 50
export const SUSTAIN_POINTS_PER_BEAT = 25
export const STREAK_PER_MULTIPLIER = 10
export const MAX_MULTIPLIER = 4
export const STAR_PHRASE_GAIN = 0.25
export const STAR_MIN_TO_ACTIVATE = 0.5
/** A full star power meter lasts this many beats. */
export const STAR_BEATS_FULL = 32
export const SOLO_POINTS_PER_NOTE = 100
/** A strum this soon after a fretted HOPO or tap is part of the same note, not an overstrum. */
export const STRUM_AFTER_FRET_LENIENCY = 0.08
/** A strum waits this long for late frets before it counts as wrong. */
export const STRUM_WAIT_FOR_FRETS = 0.05
/** A second tap on the same lane this soon after a hit is a bounce, not a ghost. */
const DOUBLE_TAP_GRACE = 0.06
/**
 * Share of a perfect run's score (every note, every sustain, no star power)
 * each star needs. Star power can push a run past 1.
 */
export const STAR_THRESHOLDS = [0.08, 0.2, 0.38, 0.6, 0.85]

const ROCK_START = 0.5
const ROCK_HIT = 0.02
const ROCK_MISS = 0.045
const ROCK_OVERHIT = 0.02

export const PENDING = 0
export const HIT = 1
export const MISSED = 2

export type SessionEvent =
  | { type: 'hit'; note: number; mask: number; offset: number; points: number }
  | { type: 'miss'; note: number; mask: number; streakLost: number }
  | { type: 'overhit'; lane: number; streakLost: number }
  | { type: 'sustainEnd'; lane: number; complete: boolean }
  | { type: 'starGained'; meter: number }
  | { type: 'starPhraseLost' }
  | { type: 'starReady' }
  | { type: 'starActivated' }
  | { type: 'starEnded' }
  | { type: 'multiplier'; value: number }
  | { type: 'streak'; value: number }
  | { type: 'soloStart'; notes: number }
  | { type: 'soloEnd'; hit: number; total: number; bonus: number }
  | { type: 'failed' }

export interface SustainState {
  note: number
  /** Seconds when the sustain runs out. */
  end: number
  endBeat: number
  /** Beat up to which points have been paid. */
  paidBeat: number
}

export interface SoloResult {
  hit: number
  total: number
  bonus: number
}

export interface Results {
  score: number
  stars: number
  hits: number
  total: number
  accuracy: number
  bestStreak: number
  fullCombo: boolean
  starPhrasesHit: number
  starPhrasesTotal: number
  solos: SoloResult[]
  /** Mean of (tap time − note time) over hits, seconds; negative is early. */
  meanOffset: number
  failed: boolean
}

interface SoloSpan {
  start: number
  end: number
  first: number
  last: number
  started: boolean
  done: boolean
}

export class PlaySession {
  readonly notes: Note[]
  readonly status: Uint8Array
  /** Gems of each note already tapped, for chords played one finger at a time. */
  readonly tapped: Uint8Array
  readonly sustains: (SustainState | null)[] = [null, null, null, null, null, null]

  score = 0
  streak = 0
  bestStreak = 0
  hits = 0
  misses = 0
  overhits = 0
  starMeter = 0
  starActive = false
  rock = ROCK_START
  failed = false

  /** What hitting everything, without star power, would score. */
  readonly perfectScore: number
  private readonly phraseOf: Int32Array
  private readonly phraseRanges: { first: number; last: number }[]
  private readonly phraseBroken: Uint8Array
  private readonly phraseAwarded: Uint8Array
  private readonly solos: SoloSpan[]
  private readonly soloResults: SoloResult[] = []
  private readonly events: SessionEvent[] = []
  /** How many touches or keys hold each lane down. */
  private readonly down = [0, 0, 0, 0, 0]
  private readonly lastLaneHit = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity]
  private head = 0
  private lastTime = -Infinity
  private lastFrettedHit = -Infinity
  private pendingStrum: { time: number } | null = null
  private offsetSum = 0

  constructor(
    track: Track,
    private readonly tempo: TempoMap,
    readonly options: SessionOptions,
  ) {
    this.notes = track.notes
    const n = this.notes.length
    this.status = new Uint8Array(n)
    this.tapped = new Uint8Array(n)

    this.phraseOf = new Int32Array(n).fill(-1)
    this.phraseRanges = []
    let i = 0
    for (const phrase of track.starPhrases) {
      while (i < n && this.notes[i].tick < phrase.startTick) i++
      const first = i
      while (i < n && this.notes[i].tick < phrase.endTick) this.phraseOf[i++] = this.phraseRanges.length
      if (i > first) this.phraseRanges.push({ first, last: i - 1 })
    }
    this.phraseBroken = new Uint8Array(this.phraseRanges.length)
    this.phraseAwarded = new Uint8Array(this.phraseRanges.length)

    this.solos = []
    let j = 0
    for (const solo of track.solos) {
      while (j < n && this.notes[j].tick < solo.startTick) j++
      const first = j
      let k = j
      while (k < n && this.notes[k].tick < solo.endTick) k++
      if (k > first) {
        this.solos.push({ start: solo.start, end: this.notes[k - 1].time, first, last: k - 1, started: false, done: false })
      }
    }
    this.perfectScore = perfectScore(this.notes, this.solos)
  }

  get multiplier(): number {
    const base = Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.streak / STREAK_PER_MULTIPLIER))
    return this.starActive ? base * 2 : base
  }

  /** How far through the current multiplier's ten notes the streak is, 0-1; 1 at the top. */
  get multiplierProgress(): number {
    if (this.streak >= STREAK_PER_MULTIPLIER * (MAX_MULTIPLIER - 1)) return 1
    return (this.streak % STREAK_PER_MULTIPLIER) / STREAK_PER_MULTIPLIER
  }

  get starReady(): boolean {
    return !this.starActive && this.starMeter >= STAR_MIN_TO_ACTIVATE
  }

  get judged(): number {
    return this.hits + this.misses
  }

  /** True once no pending note can still be hit. */
  get complete(): boolean {
    return this.head >= this.notes.length && this.sustains.every((s) => !s)
  }

  drainEvents(): SessionEvent[] {
    return this.events.splice(0, this.events.length)
  }

  /** A lane goes down: a tap in tap mode, a fret press in guitar mode. */
  press(lane: number, time: number): void {
    if (this.failed || lane < 0 || lane > 4) return
    this.update(time)
    this.down[lane]++
    if (this.options.scheme === 'tap') this.tapLane(lane, time)
    else this.fretsChanged(time)
  }

  release(lane: number, time: number): void {
    if (lane < 0 || lane > 4) return
    this.update(time)
    this.down[lane] = Math.max(0, this.down[lane] - 1)
    this.dropReleasedSustains(time)
    if (this.options.scheme === 'guitar' && !this.failed) this.fretsChanged(time)
  }

  /** Guitar mode only. */
  strum(time: number): void {
    if (this.failed || this.options.scheme !== 'guitar') return
    this.update(time)
    if (time - this.lastFrettedHit <= STRUM_AFTER_FRET_LENIENCY) {
      this.lastFrettedHit = -Infinity
      return
    }
    if (this.pendingStrum) this.overhit(-1)
    const index = this.firstHittable(time)
    if (index < 0) {
      if (this.options.ghostPenalty) this.overhit(-1)
      return
    }
    if (this.fretsMatch(this.notes[index], this.frets())) this.hit(index, time)
    else this.pendingStrum = { time }
  }

  activateStar(time: number): boolean {
    this.update(time)
    if (!this.starReady || this.failed) return false
    this.starActive = true
    this.events.push({ type: 'starActivated' })
    return true
  }

  /** Catch up to `time`: miss notes that slipped past, pay sustains, drain star power, close solos. */
  update(time: number): void {
    if (time < this.lastTime) time = this.lastTime
    const prev = this.lastTime === -Infinity ? time : this.lastTime
    this.lastTime = time
    if (this.failed) return
    const { window } = this.options

    if (this.pendingStrum && time - this.pendingStrum.time > STRUM_WAIT_FOR_FRETS) {
      this.pendingStrum = null
      this.overhit(-1)
    }

    const notes = this.notes
    while (this.head < notes.length) {
      const status = this.status[this.head]
      if (status === PENDING) {
        if (notes[this.head].time + window >= time) break
        this.miss(this.head)
      }
      this.head++
    }

    this.paySustains(time)

    if (this.starActive) {
      const beats = this.tempo.timeToBeat(time) - this.tempo.timeToBeat(prev)
      this.starMeter -= Math.max(0, beats) / STAR_BEATS_FULL
      if (this.starMeter <= 0) {
        this.starMeter = 0
        this.starActive = false
        this.events.push({ type: 'starEnded' })
      }
    }

    for (const solo of this.solos) {
      if (!solo.started && time >= solo.start) {
        solo.started = true
        this.events.push({ type: 'soloStart', notes: solo.last - solo.first + 1 })
      }
      if (solo.started && !solo.done && time > solo.end + window) this.finishSolo(solo)
    }
  }

  results(): Results {
    const total = this.notes.length
    const ratio = this.perfectScore > 0 ? this.score / this.perfectScore : 0
    let stars = 0
    for (const threshold of STAR_THRESHOLDS) if (ratio >= threshold) stars++
    let starHit = 0
    for (let p = 0; p < this.phraseRanges.length; p++) if (this.phraseAwarded[p]) starHit++
    return {
      score: Math.floor(this.score),
      stars,
      hits: this.hits,
      total,
      accuracy: total ? this.hits / total : 0,
      bestStreak: this.bestStreak,
      fullCombo: total > 0 && this.hits === total && this.overhits === 0,
      starPhrasesHit: starHit,
      starPhrasesTotal: this.phraseRanges.length,
      solos: [...this.soloResults],
      meanOffset: this.hits ? this.offsetSum / this.hits : 0,
      failed: this.failed,
    }
  }

  /** Frets held down in guitar mode, ignoring lanes that are carrying an extended sustain. */
  frets(): number {
    let mask = 0
    for (let lane = 0; lane < 5; lane++) if (this.down[lane] > 0) mask |= 1 << lane
    for (let lane = 0; lane < 5; lane++) if (this.sustains[lane]) mask &= ~(1 << lane)
    return mask
  }

  isDown(lane: number): boolean {
    return this.down[lane] > 0
  }

  /** Should this note still look like a star? Not once a miss has broken its phrase. */
  starLive(index: number): boolean {
    const phrase = this.phraseOf[index]
    return phrase >= 0 && !this.phraseBroken[phrase]
  }

  private tapLane(lane: number, time: number): void {
    const { window } = this.options
    const notes = this.notes
    for (let i = this.head; i < notes.length; i++) {
      const note = notes[i]
      if (note.time - time > window) break
      if (this.status[i] !== PENDING || note.time + window < time) continue
      // Any lane plays an open note.
      const bit = note.mask === OPEN_BIT ? OPEN_BIT : 1 << lane
      if (!(note.mask & bit) || this.tapped[i] & bit) continue
      this.tapped[i] |= bit
      this.lastLaneHit[lane] = time
      if ((this.tapped[i] & note.mask) === note.mask) this.hit(i, time)
      return
    }
    if (time - this.lastLaneHit[lane] <= DOUBLE_TAP_GRACE) return
    if (this.options.ghostPenalty) this.overhit(lane)
  }

  private fretsChanged(time: number): void {
    const frets = this.frets()
    const index = this.firstHittable(time)
    if (index < 0) return
    const note = this.notes[index]
    if (this.pendingStrum) {
      if (this.fretsMatch(note, frets)) {
        this.pendingStrum = null
        this.hit(index, time)
      }
      return
    }
    const canFret = note.kind === 'tap' || (note.kind === 'hopo' && index > 0 && this.status[index - 1] === HIT)
    if (canFret && this.fretsMatch(note, frets)) {
      this.hit(index, time)
      this.lastFrettedHit = time
    }
  }

  /** Singles may be anchored (lower frets held too); chords and opens must match exactly. */
  private fretsMatch(note: Note, frets: number): boolean {
    if (note.mask === OPEN_BIT) return frets === 0
    const noteFrets = note.mask & FRET_MASK
    if (gemCount(noteFrets) === 1) return (frets & noteFrets) !== 0 && frets < noteFrets << 1
    return frets === noteFrets
  }

  private firstHittable(time: number): number {
    const { window } = this.options
    for (let i = this.head; i < this.notes.length; i++) {
      const note = this.notes[i]
      if (note.time - time > window) return -1
      if (this.status[i] === PENDING && note.time + window >= time) return i
    }
    return -1
  }

  private hit(index: number, time: number): void {
    const note = this.notes[index]
    this.status[index] = HIT
    this.hits++
    const before = this.multiplier
    const points = NOTE_POINTS * gemCount(note.mask) * before
    this.score += points
    this.streak++
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    const offset = time - note.time
    this.offsetSum += offset
    this.rock = Math.min(1, this.rock + ROCK_HIT)
    this.events.push({ type: 'hit', note: index, mask: note.mask, offset, points })
    if (this.multiplier !== before) this.events.push({ type: 'multiplier', value: this.multiplier })
    if (this.streak % 50 === 0) this.events.push({ type: 'streak', value: this.streak })

    for (let lane = 0; lane <= OPEN_LANE; lane++) {
      if (note.sustain[lane] > 0 && note.mask & (1 << lane)) {
        this.sustains[lane] = {
          note: index,
          end: note.time + note.sustain[lane],
          endBeat: note.beat + note.sustainBeats[lane],
          paidBeat: note.beat,
        }
      }
    }
    // A sustain whose finger already let go (a quick tap) ends right away.
    this.dropReleasedSustains(time)

    const phrase = this.phraseOf[index]
    if (phrase >= 0 && !this.phraseBroken[phrase] && !this.phraseAwarded[phrase]) {
      const { first, last } = this.phraseRanges[phrase]
      let all = true
      for (let i = first; i <= last && all; i++) all = this.status[i] === HIT
      if (all) {
        this.phraseAwarded[phrase] = 1
        const wasReady = this.starReady
        this.starMeter = Math.min(1, this.starMeter + STAR_PHRASE_GAIN)
        this.events.push({ type: 'starGained', meter: this.starMeter })
        if (!wasReady && this.starReady) this.events.push({ type: 'starReady' })
      }
    }
  }

  private miss(index: number): void {
    const note = this.notes[index]
    this.status[index] = MISSED
    this.misses++
    const lost = this.streak
    this.streak = 0
    this.events.push({ type: 'miss', note: index, mask: note.mask, streakLost: lost })
    const phrase = this.phraseOf[index]
    if (phrase >= 0 && !this.phraseBroken[phrase]) {
      this.phraseBroken[phrase] = 1
      this.events.push({ type: 'starPhraseLost' })
    }
    this.hurt(ROCK_MISS)
  }

  private overhit(lane: number): void {
    this.pendingStrum = null
    this.overhits++
    const lost = this.streak
    this.streak = 0
    this.events.push({ type: 'overhit', lane, streakLost: lost })
    this.hurt(ROCK_OVERHIT)
  }

  private hurt(amount: number): void {
    // Star power carries the crowd.
    if (this.starActive) return
    this.rock = Math.max(0, this.rock - amount)
    if (this.rock <= 0 && this.options.canFail && !this.failed) {
      this.failed = true
      this.events.push({ type: 'failed' })
    }
  }

  private laneHeld(lane: number): boolean {
    if (lane === OPEN_LANE) {
      if (this.options.scheme === 'tap') return this.down.some((d) => d > 0)
      return this.frets() === 0
    }
    return this.down[lane] > 0
  }

  private dropReleasedSustains(time: number): void {
    for (let lane = 0; lane <= OPEN_LANE; lane++) {
      const s = this.sustains[lane]
      if (!s || this.laneHeld(lane)) continue
      this.paySustain(lane, s, time)
      this.sustains[lane] = null
      this.events.push({ type: 'sustainEnd', lane, complete: time >= s.end - 0.1 })
    }
  }

  private paySustains(time: number): void {
    for (let lane = 0; lane <= OPEN_LANE; lane++) {
      const s = this.sustains[lane]
      if (!s) continue
      this.paySustain(lane, s, time)
      if (time >= s.end) {
        this.sustains[lane] = null
        this.events.push({ type: 'sustainEnd', lane, complete: true })
      }
    }
  }

  private paySustain(_lane: number, s: SustainState, time: number): void {
    const beat = Math.min(s.endBeat, this.tempo.timeToBeat(Math.min(time, s.end)))
    if (beat > s.paidBeat) {
      this.score += (beat - s.paidBeat) * SUSTAIN_POINTS_PER_BEAT * this.multiplier
      s.paidBeat = beat
    }
  }

  private finishSolo(solo: SoloSpan): void {
    solo.done = true
    let hit = 0
    for (let i = solo.first; i <= solo.last; i++) if (this.status[i] === HIT) hit++
    const total = solo.last - solo.first + 1
    const bonus = hit * SOLO_POINTS_PER_NOTE
    this.score += bonus
    this.soloResults.push({ hit, total, bonus })
    this.events.push({ type: 'soloEnd', hit, total, bonus })
  }
}

function ladder(streak: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(streak / STREAK_PER_MULTIPLIER))
}

function perfectScore(notes: Note[], solos: SoloSpan[]): number {
  let streak = 0
  let total = 0
  for (const note of notes) {
    total += NOTE_POINTS * gemCount(note.mask) * ladder(streak)
    streak++
    const held = ladder(streak)
    for (let lane = 0; lane <= OPEN_LANE; lane++) total += SUSTAIN_POINTS_PER_BEAT * note.sustainBeats[lane] * held
  }
  for (const solo of solos) total += SOLO_POINTS_PER_NOTE * (solo.last - solo.first + 1)
  return total
}

/** Grade words for a solo, the way the crowd would shout them. */
export function soloGrade(hit: number, total: number): string {
  const pct = total ? hit / total : 0
  if (pct >= 1) return 'Perfect solo!'
  if (pct >= 0.95) return 'Awesome solo!'
  if (pct >= 0.9) return 'Great solo!'
  if (pct >= 0.8) return 'Good solo!'
  if (pct >= 0.7) return 'Solid solo'
  if (pct >= 0.6) return 'Okay solo'
  return 'Messy solo'
}

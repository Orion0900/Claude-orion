import { secondsPerTick, type CompiledSong, type SongEvent } from './song'

/**
 * Where the music is. A song's timeline counts ticks from the top of the
 * intro; past the intro, the body repeats end to end forever. The engine
 * asks the transport for the events that fall between what it has already
 * queued and a little way past the audio clock, and hands them to the synth
 * with their exact start times. Pure, so the timing is tested in Node.
 */

export interface Scheduled {
  /** Absolute tick on the song's timeline. */
  tick: number
  ev: SongEvent
}

/** First index whose event starts at or after `t`. */
function lowerBound(events: readonly SongEvent[], t: number): number {
  let lo = 0
  let hi = events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (events[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

function pushRange(events: readonly SongEvent[], from: number, to: number, base: number, out: Scheduled[]): void {
  for (let i = lowerBound(events, from); i < events.length && events[i].t < to; i++) out.push({ tick: base + events[i].t, ev: events[i] })
}

/**
 * Appends to `out`, in time order, every event whose absolute tick lies in
 * [from, to): the intro once, then the body looping.
 */
export function collectEvents(song: CompiledSong, from: number, to: number, out: Scheduled[] = []): Scheduled[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return out
  const intro = song.intro.len
  const body = song.body.len
  if (from < intro) pushRange(song.intro.events, from, Math.min(to, intro), 0, out)
  if (to <= intro || body <= 0) return out
  const start = Math.max(from, intro)
  for (let loop = Math.floor((start - intro) / body); ; loop++) {
    const base = intro + loop * body
    if (base >= to) break
    pushRange(song.body.events, Math.max(start, base) - base, Math.min(to, base + body) - base, base, out)
  }
  return out
}

/** Folds an absolute tick back into the first pass of the body, keeping its place in the loop. */
export function normalizeTick(song: CompiledSong, tick: number): number {
  if (!(tick > 0)) return 0
  const intro = song.intro.len
  if (tick < intro) return tick
  return intro + ((tick - intro) % song.body.len)
}

/** Where the body loops back to, and how long one pass takes, in seconds. */
export function loopPoints(song: CompiledSong): { loopStart: number; loopLength: number } {
  const spt = secondsPerTick(song)
  return { loopStart: song.intro.len * spt, loopLength: song.body.len * spt }
}

/**
 * Maps the audio clock onto one playback of a song and hands out the events
 * to queue. `startTime` is when `startTick` sounds.
 */
export class Transport {
  readonly spt: number
  /** Everything before this tick has been handed out. */
  scheduledTo: number

  constructor(
    readonly song: CompiledSong,
    readonly startTime: number,
    readonly startTick = 0,
  ) {
    this.spt = secondsPerTick(song)
    this.scheduledTo = startTick
  }

  tickAt(time: number): number {
    return this.startTick + (time - this.startTime) / this.spt
  }

  timeAt(tick: number): number {
    return this.startTime + (tick - this.startTick) * this.spt
  }

  /** The song position at `time`, never before where this playback began. */
  positionAt(time: number): number {
    return Math.max(this.startTick, this.tickAt(time))
  }

  /**
   * Appends the events that start between the last call and `now +
   * lookahead`. If the clock ran past what was queued (a stalled timer),
   * the missed notes are skipped rather than played late in a heap.
   */
  pump(now: number, lookahead: number, out: Scheduled[] = []): Scheduled[] {
    const current = this.tickAt(now)
    if (this.scheduledTo < current) this.scheduledTo = current
    const horizon = this.tickAt(now + Math.max(0, lookahead))
    if (horizon > this.scheduledTo) {
      collectEvents(this.song, this.scheduledTo, horizon, out)
      this.scheduledTo = horizon
    }
    return out
  }
}

import { describe, expect, it } from 'vitest'
import { MIN_SPAN, PAD_AFTER, PAD_BEFORE, isFiller } from './cuts'
import { TimeMap, endsSentence, keepRanges, sentences, timedWords } from './timeline'
import type { AudioAnalysis, EditSettings, Range, Word } from './types'

const edit = (over: Partial<EditSettings> = {}): EditSettings => ({
  trimStart: 0,
  trimEnd: null,
  removeSilences: false,
  maxPause: 0.4,
  removeFillers: false,
  cuts: [],
  ...over,
})
const r = (start: number, end: number): Range => ({ start, end })
const words = (list: [string, number, number, Partial<Word>?][]): Word[] =>
  list.map(([text, start, end, extra], i) => ({ id: `w${i}`, text, start, end, ...extra }))

/** Sorted, disjoint, no specks, no cuts too short to see, inside the window. */
function expectWellFormed(keep: Range[], window: Range) {
  keep.forEach((k, i) => {
    expect(k.end - k.start).toBeGreaterThanOrEqual(MIN_SPAN - 1e-9)
    expect(k.start).toBeGreaterThanOrEqual(window.start - 1e-9)
    expect(k.end).toBeLessThanOrEqual(window.end + 1e-9)
    if (i > 0) expect(k.start - keep[i - 1].end).toBeGreaterThanOrEqual(MIN_SPAN - 1e-9)
  })
}

const inside = (keep: Range[], start: number, end: number) => keep.some((k) => k.start <= start + 1e-9 && k.end >= end - 1e-9)
const touches = (keep: Range[], start: number, end: number) => keep.some((k) => k.start < end - 1e-9 && k.end > start + 1e-9)

/* A vlog intro the way Whisper hands it over: a long pause after the
 * greeting, an "Um," and an "uh" it happened to transcribe, and "easy,"
 * stretched over the pause after it (the word really ends at 10.62). */
const VLOG: [string, number, number][] = [
  ['Hey', 0.32, 0.5], ['guys,', 0.52, 0.84], ['welcome', 0.9, 1.18], ['back', 1.2, 1.38], ['to', 1.4, 1.48],
  ['my', 1.5, 1.62], ['channel.', 1.64, 2.02],
  ['Um,', 3.82, 4.1],
  ['today', 4.3, 4.62], ["I'm", 4.66, 4.8], ['going', 4.82, 4.98], ['to', 5.0, 5.06], ['show', 5.08, 5.3], ['you', 5.32, 5.44],
  ['uh', 5.7, 5.86],
  ['how', 6.02, 6.16], ['I', 6.18, 6.24], ['edit', 6.26, 6.5], ['my', 6.52, 6.62], ['videos', 6.64, 7.02], ['on', 7.06, 7.14],
  ['my', 7.16, 7.26], ['phone', 7.28, 7.6], ['in', 7.64, 7.7], ['like', 7.72, 7.86], ['five', 7.9, 8.14], ['minutes.', 8.16, 8.6],
  ["It's", 9.5, 9.66], ['honestly', 9.68, 10.1], ['so', 10.12, 10.3], ['easy,', 10.32, 11.9],
  ['and', 11.95, 12.08], ['it', 12.1, 12.18], ['saves', 12.2, 12.52], ['me', 12.54, 12.64], ['so', 12.66, 12.82],
  ['much', 12.84, 13.06], ['time.', 13.08, 13.5],
]
const VLOG_DURATION = 14.6
const vlogWords = () => words(VLOG)
/** What a microphone would have heard: speech a little past Whisper's ends, silence elsewhere. */
function vlogLoudness(): AudioAnalysis {
  const frameDuration = 0.01
  const env = new Float32Array(Math.ceil(VLOG_DURATION / frameDuration)).fill(0.003)
  for (const [text, start, end] of VLOG) {
    const heardTo = text === 'easy,' ? 10.62 : end + 0.08
    for (let f = Math.round(start / frameDuration); f < Math.round(heardTo / frameDuration); f++) env[f] = 0.2
  }
  return { envelope: env, frameDuration }
}

describe('keepRanges: a vlog intro, tapped once', () => {
  const settings = edit({ removeSilences: true, removeFillers: true, maxPause: 0.35 })
  const ws = vlogWords()
  const keep = keepRanges({ words: ws, edit: settings, duration: VLOG_DURATION })
  const map = new TimeMap(keep)
  const edited = (id: number, side: 'start' | 'end') => map.toEditedClamped(ws[id][side])

  it('is well formed', () => expectWellFormed(keep, r(0, VLOG_DURATION)))

  it('takes both fillers out completely', () => {
    for (const filler of ws.filter((w) => isFiller(w.text))) expect(touches(keep, filler.start, filler.end)).toBe(false)
  })

  it('clips no kept word, padding included', () => {
    for (const w of ws.filter((w) => !isFiller(w.text))) expect(inside(keep, w.start - PAD_BEFORE, w.end + PAD_AFTER), w.text).toBe(true)
  })

  it('starts 0.15 s before the first word and ends 0.4 s after the last', () => {
    expect(keep[0].start).toBeCloseTo(0.32 - 0.15, 9)
    expect(keep[keep.length - 1].end).toBeCloseTo(13.5 + 0.4, 9)
  })

  it('turns the long pause and the "Um," after it into one jump that leaves maxPause of silence', () => {
    // channel. (6) → today (8)
    expect(edited(8, 'start') - edited(6, 'end')).toBeCloseTo(0.35, 9)
    const jumps = map.cutPoints().filter((c) => c > edited(6, 'end') && c <= edited(8, 'start'))
    expect(jumps).toHaveLength(1)
  })

  it('lifts the "uh" out without leaving a pause cut of its own', () => {
    // you (13) → how (15): what's left of the gap was already under maxPause.
    expect(edited(15, 'start') - edited(13, 'end')).toBeCloseTo(0.23 + PAD_BEFORE, 9)
    expect(map.cutPoints().filter((c) => c > edited(13, 'end') && c <= edited(15, 'start'))).toHaveLength(1)
  })

  it('shortens the pause after "minutes." to maxPause, 40% before the cut and 60% after', () => {
    const cut = map.cutPoints().find((c) => c > edited(26, 'end') && c < edited(27, 'start'))!
    expect(cut - edited(26, 'end')).toBeCloseTo(0.14, 9)
    expect(edited(27, 'start') - cut).toBeCloseTo(0.21, 9)
  })

  it('leaves the stretched "easy," alone without loudness to go on', () => {
    expect(inside(keep, 10.32, 11.9)).toBe(true)
  })

  it('makes three jump cuts and a video 3.6 s shorter', () => {
    expect(map.cutPoints()).toHaveLength(3)
    expect(map.duration).toBeCloseTo(10.96, 6)
  })

  it('puts every kept word on the edited clock, in order', () => {
    const tw = timedWords(ws, map)
    expect(tw.map((w) => w.text)).toEqual(ws.filter((w) => !isFiller(w.text)).map((w) => w.text))
    tw.forEach((w, i) => {
      expect(w.start).toBeGreaterThanOrEqual(i ? tw[i - 1].start : 0)
      expect(w.end).toBeLessThanOrEqual(map.duration)
    })
  })

  it('with loudness, also cuts the pause Whisper hid inside "easy,"', () => {
    const keepA = keepRanges({ words: ws, edit: settings, duration: VLOG_DURATION }, vlogLoudness())
    expectWellFormed(keepA, r(0, VLOG_DURATION))
    const mapA = new TimeMap(keepA)
    expect(mapA.toEditedClamped(11.95) - mapA.toEditedClamped(10.62)).toBeCloseTo(0.35, 6)
    expect(mapA.cutPoints()).toHaveLength(4)
    for (const w of ws.filter((w) => !isFiller(w.text) && w.text !== 'easy,')) expect(inside(keepA, w.start - PAD_BEFORE, w.end + PAD_AFTER), w.text).toBe(true)
    // The heard part of "easy," is untouched.
    expect(inside(keepA, 10.32 - PAD_BEFORE, 10.62 + PAD_AFTER)).toBe(true)
  })

  it('with nothing switched on, keeps the whole recording', () => {
    expect(keepRanges({ words: ws, edit: edit(), duration: VLOG_DURATION })).toEqual([r(0, VLOG_DURATION)])
  })
})

describe('keepRanges: edge cases', () => {
  it('keeps everything with no words, minus cuts made by hand', () => {
    expect(keepRanges({ words: [], edit: edit({ removeSilences: true, removeFillers: true }), duration: 5 })).toEqual([r(0, 5)])
    expect(keepRanges({ words: [], edit: edit({ cuts: [r(1, 2)] }), duration: 5 })).toEqual([r(0, 1), r(2, 5)])
  })

  it('has nothing for an empty or nonsense duration', () => {
    expect(keepRanges({ words: [], edit: edit(), duration: 0 })).toEqual([])
    expect(keepRanges({ words: [], edit: edit(), duration: NaN })).toEqual([])
    expect(keepRanges({ words: [], edit: edit({ trimStart: 3, trimEnd: 2 }), duration: 5 })).toEqual([])
  })

  it('trims, with trimEnd null meaning the end of the recording', () => {
    expect(keepRanges({ words: [], edit: edit({ trimStart: 1, trimEnd: null }), duration: 5 })).toEqual([r(1, 5)])
    expect(keepRanges({ words: [], edit: edit({ trimStart: 1, trimEnd: 4 }), duration: 5 })).toEqual([r(1, 4)])
    expect(keepRanges({ words: [], edit: edit({ trimStart: -2, trimEnd: 9 }), duration: 5 })).toEqual([r(0, 5)])
  })

  it('applies overlapping, unsorted and reversed cuts made by hand, including at 0 and the end', () => {
    const cuts = [r(4, 3), r(1, 2), r(1.5, 2.5), r(0, 0.5), r(9, 10), r(12, 14)]
    expect(keepRanges({ words: [], edit: edit({ cuts }), duration: 10 })).toEqual([r(0.5, 1), r(2.5, 3), r(4, 9)])
  })

  it('leaves just the lead-in when every word is removed', () => {
    const ws = words([['a', 1, 1.3, { removed: true }], ['b', 2, 2.3, { removed: true }]])
    expect(keepRanges({ words: ws, edit: edit({ removeSilences: true }), duration: 4 })).toEqual([r(0, 0.97)])
    const atZero = words([['a', 0, 0.3, { removed: true }]])
    expect(keepRanges({ words: atZero, edit: edit(), duration: 4 })).toEqual([])
  })

  it('cuts a filler at the very start so the video opens on the first real word', () => {
    const ws = words([['Um,', 0.05, 0.4], ['so', 0.55, 0.8], ['today', 0.85, 1.2]])
    const keep = keepRanges({ words: ws, edit: edit({ removeFillers: true, removeSilences: true }), duration: 2 })
    expect(keep[0].start).toBeCloseTo(0.55 - PAD_BEFORE, 9)
    expect(keep).toHaveLength(1)
  })

  it('drops a flash of silence stranded between two cuts', () => {
    // A hand-made cut ends 0.1 s before a removed word's cut begins.
    const ws = words([['a', 0, 0.5], ['b', 2, 2.3, { removed: true }], ['c', 3, 3.4]])
    const keep = keepRanges({ words: ws, edit: edit({ cuts: [r(0.8, 1.87)] }), duration: 4 })
    expect(keep).toEqual([r(0, 0.8), r(3 - PAD_BEFORE, 4)])
  })

  it('handles words with zero and negative durations', () => {
    const ws = words([['a', 1, 1], ['b', 2, 1.8], ['c', 3, 3.3]])
    const keep = keepRanges({ words: ws, edit: edit({ removeSilences: true }), duration: 4 })
    expectWellFormed(keep, r(0, 4))
    for (const t of [1, 2, 3.15]) expect(inside(keep, t, t)).toBe(true)
  })

  it('handles unsorted words', () => {
    const sorted = vlogWords()
    const shuffled = [...sorted].reverse()
    const settings = edit({ removeSilences: true, removeFillers: true })
    expect(keepRanges({ words: shuffled, edit: settings, duration: VLOG_DURATION })).toEqual(
      keepRanges({ words: sorted, edit: settings, duration: VLOG_DURATION }),
    )
  })

  it('is quick on an hour of speech', () => {
    const ws: Word[] = []
    for (let i = 0, t = 0.5; t < 3600; i++) {
      ws.push({ id: `w${i}`, text: i % 25 === 0 ? 'um' : 'word', start: t, end: t + 0.25, removed: i % 97 === 0 })
      t += 0.3 + (i % 11 === 0 ? 1.5 : 0.05)
    }
    const started = performance.now()
    const keep = keepRanges({ words: ws, edit: edit({ removeSilences: true, removeFillers: true }), duration: 3600 })
    // Generous for slow CI; a quadratic slip would take many seconds.
    expect(performance.now() - started).toBeLessThan(2000)
    expectWellFormed(keep, r(0, 3600))
  })
})

/** Deterministic randomness for the property checks. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('keepRanges: properties over random transcripts', () => {
  const pick = <T,>(rnd: () => number, list: T[]) => list[Math.floor(rnd() * list.length)]

  for (let seed = 1; seed <= 150; seed++) {
    it(`holds for transcript #${seed}`, () => {
      const rnd = random(seed)
      const ws: Word[] = []
      let t = rnd() * 2
      const count = Math.floor(rnd() * 40)
      for (let i = 0; i < count; i++) {
        t += 0.05 + (rnd() < 0.25 ? rnd() * 2.5 : rnd() * 0.4)
        const len = 0.08 + rnd() * 0.5
        const text = rnd() < 0.12 ? pick(rnd, ['um', 'Uh,', 'erm']) : pick(rnd, ['so', 'today', 'video.', 'great!', 'really'])
        ws.push({ id: `w${i}`, text, start: t, end: t + len, removed: rnd() < 0.15 })
        t += len
      }
      const duration = t + rnd() * 2 + 0.1
      const cuts = Array.from({ length: Math.floor(rnd() * 3) }, () => {
        const a = rnd() * duration
        return rnd() < 0.5 ? r(a, a + rnd()) : r(a + rnd(), a)
      })
      const settings = edit({
        removeSilences: rnd() < 0.7,
        removeFillers: rnd() < 0.7,
        maxPause: pick(rnd, [0, 0.2, 0.35, 0.5, 1]),
        trimStart: rnd() < 0.2 ? rnd() * 1.5 : 0,
        trimEnd: rnd() < 0.2 ? duration - rnd() * 1.5 : null,
        cuts,
      })
      const window = r(settings.trimStart, settings.trimEnd ?? duration)
      const keep = keepRanges({ words: ws, edit: settings, duration })
      expectWellFormed(keep, window)

      const map = new TimeMap(keep)
      const handCut = (a: number, b: number) => cuts.some((c) => Math.min(c.start, c.end) < b + 0.1 && Math.max(c.start, c.end) > a - 0.1)
      const live = (w: Word) => w.start > window.start + 0.2 && w.end < window.end - 0.2 && !handCut(w.start, w.end)
      const kept = ws.filter((w) => !w.removed && !(settings.removeFillers && isFiller(w.text)))
      const dropped = ws.filter((w) => !kept.includes(w))

      // Kept words are never clipped.
      for (const w of kept.filter(live)) expect(inside(keep, w.start, w.end), `${w.id} clipped`).toBe(true)
      // Removed words and fillers being removed are gone.
      for (const w of dropped) {
        const near = kept.some((k) => k.start < w.end + 0.03 && k.end > w.start - 0.03)
        if (!near) expect(touches(keep, w.start, w.end), `${w.id} kept`).toBe(false)
      }
      // With pauses removed, no gap between kept words outlasts maxPause
      // (or the padding, when that's longer) by more than a speck.
      if (settings.removeSilences) {
        const limit = Math.max(settings.maxPause, PAD_AFTER + PAD_BEFORE) + MIN_SPAN + 1e-6
        for (let i = 0; i + 1 < kept.length; i++) {
          const [a, b] = [kept[i], kept[i + 1]]
          if (!live(a) || !live(b)) continue
          expect(map.toEditedClamped(b.start) - map.toEditedClamped(a.end), `${a.id}→${b.id}`).toBeLessThanOrEqual(limit)
        }
        const first = kept[0]
        const last = kept[kept.length - 1]
        if (first && live(first)) expect(map.toEditedClamped(first.start)).toBeLessThanOrEqual(0.15 + MIN_SPAN + 1e-6)
        if (last && live(last)) expect(map.duration - map.toEditedClamped(last.end)).toBeLessThanOrEqual(0.4 + MIN_SPAN + 1e-6)
      }

      // The same, with loudness that matches the words plus a few stray sounds.
      const frameDuration = 0.01
      const env = new Float32Array(Math.ceil(duration / frameDuration)).fill(0.002)
      const sound = (a: number, b: number) => {
        for (let f = Math.round(a / frameDuration); f < Math.round(b / frameDuration); f++) env[f] = 0.1 + rnd() * 0.1
      }
      ws.forEach((w) => sound(w.start, w.end))
      for (let i = 0; i < 3; i++) {
        const a = rnd() * duration
        sound(a, a + 0.05 + rnd() * 0.5)
      }
      const keepA = keepRanges({ words: ws, edit: settings, duration }, { envelope: env, frameDuration })
      expectWellFormed(keepA, window)
      for (const w of kept.filter(live)) expect(inside(keepA, w.start, w.end), `${w.id} clipped with loudness`).toBe(true)
    })
  }
})

describe('TimeMap', () => {
  const map = new TimeMap([r(1, 2), r(3, 5), r(7, 7.5)])

  it('adds up the edited duration and finds the jump cuts', () => {
    expect(map.duration).toBe(3.5)
    expect(map.cutPoints()).toEqual([1, 3])
  })

  it('maps source to edited, null inside cuts', () => {
    expect(map.toEdited(1)).toBe(0)
    expect(map.toEdited(1.5)).toBe(0.5)
    expect(map.toEdited(2)).toBeNull()
    expect(map.toEdited(2.5)).toBeNull()
    expect(map.toEdited(3)).toBe(1)
    expect(map.toEdited(7.5)).toBe(3.5)
    expect(map.toEdited(0.5)).toBeNull()
    expect(map.toEdited(8)).toBeNull()
  })

  it('clamps cut moments to where the cut happens', () => {
    expect(map.toEditedClamped(0.5)).toBe(0)
    expect(map.toEditedClamped(2)).toBe(1)
    expect(map.toEditedClamped(2.5)).toBe(1)
    expect(map.toEditedClamped(6)).toBe(3)
    expect(map.toEditedClamped(9)).toBe(3.5)
    expect(map.toEditedClamped(NaN)).toBe(0)
  })

  it('maps edited to source, a jump cut belonging to the shot after it', () => {
    expect(map.toSource(0)).toBe(1)
    expect(map.toSource(0.25)).toBe(1.25)
    expect(map.toSource(1)).toBe(3)
    expect(map.toSource(3)).toBe(7)
    expect(map.toSource(3.5)).toBe(7.5)
    expect(map.toSource(-1)).toBe(1)
    expect(map.toSource(99)).toBe(7.5)
    expect(map.toSource(NaN)).toBe(1)
  })

  it('finds the range around a source time', () => {
    expect([0, 1, 1.99, 2, 2.5, 3, 7.49, 7.5, 8].map((t) => map.rangeAt(t))).toEqual([-1, 0, 0, -1, -1, 1, 2, 2, -1])
  })

  it('tidies the ranges it is given', () => {
    const messy = new TimeMap([r(3, 5), r(1, 2), r(4, 4.5), r(5, 6), r(8, 8)])
    expect(messy.ranges).toEqual([r(1, 2), r(3, 6)])
    expect(messy.duration).toBe(4)
  })

  it('copes with nothing kept', () => {
    const empty = new TimeMap([])
    expect(empty.duration).toBe(0)
    expect(empty.toSource(3)).toBe(0)
    expect(empty.toEdited(1)).toBeNull()
    expect(empty.toEditedClamped(1)).toBe(0)
    expect(empty.rangeAt(1)).toBe(-1)
    expect(empty.cutPoints()).toEqual([])
  })

  it('round-trips source times inside the ranges', () => {
    const rnd = random(7)
    const ranges: Range[] = []
    for (let t = 0, i = 0; i < 300; i++) {
      t += rnd() * 0.8
      const len = 0.04 + rnd() * 3
      ranges.push(r(t, t + len))
      t += len
    }
    const big = new TimeMap(ranges)
    for (let i = 0; i < 2000; i++) {
      const k = ranges[Math.floor(rnd() * ranges.length)]
      const s = k.start + rnd() * (k.end - k.start)
      expect(big.toSource(big.toEdited(s)!)).toBeCloseTo(s, 9)
    }
    // Boundaries are exact, both ways.
    big.ranges.forEach((k, i) => {
      const at = i === 0 ? 0 : big.cutPoints()[i - 1]
      expect(big.toEdited(k.start)).toBe(at)
      expect(big.toSource(at)).toBe(k.start)
    })
  })

  it('maps every export frame to a moment that is kept, in order', () => {
    const fps = 30
    let prev = -Infinity
    for (let k = 0; k <= Math.ceil(map.duration * fps); k++) {
      const edited = Math.min(map.duration, k / fps)
      const s = map.toSource(edited)
      expect(map.rangeAt(s)).toBeGreaterThanOrEqual(0)
      expect(map.toEdited(s)).toBeCloseTo(edited, 9)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
    // Frame 30 at 1 s lands exactly on the first jump cut: the new shot.
    expect(map.toSource(30 / fps)).toBe(3)
    expect(map.toSource(29 / fps)).toBeCloseTo(1 + 29 / 30, 12)
  })
})

describe('timedWords', () => {
  const map = new TimeMap([r(0, 1), r(2, 3)])

  it('places kept words on the edited clock, drops removed and fully cut ones, clips the rest', () => {
    const ws = words([
      ['kept', 0.2, 0.5, { emphasis: true }],
      ['gone', 0.6, 0.8, { removed: true }],
      ['spans', 0.9, 2.2],
      ['cut', 1.2, 1.8],
      ['late', 2.5, 2.9],
      ['after', 3, 3.5],
    ])
    expect(timedWords(ws, map)).toEqual([
      { id: 'w0', text: 'kept', start: 0.2, end: 0.5, emphasis: true },
      { id: 'w2', text: 'spans', start: 0.9, end: expect.closeTo(1.2, 9), emphasis: false },
      { id: 'w4', text: 'late', start: 1.5, end: expect.closeTo(1.9, 9), emphasis: false },
    ])
  })

  it('gives a word with no length a moment on screen', () => {
    const ws = words([['blink', 0.3, 0.3], ['next', 0.5, 0.7], ['squeezed', 0.9, 0.9], ['last', 0.93, 0.99]])
    const tw = timedWords(ws, map)
    expect(tw[0].end).toBeCloseTo(0.38, 9)
    expect(tw[2].end).toBeCloseTo(0.93, 9)
  })

  it('drops a word that only touches a cut', () => {
    expect(timedWords(words([['edge', 1, 2]]), map)).toEqual([])
  })
})

describe('sentences', () => {
  it('splits at full stops, questions and exclamations', () => {
    const ws = words([
      ['Hi', 0, 0.2], ['there.', 0.25, 0.5], ['How', 0.6, 0.7], ['are', 0.75, 0.8], ['you?', 0.85, 1],
      ['"Great!"', 1.1, 1.4], ['Bye', 1.5, 1.6],
    ])
    expect(sentences(ws)).toEqual([
      { firstWordId: 'w0', lastWordId: 'w1', text: 'Hi there.', start: 0, end: 0.5 },
      { firstWordId: 'w2', lastWordId: 'w4', text: 'How are you?', start: 0.6, end: 1 },
      { firstWordId: 'w5', lastWordId: 'w5', text: '"Great!"', start: 1.1, end: 1.4 },
      { firstWordId: 'w6', lastWordId: 'w6', text: 'Bye', start: 1.5, end: 1.6 },
    ])
  })

  it('is not fooled by abbreviations, initials or a trailing-off ellipsis', () => {
    const ws = words([
      ['Mr.', 0, 0.2], ['Smith', 0.3, 0.5], ['said...', 0.5, 0.8], ['something', 0.85, 1],
      ['e.g.', 1, 1.2], ['this.', 1.2, 1.4], ['Then...', 1.5, 1.7], ['Nothing.', 1.75, 2],
    ])
    expect(sentences(ws).map((s) => s.text)).toEqual(['Mr. Smith said... something e.g. this.', 'Then...', 'Nothing.'])
  })

  it('splits at a long pause even without punctuation, and skips removed words', () => {
    const ws = words([['so', 0, 0.2], ['yeah', 0.3, 0.5, { removed: true }], ['anyway', 0.6, 0.9], ['next', 2.5, 2.8], ['bit', 2.9, 3]])
    expect(sentences(ws).map((s) => s.text)).toEqual(['so anyway', 'next bit'])
  })

  it('breaks up a run-on transcript', () => {
    const ws = Array.from({ length: 120 }, (_, i): Word => ({ id: `w${i}`, text: i === 35 ? 'and,' : 'word', start: i * 0.3, end: i * 0.3 + 0.25 }))
    expect(sentences(ws).map((s) => s.text.split(' ').length)).toEqual([36, 50, 34])
  })

  it('has none for no words', () => expect(sentences([])).toEqual([]))
})

describe('endsSentence', () => {
  it('reads the punctuation', () => {
    expect(endsSentence('done.')).toBe(true)
    expect(endsSentence('done.)')).toBe(true)
    expect(endsSentence('Really?!')).toBe(true)
    expect(endsSentence('U.S.')).toBe(false)
    expect(endsSentence('Dr.')).toBe(false)
    expect(endsSentence('B.')).toBe(true)
    expect(endsSentence('so,')).toBe(false)
    expect(endsSentence('wait…', 'And')).toBe(true)
    expect(endsSentence('wait…', 'and')).toBe(false)
    expect(endsSentence('wait…', 'I')).toBe(false)
  })
})

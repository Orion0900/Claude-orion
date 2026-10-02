import { describe, expect, it } from 'vitest'
import {
  LEAD_SILENCE,
  PAD_AFTER,
  PAD_BEFORE,
  TAIL_SILENCE,
  intersectRanges,
  isFiller,
  normalizeRanges,
  pauseCuts,
  planCuts,
  subtractRanges,
} from './cuts'
import type { AudioAnalysis, EditSettings, Range, Word } from './types'

const edit = (over: Partial<EditSettings> = {}): EditSettings => ({
  trimStart: 0,
  trimEnd: null,
  removeSilences: true,
  maxPause: 0.4,
  removeFillers: true,
  cuts: [],
  ...over,
})

let next = 0
const word = (text: string, start: number, end: number, extra: Partial<Word> = {}): Word => ({
  id: `w${next++}`,
  text,
  start,
  end,
  ...extra,
})

const r = (start: number, end: number): Range => ({ start, end })
const close = (a: Range[], b: Range[]) => {
  expect(a.length).toBe(b.length)
  a.forEach((x, i) => {
    expect(x.start).toBeCloseTo(b[i].start, 6)
    expect(x.end).toBeCloseTo(b[i].end, 6)
  })
}

/** A loudness envelope, quiet except where told: 10 ms frames. */
function envelope(duration: number, loud: [number, number, number?][], floor = 0.003): AudioAnalysis {
  const frameDuration = 0.01
  const env = new Float32Array(Math.ceil(duration / frameDuration)).fill(floor)
  for (const [s, e, level = 0.2] of loud) {
    for (let f = Math.round(s / frameDuration); f < Math.round(e / frameDuration); f++) env[f] = level
  }
  return { envelope: env, frameDuration }
}

describe('range arithmetic', () => {
  it('normalizes: sorts, merges overlaps and touches, flips reversed spans, drops empty and NaN ones', () => {
    expect(normalizeRanges([r(5, 6), r(1, 2), r(1.5, 3), r(3, 4), r(8, 7), r(9, 9), r(NaN, 10)])).toEqual([
      r(1, 4),
      r(5, 6),
      r(7, 8),
    ])
  })
  it('clips to bounds', () => {
    expect(normalizeRanges([r(-1, 2), r(9, 12), r(20, 30)], 0, 10)).toEqual([r(0, 2), r(9, 10)])
  })
  it('subtracts', () => {
    expect(subtractRanges([r(0, 10)], [r(2, 3), r(5, 6)])).toEqual([r(0, 2), r(3, 5), r(6, 10)])
    expect(subtractRanges([r(0, 2), r(4, 6)], [r(1, 5)])).toEqual([r(0, 1), r(5, 6)])
    expect(subtractRanges([r(0, 2)], [r(-1, 3)])).toEqual([])
    expect(subtractRanges([r(0, 2)], [])).toEqual([r(0, 2)])
    expect(subtractRanges([r(0, 2), r(3, 4)], [r(0, 2)])).toEqual([r(3, 4)])
  })
  it('intersects', () => {
    expect(intersectRanges([r(0, 5), r(6, 10)], [r(4, 7), r(9, 12)])).toEqual([r(4, 5), r(6, 7), r(9, 10)])
    expect(intersectRanges([r(0, 1)], [r(1, 2)])).toEqual([])
  })
})

describe('isFiller', () => {
  it('knows hesitation sounds however they are spelled', () => {
    for (const t of ['um', 'Um,', 'UMM', 'uh', 'Uh...', 'uhh', 'uhm', 'er', 'erm', 'Erm,', 'ah', 'Ahh', 'hmm', 'Hm?', 'mm', 'mmm', 'mhm', 'Mm-hmm', 'ähm', 'euh']) {
      expect(isFiller(t), t).toBe(true)
    }
  })
  it('leaves real words alone, including the risky ones', () => {
    for (const t of ['like', 'so', 'you', 'know', 'um-brella', 'umbrella', 'uh-huh', 'oh', 'eh', 'err', 'her', 'huh', 'ahead', 'I', '', '...', 'ham', 'mom']) {
      expect(isFiller(t), t).toBe(false)
    }
  })
})

describe('pauseCuts', () => {
  it('shortens a long pause to maxPause, 40% after the last word and 60% before the next', () => {
    const words = [word('One.', 0.15, 0.5), word('Two.', 2.5, 2.9)]
    const cuts = pauseCuts(words, edit({ maxPause: 0.5 }), 3.3)
    // Lead: 0.15 s is already short. Gap 0.5..2.5 keeps 0.2 after, 0.3 before.
    close(cuts, [r(0.7, 2.2)])
  })

  it('keeps a little silence before the first word and after the last', () => {
    const words = [word('Hello', 2, 2.4), word('there.', 2.45, 2.8)]
    close(pauseCuts(words, edit(), 6), [r(0, 2 - LEAD_SILENCE), r(2.8 + TAIL_SILENCE, 6)])
  })

  it('never cuts into the padding of a kept word, even with a tiny maxPause', () => {
    const words = [word('a', 1, 1.2), word('b', 2, 2.2)]
    // Only the padding is left of the pause; the tail is already short.
    close(pauseCuts(words, edit({ maxPause: 0 }), 2.4), [r(0, 1 - LEAD_SILENCE), r(1.2 + PAD_AFTER, 2 - PAD_BEFORE)])
  })

  it('leaves pauses at or under maxPause alone', () => {
    const words = [word('a', 0.1, 0.5), word('b', 0.9, 1.2), word('c', 1.6, 2)]
    expect(pauseCuts(words, edit({ maxPause: 0.4 }), 2.3)).toEqual([])
  })

  it('has nothing to cut without kept speech', () => {
    expect(pauseCuts([], edit(), 10)).toEqual([])
    expect(pauseCuts([word('um', 1, 1.3)], edit(), 10)).toEqual([])
    expect(pauseCuts([word('gone', 1, 1.3, { removed: true })], edit(), 10)).toEqual([])
  })

  it('ignores removeSilences: asking is the caller choosing', () => {
    const words = [word('One.', 0.15, 0.5), word('Two.', 2.5, 2.9)]
    expect(pauseCuts(words, edit({ removeSilences: false }), 3.3).length).toBe(1)
  })

  it('measures a pause without the removed word in it and joins its cut to the removed word’s', () => {
    // "end. [0.6] um [0.8] Next" with the um cut: what's left of the pause is
    // 0.57 + the next word's 60 ms lead-in, cut to 0.4 right against the
    // um's cut. That keeps 0.34 + 0.06 rather than the usual 40/60 split,
    // which would have needed a second jump.
    const words = [word('end.', 0, 1), word('um', 1.6, 1.9), word('Next', 2.7, 3)]
    const plan = planCuts(words, edit({ maxPause: 0.4 }), 3.4)
    close(plan.forced, [r(1.57, 2.7 - PAD_BEFORE)])
    close(plan.pauses, [r(1.34, 1.57)])
    // One cut in the end: the pause cut ends where the um's begins.
    expect(normalizeRanges([...plan.forced, ...plan.pauses])).toHaveLength(1)
  })

  it('measures pauses across hand-made cuts the same way', () => {
    const words = [word('a', 0, 1), word('b', 3, 3.5)]
    const plan = planCuts(words, edit({ maxPause: 0.4, cuts: [r(1.5, 2)] }), 3.9)
    const all = normalizeRanges([...plan.forced, ...plan.pauses])
    expect(all).toHaveLength(1)
    const kept = 3 - 1 - (all[0].end - all[0].start)
    expect(kept).toBeCloseTo(0.4, 6)
  })
})

describe('planCuts: removed words and fillers', () => {
  it('cuts a removed word from just before it to the next kept word, keeping the gap before it', () => {
    const words = [word('keep', 0, 0.5), word('gone', 1, 1.4, { removed: true }), word('next', 2, 2.4)]
    const plan = planCuts(words, edit({ removeSilences: false }), 3)
    close(plan.forced, [r(0.97, 2 - PAD_BEFORE)])
  })

  it('makes a run of removed words one cut', () => {
    const words = [
      word('keep', 0, 0.5),
      word('a', 1, 1.2, { removed: true }),
      word('b', 1.5, 1.7, { removed: true }),
      word('um', 2, 2.3),
      word('next', 3, 3.4),
    ]
    close(planCuts(words, edit({ removeSilences: false }), 4).forced, [r(0.97, 3 - PAD_BEFORE)])
  })

  it('leaves fillers in when removeFillers is off', () => {
    const words = [word('so', 0, 0.3), word('um', 0.6, 0.9), word('yes', 1.2, 1.5)]
    expect(planCuts(words, edit({ removeFillers: false, removeSilences: false }), 2).forced).toEqual([])
  })

  it('cuts a filler at the very start up to the first kept word', () => {
    const words = [word('Um,', 0, 0.3), word('so', 0.45, 0.7)]
    close(planCuts(words, edit({ removeSilences: false }), 1).forced, [r(0, 0.45 - PAD_BEFORE)])
  })

  it('cuts removed words at the very end through to the end of the recording', () => {
    const words = [word('bye.', 0, 0.4), word('um', 0.9, 1.1)]
    close(planCuts(words, edit({ removeSilences: false }), 3).forced, [r(0.87, 3)])
  })

  it('never cuts into a kept word, even where Whisper has them overlap', () => {
    const words = [word('keep', 0, 0.5), word('uh', 0.45, 0.7), word('next', 0.68, 1)]
    const forced = planCuts(words, edit({ removeSilences: false }), 2).forced
    for (const c of forced) {
      expect(c.start).toBeGreaterThanOrEqual(0.5)
      expect(c.end).toBeLessThanOrEqual(0.68)
    }
  })

  it('leaves a removed word Whisper put inside a kept one, and the pause after it', () => {
    const words = [word('sooo', 0, 2), word('um', 0.5, 0.8), word('next', 3, 3.5)]
    expect(planCuts(words, edit({ removeSilences: false }), 4).forced).toEqual([])
    // Even with another kept word tucked inside the long one.
    const nested = [word('sooo', 0, 3), word('um', 1, 1.2), word('yes', 1.5, 1.8), word('next', 4, 4.2)]
    expect(planCuts(nested, edit({ removeSilences: false }), 5).forced).toEqual([])
  })

  it('cuts a squeezed filler right up to its neighbours without entering them', () => {
    const words = [word('and', 0, 0.3), word('uh', 0.33, 0.5), word('then', 0.53, 0.8)]
    close(planCuts(words, edit({ removeSilences: false }), 1).forced, [r(0.33, 0.5)])
  })

  it('treats zero and negative durations as points', () => {
    const words = [word('a', 0.5, 0.5), word('b', 1, 0.8, { removed: true }), word('c', 2, 2.3)]
    const plan = planCuts(words, edit({ removeSilences: false }), 3)
    close(plan.forced, [r(0.97, 2 - PAD_BEFORE)])
    expect(plan.speech[0].start).toBe(0.5)
  })
})

describe('planCuts with loudness', () => {
  it('follows a word that is still sounding past its transcribed end', () => {
    // "end" is transcribed to 1.0 but heard to 1.2; the next word is far off.
    const words = [word('the', 0.2, 0.4), word('end', 0.5, 1), word('Then', 3, 3.3)]
    const analysis = envelope(4, [[0.2, 0.4], [0.5, 1.2], [3, 3.3]])
    const plan = planCuts(words, edit({ maxPause: 0.4 }), 4, analysis)
    const mid = plan.pauses.find((c) => c.start > 1 && c.end < 3)!
    // 40% of the 0.4 s pause kept after where the sound really stops.
    expect(mid.start).toBeCloseTo(1.2 + 0.16, 2)
    expect(mid.end).toBeCloseTo(3 - 0.24, 2)
  })

  it('cuts the silence Whisper stretched a word over', () => {
    const words = [word('so', 0.2, 0.4), word('easy,', 0.45, 2.6), word('and', 2.65, 3)]
    const analysis = envelope(3.5, [[0.2, 0.4], [0.45, 0.8], [2.65, 3]])
    const plan = planCuts(words, edit({ maxPause: 0.4 }), 3.5, analysis)
    const mid = plan.pauses.find((c) => c.start > 0.8 && c.end < 2.65)!
    expect(mid.start).toBeCloseTo(0.8 + 0.16, 2)
    expect(mid.end).toBeCloseTo(2.65 - 0.24, 2)
    // Without loudness the stretched word is left whole: no way to know.
    expect(planCuts(words, edit({ maxPause: 0.4 }), 3.5).pauses.some((c) => c.start > 0.45 && c.end < 2.6)).toBe(false)
  })

  it('cuts an um Whisper left out, with the fillers', () => {
    const words = [word('So', 0.2, 0.5), word('today', 1.6, 2)]
    const analysis = envelope(2.5, [[0.2, 0.5], [0.9, 1.25], [1.6, 2]])
    const plan = planCuts(words, edit({ removeSilences: false }), 2.5, analysis)
    expect(plan.forced).toHaveLength(1)
    expect(plan.forced[0].start).toBeLessThanOrEqual(0.9)
    expect(plan.forced[0].start).toBeGreaterThan(0.5 + PAD_AFTER - 1e-9)
    expect(plan.forced[0].end).toBeCloseTo(1.6 - PAD_BEFORE, 6)
  })

  it('keeps an untranscribed sound as speech when fillers stay, so a pause cut never slices it', () => {
    const words = [word('So', 0.2, 0.5), word('today', 2.6, 3)]
    const analysis = envelope(3.4, [[0.2, 0.5], [1.4, 1.75], [2.6, 3]])
    const plan = planCuts(words, edit({ removeFillers: false, maxPause: 0.3 }), 3.4, analysis)
    expect(plan.forced).toEqual([])
    for (const c of plan.pauses) expect(c.end <= 1.4 - 0.05 + 1e-9 || c.start >= 1.75 + 0.05 - 1e-9).toBe(true)
    expect(plan.speech.some((s) => s.start <= 1.4 + 1e-6 && s.end >= 1.75 - 1e-6)).toBe(true)
  })

  it('leaves a long untranscribed sound alone even when removing fillers', () => {
    const words = [word('So', 0.2, 0.5), word('today', 3.6, 4)]
    const analysis = envelope(4.4, [[0.2, 0.5], [1.2, 2.6], [3.6, 4]])
    expect(planCuts(words, edit({ removeSilences: false }), 4.4, analysis).forced).toEqual([])
  })

  it('moves a cut edge off a loud frame into the quietest one nearby', () => {
    // A breath right where the removed word's cut would start.
    const words = [word('keep', 0, 0.4), word('gone', 1, 1.3, { removed: true }), word('next', 2, 2.3)]
    const analysis = envelope(3, [[0, 0.4], [0.9, 0.99, 0.05], [1, 1.3], [2, 2.3]])
    const start = planCuts(words, edit({ removeSilences: false }), 3, analysis).forced[0].start
    expect(start).toBeLessThan(0.9)
    expect(start).toBeGreaterThanOrEqual(0.4 + PAD_AFTER - 1e-9)
  })

  it('copes with pauses of digital silence', () => {
    const words = [word('the', 0.2, 0.4), word('end', 0.5, 1), word('Then', 3, 3.3)]
    const analysis = envelope(4, [[0.2, 0.4], [0.5, 1.2], [3, 3.3], [1.2, 1.3, 0.0005]], 0)
    const mid = planCuts(words, edit({ maxPause: 0.4 }), 4, analysis).pauses.find((c) => c.start > 1 && c.end < 3)!
    // The faint decay after 1.2 is room noise next to speech, not more of the word.
    expect(mid.start).toBeCloseTo(1.2 + 0.16, 2)
  })

  it('reads the room tone past stretches of digital silence', () => {
    // Room tone at about -40 dB, speech at -14 dB, and a padded-in run of
    // exact zeros at the start. The zeros mustn't make the room sound loud.
    const words = [word('ask', 1.0, 1.3), word('not', 1.4, 1.7), word('what', 2.9, 3.2)]
    const analysis = envelope(4, [[1.0, 1.3, 0.2], [1.4, 1.7, 0.2], [2.9, 3.2, 0.2]], 0.01)
    analysis.envelope.fill(0, 0, 80)
    const plan = planCuts(words, edit({ maxPause: 0.4 }), 4, analysis)
    const mid = plan.pauses.find((c) => c.start > 1.7 && c.end < 2.9)
    expect(mid).toBeDefined()
    expect(mid!.end - mid!.start).toBeGreaterThan(0.6)
  })

  it('ignores a recording too loud throughout to tell pauses from speech', () => {
    const words = [word('a', 0.2, 0.5), word('b', 2.6, 3)]
    const flat = envelope(3.4, [], 0.2)
    expect(planCuts(words, edit(), 3.4, flat)).toEqual(planCuts(words, edit(), 3.4))
  })
})

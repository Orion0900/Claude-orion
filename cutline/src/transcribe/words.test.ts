import { describe, expect, it } from 'vitest'
import type { Word } from '../lib/types'
import type { SpeechProfile } from './chunking'
import { collapseRepeats, idMaker, MIN_WORD_SECONDS, normalizeChunk, snapToSpeech, spreadSegments } from './words'
import type { ChunkContext, RawChunk } from './words'

const raw = (text: string, start: number | null, end: number | null): RawChunk => ({ text, timestamp: [start, end] })

const context = (overrides: Partial<ChunkContext> = {}): ChunkContext => ({
  offset: 0,
  duration: 30,
  nextId: idMaker('t.'),
  ...overrides,
})

const texts = (words: Word[]) => words.map((w) => w.text)

/**
 * Loudness with speech over the given spans, quiet elsewhere. The speech
 * swells and fades like syllables: a loud tenth of a second in every four.
 */
function profileWith(seconds: number, loud: [number, number][]): SpeechProfile {
  const frameSeconds = 0.01
  const power = new Float32Array(Math.round(seconds / frameSeconds)).fill(1e-6)
  for (const [from, to] of loud) {
    for (let frame = Math.round(from / frameSeconds); frame < Math.round(to / frameSeconds); frame++) {
      power[frame] = frame % 40 < 10 ? 0.01 : 0.001
    }
  }
  return { power, frameSeconds, threshold: 1e-4 }
}

/** Times move forward, never overlap, stay in the window and last long enough. */
function expectWellTimed(words: Word[], from: number, to: number) {
  words.forEach((word, i) => {
    expect(word.start).toBeGreaterThanOrEqual(from)
    expect(word.end).toBeLessThanOrEqual(to)
    expect(word.end - word.start).toBeGreaterThanOrEqual(MIN_WORD_SECONDS - 1e-9)
    if (i > 0) expect(word.start).toBeGreaterThanOrEqual(words[i - 1].end)
  })
}

describe('normalizeChunk text', () => {
  it('trims spaces and attaches punctuation to the word before', () => {
    const words = normalizeChunk(
      [raw(' Hello', 0, 0.4), raw(',', 0.4, 0.42), raw(' world', 0.5, 0.9), raw(' .', 0.9, 0.92)],
      context(),
    )
    expect(texts(words)).toEqual(['Hello,', 'world.'])
    expect(words[0]).toMatchObject({ start: 0, end: 0.42 })
  })

  it('puts opening quotes and brackets on the word after', () => {
    const words = normalizeChunk(
      [raw(' He', 0, 0.2), raw(' said', 0.2, 0.5), raw(' "', 0.5, 0.5), raw('yes', 0.5, 0.8), raw('"', 0.8, 0.8)],
      context(),
    )
    expect(texts(words)).toEqual(['He', 'said', '"yes"'])
    const spanish = normalizeChunk([raw(' ¿', 0, 0), raw('Qué', 0, 0.3), raw('?', 0.3, 0.3)], context())
    expect(texts(spanish)).toEqual(['¿Qué?'])
  })

  it('joins contractions and hyphenated parts that arrive split', () => {
    const words = normalizeChunk(
      [
        raw(' I', 0, 0.1),
        raw("'m", 0.1, 0.2),
        raw(' sure', 0.2, 0.5),
        raw(' it', 0.5, 0.6),
        raw(" 's", 0.6, 0.7),
        raw(' do', 0.7, 0.8),
        raw("n't", 0.8, 0.9),
        raw(' well', 0.9, 1.1),
        raw('-known', 1.1, 1.4),
      ],
      context(),
    )
    expect(texts(words)).toEqual(["I'm", 'sure', "it's", "don't", 'well-known'])
  })

  it('keeps words from scripts without spaces apart, with their punctuation', () => {
    const words = normalizeChunk([raw('我们', 0, 0.3), raw('去', 0.3, 0.5), raw('。', 0.5, 0.5)], context())
    expect(texts(words)).toEqual(['我们', '去。'])
  })

  it('drops empty tokens, music signs and sound descriptions', () => {
    const words = normalizeChunk(
      [
        raw('', 0, 0.1),
        raw('   ', 0.1, 0.2),
        raw(' ♪', 0.2, 0.3),
        raw(' [Music]', 0.3, 1),
        raw(' (upbeat', 1, 1.2),
        raw(' music)', 1.2, 1.5),
        raw(' Hi', 1.5, 1.8),
        raw(' *laughs*', 1.8, 2),
        raw(' there.', 2, 2.4),
        raw(' ...', 2.4, 2.5),
      ],
      context(),
    )
    expect(texts(words)).toEqual(['Hi', 'there....'])
  })
})

describe('normalizeChunk times', () => {
  it('fills in missing ends and fixes backwards and overlapping times', () => {
    const words = normalizeChunk(
      [raw(' a', 0, null), raw(' b', 1, 0.5), raw(' c', 0.8, 1.6), raw(' d', 1.6, 1.6), raw(' e', null, null)],
      context({ duration: 2 }),
    )
    expect(texts(words)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(words[0]).toMatchObject({ start: 0, end: 1 })
    expect(words[1]).toMatchObject({ start: 1, end: 1.05 })
    expect(words[2]).toMatchObject({ start: 1.05, end: 1.6 })
    expectWellTimed(words, 0, 2)
  })

  it('puts words on the source clock and keeps them inside their window', () => {
    const words = normalizeChunk([raw(' x', -1, 0.5), raw(' y', 1.9, 2.5), raw(' z', 2.4, 3)], context({ offset: 10, duration: 2 }))
    expect(words[0].start).toBe(10)
    expectWellTimed(words, 10, 12)
    expect(words.at(-1)?.end).toBe(12)
  })

  it('squeezes words when the window is too short for each to get the minimum', () => {
    const words = normalizeChunk([raw(' a', 0, 0), raw(' b', 0, 0), raw(' c', 0, 0), raw(' d', 0, 0)], context({ duration: 0.1 }))
    expect(words).toHaveLength(4)
    words.forEach((word, i) => {
      expect(word.end - word.start).toBeCloseTo(0.025, 3)
      if (i > 0) expect(word.start).toBeGreaterThanOrEqual(words[i - 1].end)
    })
  })

  it('gives every word an id that is unique across windows and transcriptions', () => {
    const nextId = idMaker()
    const first = normalizeChunk([raw(' one', 0, 1), raw(' two', 1, 2)], context({ nextId }))
    const second = normalizeChunk([raw(' three', 0, 1)], context({ nextId, offset: 30 }))
    const ids = [...first, ...second].map((w) => w.id)
    expect(new Set(ids).size).toBe(3)
    expect(idMaker()()).not.toBe(idMaker()())
  })
})

describe('collapseRepeats', () => {
  const words = (text: string) => text.split(' ').map((t) => ({ text: t }))
  const join = (list: { text: string }[]) => list.map((w) => w.text).join(' ')

  it('keeps one copy of a phrase the model looped on', () => {
    expect(join(collapseRepeats(words('So Thank you. Thank you. Thank you. thank you, Thank you. Bye')))).toBe(
      'So Thank you. Bye',
    )
    expect(join(collapseRepeats(words('you you you you you you you you')))).toBe('you')
    expect(join(collapseRepeats(words('I went home I went home I went home I went home')))).toBe('I went home')
    expect(join(collapseRepeats(words('and then we left and then we left and then we left')))).toBe('and then we left')
  })

  it('leaves repeats people really say alone', () => {
    for (const text of ['no no no no', 'ha ha', 'very very good', 'go team go team go team', 'the end. The end.']) {
      expect(join(collapseRepeats(words(text)))).toBe(text)
    }
  })
})

describe('silence', () => {
  it('drops stock phrases made up over silence or steady noise', () => {
    const profile = profileWith(10, [[0, 2]])
    const tail = normalizeChunk(
      [raw(' We', 0, 0.5), raw(' won.', 0.5, 2), raw(' Thank', 4, 6), raw(' you.', 6, 9)],
      context({ duration: 10, profile }),
    )
    expect(texts(tail)).toEqual(['We', 'won.'])
    expect(normalizeChunk([raw(' you', 0, 9)], context({ duration: 10, profile: profileWith(10, []) }))).toEqual([])
    const watching = [raw(' Thanks', 3, 4), raw(' for', 4, 5), raw(' watching!', 5, 6)]
    expect(normalizeChunk(watching, context({ duration: 10, profile }))).toEqual([])
    // Loud but steady, like hiss, before the speech starts.
    const hissThenSpeech: SpeechProfile = { ...profileWith(10, [[5, 7]]), threshold: 1e-7 }
    const lead = normalizeChunk(
      [raw(' Thank', 0, 1), raw(' you', 1, 2), raw(' for', 2, 3), raw(' watching!', 3, 4.5), raw(' Hello', 5, 6), raw(' there.', 6, 7)],
      context({ duration: 10, profile: hissThenSpeech }),
    )
    expect(texts(lead)).toEqual(['Hello', 'there.'])
  })

  it('keeps the same phrases when they were really said', () => {
    const profile = profileWith(10, [[0, 3]])
    const said = [raw(' Thank', 0, 0.4), raw(' you', 0.4, 0.9), raw(' so', 1, 1.5), raw(' much.', 1.5, 3)]
    const words = normalizeChunk(said, context({ duration: 10, profile }))
    expect(texts(words)).toEqual(['Thank', 'you', 'so', 'much.'])
    // A last "you" ending a sentence stays even where the audio is quiet.
    const quietEnd = normalizeChunk([raw(' Love', 0, 1), raw(' you.', 4, 6)], context({ duration: 10, profile }))
    expect(texts(quietEnd)).toEqual(['Love', 'you.'])
  })
})

describe('snapToSpeech', () => {
  it('trims a pause counted into a word, keeping a little either side', () => {
    const profile = profileWith(5, [[3.3, 3.6]])
    const [word] = snapToSpeech([{ text: 'ask', start: 2.28, end: 3.78 }], profile, 0, 5)
    expect(word.start).toBeCloseTo(3.2, 5)
    expect(word.end).toBeCloseTo(3.75, 5)
  })

  it('keeps the main sound when a word reaches into the next one, and lets that one start on time', () => {
    const profile = profileWith(10, [
      [7.2, 7.55],
      [8.15, 8.6],
    ])
    const [you, ask] = snapToSpeech(
      [
        { text: 'you,', start: 7.2, end: 8.26 },
        { text: 'ask', start: 8.26, end: 8.62 },
      ],
      profile,
      0,
      10,
    )
    expect(you.start).toBeCloseTo(7.2, 5)
    expect(you.end).toBeCloseTo(7.7, 5)
    expect(ask.start).toBeCloseTo(8.05, 5)
    expect(ask.end).toBeCloseTo(8.62, 5)
  })

  it('leaves words alone where it hears nothing', () => {
    const words = [{ text: 'quiet', start: 1, end: 2 }]
    expect(snapToSpeech(words, profileWith(5, []), 0, 5)).toEqual(words)
  })

  /** No word may cover any part of [from, to). */
  const uncovered = (words: { start: number; end: number }[], from: number, to: number) =>
    words.every((w) => w.end <= from || w.start >= to)

  it("leaves out an um Whisper counted into the word that opens the next sentence", () => {
    // "...the channel. [umm] So today" with "So" timed from the start of the umm.
    const profile = profileWith(8, [
      [0.5, 2.47],
      [4.07, 4.41],
      [4.91, 6.95],
    ])
    const out = snapToSpeech(
      [
        { text: 'channel.', start: 1.9, end: 4.2 },
        { text: 'So', start: 4.2, end: 5.1 },
        { text: 'today', start: 5.1, end: 5.5 },
      ],
      profile,
      0,
      8,
    )
    expect(out[1].start).toBeCloseTo(4.81, 5)
    expect(uncovered(out, 4.07, 4.41)).toBe(true)
  })

  it('leaves out an uh Whisper counted into the word that ends a phrase', () => {
    // "...talk about, [uhh] the three" with "about," running on over the uhh.
    const profile = profileWith(10, [
      [4.91, 6.95],
      [7.25, 7.51],
      [8.01, 9.5],
    ])
    const out = snapToSpeech(
      [
        { text: 'talk', start: 6.2, end: 6.5 },
        { text: 'about,', start: 6.5, end: 7.6 },
        { text: 'the', start: 7.6, end: 8.2 },
      ],
      profile,
      0,
      10,
    )
    expect(out[1].end).toBeCloseTo(7.1, 5)
    expect(uncovered(out, 7.25, 7.51)).toBe(true)
  })

  it('keeps a short word whose time only reaches a sliver into the next one', () => {
    // "done. Then [pause] we" without a comma: the sliver of "we" isn't "Then".
    const profile = profileWith(4, [
      [1.0, 1.3],
      [1.62, 2.4],
    ])
    const [then] = snapToSpeech(
      [
        { text: 'done.', start: 0.2, end: 1.0 },
        { text: 'Then', start: 1.0, end: 1.75 },
        { text: 'we', start: 1.75, end: 2.0 },
      ],
      profile,
      0,
      4,
    ).slice(1)
    expect(then.start).toBeCloseTo(1.0, 5)
    expect(then.end).toBeCloseTo(1.45, 5)
  })

  it('moves a word Whisper timed onto an um back to its own sound', () => {
    // "channel. [umm] So today" with "So" over the umm and "today" over "so today".
    const profile = profileWith(8, [
      [0.5, 2.47],
      [4.07, 4.41],
      [4.91, 6.95],
    ])
    const out = snapToSpeech(
      [
        { text: 'channel.', start: 2.1, end: 2.62 },
        { text: 'So', start: 3.89, end: 4.56 },
        { text: 'today', start: 4.8, end: 5.48 },
        { text: 'I', start: 5.48, end: 5.74 },
      ],
      profile,
      0,
      8,
    )
    expect(out[1].start).toBeCloseTo(4.81, 5)
    expect(out[1].end).toBeLessThan(out[2].end)
    expect(out[2].start).toBeCloseTo(out[1].end, 5)
    expect(uncovered(out, 4.07, 4.41)).toBe(true)
  })

  it('does the same mid-phrase, where Whisper left the pauses unpunctuated', () => {
    // "talk about [uhh] the three" with "the" over the uhh.
    const profile = profileWith(10, [
      [4.91, 6.95],
      [7.25, 7.51],
      [8.01, 9.5],
    ])
    const out = snapToSpeech(
      [
        { text: 'about', start: 6.52, end: 7.19 },
        { text: 'the', start: 7.24, end: 7.84 },
        { text: 'three', start: 8.04, end: 8.46 },
      ],
      profile,
      0,
      10,
    )
    expect(out[1].start).toBeCloseTo(7.91, 5)
    expect(uncovered(out, 7.25, 7.51)).toBe(true)
  })

  it('leaves a lone word alone when punctuation says the pause is real', () => {
    const profile = profileWith(8, [
      [0.5, 2.47],
      [4.07, 4.41],
      [4.91, 6.95],
    ])
    const words = [
      { text: 'channel.', start: 2.1, end: 2.62 },
      { text: 'So,', start: 3.97, end: 4.56 },
      { text: 'today', start: 4.81, end: 5.48 },
    ]
    const out = snapToSpeech(words, profile, 0, 8)
    expect(out[1].start).toBeCloseTo(3.97, 5)
    expect(out[1].end).toBeCloseTo(4.56, 5)
  })

  it('leaves a word alone that shares its stretch of sound with the one before', () => {
    // "ask not [pause] what": "not" runs straight on from "ask".
    const profile = profileWith(8, [
      [3.3, 5.0],
      [5.9, 7.0],
    ])
    const out = snapToSpeech(
      [
        { text: 'ask', start: 3.3, end: 4.4 },
        { text: 'not', start: 4.4, end: 5.06 },
        { text: 'what', start: 5.8, end: 6.3 },
      ],
      profile,
      0,
      8,
    )
    expect(out[1].start).toBeCloseTo(4.4, 5)
    expect(out[2].start).toBeCloseTo(5.8, 5)
  })

  it('leaves a lone word alone when the next one is far off', () => {
    const profile = profileWith(10, [
      [0.5, 2.0],
      [3.0, 3.4],
      [5.5, 7.0],
    ])
    const out = snapToSpeech(
      [
        { text: 'done.', start: 1.5, end: 2.0 },
        { text: 'Okay', start: 2.9, end: 3.5 },
        { text: 'so', start: 5.4, end: 5.8 },
      ],
      profile,
      0,
      10,
    )
    expect(out[1].start).toBeCloseTo(2.9, 5)
  })

  it('takes the main sound for a word that is a whole phrase on its own', () => {
    // "up. Honestly, [uhh] it" — the longer stretch is the word.
    const profile = profileWith(26, [
      [21.47, 22.04],
      [22.34, 22.59],
      [23.19, 25],
    ])
    const out = snapToSpeech(
      [
        { text: 'up.', start: 19.0, end: 21.47 },
        { text: 'Honestly,', start: 21.47, end: 22.6 },
        { text: 'it', start: 23.1, end: 23.4 },
      ],
      profile,
      0,
      26,
    )
    expect(out[1].end).toBeCloseTo(22.19, 5)
    expect(uncovered(out, 22.34, 22.59)).toBe(true)
  })
})

describe('spreadSegments', () => {
  it('shares each segment out by the length of its words', () => {
    const spread = spreadSegments([{ text: ' Hi there everyone', timestamp: [1, 4] }], 10)
    expect(spread.map((w) => w.text)).toEqual([' Hi', ' there', ' everyone'])
    expect(spread[0].timestamp[0]).toBe(1)
    expect(spread[1].timestamp[0]).toBeCloseTo(1 + (3 * 2) / 15, 5)
    expect(spread[2].timestamp[1]).toBeCloseTo(4, 5)
  })

  it('ends an open segment where the next begins, or at the window end', () => {
    const spread = spreadSegments(
      [
        { text: ' one two', timestamp: [0, null] },
        { text: ' three', timestamp: [2, null] },
      ],
      5,
    )
    expect(spread[1].timestamp[1]).toBeCloseTo(2, 5)
    expect(spread[2].timestamp).toEqual([2, 5])
  })

  it('splits scripts without spaces into words', () => {
    const spread = spreadSegments([{ text: '今日はいい天気です。', timestamp: [0, 2] }], 2, 'ja')
    expect(spread.length).toBeGreaterThan(2)
    expect(spread.map((w) => w.text).join('')).toBe('今日はいい天気です。')
  })

  it('makes usable words through the same clean-up', () => {
    const words = normalizeChunk(
      spreadSegments([{ text: ' And so, my fellow Americans.', timestamp: [0, 2] }], 3),
      context({ offset: 5, duration: 3 }),
    )
    expect(texts(words)).toEqual(['And', 'so,', 'my', 'fellow', 'Americans.'])
    expectWellTimed(words, 5, 8)
  })
})

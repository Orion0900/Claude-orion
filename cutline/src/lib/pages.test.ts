import { describe, expect, it } from 'vitest'
import { buildPages, pageAt, translatedPages } from './pages'
import { TimeMap, timedWords } from './timeline'
import type { CaptionPage, CaptionStyle, Range, TimedWord, Word } from './types'

const style = (over: Partial<Pick<CaptionStyle, 'wordsPerPage' | 'maxLines' | 'emojis'>> = {}) => ({
  wordsPerPage: 4,
  maxLines: 2,
  emojis: true,
  ...over,
})
const r = (start: number, end: number): Range => ({ start, end })

/** Words read one after another, 0.3 s each with a 0.05 s gap, unless a time is given. */
function speak(texts: (string | [string, number, number, Partial<Word>?])[]): Word[] {
  let t = 0
  return texts.map((item, i) => {
    const [text, start, end, extra] = typeof item === 'string' ? [item, t, t + 0.3, {}] : item
    t = end + 0.05
    return { id: `w${i}`, text, start, end, ...extra }
  })
}
const timed = (ws: Word[]): TimedWord[] => ws.map((w) => ({ id: w.id, text: w.text, start: w.start, end: w.end, emphasis: !!w.emphasis }))
const texts = (pages: CaptionPage[]) => pages.map((p) => p.words.map((w) => w.text).join(' '))
const pagesOf = (ws: Word[], s = style()) => buildPages(timed(ws), ws, s)

describe('buildPages', () => {
  it('fills pages up to wordsPerPage, numbered in order', () => {
    const pages = pagesOf(speak(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']))
    expect(texts(pages)).toEqual(['one two three four', 'five six seven eight'])
    expect(pages.map((p) => p.index)).toEqual([0, 1])
  })

  it('shares words out evenly instead of leaving a straggler', () => {
    expect(texts(pagesOf(speak(['a', 'b', 'c', 'd', 'e'])))).toEqual(['a b c', 'd e'])
    expect(texts(pagesOf(speak(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])))).toEqual(['a b c', 'd e f', 'g h i'])
  })

  it('takes one word over the limit rather than leave a page of one', () => {
    expect(texts(pagesOf(speak(['a', 'b', 'c']), style({ wordsPerPage: 2 })))).toEqual(['a b c'])
    expect(texts(pagesOf(speak(['a', 'b', 'c', 'd', 'e']), style({ wordsPerPage: 2 })))).toEqual(['a b', 'c d e'])
  })

  it('does one word a page when asked', () => {
    expect(texts(pagesOf(speak(['a', 'b', 'c']), style({ wordsPerPage: 1 })))).toEqual(['a', 'b', 'c'])
  })

  it('ends a page at the end of a sentence', () => {
    expect(texts(pagesOf(speak(['Hi', 'there.', 'How', 'are', 'you?', 'Good!', 'Yes'])))).toEqual([
      'Hi there.',
      'How are you?',
      'Good!',
      'Yes',
    ])
  })

  it('ends a page after a comma once it is half full, unless that strands a word', () => {
    expect(texts(pagesOf(speak(['So', 'basically,', "here's", 'the', 'thing.'])))).toEqual(['So basically,', "here's the thing."])
    expect(texts(pagesOf(speak(['Well,', 'I', 'think', 'we', 'go.'])))).toEqual(['Well, I think', 'we go.'])
    expect(texts(pagesOf(speak(['I', 'mean,', 'yes.'])))).toEqual(['I mean, yes.'])
  })

  it('starts a new page after a word marked breakAfter', () => {
    expect(texts(pagesOf(speak(['a', ['b', 0.35, 0.65, { breakAfter: true }], 'c', 'd'])))).toEqual(['a b', 'c d'])
  })

  it('starts a new page after a pause, and a lone word there stays alone', () => {
    const ws = speak(['one', 'two', ['three', 0.7, 1], ['four', 2, 2.3], 'five', 'six'])
    expect(texts(pagesOf(ws))).toEqual(['one two three', 'four five six'])
    const lone = speak(['Hey', ['guys', 1.5, 1.8], 'welcome', 'back'])
    expect(texts(pagesOf(lone))).toEqual(['Hey', 'guys welcome back'])
  })

  it('keeps a page within what maxLines can hold', () => {
    const ws = speak(['unbelievable', 'extraordinary', 'magnificent', 'wow'])
    expect(texts(pagesOf(ws, style({ maxLines: 1 })))).toEqual(['unbelievable', 'extraordinary', 'magnificent wow'])
    expect(texts(pagesOf(ws, style({ maxLines: 2 })))).toEqual(['unbelievable extraordinary', 'magnificent wow'])
  })

  it('times pages from the first word, holding a moment after the last but never past the next', () => {
    const ws = speak([['a', 0, 0.3], ['b.', 0.35, 1], ['c', 1.6, 1.9], ['d.', 1.95, 2.2], ['e', 3.5, 3.8], ['f.', 3.85, 4.1]])
    const pages = pagesOf(ws)
    // The first page would leave a 0.1 s blank before the second, so it stays up until it.
    expect(pages.map((p) => [p.start, p.end])).toEqual([
      [0, 1.6],
      [1.6, 2.7],
      [3.5, 4.6],
    ])
  })

  it('closes a blank between pages too short to read as anything but flicker', () => {
    const ws = speak([['a.', 0, 1], ['b.', 1.7, 2]])
    expect(pagesOf(ws)[0].end).toBe(1.7)
    const wide = speak([['a.', 0, 1], ['b.', 1.8, 2]])
    expect(pagesOf(wide)[0].end).toBe(1.5)
  })

  it('shows the first emoji among its words, when emojis are on', () => {
    const ws = speak(['make', ['money', 0.35, 0.65, { emoji: '💰' }], ['fast', 0.7, 1, { emoji: '⚡' }], 'today'])
    expect(pagesOf(ws)[0].emoji).toBe('💰')
    expect(pagesOf(ws, style({ emojis: false }))[0].emoji).toBeNull()
    expect(pagesOf(speak(['plain', 'words']))[0].emoji).toBeNull()
  })

  it('has no pages for no words', () => expect(buildPages([], [], style())).toEqual([]))

  it('copes with nonsense settings', () => {
    expect(texts(pagesOf(speak(['a', 'b', 'c']), style({ wordsPerPage: 0, maxLines: 0 })))).toEqual(['a', 'b', 'c'])
  })

  it('pages a long transcript quickly and never overlaps', () => {
    const ws = Array.from({ length: 3000 }, (_, i): Word => ({
      id: `w${i}`,
      text: i % 9 === 8 ? 'end.' : i % 5 === 4 ? 'and,' : 'word',
      start: i * 0.35 + (i % 40 === 0 ? 0.8 : 0),
      end: i * 0.35 + 0.3 + (i % 40 === 0 ? 0.8 : 0),
    }))
    const started = performance.now()
    const pages = pagesOf(ws)
    expect(performance.now() - started).toBeLessThan(200)
    expect(pages.flatMap((p) => p.words).length).toBe(3000)
    pages.forEach((p, i) => {
      expect(p.words.length).toBeLessThanOrEqual(5)
      expect(p.end).toBeGreaterThanOrEqual(p.start)
      if (i) expect(p.start).toBeGreaterThanOrEqual(pages[i - 1].end)
    })
  })
})

describe('pageAt', () => {
  const pages = pagesOf(speak([['one.', 0, 1], ['two.', 2, 2.5], ['three.', 2.6, 3]]))

  it('finds the page on screen', () => {
    expect(pageAt(pages, 0)?.index).toBe(0)
    expect(pageAt(pages, 1.49)?.index).toBe(0)
    expect(pageAt(pages, 2.59)?.index).toBe(1)
    expect(pageAt(pages, 2.6)?.index).toBe(2)
    expect(pageAt(pages, 3.49)?.index).toBe(2)
  })

  it('finds nothing between, before and after pages', () => {
    expect(pageAt(pages, 1.5)).toBeNull()
    expect(pageAt(pages, 1.99)).toBeNull()
    expect(pageAt(pages, -1)).toBeNull()
    expect(pageAt(pages, 3.5)).toBeNull()
    expect(pageAt([], 1)).toBeNull()
  })

  it('agrees with a plain scan everywhere', () => {
    for (let t = -0.5; t < 4; t += 0.01) {
      expect(pageAt(pages, t)).toBe(pages.find((p) => t >= p.start && t < p.end) ?? null)
    }
  })
})

describe('translatedPages', () => {
  // Two sentences with a cut between them (2.2..2.8 source).
  const source = speak([
    ['Hello', 0, 0.4], ['everyone,', 0.45, 1], ['welcome', 1.05, 1.5], ['back.', 1.55, 2, { emoji: '👋' }],
    ['Today', 3, 3.4], ['we', 3.45, 3.6], ['cook', 3.65, 4, { emoji: '🍳' }], ['pasta.', 4.05, 4.6],
  ])
  const map = new TimeMap([r(0, 2.2), r(2.8, 5)])
  const translation = {
    language: 'es',
    sentences: [
      { firstWordId: 'w0', lastWordId: 'w3', text: 'Hola a todos, bienvenidos de nuevo.' },
      { firstWordId: 'w4', lastWordId: 'w7', text: 'Hoy cocinamos pasta.' },
    ],
  }

  it('splits each sentence into pages and times them across its edited span', () => {
    const pages = translatedPages(translation, source, map, style())
    expect(texts(pages)).toEqual(['Hola a todos,', 'bienvenidos de nuevo.', 'Hoy cocinamos pasta.'])
    expect(pages[0].start).toBe(0)
    const words = pages.flatMap((p) => p.words)
    expect(words[5].end).toBeCloseTo(2, 9)
    expect(words[6].start).toBeCloseTo(map.toEditedClamped(3), 9)
    expect(words[8].end).toBeCloseTo(map.toEditedClamped(4.6), 9)
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2])
  })

  it('gives longer words more time', () => {
    const words = translatedPages(translation, source, map, style()).flatMap((p) => p.words)
    const a = words.find((w) => w.text === 'a')!
    const bienvenidos = words.find((w) => w.text === 'bienvenidos')!
    expect(bienvenidos.end - bienvenidos.start).toBeGreaterThan(4 * (a.end - a.start))
    words.forEach((w, i) => i && expect(w.start).toBeGreaterThanOrEqual(words[i - 1].end - 1e-9))
  })

  it('carries the emoji of the source words a page is spoken over', () => {
    const pages = translatedPages(translation, source, map, style())
    expect(pages.map((p) => p.emoji)).toEqual([null, '👋', '🍳'])
    expect(translatedPages(translation, source, map, style({ emojis: false })).every((p) => p.emoji === null)).toBe(true)
  })

  it('skips the pauses inside a sentence and starts a new page after one', () => {
    const ws = speak([['one', 0, 0.5], ['two', 0.5, 1], ['three', 2.5, 3], ['four', 3, 3.5]])
    const pages = translatedPages(
      { language: 'fr', sentences: [{ firstWordId: 'w0', lastWordId: 'w3', text: 'un deux trois quatre' }] },
      ws,
      new TimeMap([r(0, 4)]),
      style(),
    )
    expect(texts(pages)).toEqual(['un deux', 'trois quatre'])
    for (const w of pages.flatMap((p) => p.words)) expect(w.end <= 1 + 1e-9 || w.start >= 2.5 - 1e-9).toBe(true)
  })

  it('has no pages for a sentence cut from the video or one it cannot place', () => {
    const cutAway = new TimeMap([r(0, 2.2)])
    expect(texts(translatedPages(translation, source, cutAway, style()))).toEqual(['Hola a todos,', 'bienvenidos de nuevo.'])
    const unknown = { language: 'es', sentences: [{ firstWordId: 'nope', lastWordId: 'w3', text: 'Hola.' }] }
    expect(translatedPages(unknown, source, map, style())).toEqual([])
    expect(translatedPages({ language: 'es', sentences: [] }, source, map, style())).toEqual([])
  })

  it('cuts text written without spaces into short pieces', () => {
    const ja = { language: 'ja', sentences: [{ firstWordId: 'w0', lastWordId: 'w3', text: '皆さん、こんにちは。今日はスマホで動画を編集する方法を紹介します。' }] }
    const pages = translatedPages(ja, source, map, style())
    const words = pages.flatMap((p) => p.words)
    expect(words.length).toBeGreaterThan(3)
    expect(words.every((w) => [...w.text].length <= 8)).toBe(true)
    expect(words.map((w) => w.text).join('')).toBe(ja.sentences[0].text)
  })

  it('times the same as the original pages would across the same words', () => {
    const tw = timedWords(source, map)
    const pages = translatedPages(translation, source, map, style())
    expect(pages[pages.length - 1].start).toBeGreaterThanOrEqual(tw[4].start - 1e-9)
  })
})

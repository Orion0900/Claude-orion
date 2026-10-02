import { describe, expect, it } from 'vitest'
import { toPlainText, toSrt, toVtt } from './subtitles'
import type { CaptionPage, Word } from './types'

const page = (index: number, start: number, end: number, text: string): CaptionPage => ({
  index,
  start,
  end,
  emoji: null,
  words: text.split(' ').map((t, i) => ({ id: `p${index}w${i}`, text: t, start, end, emphasis: false })),
})

const pages = [page(0, 0, 1.234, 'Hey guys,'), page(1, 1.234, 2.5, 'welcome back.'), page(2, 3723.5, 3725.002, 'Bye!')]

describe('toSrt', () => {
  it('writes numbered cues with comma milliseconds', () => {
    expect(toSrt(pages)).toBe(
      '1\n00:00:00,000 --> 00:00:01,234\nHey guys,\n\n' +
        '2\n00:00:01,234 --> 00:00:02,500\nwelcome back.\n\n' +
        '3\n01:02:03,500 --> 01:02:05,002\nBye!\n',
    )
  })

  it('is empty for no pages, and skips pages without words', () => {
    expect(toSrt([])).toBe('')
    const empty: CaptionPage = { index: 0, start: 0, end: 1, emoji: null, words: [] }
    expect(toSrt([empty, page(1, 1, 2, 'Hi')])).toBe('1\n00:00:01,000 --> 00:00:02,000\nHi\n')
  })

  it('never writes a cue that ends before it starts', () => {
    expect(toSrt([page(0, 2, 2, 'blink')])).toBe('1\n00:00:02,000 --> 00:00:02,001\nblink\n')
    expect(toSrt([page(0, -1, 0.5, 'early')])).toBe('1\n00:00:00,000 --> 00:00:00,500\nearly\n')
  })

  it('rounds to the nearest millisecond', () => {
    expect(toSrt([page(0, 0.0004, 0.9996, 'x')])).toContain('00:00:00,000 --> 00:00:01,000')
  })
})

describe('toVtt', () => {
  it('writes the header and cues with dot milliseconds', () => {
    expect(toVtt(pages)).toBe(
      'WEBVTT\n\n' +
        '00:00:00.000 --> 00:00:01.234\nHey guys,\n\n' +
        '00:00:01.234 --> 00:00:02.500\nwelcome back.\n\n' +
        '01:02:03.500 --> 01:02:05.002\nBye!\n',
    )
  })

  it('escapes what WebVTT would read as markup', () => {
    expect(toVtt([page(0, 0, 1, 'R&D <b> --> ok')])).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nR&amp;D &lt;b&gt; --&gt; ok\n')
  })

  it('is just the header for no pages', () => expect(toVtt([])).toBe('WEBVTT\n'))
})

describe('toPlainText', () => {
  const words = (list: [string, number, number, Partial<Word>?][]): Word[] =>
    list.map(([text, start, end, extra], i) => ({ id: `w${i}`, text, start, end, ...extra }))

  it('joins words into sentences and paragraphs at long pauses', () => {
    const text = toPlainText(
      words([
        ['Hey', 0, 0.2], ['guys.', 0.25, 0.5], ['Today', 0.6, 0.9], ['we', 0.95, 1], ['cook.', 1.05, 1.4],
        ['First,', 2.6, 2.9], ['the', 3, 3.1], ['pasta.', 3.15, 3.5],
      ]),
    )
    expect(text).toBe('Hey guys. Today we cook.\n\nFirst, the pasta.')
  })

  it('keeps a sentence together through a hesitation, but not through a long silence', () => {
    const hesitant = words([['I', 0, 0.2], ['think', 1.6, 1.9], ['so.', 2, 2.3]])
    expect(toPlainText(hesitant)).toBe('I think so.')
    const stopped = words([['I', 0, 0.2], ['think', 2.6, 2.9], ['so.', 3, 3.3]])
    expect(toPlainText(stopped)).toBe('I\n\nthink so.')
  })

  it('leaves out removed words', () => {
    expect(toPlainText(words([['So', 0, 0.2], ['um', 0.3, 0.5, { removed: true }], ['yes.', 0.6, 0.9]]))).toBe('So yes.')
  })

  it('breaks up a very long paragraph at a full stop', () => {
    const list: [string, number, number][] = []
    for (let i = 0; i < 300; i++) list.push([i % 10 === 9 ? 'end.' : 'word', i * 0.3, i * 0.3 + 0.25])
    const paragraphs = toPlainText(words(list)).split('\n\n')
    expect(paragraphs.length).toBeGreaterThan(1)
    for (const p of paragraphs) expect(p.split(' ').length).toBeLessThanOrEqual(130)
  })

  it('is empty for no words', () => expect(toPlainText([])).toBe(''))
})

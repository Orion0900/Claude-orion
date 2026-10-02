import { describe, expect, it } from 'vitest'
import { EMOJI_DICTIONARY, emojiFor, suggestEmojis, suggestEmphasis } from './emoji'
import type { Word } from './types'

const say = (text: string, extra: (i: number) => Partial<Word> = () => ({})): Word[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({ id: `w${i}`, text: t, start: i * 0.4, end: i * 0.4 + 0.35, ...extra(i) }))

const picked = (words: Word[], map: Map<string, string>) =>
  words.flatMap((w) => (map.has(w.id) ? [`${w.text}${map.get(w.id)}`] : []))

describe('the emoji dictionary', () => {
  const entries = EMOJI_DICTIONARY.flatMap(([emoji, list]) => list.split(' ').map((w) => [emoji, w.replace(/[!~]$/, '')]))

  it('has a few hundred common words, each mapped once', () => {
    expect(entries.length).toBeGreaterThanOrEqual(300)
    const seen = new Map<string, string>()
    for (const [emoji, w] of entries) {
      expect(seen.has(w), `"${w}" is under ${seen.get(w)} and ${emoji}`).toBe(false)
      seen.set(w, emoji)
    }
  })

  it('is written in plain lowercase base forms', () => {
    for (const [, list] of EMOJI_DICTIONARY) for (const w of list.split(' ')) expect(w).toMatch(/^[a-z0-9]+[!~]?$/)
  })

  it('covers the words creators say most', () => {
    expect(['money', 'love', 'fire', 'idea', 'time', 'gym', 'phone', 'brain', 'rocket', '100'].map(emojiFor)).toEqual([
      '💰',
      '❤️',
      '🔥',
      '💡',
      '⏰',
      '💪',
      '📱',
      '🧠',
      '🚀',
      '💯',
    ])
  })
})

describe('emojiFor', () => {
  it('ignores case and punctuation', () => {
    expect(emojiFor('MONEY!')).toBe('💰')
    expect(emojiFor('"Pizza,"')).toBe('🍕')
    expect(emojiFor("dog's")).toBe('🐶')
  })

  it('finds plurals and -ing / -ed forms', () => {
    expect(emojiFor('phones')).toBe('📱')
    expect(emojiFor('stories')).toBe('📖')
    expect(emojiFor('cooking')).toBe('🍳')
    expect(emojiFor('running')).toBe('🏃')
    expect(emojiFor('coding')).toBe('💻')
    expect(emojiFor('loved')).toBe('❤️')
    expect(emojiFor('shopped')).toBe('🛍️')
    expect(emojiFor('boxes')).toBe('📦')
  })

  it('reads money and 100% for what they are', () => {
    expect(emojiFor('$500')).toBe('💰')
    expect(emojiFor('€20,')).toBe('💰')
    expect(emojiFor('100%')).toBe('💯')
    expect(emojiFor('100.')).toBe('💯')
  })

  it('stays away from fillers, unknown words and meanings that would land badly', () => {
    for (const w of ['um', 'the', 'and', 'like', 'fired', 'xylophone', '', '...']) expect(emojiFor(w), w).toBeNull()
  })
})

describe('suggestEmojis', () => {
  it('picks dictionary words across a transcript', () => {
    const words = say('I spent all my money on a new phone and then went to the gym and every single morning')
    expect(picked(words, suggestEmojis(words))).toEqual(['money💰', 'phone📱', 'gym💪', 'morning🌅'])
    // Three words after "gym" is too close for another.
    const tight = say('then went to the gym every single morning')
    expect(picked(tight, suggestEmojis(tight))).toEqual(['gym💪'])
  })

  it('puts at most one emoji about every four words, the stronger match winning', () => {
    // "pizza" (vivid) beats "dinner" two words away.
    const words = say('we had dinner with pizza tonight')
    expect(picked(words, suggestEmojis(words))).toEqual(['pizza🍕'])
    const all = say('money fire love idea rocket brain phone gym coffee pizza music travel')
    const ids = [...suggestEmojis(all).keys()].map((id) => Number(id.slice(1)))
    ids.sort((a, b) => a - b).forEach((i, k) => k && expect(i - ids[k - 1]).toBeGreaterThanOrEqual(4))
  })

  it('does not repeat an emoji close together', () => {
    const words = say('money is great but more money means more money problems and money stress')
    expect([...suggestEmojis(words).values()].filter((e) => e === '💰')).toHaveLength(1)
  })

  it('leaves weak matches for when nothing else is near', () => {
    const words = say('it is time to talk about time and money today')
    const emojis = picked(words, suggestEmojis(words))
    expect(emojis).toContain('money💰')
    expect(emojis.some((e) => e.startsWith('time'))).toBe(false)
  })

  it('gives removed words nothing', () => {
    const words = say('my coffee order', (i) => ({ removed: i === 1 }))
    expect(suggestEmojis(words).size).toBe(0)
  })

  it('is deterministic and quick on a long transcript', () => {
    const base = 'so today I want to talk about money and how my morning coffee routine changed my business and my health '
    const words = say(base.repeat(160))
    expect(words.length).toBeGreaterThan(3000)
    const started = performance.now()
    const first = suggestEmojis(words)
    expect(performance.now() - started).toBeLessThan(150)
    expect([...suggestEmojis(words)]).toEqual([...first])
    expect(first.size).toBeLessThanOrEqual(words.length / 4)
  })
})

describe('suggestEmphasis', () => {
  const marked = (words: Word[]) => words.filter((w) => suggestEmphasis(words).has(w.id)).map((w) => w.text)

  it('goes for numbers, money and percentages first', () => {
    const words = say('I made $5,000 in three months and grew my audience by 200% this year honestly')
    expect(marked(words)).toEqual(['$5,000', '200%'])
  })

  it('lands on shouted words, exclamations and long unusual words', () => {
    expect(marked(say('and this is the part that is HUGE for anyone starting'))).toEqual(['HUGE'])
    expect(marked(say('you have to try this at least once, trust me, wow!'))).toEqual(['wow!'])
    expect(marked(say('the secret is consistency over a really long period of time'))).toEqual(['consistency'])
  })

  it('never picks stopwords or fillers', () => {
    expect(suggestEmphasis(say('um so I mean you know it is what it is'))).toEqual(new Set())
    expect(suggestEmphasis([])).toEqual(new Set())
  })

  it('stops treating a word as special once it is said over and over', () => {
    const words = say('content content content content strategy matters and content wins every single time')
    expect(marked(words)).toEqual(['strategy'])
  })

  it('marks at most about one word in seven, spread out', () => {
    const words = say('Incredible 100 results! Massive GROWTH and 50% more revenue, $2,000 extra, BIG wins, amazing customers, 3x faster shipping everywhere')
    const ids = [...suggestEmphasis(words)].map((id) => Number(id.slice(1))).sort((a, b) => a - b)
    expect(ids.length).toBeLessThanOrEqual(Math.max(1, Math.floor(words.length / 7)))
    ids.forEach((i, k) => k && expect(i - ids[k - 1]).toBeGreaterThanOrEqual(4))
  })

  it('skips removed words and is deterministic and quick', () => {
    const words = say('we spent $300 on equipment', (i) => ({ removed: i === 2 }))
    expect(marked(words)).toEqual(['equipment'])
    const long = say('honestly the biggest breakthrough came when consistency met 10x discipline every morning '.repeat(250))
    const started = performance.now()
    const first = suggestEmphasis(long)
    expect(performance.now() - started).toBeLessThan(150)
    expect([...suggestEmphasis(long)]).toEqual([...first])
  })
})

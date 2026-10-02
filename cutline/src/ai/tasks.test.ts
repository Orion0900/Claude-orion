import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Word } from '../lib/types'
import { AiError, setClientOptionsForTests } from './claude'
import { apiError, fakeFetch, reply, section, transcriptRefs, type Responder, type SentRequest } from './fake-claude'
import type { AiSettings } from './settings'
import { findClips, fixTranscript, pickHighlights, translateSentences, writeHook, writeScript } from './tasks'

const ai: AiSettings = { apiKey: 'sk-ant-test', model: 'claude-opus-5-5' }

function useFake(respond: Responder) {
  const fake = fakeFetch(respond)
  setClientOptionsForTests({ fetch: fake.fetch, maxRetries: 0 })
  return fake
}

afterEach(() => setClientOptionsForTests({}))

/** Words half a second apart, ids `id-<n>`. */
function makeWords(texts: string[], removed: number[] = []): Word[] {
  return texts.map((text, i) => ({
    id: `id-${i}`,
    text,
    start: i * 0.5,
    end: i * 0.5 + 0.4,
    ...(removed.includes(i) ? { removed: true } : {}),
  }))
}

const manyWords = (n: number) => makeWords(Array.from({ length: n }, (_, i) => `word${i}`))

const userText = (req: SentRequest) => req.body.messages[0].content

async function failure(promise: Promise<unknown>): Promise<AiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AiError)
  return error as AiError
}

describe('pickHighlights', () => {
  it('sends kept words as ref lines at low effort and maps the picks back to word ids', async () => {
    const words = makeWords('So today I made one thousand dollars um selling cookies.'.split(' '), [7])
    const fake = useFake(() =>
      reply({ emphasis: ['w5', 'w6'], emojis: [{ ref: 'w6', emoji: '💰' }] }),
    )
    const result = await pickHighlights(ai, words, undefined)

    expect(result).toEqual({ emphasis: ['id-5', 'id-6'], emojis: [{ wordId: 'id-6', emoji: '💰' }] })
    const [req] = fake.sent
    expect(req.body.output_config?.effort).toBe('low')
    expect(section(req, 'Transcript')).toEqual([
      'w0 So', 'w1 today', 'w2 I', 'w3 made', 'w4 one', 'w5 thousand', 'w6 dollars', 'w8 selling', 'w9 cookies.',
    ])
    expect(userText(req)).not.toContain('um')
    expect(req.body.system).toContain('emphasis')
  })

  it('drops made-up refs and bad emojis, spaces emojis out and caps keywords near 15%', async () => {
    useFake(() =>
      reply({
        emphasis: ['w999', 'nonsense', ...Array.from({ length: 30 }, (_, i) => `w${i * 3}`)],
        emojis: [
          { ref: 'w1', emoji: '🔥' },
          { ref: 'w3', emoji: '😀' },
          { ref: 'w10', emoji: 'fire' },
          { ref: 'w20', emoji: ' 👩‍💻 ' },
          { ref: 'w23', emoji: '🇺🇸' },
          { ref: 'w40', emoji: '🔥🔥' },
          { ref: 'w50', emoji: '🇺🇸' },
          { ref: 'w60', emoji: '👍🏽' },
          { ref: 'w70', emoji: '❤️' },
          { ref: 'w80', emoji: '1️⃣' },
        ],
      }),
    )
    const result = await pickHighlights(ai, manyWords(100))
    expect(result.emphasis).toHaveLength(15)
    expect(result.emphasis[0]).toBe('id-0')
    expect(result.emojis).toEqual([
      { wordId: 'id-1', emoji: '🔥' },
      { wordId: 'id-20', emoji: '👩‍💻' },
      { wordId: 'id-50', emoji: '🇺🇸' },
      { wordId: 'id-60', emoji: '👍🏽' },
      { wordId: 'id-70', emoji: '❤️' },
      { wordId: 'id-80', emoji: '1️⃣' },
    ])
  })

  it('accepts any single emoji, however it is built, and nothing else', async () => {
    const zwj = String.fromCodePoint(0x200d)
    const vs16 = String.fromCodePoint(0xfe0f)
    const valid = [
      String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f), // Scotland's flag
      `${String.fromCodePoint(0x1f3f3)}${vs16}${zwj}${String.fromCodePoint(0x1f308)}`, // rainbow flag
      [0x1f468, 0x1f469, 0x1f467].map((c) => String.fromCodePoint(c)).join(zwj), // family
      `#${vs16}${String.fromCodePoint(0x20e3)}`, // keycap
      String.fromCodePoint(0x263a), // ☺ without its variation selector
    ]
    const invalid = ['ok', ':fire:', '1', `${zwj}`, '🔥 fire', '😀😀']
    useFake(() =>
      reply({
        emphasis: [],
        emojis: [...valid, ...invalid].map((emoji, i) => ({ ref: `w${i * 10}`, emoji })),
      }),
    )
    const result = await pickHighlights(ai, manyWords(120))
    expect(result.emojis).toEqual(valid.map((emoji, i) => ({ wordId: `id-${i * 10}`, emoji })))
  })

  it('splits a long transcript into even chunks with context, and merges the picks in order', async () => {
    const fake = useFake((req) => {
      const refs = transcriptRefs(req)
      const before = section(req, 'Context before').map((line) => line.split(' ')[0])
      return reply({
        // A pick from the context lines belongs to another chunk and must be ignored.
        emphasis: [refs[1], ...before.slice(0, 1)],
        emojis: [{ ref: refs[refs.length - 1], emoji: '🔥' }],
      })
    })
    const result = await pickHighlights(ai, manyWords(1300))

    expect(fake.sent).toHaveLength(3)
    const chunks = fake.sent
      .map((req) => ({ body: transcriptRefs(req), before: section(req, 'Context before'), after: section(req, 'Context after') }))
      .sort((a, b) => Number(a.body[0].slice(1)) - Number(b.body[0].slice(1)))
    expect(chunks.map((c) => c.body.length)).toEqual([434, 434, 432])
    expect(chunks.map((c) => c.before.length)).toEqual([0, 40, 40])
    expect(chunks.map((c) => c.after.length)).toEqual([40, 40, 0])
    expect(chunks[1].before[0]).toBe('w394 word394')

    expect(result.emphasis).toEqual(['id-1', 'id-435', 'id-869'])
    expect(result.emojis.map((e) => e.wordId)).toEqual(['id-433', 'id-867', 'id-1299'])
  })

  it('keeps emojis apart where two chunks meet', async () => {
    useFake((req) => {
      const refs = transcriptRefs(req)
      // The first chunk picks its last word and the second its first: neighbours.
      return reply({ emphasis: [], emojis: [{ ref: refs[0] === 'w0' ? refs[refs.length - 1] : refs[0], emoji: '🔥' }] })
    })
    const result = await pickHighlights(ai, manyWords(700))
    expect(result.emojis.map((e) => e.wordId)).toEqual(['id-349'])
  })

  it('stops the other chunks when one fails, and reports that failure', async () => {
    const cancelled: boolean[] = []
    const fake = useFake(async (req, signal) => {
      if (transcriptRefs(req)[0] === 'w434') {
        // Fail only once all three are in flight, so there's something to cancel.
        await vi.waitFor(() => expect(fake.sent).toHaveLength(3))
        return apiError(429, 'rate_limit_error', 'Slow down')
      }
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          cancelled.push(true)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    expect((await failure(pickHighlights(ai, manyWords(1300)))).kind).toBe('rate')
    expect(cancelled).toEqual([true, true])
  })

  it('sends nothing when every word was cut', async () => {
    const fake = useFake(() => reply({ emphasis: [], emojis: [] }))
    expect(await pickHighlights(ai, makeWords(['um', 'uh'], [0, 1]))).toEqual({ emphasis: [], emojis: [] })
    expect(fake.sent).toHaveLength(0)
  })
})

describe('fixTranscript', () => {
  it('keeps one word in, one word out, and returns only real changes in order', async () => {
    const words = makeWords('we deploy on kubernetes and um post gress every day'.split(' '), [5])
    const fake = useFake(() =>
      reply({
        fixes: [
          { ref: 'w6', text: 'Postgres' },
          { ref: 'w3', text: 'Kubernetes' },
          { ref: 'w3', text: 'KUBERNETES' },
          { ref: 'w7', text: '' },
          { ref: 'w4', text: 'and' },
          { ref: 'w1', text: 'deploy it' },
          { ref: 'w99', text: 'ghost' },
          { ref: 'w5', text: 'uh,' },
          { ref: 'w9', text: 'day.' },
        ],
      }),
    )
    const result = await fixTranscript(ai, words, ' Kubernetes and Postgres ', undefined)

    expect(result).toEqual([
      { wordId: 'id-3', text: 'Kubernetes' },
      { wordId: 'id-5', text: 'uh,' },
      { wordId: 'id-6', text: 'Postgres' },
      { wordId: 'id-9', text: 'day.' },
    ])
    const [req] = fake.sent
    expect(req.body.output_config?.effort).toBe('low')
    expect(userText(req)).toContain('Notes from the user about this video: Kubernetes and Postgres')
    // Cut words are still sent: they keep sentences readable.
    expect(section(req, 'Transcript')).toContain('w5 um')
  })

  it('allows spaces only where the original word had one', async () => {
    const words = makeWords(['New York', 'pizza'])
    useFake(() => reply({ fixes: [{ ref: 'w0', text: 'New York City' }, { ref: 'w1', text: 'pizza pie' }] }))
    expect(await fixTranscript(ai, words, '')).toEqual([{ wordId: 'id-0', text: 'New York City' }])
  })

  it('ignores fixes to context lines, which another chunk owns', async () => {
    const fake = useFake((req) => {
      const context = section(req, 'Context before').map((line) => line.split(' ')[0])
      return reply({ fixes: context.length ? [{ ref: context[0], text: 'Changed' }] : [] })
    })
    expect(await fixTranscript(ai, manyWords(700), 'none')).toEqual([])
    expect(fake.sent).toHaveLength(2)
  })
})

describe('translateSentences', () => {
  it('sends short ids, returns the caller’s ids in input order and drops anything unasked', async () => {
    const fake = useFake(() =>
      reply({
        translations: [
          { id: 's1', text: '¿Cómo estás?' },
          { id: 's9', text: 'Fantasma' },
          { id: 's0', text: ' Hola,\n  ¿qué tal? ' },
          { id: 's0', text: 'Duplicado' },
        ],
      }),
    )
    const result = await translateSentences(
      ai,
      [
        { id: 'first', text: 'Hello there.' },
        { id: 'second', text: 'How are you?' },
        { id: 'blank', text: '   ' },
      ],
      'Spanish',
    )

    expect(result).toEqual([
      { id: 'first', text: 'Hola, ¿qué tal?' },
      { id: 'second', text: '¿Cómo estás?' },
    ])
    const [req] = fake.sent
    expect(req.body.system).toContain('into Spanish')
    expect(req.body.output_config?.effort).toBe('low')
    expect(section(req, 'Sentences to translate')).toEqual([
      '{"id":"s0","text":"Hello there."}',
      '{"id":"s1","text":"How are you?"}',
    ])
  })

  it('asks once more for sentences that came back missing', async () => {
    const fake = useFake((req) => {
      const asked = section(req, 'Sentences to translate').map((line) => JSON.parse(line) as { id: string; text: string })
      // The first time round, the last sentence is skipped.
      const answered = fake.sent.length === 1 ? asked.slice(0, -1) : asked
      return reply({ translations: answered.map((x) => ({ id: x.id, text: `ES ${x.text}` })) })
    })
    const result = await translateSentences(
      ai,
      ['One.', 'Two.', 'Three.'].map((text, i) => ({ id: String(i), text })),
      'Spanish',
    )
    expect(result.map((r) => r.text)).toEqual(['ES One.', 'ES Two.', 'ES Three.'])
    expect(fake.sent).toHaveLength(2)
    expect(section(fake.sent[1], 'Sentences to translate')).toEqual(['{"id":"s2","text":"Three."}'])
  })

  it('keeps what was translated if asking again for the gaps fails, but still honours a cancel', async () => {
    const fake = useFake(() => {
      if (fake.sent.length > 1) return apiError(429, 'rate_limit_error', 'Slow down')
      return reply({ translations: [{ id: 's0', text: 'Uno.' }] })
    })
    const sentences = [
      { id: 'a', text: 'One.' },
      { id: 'b', text: 'Two.' },
    ]
    expect(await translateSentences(ai, sentences, 'Spanish')).toEqual([{ id: 'a', text: 'Uno.' }])
    expect(fake.sent).toHaveLength(2)
    expect(section(fake.sent[1], 'Sentences to translate')).toEqual(['{"id":"s1","text":"Two."}'])

    const controller = new AbortController()
    useFake(() => {
      // Cancelled while the first answer was on its way: the retry must not run.
      controller.abort()
      return reply({ translations: [{ id: 's0', text: 'Uno.' }] })
    })
    await expect(translateSentences(ai, sentences, 'Spanish', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('batches long transcripts with a little of what came before', async () => {
    const fake = useFake((req) => {
      const asked = section(req, 'Sentences to translate').map((line) => JSON.parse(line) as { id: string })
      return reply({ translations: asked.map((x) => ({ id: x.id, text: 'traducido' })) })
    })
    const sentences = Array.from({ length: 130 }, (_, i) => ({ id: `n${i}`, text: `Sentence ${i}.` }))
    const result = await translateSentences(ai, sentences, 'Spanish')

    expect(result).toHaveLength(130)
    expect(result[129]).toEqual({ id: 'n129', text: 'traducido' })
    const sizes = fake.sent.map((req) => section(req, 'Sentences to translate').length).sort((a, b) => b - a)
    expect(sizes).toEqual([44, 44, 42])
    const context = fake.sent.map((req) => section(req, 'Earlier in the video, for context only').length).sort()
    expect(context).toEqual([0, 3, 3])
  })

  it('needs a language', async () => {
    const fake = useFake(() => reply({ translations: [] }))
    expect((await failure(translateSentences(ai, [{ id: 'a', text: 'Hi' }], ' '))).kind).toBe('other')
    expect(fake.sent).toHaveLength(0)
  })
})

describe('writeHook', () => {
  it('reads the kept words at medium effort and tidies what comes back', async () => {
    const words = makeWords('I made one thousand dollars um selling cookies.'.split(' '), [5])
    const fake = useFake(() =>
      reply({
        hooks: [
          '"Stop wasting money"',
          'Stop wasting money',
          '  ',
          'x'.repeat(150),
          'The $1,000 cookie',
          'Nobody tells you this',
          'One more angle',
          'And a fifth',
        ],
        caption: '  Made these on a whim.\r\n\r\n\r\n\r\nWho wants the recipe? 🍪  ',
        hashtags: ['#baking', 'cookies', '#Baking', 'side hustle', '#', '##money!', `#${'a'.repeat(60)}`],
      }),
    )
    const result = await writeHook(ai, words)

    expect(result).toEqual({
      hooks: ['Stop wasting money', 'The $1,000 cookie', 'Nobody tells you this', 'One more angle'],
      caption: 'Made these on a whim.\n\nWho wants the recipe? 🍪',
      hashtags: ['#baking', '#cookies', '#sidehustle', '#money'],
    })
    const [req] = fake.sent
    expect(req.body.output_config?.effort).toBe('medium')
    expect(section(req, 'Transcript')).toEqual(['I made one thousand dollars selling cookies.'])
  })

  it('fails as "bad-output" when no hook is usable', async () => {
    useFake(() => reply({ hooks: ['', '   '], caption: 'Hi', hashtags: [] }))
    expect((await failure(writeHook(ai, manyWords(20)))).kind).toBe('bad-output')
  })

  it('needs some speech to work from', async () => {
    const fake = useFake(() => reply({ hooks: ['Hi'], caption: '', hashtags: [] }))
    expect((await failure(writeHook(ai, makeWords(['um'], [0])))).kind).toBe('other')
    expect(fake.sent).toHaveLength(0)
  })
})

describe('findClips', () => {
  /** 40 ten-word sentences, each 5 s long: sentence n runs from 5n to 5n + 4.9 s. */
  function talk(removedSentences: number[] = []): Word[] {
    const words: Word[] = []
    for (let n = 0; n < 40; n++) {
      for (let k = 0; k < 10; k++) {
        const i = n * 10 + k
        words.push({
          id: `id-${i}`,
          text: k === 9 ? `end${n}.` : `t${i}`,
          start: i * 0.5,
          end: i * 0.5 + 0.4,
          ...(removedSentences.includes(n) ? { removed: true } : {}),
        })
      }
    }
    return words
  }

  const clip = (start: string, end: string, score: number, title = `Clip ${start}`) => ({
    start,
    end,
    title,
    reason: 'It lands.',
    score,
  })

  it('maps segment refs to word ids and keeps the best non-overlapping clips that fit the target', async () => {
    const fake = useFake(() =>
      reply({
        clips: [
          clip('s2', 's7', 80, '“The cookie money”'), // 29.9 s
          clip('s5', 's9', 70), // overlaps the one above, which scored higher
          clip('s10', 's11', 90), // 9.9 s: too short
          clip('s12', 's30', 95), // 94.9 s: too long
          clip('s20', 's15', 99), // backwards
          clip('s31', 's35', 150, ''), // 24.9 s, score over 100, no title
          clip('w5', 's99', 99), // not segment refs
          clip('s14', 's19', 65.6), // 29.9 s
          clip('s24', 's29', 30),
          clip('s36', 's39', 20), // 19.9 s: just inside the slack below 20
          clip('s8', 's11', 10), // fine, but a sixth
        ],
      }),
    )
    const result = await findClips(ai, talk(), { min: 20, max: 60 })

    expect(result).toEqual([
      // No title from Claude: the clip's opening line stands in.
      {
        title: 't310 t311 t312 t313 t314 t315 t316 t317 t318 end31.',
        reason: 'It lands.',
        firstWordId: 'id-310',
        lastWordId: 'id-359',
        score: 100,
      },
      { title: 'The cookie money', reason: 'It lands.', firstWordId: 'id-20', lastWordId: 'id-79', score: 80 },
      { title: 'Clip s14', reason: 'It lands.', firstWordId: 'id-140', lastWordId: 'id-199', score: 66 },
      { title: 'Clip s24', reason: 'It lands.', firstWordId: 'id-240', lastWordId: 'id-299', score: 30 },
      { title: 'Clip s36', reason: 'It lands.', firstWordId: 'id-360', lastWordId: 'id-399', score: 20 },
    ])
    const [req] = fake.sent
    expect(req.body.output_config?.effort).toBe('medium')
    expect(req.body.system).toContain('20 to 60 seconds')
    expect(section(req, 'Transcript')[1]).toBe('s1 [5-9.9] t10 t11 t12 t13 t14 t15 t16 t17 t18 end1.')
  })

  it('leaves cut words out of the transcript it sends', async () => {
    const fake = useFake(() => reply({ clips: [clip('s0', 's4', 50)] }))
    const result = await findClips(ai, talk([0]), { min: 20, max: 60 })
    expect(section(fake.sent[0], 'Transcript')[0]).toMatch(/^s0 \[5-9\.9\] t10 /)
    expect(result.map((c) => [c.firstWordId, c.lastWordId])).toEqual([['id-10', 'id-59']])
  })

  it('sends nothing when the whole video is shorter than the shortest clip', async () => {
    const fake = useFake(() => reply({ clips: [] }))
    expect(await findClips(ai, manyWords(10), { min: 20, max: 60 })).toEqual([])
    expect(fake.sent).toHaveLength(0)
  })
})

describe('writeScript', () => {
  it('sends the brief with a word count at medium effort and tidies the script', async () => {
    const fake = useFake(() =>
      reply({ title: '"3 Habits That Stuck"', script: '  Line one.\r\n\r\n\r\nLine two.   \n' }),
    )
    const result = await writeScript(ai, { topic: ' 3 habits ', seconds: 45, tone: 'Funny' })

    expect(result).toEqual({ title: '3 Habits That Stuck', script: 'Line one.\n\nLine two.' })
    const [req] = fake.sent
    expect(req.body.output_config?.effort).toBe('medium')
    expect(userText(req)).toBe('Topic: 3 habits\nTone: Funny\nLength: about 45 seconds read aloud, roughly 113 words.')
  })

  it('works with Haiku 4.5, which takes no effort setting', async () => {
    const fake = useFake(() => reply({ title: 'T', script: 'Say this.' }))
    await writeScript({ ...ai, model: 'claude-haiku-4-5' }, { topic: 'Habits', seconds: 30, tone: '' })
    expect(fake.sent[0].body.output_config).not.toHaveProperty('effort')
    expect(userText(fake.sent[0])).toContain('Tone: Natural and friendly')
  })

  it('fails as "bad-output" on an empty script', async () => {
    useFake(() => reply({ title: 'T', script: ' \n ' }))
    expect((await failure(writeScript(ai, { topic: 'Habits', seconds: 30, tone: 'Calm' }))).kind).toBe('bad-output')
  })

  it('needs a topic', async () => {
    const fake = useFake(() => reply({ title: 'T', script: 'S' }))
    expect((await failure(writeScript(ai, { topic: '  ', seconds: 30, tone: 'Calm' }))).kind).toBe('other')
    expect(fake.sent).toHaveLength(0)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError, ask, checkKey, setClientOptionsForTests, type Effort } from './claude'
import { apiError, fakeFetch, reply, type Responder } from './fake-claude'
import type { AiSettings, ClaudeModel } from './settings'

const settings = (model: ClaudeModel = 'claude-opus-5-5'): AiSettings => ({ apiKey: ' sk-ant-test \n', model })

function useFake(respond: Responder) {
  const fake = fakeFetch(respond)
  setClientOptionsForTests({ fetch: fake.fetch, maxRetries: 0 })
  return fake
}

afterEach(() => {
  setClientOptionsForTests({})
  vi.unstubAllEnvs()
})

const greet = (s: AiSettings, effort: Effort = 'low', signal?: AbortSignal) =>
  ask(s, { effort, system: 'Greet.', user: 'Hello', schema: (z) => z.object({ greeting: z.string() }) }, signal)

async function failure(promise: Promise<unknown>): Promise<AiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AiError)
  return error as AiError
}

describe('requests', () => {
  it.each(['claude-opus-5-5', 'claude-sonnet-5-5'] as const)(
    '%s: adaptive thinking left alone, effort set, server-side fallbacks on',
    async (model) => {
      const fake = useFake(() => reply({ greeting: 'hi' }))
      expect(await greet(settings(model), 'medium')).toEqual({ greeting: 'hi' })

      expect(fake.sent).toHaveLength(1)
      const [req] = fake.sent
      expect(req.body.model).toBe(model)
      expect(req.body.max_tokens).toBe(16000)
      expect(req.body.output_config?.effort).toBe('medium')
      expect(req.body.output_config?.format?.type).toBe('json_schema')
      expect(req.body.output_config?.format?.schema).toMatchObject({
        type: 'object',
        required: ['greeting'],
        additionalProperties: false,
      })
      expect(req.body.fallbacks).toBe('default')
      expect(req.body).not.toHaveProperty('thinking')
      expect(req.headers.get('anthropic-beta')?.split(',')).toContain('server-side-fallback-2026-07-01')
    },
  )

  it('claude-haiku-4-5: no effort, thinking or fallbacks', async () => {
    const fake = useFake(() => reply({ greeting: 'hi' }))
    await greet(settings('claude-haiku-4-5'), 'medium')
    const [req] = fake.sent
    expect(req.body.model).toBe('claude-haiku-4-5')
    expect(req.body.output_config).not.toHaveProperty('effort')
    expect(req.body.output_config?.format?.type).toBe('json_schema')
    expect(req.body).not.toHaveProperty('fallbacks')
    expect(req.body).not.toHaveProperty('thinking')
    expect(req.headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback')
  })

  it('goes straight to the API from the browser with the trimmed key, whatever the environment says', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://elsewhere.example')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'someone-elses-token')
    const fake = useFake(() => reply({ greeting: 'hi' }))
    await greet(settings())
    const [req] = fake.sent
    expect(req.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(req.headers.get('x-api-key')).toBe('sk-ant-test')
    expect(req.headers.get('authorization')).toBeNull()
    expect(req.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
  })

  it('puts the job in the system prompt and the material in a single user turn, with no prefill', async () => {
    const fake = useFake(() => reply({ greeting: 'hi' }))
    await greet(settings())
    const [req] = fake.sent
    expect(req.body.system).toBe('Greet.')
    expect(req.body.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('reads the answer from the text block after any thinking', async () => {
    useFake(() =>
      reply(null, {
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: '{"greeting":"hey","extra":true}' },
        ],
      }),
    )
    expect(await greet(settings())).toEqual({ greeting: 'hey' })
  })
})

describe('errors', () => {
  it.each([
    [401, 'authentication_error', 'auth'],
    [403, 'permission_error', 'auth'],
    [404, 'not_found_error', 'other'],
    [429, 'rate_limit_error', 'rate'],
    [500, 'api_error', 'other'],
    [529, 'overloaded_error', 'other'],
  ] as const)('HTTP %i (%s) is "%s"', async (status, type, kind) => {
    useFake(() => apiError(status, type, 'Nope'))
    const error = await failure(greet(settings()))
    expect(error.kind).toBe(kind)
    expect(error.cause).toBeDefined()
  })

  it('says which key was refused', async () => {
    useFake(() => apiError(401, 'authentication_error', 'invalid x-api-key'))
    expect((await failure(greet(settings()))).message).toBe("That API key wasn't accepted. Check it in Settings.")
  })

  it('names the model a key cannot use', async () => {
    useFake(() => apiError(404, 'not_found_error', 'model: claude-sonnet-5-5'))
    expect((await failure(greet(settings('claude-sonnet-5-5')))).message).toContain('Claude Sonnet 5.5')
  })

  it("passes on the API's own explanation of a bad request, such as running out of credit", async () => {
    useFake(() => apiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'))
    const error = await failure(greet(settings()))
    expect(error.kind).toBe('other')
    expect(error.message).toBe(
      "Claude couldn't take this request: Your credit balance is too low to access the Anthropic API.",
    )
  })

  it('tells the monthly spend cap apart from a rate limit, since waiting will not help', async () => {
    useFake(() =>
      apiError(429, 'rate_limit_error', 'You have reached your API usage limits.', {
        error_code: 'enforced_spend_limit_reached',
      }),
    )
    const error = await failure(greet(settings()))
    expect(error.kind).toBe('rate')
    expect(error.message).toContain('monthly spend limit')

    useFake(() => apiError(429, 'rate_limit_error', 'Number of requests has exceeded your rate limit.'))
    expect((await failure(greet(settings()))).message).toContain('Wait a minute')
  })

  it('a request too large to send is "too-long"', async () => {
    useFake(() => apiError(413, 'request_too_large', 'Request exceeds the maximum allowed number of bytes.'))
    expect((await failure(greet(settings()))).kind).toBe('too-long')
  })

  it('a dropped connection is "offline"', async () => {
    useFake(() => {
      throw new TypeError('Load failed')
    })
    expect((await failure(greet(settings()))).kind).toBe('offline')
  })

  it('a refusal before any output is "refused"', async () => {
    useFake(() => reply(null, { stopReason: 'refusal', content: [] }))
    const error = await failure(greet(settings()))
    expect(error.kind).toBe('refused')
    expect(error.message).toBe('Claude declined this one.')
  })

  it('a refusal partway through is still "refused", not a parse failure', async () => {
    useFake(() => reply(null, { stopReason: 'refusal', text: '{"greet' }))
    expect((await failure(greet(settings()))).kind).toBe('refused')
  })

  it('a reply cut off at max_tokens is "too-long", although its JSON is broken', async () => {
    useFake(() => reply(null, { stopReason: 'max_tokens', text: '{"greeting":"hel' }))
    const error = await failure(greet(settings()))
    expect(error.kind).toBe('too-long')
    expect(error.message).toContain('shorter video')
  })

  it('JSON that does not parse is "bad-output"', async () => {
    useFake(() => reply(null, { text: 'Sure! Here you go: {greeting: hi}' }))
    const error = await failure(greet(settings()))
    expect(error.kind).toBe('bad-output')
    expect(error.cause).toBeDefined()
  })

  it('JSON in the wrong shape is "bad-output"', async () => {
    useFake(() => reply({ greeting: 42 }))
    expect((await failure(greet(settings()))).kind).toBe('bad-output')
  })

  it('no key is "auth", and nothing is sent', async () => {
    const fake = useFake(() => reply({ greeting: 'hi' }))
    const error = await failure(greet({ apiKey: '   ', model: 'claude-opus-5-5' }))
    expect(error.kind).toBe('auth')
    expect(fake.sent).toHaveLength(0)
  })
})

describe('cancelling', () => {
  it('rejects with an AbortError, like fetch', async () => {
    const fake = useFake(
      (_req, signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const controller = new AbortController()
    const pending = greet(settings(), 'low', controller.signal)
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(pending).rejects.not.toBeInstanceOf(AiError)
  })

  it('sends nothing once already cancelled', async () => {
    const fake = useFake(() => reply({ greeting: 'hi' }))
    const controller = new AbortController()
    controller.abort()
    await expect(greet(settings(), 'low', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fake.sent).toHaveLength(0)
  })
})

describe('checkKey', () => {
  it('sends one tiny request shaped like the real ones', async () => {
    const fake = useFake(() => reply(null, { stopReason: 'max_tokens', content: [{ type: 'text', text: 'H' }] }))
    await expect(checkKey(settings('claude-sonnet-5-5'))).resolves.toBeUndefined()
    expect(fake.sent).toHaveLength(1)
    const [req] = fake.sent
    expect(req.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(req.body.model).toBe('claude-sonnet-5-5')
    expect(req.body.max_tokens).toBe(1)
    expect(req.body.output_config).toEqual({ effort: 'low' })
    expect(req.body.fallbacks).toBe('default')
    expect(req.body).not.toHaveProperty('thinking')
    expect(req.headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01')
  })

  it('leaves out effort and fallbacks for Haiku 4.5', async () => {
    const fake = useFake(() => reply(null, { content: [{ type: 'text', text: 'Hi' }] }))
    await checkKey(settings('claude-haiku-4-5'))
    const [req] = fake.sent
    expect(req.body).not.toHaveProperty('output_config')
    expect(req.body).not.toHaveProperty('fallbacks')
    expect(req.headers.get('anthropic-beta')).toBeNull()
  })

  it('is satisfied by any answer, even a refusal: the key still worked', async () => {
    useFake(() => reply(null, { stopReason: 'refusal', content: [] }))
    await expect(checkKey(settings())).resolves.toBeUndefined()
  })

  it('reports a rejected key as "auth"', async () => {
    useFake(() => apiError(401, 'authentication_error', 'invalid x-api-key'))
    expect((await failure(checkKey(settings()))).kind).toBe('auth')
  })

  it('needs a key before it sends anything', async () => {
    const fake = useFake(() => reply(null))
    expect((await failure(checkKey({ apiKey: '', model: 'claude-opus-5-5' }))).kind).toBe('auth')
    expect(fake.sent).toHaveLength(0)
  })
})

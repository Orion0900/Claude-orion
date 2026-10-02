/**
 * Requests to Claude, sent straight from the phone with the user's own API
 * key.
 *
 * The SDK and zod load on first use, so the editor stays quick to open for
 * everyone who never turns the AI features on.
 */
import type Anthropic from '@anthropic-ai/sdk'
import type * as Z from 'zod/v4'
import { CLAUDE_MODELS, hasAi, type AiSettings, type ClaudeModel } from './settings'

export type AiErrorKind = 'auth' | 'rate' | 'offline' | 'refused' | 'too-long' | 'bad-output' | 'other'

/** Something that stopped an AI feature. The message is written for the user. */
export class AiError extends Error {
  kind: AiErrorKind

  constructor(kind: AiErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AiError'
    this.kind = kind
  }
}

/** How much Claude thinks first: low for mechanical jobs, medium for creative ones. */
export type Effort = 'low' | 'medium'

interface ModelTraits {
  /** Thinks adaptively, steered by output_config.effort. Haiku 4.5 rejects effort. */
  effort: boolean
  /** Can hand a refused request to another model on the server. */
  fallbacks: boolean
}

const TRAITS: Record<ClaudeModel, ModelTraits> = {
  'claude-opus-5-5': { effort: true, fallbacks: true },
  'claude-sonnet-5-5': { effort: true, fallbacks: true },
  'claude-haiku-4-5': { effort: false, fallbacks: false },
}

/** Room for thinking plus the answer, while staying a plain, non-streaming request. */
const MAX_TOKENS = 16000

const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** The parts of a request that depend on the model. */
function modelParams(model: ClaudeModel, effort: Effort) {
  const traits = TRAITS[model]
  return {
    effort: traits.effort ? effort : undefined,
    // A safety classifier can misfire on an ordinary video. With 'default' the
    // API retries on the model it recommends for that kind of refusal, in the
    // same call, instead of failing.
    fallback: traits.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : undefined,
  }
}

interface ClientOverrides {
  fetch?: typeof fetch
  maxRetries?: number
}

let overrides: ClientOverrides = {}

/** Test seam: answer requests from a fake fetch instead of the network. */
export function setClientOptionsForTests(next: ClientOverrides): void {
  overrides = next
}

type Sdk = typeof import('@anthropic-ai/sdk')

async function load<T>(module: () => Promise<T>): Promise<T> {
  try {
    return await module()
  } catch (e) {
    // The code is fetched on first use, so this fails when the phone is
    // offline and hasn't cached it yet.
    throw new AiError('offline', "Couldn't load the AI tools. Check your connection and try again.", { cause: e })
  }
}

function makeClient(sdk: Sdk, s: AiSettings): Anthropic {
  return new sdk.default({
    apiKey: s.apiKey.trim(),
    // Pinned, so nothing in a build or test environment can redirect the
    // key or add other credentials.
    authToken: null,
    baseURL: 'https://api.anthropic.com',
    // The key is the user's own and stays on their phone, so calling the API
    // from the browser exposes it to no one else.
    dangerouslyAllowBrowser: true,
    ...overrides,
  })
}

function requireKey(s: AiSettings): void {
  if (!hasAi(s)) throw new AiError('auth', 'Add your Anthropic API key in Settings to use this.')
}

/** Rejects like fetch does when the user cancels. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError')
}

/**
 * Sends the smallest real request with the chosen model: it proves the key,
 * the model, the account's credit and the route from the browser all at
 * once, for a tiny fraction of a cent. Throws an AiError when any of them is
 * wrong.
 */
export async function checkKey(s: AiSettings, signal?: AbortSignal): Promise<void> {
  requireKey(s)
  throwIfAborted(signal)
  const sdk = await load(() => import('@anthropic-ai/sdk'))
  throwIfAborted(signal)
  const { effort, fallback } = modelParams(s.model, 'low')
  try {
    await makeClient(sdk, s).beta.messages.create(
      {
        model: s.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
        ...(effort ? { output_config: { effort } } : {}),
        ...fallback,
      },
      { signal },
    )
  } catch (e) {
    throw explain(e, sdk, s, signal)
  }
}

export interface AskRequest<S extends Z.ZodType> {
  effort: Effort
  /** The role and the job. */
  system: string
  /** The material to work on. */
  user: string
  /** The shape of the answer, built once zod has loaded. */
  schema: (z: typeof Z) => S
}

/** One request whose answer comes back as JSON checked against `schema`. */
export async function ask<S extends Z.ZodType>(
  s: AiSettings,
  req: AskRequest<S>,
  signal?: AbortSignal,
): Promise<Z.infer<S>> {
  requireKey(s)
  throwIfAborted(signal)
  const [sdk, helpers, z] = await Promise.all([
    load(() => import('@anthropic-ai/sdk')),
    load(() => import('@anthropic-ai/sdk/helpers/beta/zod')),
    load(() => import('zod/v4')),
  ])
  throwIfAborted(signal)

  const strict = helpers.betaZodOutputFormat(req.schema(z))
  let parseError: unknown = null
  const format = {
    ...strict,
    // The SDK throws on a reply that doesn't parse, and a reply cut off at
    // max_tokens or stopped by a refusal never does. Returning null lets the
    // stop reason say what actually happened.
    parse(text: string): Z.infer<S> | null {
      try {
        return strict.parse(text)
      } catch (e) {
        parseError = e
        return null
      }
    },
  }

  const { effort, fallback } = modelParams(s.model, req.effort)
  let message
  try {
    message = await makeClient(sdk, s).beta.messages.parse(
      {
        model: s.model,
        max_tokens: MAX_TOKENS,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        output_config: effort ? { effort, format } : { format },
        ...fallback,
      },
      { signal },
    )
  } catch (e) {
    throw explain(e, sdk, s, signal)
  }

  switch (message.stop_reason) {
    case 'refusal':
      throw new AiError('refused', 'Claude declined this one.')
    case 'max_tokens':
    case 'model_context_window_exceeded':
      throw new AiError('too-long', 'That was too much for Claude to finish in one go. Try a shorter video.')
  }
  const output = message.parsed_output
  if (output == null) {
    throw new AiError('bad-output', "Claude's answer came back in the wrong shape. Try again.", { cause: parseError })
  }
  return output
}

/** Says what went wrong in the user's terms, or rejects like fetch does if they cancelled. */
function explain(e: unknown, sdk: Sdk, s: AiSettings, signal?: AbortSignal): Error {
  if (e instanceof AiError) return e
  if (signal?.aborted || e instanceof sdk.APIUserAbortError) {
    return new DOMException('The request was cancelled.', 'AbortError')
  }
  const cause = { cause: e }
  if (e instanceof sdk.AuthenticationError) {
    return new AiError('auth', "That API key wasn't accepted. Check it in Settings.", cause)
  }
  if (e instanceof sdk.PermissionDeniedError) {
    return new AiError('auth', "That API key isn't allowed to do this. Check it in Settings.", cause)
  }
  if (e instanceof sdk.NotFoundError) {
    const label = CLAUDE_MODELS.find((m) => m.id === s.model)?.label ?? s.model
    return new AiError('other', `This API key can't use ${label}. Pick another model in Settings.`, cause)
  }
  if (e instanceof sdk.RateLimitError) {
    return new AiError('rate', "You've hit this API key's rate limit. Wait a minute and try again.", cause)
  }
  if (e instanceof sdk.APIConnectionTimeoutError) {
    return new AiError('offline', 'Claude took too long to answer. Check your connection and try again.', cause)
  }
  if (e instanceof sdk.APIConnectionError) {
    return new AiError('offline', "Couldn't reach Claude. Check your connection and try again.", cause)
  }
  if (e instanceof sdk.InternalServerError) {
    return new AiError('other', 'Claude is busy or having trouble right now. Try again in a minute.', cause)
  }
  if (e instanceof sdk.BadRequestError) {
    return new AiError('other', `Claude couldn't take this request: ${apiMessage(e)}`, cause)
  }
  if (e instanceof sdk.APIError) {
    return new AiError('other', `Claude returned an error: ${apiMessage(e)}`, cause)
  }
  return new AiError('other', 'Something went wrong while talking to Claude.', cause)
}

/** The API's own explanation, such as the account being out of credit. */
function apiMessage(e: InstanceType<Sdk['APIError']>): string {
  const body = e.error as { error?: { message?: unknown } } | undefined
  const message = body?.error?.message
  return typeof message === 'string' && message ? message : `status ${e.status ?? 'unknown'}`
}

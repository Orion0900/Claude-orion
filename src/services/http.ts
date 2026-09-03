/**
 * Shared client for the public OSM services. They are all fair-use endpoints,
 * so requests are serialised per host with a minimum gap between them and a
 * short retry on transient failures.
 */

interface QueueState {
  chain: Promise<unknown>
  lastStart: number
}

const queues = new Map<string, QueueState>()

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface FetchJsonOptions {
  signal?: AbortSignal
  /** Minimum milliseconds between requests to the same host. */
  minGapMs?: number
  timeoutMs?: number
  retries?: number
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const host = hostOf(url)
  const minGap = options.minGapMs ?? 250
  const state = queues.get(host) ?? { chain: Promise.resolve(), lastStart: 0 }

  const run = state.chain.then(async () => {
    const sinceLast = Date.now() - state.lastStart
    if (sinceLast < minGap) await wait(minGap - sinceLast)
    state.lastStart = Date.now()
    return attempt(url, options)
  })

  // Keep the chain alive even when this request rejects, or the whole host
  // queue would poison every request behind it.
  queues.set(host, { ...state, chain: run.catch(() => undefined) })
  return run as Promise<T>
}

async function attempt<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const retries = options.retries ?? 2
  const timeoutMs = options.timeoutMs ?? 15000
  let lastError: unknown

  for (let i = 0; i <= retries; i++) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onAbort = () => controller.abort()
    options.signal?.addEventListener('abort', onAbort)

    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new HttpError(`Request failed (${response.status}) for ${hostOf(url)}`, response.status)
      }
      return (await response.json()) as T
    } catch (error) {
      lastError = error
      if (options.signal?.aborted) throw error
      // 4xx other than rate limiting won't fix themselves.
      if (error instanceof HttpError && error.status && error.status < 500 && error.status !== 429) {
        throw error
      }
      if (i < retries) await wait(400 * 2 ** i)
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError(String(lastError))
}

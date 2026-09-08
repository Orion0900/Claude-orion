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
  /** GET unless a body is sent. */
  method?: 'GET' | 'POST'
  /** JSON body for a POST. */
  body?: string
  /** Minimum milliseconds between requests to the same host. */
  minGapMs?: number
  timeoutMs?: number
  retries?: number
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const host = hostOf(url)
  const minGap = options.minGapMs ?? 250

  // One state object per host, kept in the map and mutated in place. Storing a
  // copy instead would freeze `lastStart` at whatever it was when the request
  // was queued — which is before the request has run — so every later request
  // would compare against a stale time and the gap would never be honoured.
  let state = queues.get(host)
  if (!state) {
    state = { chain: Promise.resolve(), lastStart: 0 }
    queues.set(host, state)
  }
  const entry = state

  const run = entry.chain.then(async () => {
    const sinceLast = Date.now() - entry.lastStart
    if (sinceLast < minGap) await wait(minGap - sinceLast)
    entry.lastStart = Date.now()
    return attempt(url, options)
  })

  // Keep the chain alive even when this request rejects, or the whole host
  // queue would poison every request behind it.
  entry.chain = run.catch(() => undefined)
  return run as Promise<T>
}

/** A request that ran out of time. Retryable, and never a user cancellation. */
export const TIMEOUT_STATUS = 408

async function attempt<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const retries = options.retries ?? 2
  const timeoutMs = options.timeoutMs ?? 15000
  let lastError: unknown

  for (let i = 0; i <= retries; i++) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const controller = new AbortController()
    // Our own deadline aborts the same way a caller does, so without this flag
    // a slow network would be indistinguishable from the rider walking away —
    // and callers quite rightly say nothing at all when someone cancels.
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const onAbort = () => controller.abort()
    options.signal?.addEventListener('abort', onAbort)

    try {
      const response = await fetch(
        url,
        options.body === undefined
          ? { signal: controller.signal }
          : {
              signal: controller.signal,
              method: options.method ?? 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: options.body,
            },
      )
      if (!response.ok) {
        throw new HttpError(`Request failed (${response.status}) for ${hostOf(url)}`, response.status)
      }
      return (await response.json()) as T
    } catch (error) {
      if (options.signal?.aborted) throw error
      const failure = timedOut
        ? new HttpError(`Timed out after ${timeoutMs} ms for ${hostOf(url)}`, TIMEOUT_STATUS)
        : error
      lastError = failure
      // 4xx other than rate limiting and our own deadline won't fix themselves.
      if (
        failure instanceof HttpError &&
        failure.status &&
        failure.status < 500 &&
        failure.status !== 429 &&
        failure.status !== TIMEOUT_STATUS
      ) {
        throw failure
      }
      if (i < retries) await wait(400 * 2 ** i)
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError(String(lastError))
}

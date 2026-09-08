/**
 * The one place a request is made.
 *
 * Sources are third-party endpoints of varying quality — a feed, someone's
 * bridge worker, the Upwork API — so every call gets a timeout, a couple of
 * retries on the failures that are worth retrying, and an error message that
 * names the host instead of saying "Failed to fetch".
 */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface RequestOptions {
  signal?: AbortSignal
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  retries?: number
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export async function requestText(url: string, options: RequestOptions = {}): Promise<string> {
  const retries = options.retries ?? 2
  const timeoutMs = options.timeoutMs ?? 20_000
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onAbort = () => controller.abort()
    options.signal?.addEventListener('abort', onAbort)

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      })
      const text = await response.text()
      if (!response.ok) {
        throw new HttpError(`${hostOf(url)} said ${response.status}`, response.status, text.slice(0, 400))
      }
      return text
    } catch (error) {
      lastError = error
      if (options.signal?.aborted) throw error
      // A 4xx that isn't rate limiting won't fix itself on a retry.
      if (error instanceof HttpError && error.status && error.status < 500 && error.status !== 429) throw error
      if (attempt < retries) await wait(500 * 2 ** attempt)
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }

  if (lastError instanceof Error && lastError.name === 'AbortError') {
    throw new HttpError(`${hostOf(url)} took too long to answer`)
  }
  // A browser reports a blocked cross-origin request as an opaque TypeError,
  // which is by far the most common way a feed URL fails here.
  throw new HttpError(
    `Couldn't reach ${hostOf(url)}. If it isn't a bridge you control, the browser will block it — see the Sources help.`,
  )
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const text = await requestText(url, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  })
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(`${hostOf(url)} didn't return JSON`)
  }
}

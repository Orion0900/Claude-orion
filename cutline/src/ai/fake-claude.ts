/**
 * Test helpers: a stand-in for the Claude API. The fetch records every
 * request and answers with canned Messages API responses, so tests never
 * touch the network.
 */

export interface SentRequest {
  url: string
  headers: Headers
  body: {
    model: string
    max_tokens: number
    system?: string
    messages: { role: string; content: string }[]
    output_config?: { effort?: string; format?: { type: string; schema: Record<string, unknown> } }
    fallbacks?: unknown
    thinking?: unknown
  }
}

export type Responder = (req: SentRequest, signal: AbortSignal | null | undefined) => Response | Promise<Response>

export function fakeFetch(respond: Responder) {
  const sent: SentRequest[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req: SentRequest = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')),
    }
    sent.push(req)
    return respond(req, init?.signal)
  }
  return { fetch: fetch as typeof globalThis.fetch, sent }
}

/** A finished reply carrying `output` as its structured JSON. */
export function reply(
  output: unknown,
  options: { stopReason?: string; text?: string; content?: unknown[] } = {},
): Response {
  return json(200, {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: options.content ?? [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: options.text ?? JSON.stringify(output) },
    ],
    stop_reason: options.stopReason ?? 'end_turn',
    stop_sequence: null,
    stop_details: options.stopReason === 'refusal' ? { type: 'refusal', category: 'cyber', explanation: null } : null,
    usage: { input_tokens: 120, output_tokens: 40 },
  })
}

export function apiError(status: number, type: string, message: string): Response {
  return json(status, { type: 'error', error: { type, message }, request_id: 'req_test' })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
  })
}

/** The user message's lines in one section, e.g. "Transcript" or "Context before". */
export function section(req: SentRequest, name: string): string[] {
  const text = req.body.messages[0].content
  const start = text.indexOf(`${name}:\n`)
  if (start < 0) return []
  const rest = text.slice(start + name.length + 2)
  const end = rest.indexOf('\n\n')
  return (end < 0 ? rest : rest.slice(0, end)).split('\n')
}

/** The refs a word-by-word request asks about, leaving out context lines. */
export function transcriptRefs(req: SentRequest): string[] {
  return section(req, 'Transcript').map((line) => line.split(' ')[0])
}

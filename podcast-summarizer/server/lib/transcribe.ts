/**
 * Getting words out of audio. Three sources, tried in order of cost:
 *
 *   1. A transcript the publisher already ships in the feed (Podcasting 2.0
 *      <podcast:transcript>). Free and instant.
 *   2. AssemblyAI, which transcribes straight from the audio URL — no download,
 *      no size limit, and it returns paragraph timestamps.
 *   3. OpenAI Whisper, which needs the file uploaded (25 MB cap, so long
 *      episodes are chunked with ffmpeg when it is installed).
 *
 * Every path ends in the same shape: timed segments.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TranscriptRef } from './feeds.js'
import { formatTimestamp } from './text.js'

type Fetch = typeof fetch

export interface Segment {
  /** seconds */
  start: number
  end?: number
  text: string
  speaker?: string
}

export interface Transcript {
  source: 'feed' | 'assemblyai' | 'openai' | 'manual'
  language?: string
  segments: Segment[]
}

// ---------------------------------------------------------------------------
// Parsing transcript files

function parseClock(s: string): number {
  // 01:02:03,456  |  01:02:03.456  |  02:03.456
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/)
  if (!m) return NaN
  const [, h, min, sec, ms] = m
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(sec) + Number((ms ?? '0').padEnd(3, '0')) / 1000
}

export function parseSrtOrVtt(text: string): Segment[] {
  const segments: Segment[] = []
  const blocks = text.replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n/, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    const timeIdx = lines.findIndex((l) => l.includes('-->'))
    if (timeIdx === -1) continue
    const [startRaw, endRaw] = lines[timeIdx].split('-->')
    const start = parseClock(startRaw.trim().split(' ')[0])
    const end = parseClock(endRaw.trim().split(' ')[0])
    if (Number.isNaN(start)) continue
    const body = lines
      .slice(timeIdx + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!body) continue
    const speakerMatch = body.match(/^([A-Z][\w .'-]{0,40}):\s+(.*)$/)
    segments.push(
      speakerMatch
        ? { start, end: Number.isNaN(end) ? undefined : end, speaker: speakerMatch[1], text: speakerMatch[2] }
        : { start, end: Number.isNaN(end) ? undefined : end, text: body },
    )
  }
  return segments
}

/** Podcasting 2.0 JSON transcript: { segments: [{startTime, endTime, speaker, body}] } */
export function parseJsonTranscript(text: string): Segment[] {
  const json = JSON.parse(text) as { segments?: { startTime?: number; endTime?: number; speaker?: string; body?: string }[] }
  return (json.segments ?? [])
    .filter((s) => s.body && s.body.trim())
    .map((s) => ({ start: Number(s.startTime ?? 0), end: s.endTime, speaker: s.speaker, text: (s.body as string).trim() }))
}

export function parseTranscriptFile(text: string, type?: string, url?: string): Segment[] {
  const t = (type ?? '').toLowerCase()
  const u = (url ?? '').toLowerCase()
  if (t.includes('json') || u.endsWith('.json')) return parseJsonTranscript(text)
  if (t.includes('subrip') || t.includes('vtt') || t.includes('srt') || u.endsWith('.srt') || u.endsWith('.vtt') || text.includes('-->')) {
    return parseSrtOrVtt(text)
  }
  // Plain text or HTML: one segment, no timing.
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain ? [{ start: 0, text: plain }] : []
}

/** Prefer formats with timing; JSON and SRT/VTT carry it, HTML/text do not. */
function transcriptPreference(t: TranscriptRef): number {
  const type = (t.type ?? '').toLowerCase()
  if (type.includes('json')) return 0
  if (type.includes('vtt') || type.includes('subrip') || type.includes('srt')) return 1
  if (type.includes('text/plain')) return 2
  return 3
}

export async function fetchFeedTranscript(refs: TranscriptRef[], fetchImpl: Fetch = fetch): Promise<Transcript | undefined> {
  const ordered = [...refs].sort((a, b) => transcriptPreference(a) - transcriptPreference(b))
  for (const ref of ordered) {
    try {
      const res = await fetchImpl(ref.url)
      if (!res.ok) continue
      const segments = parseTranscriptFile(await res.text(), ref.type, ref.url)
      // A transcript with fewer than a few hundred words is a teaser, not the episode.
      if (wordCount(segments) < 300) continue
      return { source: 'feed', language: ref.language, segments }
    } catch {
      /* try the next one */
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// AssemblyAI

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

export async function transcribeWithAssemblyAI(
  audioUrl: string,
  apiKey: string,
  opts: { fetch?: Fetch; onProgress?: (msg: string) => void } = {},
): Promise<Transcript> {
  const fetchImpl = opts.fetch ?? fetch
  const headers = { authorization: apiKey, 'content-type': 'application/json' }
  const create = await fetchImpl('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers,
    body: JSON.stringify({ audio_url: audioUrl, speaker_labels: true, language_detection: true }),
  })
  if (!create.ok) throw new Error(`AssemblyAI rejected the job (${create.status}): ${await create.text()}`)
  const { id } = (await create.json()) as { id: string }

  for (let attempt = 0; ; attempt++) {
    await sleep(Math.min(3000 + attempt * 1000, 10_000))
    const res = await fetchImpl(`https://api.assemblyai.com/v2/transcript/${id}`, { headers })
    if (!res.ok) throw new Error(`AssemblyAI status check failed (${res.status})`)
    const body = (await res.json()) as {
      status: string
      error?: string
      language_code?: string
      text?: string
      utterances?: { start: number; end: number; text: string; speaker: string }[]
    }
    if (body.status === 'error') throw new Error(`AssemblyAI failed: ${body.error}`)
    if (body.status === 'completed') {
      const segments: Segment[] = (body.utterances ?? []).map((u) => ({
        start: u.start / 1000,
        end: u.end / 1000,
        text: u.text,
        speaker: `Speaker ${u.speaker}`,
      }))
      if (segments.length === 0 && body.text) segments.push({ start: 0, text: body.text })
      return { source: 'assemblyai', language: body.language_code, segments }
    }
    opts.onProgress?.(`Transcribing (${body.status})…`)
  }
}

// ---------------------------------------------------------------------------
// OpenAI Whisper

const OPENAI_LIMIT_BYTES = 25 * 1024 * 1024

async function run(cmd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`))))
  })
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version'])
    return true
  } catch {
    return false
  }
}

async function whisperChunk(file: string, apiKey: string, model: string, fetchImpl: Fetch): Promise<{ segments: Segment[]; language?: string }> {
  const form = new FormData()
  form.append('file', new Blob([await readFile(file)]), 'audio.mp3')
  form.append('model', model)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  const res = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) throw new Error(`OpenAI transcription failed (${res.status}): ${await res.text()}`)
  const json = (await res.json()) as { language?: string; text?: string; segments?: { start: number; end: number; text: string }[] }
  const segments: Segment[] = (json.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
  if (segments.length === 0 && json.text) segments.push({ start: 0, text: json.text })
  return { segments, language: json.language }
}

export async function transcribeWithOpenAI(
  audioUrl: string,
  apiKey: string,
  opts: { fetch?: Fetch; model?: string; onProgress?: (msg: string) => void } = {},
): Promise<Transcript> {
  const fetchImpl = opts.fetch ?? fetch
  const model = opts.model ?? 'whisper-1'
  const dir = await mkdtemp(join(tmpdir(), 'podcast-'))
  try {
    opts.onProgress?.('Downloading audio…')
    const res = await fetchImpl(audioUrl, { redirect: 'follow' })
    if (!res.ok) throw new Error(`Audio download failed (${res.status})`)
    const source = join(dir, 'source.mp3')
    await writeFile(source, Buffer.from(await res.arrayBuffer()))
    const size = (await stat(source)).size

    let files = [source]
    let chunkSeconds = 0
    if (size > OPENAI_LIMIT_BYTES) {
      if (!(await hasFfmpeg())) {
        throw new Error(
          `The audio is ${(size / 1_048_576).toFixed(0)} MB, over OpenAI's 25 MB limit, and ffmpeg is not installed to split it. Install ffmpeg or set ASSEMBLYAI_API_KEY.`,
        )
      }
      opts.onProgress?.('Splitting audio for upload…')
      // Re-encode to 48 kbps mono: ~20 MB per hour, well under the cap per 10-minute piece.
      chunkSeconds = 600
      await run('ffmpeg', ['-y', '-i', source, '-vn', '-ac', '1', '-b:a', '48k', '-f', 'segment', '-segment_time', String(chunkSeconds), join(dir, 'part-%03d.mp3')])
      files = (await readdir(dir)).filter((f) => f.startsWith('part-')).sort().map((f) => join(dir, f))
    }

    const segments: Segment[] = []
    let language: string | undefined
    for (let i = 0; i < files.length; i++) {
      opts.onProgress?.(files.length > 1 ? `Transcribing part ${i + 1} of ${files.length}…` : 'Transcribing…')
      const part = await whisperChunk(files[i], apiKey, model, fetchImpl)
      language ??= part.language
      const offset = i * chunkSeconds
      for (const s of part.segments) segments.push({ ...s, start: s.start + offset, end: s.end === undefined ? undefined : s.end + offset })
    }
    return { source: 'openai', language, segments }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Rendering for the model

export function wordCount(segments: Segment[]): number {
  return segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0)
}

/**
 * Turn segments into timestamped paragraphs. Short caption-style segments are
 * merged so the model reads prose, not subtitles, while a `[m:ss]` marker
 * every paragraph lets it cite where in the episode a point was made.
 */
export function renderTranscript(segments: Segment[], paragraphSeconds = 45): string {
  const lines: string[] = []
  let current: { start: number; speaker?: string; parts: string[] } | undefined
  const flush = () => {
    if (!current) return
    const who = current.speaker ? `${current.speaker}: ` : ''
    lines.push(`[${formatTimestamp(current.start)}] ${who}${current.parts.join(' ')}`)
    current = undefined
  }
  for (const s of segments) {
    const speakerChanged = current && s.speaker !== current.speaker
    const tooLong = current && s.start - current.start >= paragraphSeconds
    if (!current || speakerChanged || tooLong) {
      flush()
      current = { start: s.start, speaker: s.speaker, parts: [] }
    }
    current!.parts.push(s.text.trim())
  }
  flush()
  return lines.join('\n\n')
}

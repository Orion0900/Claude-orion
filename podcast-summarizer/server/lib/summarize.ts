/**
 * The summary itself, produced by Claude from the timestamped transcript.
 *
 * One structured-output request: the transcript of even a three-hour episode
 * fits comfortably in context, and asking for the whole summary at once gives
 * the model the full arc of the conversation to draw the key points from.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod/v4'

export const DEFAULT_MODEL = 'claude-haiku-4-5'

/** `output_config.effort` exists on Opus 4.5+ / Sonnet 4.6+ / Fable; Haiku and older models reject it. */
export function supportsEffort(model: string): boolean {
  return !/haiku|claude-3|sonnet-4-5|opus-4-[01]\b/.test(model)
}

/** Server-side refusal fallbacks are a Fable / Opus 5 feature. */
export function supportsFallbacks(model: string): boolean {
  return /fable|mythos|opus-5/.test(model)
}

const TimestampedPoint = z.object({
  point: z.string().describe('One key point, stated as a complete sentence the listener could act on or repeat.'),
  detail: z.string().describe('One or two sentences of supporting detail, evidence or reasoning from the episode.'),
  timestamp: z.string().describe('Where in the episode this is discussed, as m:ss or h:mm:ss, taken from the transcript markers.'),
})

const Chapter = z.object({
  title: z.string().describe('Short chapter title.'),
  start: z.string().describe('Start timestamp as m:ss or h:mm:ss.'),
  summary: z.string().describe('Two to four sentences covering what is discussed in this stretch.'),
})

const Quote = z.object({
  text: z.string().describe('The quote, verbatim or very close to it.'),
  speaker: z.string().describe('Who said it, or "Host"/"Guest" if names are unknown.'),
  timestamp: z.string(),
})

export const SummarySchema = z.object({
  tldr: z.string().describe('The episode in two or three sentences.'),
  key_points: z.array(TimestampedPoint).describe('Every substantive point made in the episode, in the order discussed. Aim for completeness: a long episode may have 15-30.'),
  chapters: z.array(Chapter).describe('The episode broken into 4-12 topical chapters.'),
  quotes: z.array(Quote).describe('Up to 8 of the most memorable or quotable lines.'),
  action_items: z.array(z.string()).describe('Concrete things the listener is encouraged to do, try, read or watch. Empty if none.'),
  mentions: z.array(z.string()).describe('People, books, papers, products, companies and other named things mentioned, each with a few words of context.'),
  people: z.array(z.string()).describe('Hosts and guests, with their roles if stated.'),
})

export type Summary = z.infer<typeof SummarySchema>

export interface SummarizeInput {
  showName?: string
  episodeTitle: string
  description?: string
  transcript: string
}

const SYSTEM = `You write structured briefings of podcast episodes for someone who wants everything of substance from the episode without listening to it.

You are given a transcript with [m:ss] timestamp markers at the start of each paragraph. Read the whole thing before writing.

Standards:
- Be complete. Pull out every real point, claim, recommendation, story with a lesson, and disagreement. Do not collapse a two-hour conversation into five bullets.
- Be faithful. Attribute claims to who made them; do not add facts that are not in the transcript. If the hosts are uncertain, say so.
- Be specific. Numbers, names, and mechanisms beat generalities. "Sleep 7-9 hours; below 6 hours, glucose regulation drops measurably" beats "sleep is important".
- Cite timestamps from the markers nearest the discussion. Every key point, chapter and quote carries one.
- Skip ads, sponsor reads, housekeeping and intros unless they contain something the listener would want.
- Write in plain, direct prose. No filler, no hedging about the summary itself.`

export interface Summarizer {
  summarize(input: SummarizeInput, onProgress?: (msg: string) => void): Promise<{ summary: Summary; model: string; usage: { input: number; output: number } }>
}

export function createSummarizer(opts: { apiKey?: string; model?: string } = {}): Summarizer {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {})
  const model = opts.model ?? DEFAULT_MODEL
  return {
    async summarize(input, onProgress) {
      const header = [
        input.showName ? `Show: ${input.showName}` : undefined,
        `Episode: ${input.episodeTitle}`,
        input.description ? `Show notes:\n${input.description}` : undefined,
      ]
        .filter(Boolean)
        .join('\n')

      onProgress?.('Reading the transcript…')
      const stream = client.beta.messages.stream({
        model,
        max_tokens: 32000,
        ...(supportsFallbacks(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `${header}\n\nTranscript:\n\n${input.transcript}\n\nProduce the structured briefing for this episode.`,
          },
        ],
        output_config: { ...(supportsEffort(model) ? { effort: 'high' as const } : {}), format: betaZodOutputFormat(SummarySchema) },
      })
      stream.on('text', () => onProgress?.('Writing the summary…'))
      const message = await stream.finalMessage()
      if (message.stop_reason === 'refusal') {
        throw new Error(`Claude declined to summarize this episode${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : '.'}`)
      }
      if (message.stop_reason === 'max_tokens') throw new Error('The summary ran past the output limit; try again.')
      if (!message.parsed_output) throw new Error('Claude returned a summary that did not match the expected shape.')
      return {
        summary: message.parsed_output,
        model: message.model,
        usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      }
    },
  }
}

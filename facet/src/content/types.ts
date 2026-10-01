import type { GroupId } from '../face/metrics/types'
import type { Sex } from '../face/types'

/** What kind of step a piece of advice is. Clinical items are shown apart, as information only. */
export type AdviceKind = 'style' | 'grooming' | 'makeup' | 'habits' | 'clinical'

export interface Advice {
  kind: AdviceKind
  text: string
  /** Show only when comparing against this sex's ideals. */
  only?: Sex
}

/** What one result means, keyed by the metric's result key ("ideal", "low", "lower-long"…). */
export interface Outcome {
  /** A short verdict chip, 1–4 words: "Ideal", "Slightly wide-set". */
  verdict: string
  /** One to three sentences on what this result means for how the face reads. */
  meaning: string
  advice: Advice[]
}

export interface MetricText {
  title: string
  /** One plain line: what is measured, between which points. */
  measures: string
  /** Why it matters and where the ideal comes from, 1–3 sentences. */
  why: string
  /** A caveat worth reading before taking the number to heart (ethnic variation, expression…). */
  note?: string
  outcomes: Record<string, Outcome>
}

export interface GroupText {
  title: string
  intro: string
}

export interface ShapeText {
  name: string
  /** Two or three sentences describing the shape's proportions. */
  description: string
  hair: Record<Sex, string[]>
  glasses: string[]
  /** Facial hair, for the male comparison. */
  beard: string[]
  /** Contouring and brow ideas. */
  makeup: string[]
}

export interface FindingText {
  title: string
  /** Sentence for the finding, given the formatted amount ("1.8 mm") and side. */
  describe: (amount: string, side: 'right' | 'left') => string
  /** A reassuring, practical line shown when the difference is noticeable. */
  tip: string
}

export type GroupTexts = Record<GroupId, GroupText>

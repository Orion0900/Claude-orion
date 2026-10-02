/**
 * The shapes everything in Cutline agrees on.
 *
 * Two clocks run through the app and it matters which one a number is on:
 *
 *   - **source time** is the position in the original recording. Words,
 *     cuts and everything stored in a project are on this clock, so an edit
 *     never has to be re-timed when another edit changes.
 *   - **edited time** is the position in the finished video, after the cuts.
 *     Only things derived for playback and export (caption pages, zooms, the
 *     playhead) are on this clock, and they're rebuilt whenever the cuts move.
 *
 * Fields are named for their clock when it could be ambiguous.
 */

export type Seconds = number

/** A half-open span [start, end) on whichever clock the caller says. */
export interface Range {
  start: Seconds
  end: Seconds
}

/** One spoken word, as transcribed. Times are source time. */
export interface Word {
  /** Stable for the life of the project: edits refer to words by id. */
  id: string
  /** As displayed: punctuation attached, no surrounding whitespace. */
  text: string
  start: Seconds
  end: Seconds
  /** Cut from the video, by a tap in the transcript or the filler remover. */
  removed?: boolean
  /** Drawn in the emphasis colour: a keyword worth landing. */
  emphasis?: boolean
  /** An emoji shown with the caption page this word is on. */
  emoji?: string
  /** Start a new caption page after this word, whatever the page size. */
  breakAfter?: boolean
}

/** What the source recording is, read once at import. */
export interface MediaInfo {
  fileName: string
  mimeType: string
  size: number
  duration: Seconds
  /** Display size, rotation already applied: a portrait iPhone clip is taller than wide. */
  width: number
  height: number
  frameRate: number | null
  hasAudio: boolean
  videoCodec: string | null
  audioCodec: string | null
}

/** Loudness through the recording, worked out once at import. */
export interface AudioAnalysis {
  /** RMS level of each frame, 0..1. */
  envelope: Float32Array
  /** Length of one envelope frame. */
  frameDuration: Seconds
}

export type CaptionPresetId =
  | 'bold'
  | 'karaoke'
  | 'box'
  | 'minimal'
  | 'typewriter'
  | 'neon'
  | 'bounce'
  | 'subtitle'
  | 'comic'
  | 'marker'

export type FontId = 'montserrat' | 'anton' | 'bangers' | 'inter' | 'poppins' | 'marker'

/** How the word being spoken right now stands out from the rest of its page. */
export type HighlightMode = 'color' | 'box' | 'underline' | 'scale' | 'none'

/** How words and pages arrive on screen. */
export type CaptionAnimation = 'pop' | 'bounce' | 'fade' | 'slide' | 'typewriter' | 'karaoke' | 'none'

/**
 * Every caption look is these parameters; a preset is just a named set of
 * them. Sizes are relative so a style looks the same at any resolution or
 * aspect ratio.
 */
export interface CaptionStyle {
  preset: CaptionPresetId
  font: FontId
  weight: number
  /** Font size as a fraction of the shorter side of the frame. */
  size: number
  uppercase: boolean
  textColor: string
  /** The word being spoken: its colour, or its box colour in 'box' mode. */
  activeColor: string
  /** Keywords marked for emphasis. */
  emphasisColor: string
  strokeColor: string
  /** Outline width as a fraction of the font size; 0 for none. */
  strokeWidth: number
  shadow: 'none' | 'soft' | 'hard'
  glow: boolean
  /** A panel behind the whole page of text. */
  background: 'none' | 'box'
  backgroundColor: string
  highlight: HighlightMode
  animation: CaptionAnimation
  /** Most words on one caption page. */
  wordsPerPage: number
  /** Most lines one page may wrap onto. */
  maxLines: number
  /** Vertical centre of the captions, 0 (top) .. 1 (bottom) of the frame. */
  position: number
  emojis: boolean
}

export type AspectId = '9:16' | '4:5' | '1:1' | '16:9' | 'source'

export interface FormatSettings {
  aspect: AspectId
  /** 'fill' crops to fill the frame; 'fit' shows the whole picture on a background. */
  fit: 'fill' | 'fit'
  background: 'blur' | 'color'
  backgroundColor: string
  /** Manual zoom on top of the fit, 1 = none. */
  zoom: number
  /** The point of the source picture kept in view when cropping, 0..1 each way. */
  focusX: number
  focusY: number
  /** Punch-in zooms on emphasis and after cuts. */
  autoZoom: boolean
  /** Extra scale of a punch-in, e.g. 0.12 for 112%. */
  zoomStrength: number
  progressBar: boolean
  progressColor: string
}

export interface EditSettings {
  /** Source time the video starts at. */
  trimStart: Seconds
  /** Source time it ends at; null for the end of the recording. */
  trimEnd: Seconds | null
  /** Shorten every pause longer than maxPause down to maxPause. */
  removeSilences: boolean
  maxPause: Seconds
  /** Cut um, uh and their kind. */
  removeFillers: boolean
  /** Extra source-time spans cut by hand. */
  cuts: Range[]
}

/** A title card over the opening seconds: the hook. */
export interface HookOverlay {
  enabled: boolean
  text: string
  /** Edited-time seconds it stays up from the start. */
  duration: Seconds
}

/** Captions shown in another language, one entry per sentence of the transcript. */
export interface Translation {
  language: string
  sentences: { firstWordId: string; lastWordId: string; text: string }[]
}

export interface MusicSettings {
  name: string
  /** 0..1 */
  volume: number
  /** Duck the music under speech. */
  ducking: boolean
}

export type TranscriptStatus = 'none' | 'running' | 'done' | 'error'

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  media: MediaInfo
  transcript: {
    status: TranscriptStatus
    /** ISO 639-1 code, when known. */
    language: string | null
    model: string | null
    error?: string
  }
  words: Word[]
  edit: EditSettings
  style: CaptionStyle
  format: FormatSettings
  hook: HookOverlay
  translation: Translation | null
  music: MusicSettings | null
  /** Captions switched off: the video is still cut and framed, just not captioned. */
  captionsOff?: boolean
  /** A small JPEG data URL for the project list. */
  thumbnail: string | null
}

/* ---- Derived for playback and export; edited time from here down. ---- */

/** A word placed on the edited clock. */
export interface TimedWord {
  id: string
  text: string
  /** Edited-time span the word is spoken over. */
  start: Seconds
  end: Seconds
  emphasis: boolean
}

/** One screenful of captions. */
export interface CaptionPage {
  index: number
  /** Edited time the page appears and leaves. */
  start: Seconds
  end: Seconds
  words: TimedWord[]
  emoji: string | null
}

/** A punch-in: the picture scales up over [start, end) of edited time. */
export interface ZoomMark {
  start: Seconds
  end: Seconds
  /** Extra scale at the peak, e.g. 0.12. */
  amount: number
}

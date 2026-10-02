/**
 * Everything playback and export need to draw a frame, worked out once from
 * a project whenever it changes: which source spans survive the edit, the
 * caption pages and punch-ins on the edited clock, and the settings to draw
 * them with. Drawing a frame is then cheap lookups only.
 */
import { buildPages, translatedPages } from '../lib/pages'
import { keepRanges, TimeMap, timedWords } from '../lib/timeline'
import type { AudioAnalysis, CaptionPage, Project, ZoomMark } from '../lib/types'
import { autoZooms } from '../lib/zooms'

export interface RenderPlan {
  map: TimeMap
  pages: CaptionPage[]
  zooms: ZoomMark[]
  /** Edited duration. */
  duration: number
  /** Captions switched off: pages exist (for SRT) but aren't drawn. */
  showCaptions: boolean
  project: Project
}

export function buildPlan(project: Project, analysis: AudioAnalysis | null, showCaptions = true): RenderPlan {
  const ranges = keepRanges(
    { words: project.words, edit: project.edit, duration: project.media.duration },
    analysis,
  )
  const map = new TimeMap(ranges)
  const words = timedWords(project.words, map)
  const pages =
    project.translation && project.translation.sentences.length > 0
      ? translatedPages(project.translation, project.words, map, project.style)
      : buildPages(words, project.words, project.style)
  const zooms = project.format.autoZoom
    ? autoZooms({ words, cutPoints: map.cutPoints(), duration: map.duration, strength: project.format.zoomStrength })
    : []
  return { map, pages, zooms, duration: map.duration, showCaptions, project }
}

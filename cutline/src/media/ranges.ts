import type { Range, Seconds } from '../lib/types'

/** One kept source span, placed on the edited clock. */
export interface TimelineSegment {
  /** Source-time span kept. */
  start: Seconds
  end: Seconds
  /** Edited time this span starts at. */
  offset: Seconds
}

/** The kept spans back to back: how source time maps onto the finished video. */
export interface Timeline {
  segments: TimelineSegment[]
  /** Edited duration, the sum of the kept spans. */
  duration: Seconds
}

/**
 * Sorted, clamped to the recording, empty spans dropped, and overlapping or
 * touching spans merged: back to back they play exactly the same, and fewer
 * joins means fewer seeks and crossfades.
 */
export function normalizeRanges(ranges: readonly Range[], sourceDuration?: Seconds): Range[] {
  const limit = sourceDuration !== undefined && sourceDuration > 0 ? sourceDuration : Infinity
  const sorted = ranges
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(limit, r.end) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end - r.start > 1e-6)
    .sort((a, b) => a.start - b.start)
  const merged: Range[] = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end + 1e-6) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }
  return merged
}

export function buildTimeline(ranges: readonly Range[], sourceDuration?: Seconds): Timeline {
  const segments: TimelineSegment[] = []
  let offset = 0
  for (const r of normalizeRanges(ranges, sourceDuration)) {
    segments.push({ start: r.start, end: r.end, offset })
    offset += r.end - r.start
  }
  return { segments, duration: offset }
}

/** Index of the segment playing at edited time t, clamped to the first and last. */
export function segmentIndexAt(timeline: Timeline, editedTime: Seconds): number {
  const { segments } = timeline
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segments[mid].offset <= editedTime) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** The source moment shown at edited time t. */
export function sourceTimeAt(timeline: Timeline, editedTime: Seconds): Seconds {
  if (timeline.segments.length === 0) return 0
  const seg = timeline.segments[segmentIndexAt(timeline, editedTime)]
  const local = Math.min(Math.max(editedTime - seg.offset, 0), seg.end - seg.start)
  return seg.start + local
}

/** Frames in the finished video. Rounded, so audio padded to frames/fps never differs from the cut by more than half a frame. */
export function frameCount(duration: Seconds, fps: number): number {
  return Math.max(1, Math.round(duration * fps))
}

/**
 * The source timestamp to fetch for each output frame k (shown from edited
 * time k/fps): monotonic, so one decoder pass serves the whole export.
 *
 * `nudge` pushes each lookup slightly later. Containers store frame times
 * rounded (WebM to the millisecond), so 0.4 + 2/30 = 0.46667 can land just
 * before a frame stamped 0.467 and fetch the one before it. The nudge never
 * crosses the end of a kept span, so a cut frame can't leak in.
 */
export function frameSourceTimes(timeline: Timeline, fps: number, count = frameCount(timeline.duration, fps), nudge = 0): Float64Array {
  const out = new Float64Array(count)
  const { segments } = timeline
  if (segments.length === 0) return out
  let i = 0
  for (let k = 0; k < count; k++) {
    const t = k / fps
    while (i < segments.length - 1 && t >= segments[i + 1].offset - 1e-9) i++
    const seg = segments[i]
    const s = seg.start + Math.min(Math.max(t - seg.offset, 0), seg.end - seg.start)
    out[k] = Math.max(s, Math.min(s + nudge, seg.end - 1e-6))
  }
  return out
}

import { loadPhoto, pixelsOf, type LoadedPhoto } from '../detect/image'
import { detectImage, getLandmarker, type LoadProgress } from '../detect/landmarker'
import { analyzeFront, groupScores, harmonyOf, type FrontAnalysis, type GroupScore } from '../face/analyze'
import { computeFrame } from '../face/frame'
import { FACE_OVAL } from '../face/indices'
import type { MetricResult } from '../face/metrics/types'
import { measurePixels } from '../face/pixels'
import { analyzeProfile, PROFILE_POINTS, type ProfileAnalysis, type ProfilePoints } from '../face/profile'
import type { FaceDetection, Sex } from '../face/types'
import { getAnalysis, newId, photoKey, putAnalysis, putPhoto, requestPersistence, type StoredAnalysis } from './db'

export interface Computed {
  front: FrontAnalysis
  profile: ProfileAnalysis | null
  /** Front and profile measurements together. */
  metrics: MetricResult[]
  groups: GroupScore[]
  harmony: number
}

export function profileComplete(a: StoredAnalysis): boolean {
  return !!a.profile?.points && a.profile.confirmed >= PROFILE_POINTS.length
}

/** Derives every result from what's stored. Cheap enough to run on each render that needs it. */
export function compute(a: StoredAnalysis, sex: Sex = a.sex): Computed {
  const f = a.front
  const front = analyzeFront(
    { detection: f.detection, pixels: f.pixels, adjustments: f.adjustments, hairlineHidden: f.hairlineHidden, focal35: f.focal35 },
    { sex },
  )
  const profile = profileComplete(a) ? analyzeProfile(a.profile!.points!, sex, front.faceHeightMm) : null
  const metrics = [...front.metrics, ...(profile?.metrics ?? [])]
  const groups = groupScores(metrics, front.symmetry.score)
  return { front, profile, metrics, groups, harmony: harmonyOf(groups) }
}

export function summarize(c: Computed): StoredAnalysis['summary'] {
  return {
    harmony: c.harmony,
    symmetry: Math.round(c.front.symmetry.score),
    shape: c.front.shape.shape,
    profile: c.groups.find((g) => g.id === 'profile')?.score ?? null,
  }
}

/** A small portrait crop around the face for lists. */
export function thumbnailOf(source: CanvasImageSource, det: FaceDetection, size = 160): string {
  const oval = FACE_OVAL.map((i) => det.landmarks[i])
  const xs = oval.map((p) => p.x)
  const ys = oval.map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  const side = Math.max(w, h) * 1.35
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2 - h * 0.05
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#16161b'
  g.fillRect(0, 0, size, size)
  g.drawImage(source, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size)
  return c.toDataURL('image/jpeg', 0.82)
}

export type CreateResult = { ok: true; id: string } | { ok: false; reason: 'noface' | 'unreadable' | 'engine'; message: string }

/** Detects, measures and stores a new analysis from a front photo. */
export async function createFromPhoto(file: Blob, sex: Sex, onProgress?: LoadProgress, demo = false): Promise<CreateResult> {
  let photo: LoadedPhoto
  try {
    photo = await loadPhoto(file)
  } catch {
    return { ok: false, reason: 'unreadable', message: 'That file couldn’t be opened as a photo.' }
  }
  try {
    await getLandmarker(onProgress)
  } catch (e) {
    return { ok: false, reason: 'engine', message: `The analysis engine couldn’t load${navigator.onLine ? '' : ' (you seem to be offline)'}. ${(e as Error).message ?? ''}` }
  }
  const detection = await detectImage(photo.canvas)
  if (!detection) return { ok: false, reason: 'noface', message: 'No face was found in that photo.' }

  const pixels = measurePixels(pixelsOf(photo.canvas), detection.landmarks, computeFrame(detection.landmarks))
  const id = newId()
  const now = Date.now()
  const stored: StoredAnalysis = {
    id,
    createdAt: now,
    updatedAt: now,
    sex,
    front: {
      width: photo.width,
      height: photo.height,
      detection,
      pixels,
      adjustments: {},
      hairlineHidden: false,
      focal35: photo.exif?.focal35 ?? null,
    },
    thumbnail: thumbnailOf(photo.canvas, detection),
    summary: { harmony: 0, symmetry: 0, shape: 'oval', profile: null },
    demo,
  }
  stored.summary = summarize(compute(stored))
  await putPhoto(photoKey(id, 'front'), photo.blob)
  await putAnalysis(stored)
  void requestPersistence()
  return { ok: true, id }
}

/** Attaches a side photo to an analysis, ready for its points to be placed. */
export async function attachProfile(a: StoredAnalysis, file: Blob): Promise<StoredAnalysis> {
  const photo = await loadPhoto(file)
  await putPhoto(photoKey(a.id, 'profile'), photo.blob)
  const next: StoredAnalysis = { ...a, updatedAt: Date.now(), profile: { width: photo.width, height: photo.height, attachedAt: Date.now(), points: null, confirmed: 0 } }
  await putAnalysis(next)
  return next
}

/**
 * The built-in demo: a synthetic face rendered from the average face mesh —
 * nobody's real face — analysed front and side, so the report can be seen
 * before using a photo of yourself.
 */
export async function createDemo(sex: Sex, onProgress?: LoadProgress): Promise<CreateResult> {
  const get = async (path: string) => {
    const res = await fetch(new URL(path, document.baseURI))
    if (!res.ok) throw new Error(`Couldn’t load ${path}`)
    return res
  }
  try {
    const result = await createFromPhoto(await (await get('demo/front.jpg')).blob(), sex, onProgress, true)
    if (!result.ok) return result
    const stored = await getAnalysis(result.id)
    if (stored) {
      const withProfile = await attachProfile(stored, await (await get('demo/profile.jpg')).blob())
      const points = (await (await get('demo/profile-points.json')).json()) as ProfilePoints
      await saveAnalysis({ ...withProfile, profile: { ...withProfile.profile!, points, confirmed: PROFILE_POINTS.length } })
    }
    return result
  } catch (e) {
    return { ok: false, reason: 'engine', message: (e as Error).message }
  }
}

/** Saves a changed analysis, refreshing its summary. */
export async function saveAnalysis(a: StoredAnalysis): Promise<StoredAnalysis> {
  const next = { ...a, updatedAt: Date.now() }
  next.summary = summarize(compute(next))
  await putAnalysis(next)
  return next
}


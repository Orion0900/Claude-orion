import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { FaceDetection } from '../face/types'

/** Resolves a file shipped with the app, whether it's served at a root or a sub-path. */
export const assetUrl = (path: string) => new URL(path, document.baseURI).href

const MODEL = 'models/face_landmarker.task'

export type LoadProgress = (loaded: number, total: number) => void

let landmarker: Promise<FaceLandmarker> | null = null
let mode: 'IMAGE' | 'VIDEO' = 'IMAGE'

/** Downloads a file while reporting progress, so the first load can show a bar. */
async function fetchBytes(url: string, onProgress?: LoadProgress): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Couldn’t load ${url} (${response.status})`)
  const total = Number(response.headers.get('content-length')) || 0
  if (!response.body || !onProgress) return new Uint8Array(await response.arrayBuffer())
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/**
 * The face landmarker, created once. Everything it needs — the WebAssembly
 * runtime and the model — is served from this app's own origin, so it runs
 * offline and the photo never leaves the device.
 */
export function getLandmarker(onProgress?: LoadProgress): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const simd = await FilesetResolver.isSimdSupported()
    const name = simd ? 'vision_wasm_internal' : 'vision_wasm_nosimd_internal'
    const base = assetUrl('mediapipe/')
    // Warm the wasm download alongside the model so both show in the progress.
    let modelDone = 0
    let wasmDone = 0
    let modelTotal = 3_760_000
    let wasmTotal = 11_760_000
    const report = () => onProgress?.(modelDone + wasmDone, modelTotal + wasmTotal)
    const [model] = await Promise.all([
      fetchBytes(assetUrl(MODEL), (l, t) => {
        modelDone = l
        if (t) modelTotal = t
        report()
      }),
      fetchBytes(base + name + '.wasm', (l, t) => {
        wasmDone = l
        if (t) wasmTotal = t
        report()
      }).catch(() => null),
    ])
    const created = await FaceLandmarker.createFromOptions(
      { wasmLoaderPath: base + name + '.js', wasmBinaryPath: base + name + '.wasm' },
      {
        baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.4,
        minFacePresenceConfidence: 0.4,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      },
    )
    mode = 'IMAGE'
    return created
  })()
  landmarker.catch(() => {
    landmarker = null
  })
  return landmarker
}

async function inMode(want: 'IMAGE' | 'VIDEO'): Promise<FaceLandmarker> {
  const lm = await getLandmarker()
  if (mode !== want) {
    await lm.setOptions({ runningMode: want })
    mode = want
  }
  return lm
}

export function toDetection(result: FaceLandmarkerResult, width: number, height: number): FaceDetection | null {
  const points = result.faceLandmarks[0]
  if (!points || points.length < 478) return null
  const blendshapes: Record<string, number> = {}
  for (const c of result.faceBlendshapes[0]?.categories ?? []) blendshapes[c.categoryName] = c.score
  const matrix = result.facialTransformationMatrixes[0]?.data
  return {
    width,
    height,
    // Normalised to pixels; z is normalised by width like x.
    landmarks: points.map((p) => ({ x: p.x * width, y: p.y * height, z: p.z * width })),
    blendshapes,
    matrix: matrix ? Array.from(matrix) : null,
  }
}

export async function detectImage(source: HTMLCanvasElement | HTMLImageElement | ImageBitmap): Promise<FaceDetection | null> {
  const lm = await inMode('IMAGE')
  return toDetection(lm.detect(source), source.width, source.height)
}

/** For the live camera: call once per frame with a rising timestamp. */
export async function videoLandmarker(): Promise<(video: HTMLVideoElement, time: number) => FaceDetection | null> {
  const lm = await inMode('VIDEO')
  return (video, time) => toDetection(lm.detectForVideo(video, time), video.videoWidth, video.videoHeight)
}

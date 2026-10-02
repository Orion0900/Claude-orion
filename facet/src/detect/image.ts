import { readExif, type ExifInfo } from '../face/exif'
import type { Pixels } from '../face/pixels'

/** The long side a photo is kept at: plenty for sub-millimetre landmarks. */
export const MAX_SIDE = 1600

export interface LoadedPhoto {
  /** The photo as kept: upright, downscaled, re-encoded as JPEG. */
  blob: Blob
  width: number
  height: number
  canvas: HTMLCanvasElement
  exif: ExifInfo | null
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t encode the photo'))), 'image/jpeg', quality),
  )
}

export async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    // The decoded image stays usable after its URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * Reads a picked or captured photo. Browsers apply the EXIF orientation when
 * decoding, so drawing it to a canvas gives the photo the right way up.
 */
export async function loadPhoto(file: Blob, maxSide = MAX_SIDE): Promise<LoadedPhoto> {
  const head = await file.slice(0, 256 * 1024).arrayBuffer()
  const exif = readExif(head)
  const img = await decodeImage(file)
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.round(img.naturalWidth * s)
  const height = Math.round(img.naturalHeight * s)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, 0, 0, width, height)
  const blob = await canvasToBlob(canvas)
  // Rescaling changes the image diagonal but not the 35 mm-equivalent focal
  // length, which is defined against the whole frame: still valid.
  return { blob, width, height, canvas, exif }
}

export function pixelsOf(canvas: HTMLCanvasElement): Pixels {
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  const data = g.getImageData(0, 0, canvas.width, canvas.height)
  return { width: data.width, height: data.height, data: data.data }
}

/** The few camera facts the analysis can use, read from a JPEG's EXIF block. */
export interface ExifInfo {
  /** 35 mm-equivalent focal length, mm. */
  focal35: number | null
  /** Actual focal length, mm. */
  focal: number | null
  model: string | null
}

/**
 * Reads EXIF from a JPEG without a library: find the APP1 "Exif" segment,
 * then walk IFD0 and the Exif sub-IFD for the handful of tags wanted.
 * Returns null for anything that isn't a JPEG with EXIF.
 */
export function readExif(buffer: ArrayBuffer): ExifInfo | null {
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null
  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    if ((marker & 0xff00) !== 0xff00) return null
    const size = view.getUint16(offset + 2)
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      return parseTiff(view, offset + 10)
    }
    if (marker === 0xffda) return null
    offset += 2 + size
  }
  return null
}

function parseTiff(view: DataView, tiff: number): ExifInfo | null {
  if (tiff + 8 > view.byteLength) return null
  const little = view.getUint16(tiff) === 0x4949
  const u16 = (o: number) => view.getUint16(o, little)
  const u32 = (o: number) => view.getUint32(o, little)
  const info: ExifInfo = { focal35: null, focal: null, model: null }

  const readIfd = (start: number, onTag: (tag: number, type: number, count: number, valueOffset: number) => void) => {
    if (start + 2 > view.byteLength) return
    const n = u16(start)
    for (let i = 0; i < n; i++) {
      const entry = start + 2 + i * 12
      if (entry + 12 > view.byteLength) return
      onTag(u16(entry), u16(entry + 2), u32(entry + 4), entry + 8)
    }
  }
  const ascii = (count: number, valueOffset: number) => {
    const at = count > 4 ? tiff + u32(valueOffset) : valueOffset
    let s = ''
    for (let i = 0; i < count - 1 && at + i < view.byteLength; i++) s += String.fromCharCode(view.getUint8(at + i))
    return s.trim() || null
  }

  let exifIfd = 0
  readIfd(tiff + u32(tiff + 4), (tag, _type, count, valueOffset) => {
    if (tag === 0x8769) exifIfd = tiff + u32(valueOffset)
    if (tag === 0x0110) info.model = ascii(count, valueOffset)
  })
  if (exifIfd) {
    readIfd(exifIfd, (tag, type, _count, valueOffset) => {
      if (tag === 0xa405) info.focal35 = (type === 3 ? u16(valueOffset) : u32(valueOffset)) || null
      if (tag === 0x920a) {
        const at = tiff + u32(valueOffset)
        if (at + 8 <= view.byteLength) {
          const den = u32(at + 4)
          info.focal = den ? u32(at) / den : null
        }
      }
    })
  }
  return info
}

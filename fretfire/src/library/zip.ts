/**
 * Lazy ZIP reading. Only the directory at the end of the archive is read up
 * front; each file is sliced (and inflated) from the original Blob when asked
 * for, so a song pack of hundreds of megabytes never sits in the JS heap.
 */

/** One file inside an archive. */
export interface ArchiveEntry {
  /** Full path inside the archive, with '/' separators. */
  name: string
  /** Uncompressed size in bytes. */
  size: number
  blob(): Promise<Blob>
}

const EOCD = 0x06054b50
const ZIP64_LOCATOR = 0x07064b50
const ZIP64_EOCD = 0x06064b50
const CENTRAL_HEADER = 0x02014b50
const LOCAL_HEADER = 0x04034b50
const MAX_COMMENT = 0xffff
const EOCD_SIZE = 22
const LOCATOR_SIZE = 20

/** Lists the files in a ZIP archive. Directories, macOS metadata and encrypted or oddly compressed entries are left out. */
export async function openZip(file: Blob): Promise<ArchiveEntry[]> {
  const tailLength = Math.min(file.size, EOCD_SIZE + MAX_COMMENT + LOCATOR_SIZE)
  const tailStart = file.size - tailLength
  const tail = await readView(file, tailStart, file.size)

  const eocd = findEocd(tail)
  if (eocd < 0) throw new Error('This is not a zip file')
  let directorySize = tail.getUint32(eocd + 12, true)
  let directoryOffset = tail.getUint32(eocd + 16, true)
  // Where the central directory must end: right before the (ZIP64) end record.
  let directoryEnd = tailStart + eocd

  if (eocd >= LOCATOR_SIZE && tail.getUint32(eocd - LOCATOR_SIZE, true) === ZIP64_LOCATOR) {
    const recordOffset = getUint64(tail, eocd - LOCATOR_SIZE + 8)
    const record = await readView(file, recordOffset, recordOffset + 56)
    if (record.byteLength >= 56 && record.getUint32(0, true) === ZIP64_EOCD) {
      directorySize = getUint64(record, 40)
      directoryOffset = getUint64(record, 48)
      directoryEnd = recordOffset
    }
  }

  if (directorySize === 0) return []
  let directory = await readView(file, directoryOffset, directoryOffset + directorySize)
  // Data glued in front of the archive (a self-extractor stub) shifts every offset.
  let shift = 0
  if (!isCentralHeader(directory, 0)) {
    shift = directoryEnd - directorySize - directoryOffset
    if (shift !== 0) directory = await readView(file, directoryOffset + shift, directoryOffset + shift + directorySize)
    if (!isCentralHeader(directory, 0)) throw new Error('This zip file is damaged')
  }

  const decoder = new TextDecoder('utf-8')
  const entries: ArchiveEntry[] = []
  let p = 0
  // Walk the whole directory rather than trusting the entry count, which old tools wrap at 65535.
  while (p + 46 <= directory.byteLength && isCentralHeader(directory, p)) {
    const flags = directory.getUint16(p + 8, true)
    const method = directory.getUint16(p + 10, true)
    let compressedSize = directory.getUint32(p + 20, true)
    let size = directory.getUint32(p + 24, true)
    const nameLength = directory.getUint16(p + 28, true)
    const extraLength = directory.getUint16(p + 30, true)
    const commentLength = directory.getUint16(p + 32, true)
    let localOffset = directory.getUint32(p + 42, true)
    const next = p + 46 + nameLength + extraLength + commentLength
    if (next > directory.byteLength) break

    const nameBytes = new Uint8Array(directory.buffer, directory.byteOffset + p + 46, nameLength)
    // Names are UTF-8 when flag bit 11 says so; anything else is read as UTF-8 too.
    const name = decoder.decode(nameBytes).replace(/\\/g, '/').replace(/^\/+/, '')

    // ZIP64 extra field: 64-bit values for whichever fields are maxed out, in this order.
    for (let e = p + 46 + nameLength, end = e + extraLength; e + 4 <= end; ) {
      const id = directory.getUint16(e, true)
      const length = directory.getUint16(e + 2, true)
      if (id === 0x0001) {
        let q = e + 4
        const stop = Math.min(end, q + length)
        if (size === 0xffffffff && q + 8 <= stop) {
          size = getUint64(directory, q)
          q += 8
        }
        if (compressedSize === 0xffffffff && q + 8 <= stop) {
          compressedSize = getUint64(directory, q)
          q += 8
        }
        if (localOffset === 0xffffffff && q + 8 <= stop) localOffset = getUint64(directory, q)
      }
      e += 4 + length
    }
    p = next

    if (!name || name.endsWith('/') || flags & 1 || (method !== 0 && method !== 8)) continue
    const parts = name.split('/')
    if (parts.includes('__MACOSX') || parts[parts.length - 1] === '.DS_Store') continue

    const headerOffset = localOffset + shift
    entries.push({
      name,
      size,
      async blob() {
        if (size === 0) return new Blob([])
        const header = await readView(file, headerOffset, headerOffset + 30)
        if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL_HEADER) {
          throw new Error(`${name} is damaged in this zip`)
        }
        const start = headerOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
        const data = file.slice(start, start + compressedSize)
        if (method === 0) return data
        return new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
      },
    })
  }
  return entries
}

/** The end-of-central-directory record, searched for backwards past a comment of up to 64 KB. */
function findEocd(tail: DataView): number {
  let loose = -1
  for (let p = tail.byteLength - EOCD_SIZE; p >= 0; p--) {
    if (tail.getUint32(p, true) !== EOCD) continue
    const end = p + EOCD_SIZE + tail.getUint16(p + 20, true)
    if (end === tail.byteLength) return p
    if (loose < 0 && end <= tail.byteLength) loose = p
  }
  return loose
}

function isCentralHeader(view: DataView, at: number): boolean {
  return at + 4 <= view.byteLength && view.getUint32(at, true) === CENTRAL_HEADER
}

async function readView(file: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await file.slice(Math.max(0, start), Math.max(0, end)).arrayBuffer())
}

function getUint64(view: DataView, at: number): number {
  return view.getUint32(at, true) + view.getUint32(at + 4, true) * 2 ** 32
}

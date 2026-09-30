import type { ArchiveEntry } from './zip'

/**
 * Clone Hero `.sng` song containers (github.com/mdsitton/SngFileFormat): a
 * header, song.ini-style metadata, a file index and XOR-masked file data, all
 * little-endian. Only the header region is read up front; files are unmasked
 * in chunks when asked for.
 */

const IDENTIFIER = 'SNGPKG'
/** Identifier, version and the 16-byte XOR mask. */
const HEADER_SIZE = 26
const FIRST_READ = 64 * 1024
const CHUNK = 1 << 20
const NOT_SNG = 'This is not a .sng file'
const DAMAGED = 'This .sng file is damaged'

/** Reads an .sng container: its song.ini metadata (lowercase keys) and its files. */
export async function openSng(file: Blob): Promise<{ meta: Record<string, string>; entries: ArchiveEntry[] }> {
  let bytes = new Uint8Array(await file.slice(0, Math.min(file.size, FIRST_READ)).arrayBuffer())
  let view = new DataView(bytes.buffer)
  /** Makes sure the first `end` bytes of the file are loaded. */
  const need = async (end: number) => {
    if (end <= bytes.length) return
    if (end > file.size) throw new Error(DAMAGED)
    bytes = new Uint8Array(await file.slice(0, Math.min(file.size, Math.max(end, bytes.length * 2))).arrayBuffer())
    view = new DataView(bytes.buffer)
  }
  const u64 = (at: number) => {
    const value = view.getUint32(at, true) + view.getUint32(at + 4, true) * 2 ** 32
    if (!Number.isSafeInteger(value)) throw new Error(DAMAGED)
    return value
  }
  const text = (at: number, length: number) => utf8.decode(bytes.subarray(at, at + length))

  if (bytes.length < HEADER_SIZE || String.fromCharCode(...bytes.subarray(0, 6)) !== IDENTIFIER) {
    throw new Error(NOT_SNG)
  }
  const key = new Uint8Array(256)
  for (let i = 0; i < 256; i++) key[i] = bytes[10 + (i % 16)] ^ i

  // Metadata: length (of what follows it), pair count, then length-prefixed key/value pairs.
  await need(HEADER_SIZE + 16)
  const metaStart = HEADER_SIZE + 8
  const metaEnd = metaStart + u64(HEADER_SIZE)
  await need(metaEnd + 16)
  const meta: Record<string, string> = {}
  const metaCount = u64(metaStart)
  let pos = metaStart + 8
  for (let i = 0; i < metaCount && pos + 4 <= metaEnd; i++) {
    const keyLength = view.getInt32(pos, true)
    if (keyLength < 0 || pos + 8 + keyLength > metaEnd) break
    const name = text(pos + 4, keyLength).trim().toLowerCase()
    pos += 4 + keyLength
    const valueLength = view.getInt32(pos, true)
    if (valueLength < 0 || pos + 4 + valueLength > metaEnd) break
    const value = text(pos + 4, valueLength).trim()
    pos += 4 + valueLength
    if (name) meta[name] = value
  }

  // File index: length (of what follows it), file count, then name / size / absolute offset.
  const indexStart = metaEnd + 8
  const indexEnd = indexStart + u64(metaEnd)
  await need(indexEnd)
  const fileCount = u64(indexStart)
  const entries: ArchiveEntry[] = []
  pos = indexStart + 8
  for (let i = 0; i < fileCount && pos + 1 <= indexEnd; i++) {
    const nameLength = bytes[pos]
    if (pos + 1 + nameLength + 16 > indexEnd) break
    const name = text(pos + 1, nameLength).replace(/\\/g, '/')
    const size = u64(pos + 1 + nameLength)
    const offset = u64(pos + 9 + nameLength)
    pos += 17 + nameLength
    if (!name || offset + size > file.size) continue
    entries.push({ name, size, blob: () => unmask(file, offset, size, key) })
  }
  return { meta, entries }
}

const utf8 = new TextDecoder('utf-8')

/** Unmasks one file a chunk at a time; each chunk goes straight into a Blob so the heap never holds the whole file. */
async function unmask(file: Blob, offset: number, size: number, key: Uint8Array): Promise<Blob> {
  const parts: Blob[] = []
  for (let start = 0; start < size; start += CHUNK) {
    const end = Math.min(size, start + CHUNK)
    const chunk = new Uint8Array(await file.slice(offset + start, offset + end).arrayBuffer())
    for (let i = 0; i < chunk.length; i++) chunk[i] ^= key[(start + i) & 0xff]
    parts.push(new Blob([chunk]))
  }
  return new Blob(parts)
}

import { openZip } from './zip'

// The project is typed for browsers (no @types/node), so node:zlib gets a hand-written type here.
interface Zlib {
  deflateRawSync(data: Uint8Array): Uint8Array
  crc32(data: Uint8Array): number
}
const zlibModule = 'node:zlib'
const { crc32, deflateRawSync } = (await import(/* @vite-ignore */ zlibModule)) as Zlib

interface ZipInput {
  name: string
  data: Uint8Array | string
  method?: number
  flags?: number
  /** Raw name bytes, for testing non-UTF-8 names. */
  nameBytes?: Uint8Array
}

interface ZipOptions {
  comment?: string
  zip64?: boolean
  /** Junk bytes before the archive, with offsets left relative to the archive (like a self-extractor). */
  prefix?: number
  /** An extra field in every local header, which the central directory doesn't repeat. */
  localExtra?: boolean
}

const enc = (text: string) => new TextEncoder().encode(text)

/** A small ZIP writer: stored or deflated entries, optional ZIP64 records, comment and prefix. */
function makeZip(files: ZipInput[], options: ZipOptions = {}): Uint8Array<ArrayBuffer> {
  const { comment = '', zip64 = false, prefix = 0, localExtra = false } = options
  const parts: Uint8Array[] = [new Uint8Array(prefix).fill(0x41)]
  let length = prefix
  const emit = (...chunks: (number[] | Uint8Array)[]) => {
    for (const chunk of chunks) {
      parts.push(Uint8Array.from(chunk))
      length += chunk.length
    }
  }
  const central: number[] = []
  const u16 = (list: number[], n: number) => list.push(n & 255, (n >>> 8) & 255)
  const u32 = (list: number[], n: number) => list.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255)
  const u64 = (list: number[], n: number) => {
    u32(list, n % 2 ** 32)
    u32(list, Math.floor(n / 2 ** 32))
  }
  let count = 0
  for (const file of files) {
    const data = typeof file.data === 'string' ? enc(file.data) : file.data
    const method = file.method ?? 8
    const body = method === 8 ? new Uint8Array(deflateRawSync(data)) : data
    const name = file.nameBytes ?? enc(file.name)
    const flags = file.flags ?? 0x0800
    const crc = crc32(data)
    const offset = length - prefix

    const local: number[] = []
    u32(local, 0x04034b50)
    u16(local, zip64 ? 45 : 20)
    u16(local, flags)
    u16(local, method)
    u32(local, 0) // time and date
    u32(local, crc)
    const extra: number[] = []
    if (zip64) {
      u16(extra, 1)
      u16(extra, 16)
      u64(extra, data.length)
      u64(extra, body.length)
    }
    if (localExtra) {
      u16(extra, 0x5455)
      u16(extra, 5)
      extra.push(1, 2, 3, 4, 5)
    }
    u32(local, zip64 ? 0xffffffff : body.length)
    u32(local, zip64 ? 0xffffffff : data.length)
    u16(local, name.length)
    u16(local, extra.length)
    emit(local, name, extra, body)

    const cdExtra: number[] = []
    if (zip64) {
      u16(cdExtra, 1)
      u16(cdExtra, 24)
      u64(cdExtra, data.length)
      u64(cdExtra, body.length)
      u64(cdExtra, offset)
    }
    u32(central, 0x02014b50)
    u16(central, 20)
    u16(central, zip64 ? 45 : 20)
    u16(central, flags)
    u16(central, method)
    u32(central, 0)
    u32(central, crc)
    u32(central, zip64 ? 0xffffffff : body.length)
    u32(central, zip64 ? 0xffffffff : data.length)
    u16(central, name.length)
    u16(central, cdExtra.length)
    u16(central, 0) // comment
    u16(central, 0) // disk
    u16(central, 0) // internal attributes
    u32(central, 0) // external attributes
    u32(central, zip64 ? 0xffffffff : offset)
    central.push(...name, ...cdExtra)
    count++
  }

  const cdOffset = length - prefix
  emit(central)
  if (zip64) {
    const recordOffset = length - prefix
    const record: number[] = []
    u32(record, 0x06064b50)
    u64(record, 44)
    u16(record, 45)
    u16(record, 45)
    u32(record, 0)
    u32(record, 0)
    u64(record, count)
    u64(record, count)
    u64(record, central.length)
    u64(record, cdOffset)
    u32(record, 0x07064b50)
    u32(record, 0)
    u64(record, recordOffset)
    u32(record, 1)
    emit(record)
  }
  const commentBytes = enc(comment)
  const end: number[] = []
  u32(end, 0x06054b50)
  u16(end, 0)
  u16(end, 0)
  u16(end, zip64 ? 0xffff : count)
  u16(end, zip64 ? 0xffff : count)
  u32(end, zip64 ? 0xffffffff : central.length)
  u32(end, zip64 ? 0xffffffff : cdOffset)
  u16(end, commentBytes.length)
  emit(end, commentBytes)
  const zip = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    zip.set(part, at)
    at += part.length
  }
  return zip
}

const SAMPLE: ZipInput[] = [
  { name: 'Pack/', data: '', method: 0 },
  { name: 'Pack/Song A/notes.chart', data: '[Song]\n{\n}\n', method: 0 },
  { name: 'Pack/Song A/song.ogg', data: 'OggS audio audio audio audio', method: 8 },
  { name: 'Pack/Song B/Sub Folder/notes.mid', data: 'MThd deflated', method: 8 },
  { name: '__MACOSX/Pack/Song A/._notes.chart', data: 'resource fork', method: 0 },
  { name: 'Pack/.DS_Store', data: 'finder junk', method: 0 },
]

async function contents(zip: Uint8Array<ArrayBuffer>): Promise<Record<string, string>> {
  const entries = await openZip(new Blob([zip]))
  const out: Record<string, string> = {}
  for (const entry of entries) out[entry.name] = await (await entry.blob()).text()
  return out
}

const EXPECTED = {
  'Pack/Song A/notes.chart': '[Song]\n{\n}\n',
  'Pack/Song A/song.ogg': 'OggS audio audio audio audio',
  'Pack/Song B/Sub Folder/notes.mid': 'MThd deflated',
}

describe('openZip', () => {
  it('lists stored and deflated files in nested folders, skipping folders and macOS junk', async () => {
    const zip = makeZip(SAMPLE, { comment: 'Song pack v1 — enjoy' })
    const entries = await openZip(new Blob([zip]))
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ['Pack/Song A/notes.chart', 11],
      ['Pack/Song A/song.ogg', 28],
      ['Pack/Song B/Sub Folder/notes.mid', 13],
    ])
    expect(await contents(zip)).toEqual(EXPECTED)
  })

  it('finds the real end record behind a comment that contains its signature', async () => {
    const zip = makeZip(SAMPLE, { comment: 'fake PK\u0005\u0006 record in here' })
    expect(await contents(zip)).toEqual(EXPECTED)
  })

  it('reads ZIP64 archives', async () => {
    expect(await contents(makeZip(SAMPLE, { zip64: true }))).toEqual(EXPECTED)
  })

  it('finds data behind local extra fields and after prepended bytes', async () => {
    expect(await contents(makeZip(SAMPLE, { localExtra: true, prefix: 1000 }))).toEqual(EXPECTED)
  })

  it('inflates large files intact', async () => {
    const big = new Uint8Array(300_000)
    for (let i = 0; i < big.length; i++) big[i] = (i * 7 + (i >> 9)) & 255
    const [entry] = await openZip(new Blob([makeZip([{ name: 'big.bin', data: big }])]))
    const out = new Uint8Array(await (await entry.blob()).arrayBuffer())
    expect(out.length).toBe(big.length)
    expect(out.every((b, i) => b === big[i])).toBe(true)
  })

  it('skips encrypted entries and unsupported compression', async () => {
    const zip = makeZip([
      { name: 'secret.ogg', data: 'x', method: 0, flags: 0x0801 },
      { name: 'lzma.ogg', data: 'x', method: 14 },
      { name: 'fine.ogg', data: 'ok', method: 0 },
    ])
    expect(Object.keys(await contents(zip))).toEqual(['fine.ogg'])
  })

  it('decodes names without the UTF-8 flag as UTF-8, replacing bad bytes', async () => {
    const zip = makeZip([
      { name: '', nameBytes: enc('Björk/notes.chart'), data: 'a', method: 0, flags: 0 },
      { name: '', nameBytes: new Uint8Array([0x41, 0x82, 0x2e, 0x6f, 0x67, 0x67]), data: 'b', method: 0, flags: 0 },
      { name: '', nameBytes: enc('Windows\\Path\\song.ogg'), data: 'c', method: 0, flags: 0 },
    ])
    const entries = await openZip(new Blob([zip]))
    expect(entries.map((e) => e.name)).toEqual(['Björk/notes.chart', 'A�.ogg', 'Windows/Path/song.ogg'])
  })

  it('reads only the directory up front', async () => {
    const audio = new Uint8Array(2_000_000).fill(7)
    const zip = makeZip([
      { name: 'Song/song.ogg', data: audio, method: 0 },
      { name: 'Song/notes.chart', data: 'chart', method: 0 },
    ])
    let bytesRead = 0
    const blob = new Blob([zip])
    // Only size and slice() are available, so reading the whole Blob any other way would throw.
    const tracking = {
      size: blob.size,
      slice(start?: number, end?: number) {
        const part = blob.slice(start, end)
        bytesRead += part.size
        return part
      },
    } as unknown as Blob
    const entries = await openZip(tracking)
    expect(entries).toHaveLength(2)
    expect(bytesRead).toBeLessThan(100_000)
    expect(await (await entries[1].blob()).text()).toBe('chart')
    expect(bytesRead).toBeLessThan(200_000)
  })

  it('returns nothing for an empty archive', async () => {
    expect(await openZip(new Blob([makeZip([])]))).toEqual([])
  })

  it('rejects files that are not zips', async () => {
    await expect(openZip(new Blob(['just some text, no zip here']))).rejects.toThrow('This is not a zip file')
    await expect(openZip(new Blob([]))).rejects.toThrow('This is not a zip file')
  })
})

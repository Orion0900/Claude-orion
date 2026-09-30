import { openSng } from './sng'

const enc = (text: string) => new TextEncoder().encode(text)

interface SngFile {
  name: string
  data: Uint8Array | string
  /** Overrides the stored size, to fake a damaged index. */
  size?: number
}

/** A small .sng writer following github.com/mdsitton/SngFileFormat. */
function makeSng(meta: [string, string][], files: SngFile[]): Uint8Array<ArrayBuffer> {
  const mask = Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 255)
  const bytes: number[] = []
  const u32 = (list: number[], n: number) => list.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255)
  const u64 = (list: number[], n: number) => {
    u32(list, n % 2 ** 32)
    u32(list, Math.floor(n / 2 ** 32))
  }

  const metaSection: number[] = []
  u64(metaSection, meta.length)
  for (const [key, value] of meta) {
    const k = enc(key)
    const v = enc(value)
    u32(metaSection, k.length)
    metaSection.push(...k)
    u32(metaSection, v.length)
    for (const b of v) metaSection.push(b)
  }

  const datas = files.map((f) => (typeof f.data === 'string' ? enc(f.data) : f.data))
  const names = files.map((f) => enc(f.name))
  const indexLength = 8 + names.reduce((sum, n) => sum + 1 + n.length + 16, 0)
  let dataStart = 6 + 4 + 16 + 8 + metaSection.length + 8 + indexLength + 8
  const indexSection: number[] = []
  u64(indexSection, files.length)
  files.forEach((file, i) => {
    indexSection.push(names[i].length, ...names[i])
    u64(indexSection, file.size ?? datas[i].length)
    u64(indexSection, dataStart)
    dataStart += datas[i].length
  })

  bytes.push(...enc('SNGPKG'))
  u32(bytes, 1)
  bytes.push(...mask)
  u64(bytes, metaSection.length)
  for (const b of metaSection) bytes.push(b)
  u64(bytes, indexSection.length)
  bytes.push(...indexSection)
  u64(bytes, datas.reduce((sum, d) => sum + d.length, 0))

  const header = Uint8Array.from(bytes)
  const total = header.length + datas.reduce((sum, d) => sum + d.length, 0)
  const out = new Uint8Array(total)
  out.set(header)
  let at = header.length
  for (const data of datas) {
    for (let i = 0; i < data.length; i++) out[at + i] = data[i] ^ mask[i % 16] ^ (i & 0xff)
    at += data.length
  }
  return out
}

describe('openSng', () => {
  it('reads metadata with lowercase keys and unmasks files', async () => {
    const sng = makeSng(
      [
        ['Name', 'Song Name'],
        ['artist', ' Artist '],
        ['diff_guitar', '4'],
      ],
      [
        { name: 'notes.chart', data: '[Song]\n{\n}\n' },
        { name: 'song.opus', data: 'OpusHead fake audio' },
      ],
    )
    const { meta, entries } = await openSng(new Blob([sng]))
    expect(meta).toEqual({ name: 'Song Name', artist: 'Artist', diff_guitar: '4' })
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ['notes.chart', 11],
      ['song.opus', 19],
    ])
    expect(await (await entries[0].blob()).text()).toBe('[Song]\n{\n}\n')
    expect(await (await entries[1].blob()).text()).toBe('OpusHead fake audio')
  })

  it('unmasks big files across chunk boundaries', async () => {
    const audio = new Uint8Array(2_500_000)
    for (let i = 0; i < audio.length; i++) audio[i] = (i * 13 + (i >> 11)) & 255
    const sng = makeSng([], [
      { name: 'notes.mid', data: 'MThd' },
      { name: 'song.ogg', data: audio },
    ])
    const { entries } = await openSng(new Blob([sng]))
    const out = new Uint8Array(await (await entries[1].blob()).arrayBuffer())
    expect(out.length).toBe(audio.length)
    expect(out.every((b, i) => b === audio[i])).toBe(true)
  })

  it('reads a header region bigger than its first read', async () => {
    const pairs: [string, string][] = [
      ['loading_phrase', 'x'.repeat(100_000)],
      ['name', 'Long'],
    ]
    const sng = makeSng(pairs, [{ name: 'song.ogg', data: 'ogg' }])
    const { meta, entries } = await openSng(new Blob([sng]))
    expect(meta.name).toBe('Long')
    expect(meta.loading_phrase).toHaveLength(100_000)
    expect(await (await entries[0].blob()).text()).toBe('ogg')
  })

  it('skips files that point past the end of the container', async () => {
    const sng = makeSng([], [
      { name: 'song.ogg', data: 'ogg' },
      { name: 'broken.ogg', data: 'xyz', size: 1_000_000 },
    ])
    const { entries } = await openSng(new Blob([sng]))
    expect(entries.map((e) => e.name)).toEqual(['song.ogg'])
  })

  it('rejects files that are not .sng containers or are cut short', async () => {
    const zip = new Blob(['PK\u0003\u0004 not an sng at all, sorry'])
    await expect(openSng(zip)).rejects.toThrow('This is not a .sng file')
    const sng = makeSng([['name', 'x'.repeat(1000)]], [{ name: 'song.ogg', data: 'ogg' }])
    await expect(openSng(new Blob([sng.subarray(0, 500)]))).rejects.toThrow('This .sng file is damaged')
  })
})

import { crc32, deflateRawSync } from 'node:zlib'
import { AUDIO_EXTENSIONS, importFiles, loadChart, type SongPackage } from './importer'

const enc = (text: string) => new TextEncoder().encode(text)
const bytesOf = (data: Uint8Array | string) => (typeof data === 'string' ? enc(data) : data)

/** A minimal ZIP writer: charts are deflated, everything else stored. */
function makeZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const out: number[] = []
  const central: number[] = []
  const u16 = (list: number[], n: number) => list.push(n & 255, (n >>> 8) & 255)
  const u32 = (list: number[], n: number) => list.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255)
  const names = Object.keys(files)
  for (const path of names) {
    const data = bytesOf(files[path])
    const method = /\.(chart|mid|ini)$/.test(path) ? 8 : 0
    const body = method ? new Uint8Array(deflateRawSync(data)) : data
    const name = enc(path)
    const offset = out.length
    const fields = (list: number[]) => {
      u16(list, 20)
      u16(list, 0x0800)
      u16(list, method)
      u32(list, 0)
      u32(list, crc32(data))
      u32(list, body.length)
      u32(list, data.length)
      u16(list, name.length)
      u16(list, 0)
    }
    u32(out, 0x04034b50)
    fields(out)
    out.push(...name, ...body)
    u32(central, 0x02014b50)
    u16(central, 20)
    fields(central)
    u16(central, 0)
    u16(central, 0)
    u16(central, 0)
    u32(central, 0)
    u32(central, offset)
    central.push(...name)
  }
  const cdOffset = out.length
  out.push(...central)
  u32(out, 0x06054b50)
  u32(out, 0)
  u16(out, names.length)
  u16(out, names.length)
  u32(out, central.length)
  u32(out, cdOffset)
  u16(out, 0)
  return new Uint8Array(out)
}

/** A minimal notes.mid: 120 BPM at 480 ticks per beat, one track per part. */
function makeMidi(parts: Record<string, [tick: number, key: number, length: number][]>): Uint8Array {
  const vlq = (n: number) => {
    const out = [n & 0x7f]
    for (n >>= 7; n > 0; n >>= 7) out.unshift((n & 0x7f) | 0x80)
    return out
  }
  const track = (name: string, events: [number, number[]][]) => {
    const body: number[] = [0, 0xff, 0x03, name.length, ...enc(name)]
    let last = 0
    for (const [tick, bytes] of events.sort((a, b) => a[0] - b[0])) {
      body.push(...vlq(tick - last), ...bytes)
      last = tick
    }
    body.push(0, 0xff, 0x2f, 0)
    return [...enc('MTrk'), (body.length >>> 24) & 255, (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255, ...body]
  }
  const tracks = [track('tempo', [[0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]]])]
  for (const [name, notes] of Object.entries(parts)) {
    const events: [number, number[]][] = []
    for (const [tick, key, length] of notes) events.push([tick, [0x90, key, 100]], [tick + length, [0x80, key, 0]])
    tracks.push(track(name, events))
  }
  const header = [...enc('MThd'), 0, 0, 0, 6, 0, 1, 0, tracks.length, 0x01, 0xe0]
  return new Uint8Array([...header, ...tracks.flat()])
}

/** A minimal .sng writer. */
function makeSng(meta: Record<string, string>, files: Record<string, Uint8Array | string>): Uint8Array {
  const mask = Array.from({ length: 16 }, (_, i) => (i * 29 + 3) & 255)
  const u32 = (list: number[], n: number) => list.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255)
  const u64 = (list: number[], n: number) => {
    u32(list, n)
    u32(list, 0)
  }
  const metaSection: number[] = []
  u64(metaSection, Object.keys(meta).length)
  for (const [key, value] of Object.entries(meta)) {
    u32(metaSection, enc(key).length)
    metaSection.push(...enc(key))
    u32(metaSection, enc(value).length)
    metaSection.push(...enc(value))
  }
  const datas = Object.values(files).map(bytesOf)
  const names = Object.keys(files).map(enc)
  const indexLength = 8 + names.reduce((sum, n) => sum + 17 + n.length, 0)
  let at = 26 + 8 + metaSection.length + 8 + indexLength + 8
  const index: number[] = []
  u64(index, names.length)
  names.forEach((name, i) => {
    index.push(name.length, ...name)
    u64(index, datas[i].length)
    u64(index, at)
    at += datas[i].length
  })
  const out: number[] = [...enc('SNGPKG')]
  u32(out, 1)
  out.push(...mask)
  u64(out, metaSection.length)
  out.push(...metaSection)
  u64(out, index.length)
  out.push(...index)
  u64(out, datas.reduce((sum, d) => sum + d.length, 0))
  for (const data of datas) data.forEach((b, i) => out.push(b ^ mask[i % 16] ^ (i & 0xff)))
  return new Uint8Array(out)
}

const chartText = (name: string, artist: string, extra = '') => `[Song]
{
  Name = "${name}"
  Artist = "${artist}"
  Resolution = 192
  Offset = 0
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 1 96
  384 = N 2 0
}
[ExpertDoubleBass]
{
  0 = N 0 0
}
${extra}`

const DRUM_CHART = '[Song]\n{\n  Resolution = 192\n}\n[ExpertDrums]\n{\n  0 = N 0 0\n}\n'
const GUITAR_MIDI = makeMidi({
  'PART GUITAR': [
    [0, 96, 60],
    [480, 97, 60],
  ],
  'PART KEYS': [[960, 72, 60]],
})

const file = (name: string, data: Uint8Array | string = 'x', path?: string) => {
  const f = new File([bytesOf(data)], name)
  if (path) Object.defineProperty(f, 'webkitRelativePath', { value: path })
  return f
}

const PACK = makeZip({
  'Pack/Artist - Song A/notes.chart': chartText('Chart Name', 'Chart Artist'),
  'Pack/Artist - Song A/song.ini': '[song]\nname = Ini Name\ndiff_guitar = 5\ndelay = 500\n',
  'Pack/Artist - Song A/song.ogg': 'OggS',
  'Pack/Artist - Song A/Album.PNG': 'PNG',
  'Pack/Artist - Song A/readme.txt': 'hello',
  'Pack/Artist - Song A/background.jpg': 'JPG',
  'Pack/Deep/Nested/Song B/notes.mid': GUITAR_MIDI,
  'Pack/Deep/Nested/Song B/guitar.opus': 'Opus',
  '__MACOSX/Pack/Deep/Nested/Song B/._notes.mid': 'fork',
  'Pack/.DS_Store': 'junk',
  'Pack/notes.txt': 'junk',
})

const byName = (songs: SongPackage[]) => Object.fromEntries(songs.map((s) => [s.meta.name, s]))

describe('importFiles', () => {
  it('imports every song folder in a zip and keeps only the files songs use', async () => {
    const messages: string[] = []
    const { songs, errors } = await importFiles([file('Pack.zip', PACK)], (m) => messages.push(m))
    expect(errors).toEqual([])
    expect(songs).toHaveLength(2)
    expect(messages).toContain('Reading Pack.zip…')
    expect(messages).toContain('Found 2 songs…')

    const { 'Ini Name': a, 'Song B': b } = byName(songs)
    expect(a.chartFile).toBe('notes.chart')
    expect(Object.keys(a.files).sort()).toEqual(['album.png', 'notes.chart', 'song.ini', 'song.ogg'])
    expect(a.source).toBe('Pack.zip/Pack/Artist - Song A')
    expect(a.meta.artist).toBe('Chart Artist')
    expect(a.meta.delay).toBe(0.5)
    expect(a.meta.intensity).toEqual({ guitar: 5, bass: 0, rhythm: -1, keys: -1, coop: -1 })
    // No song_length: the song ends with the last note (tick 384 at 120 BPM, after the 0.5 s delay).
    expect(a.meta.length).toBeCloseTo(1.5)
    expect(await a.files['song.ogg'].text()).toBe('OggS')

    expect(b.chartFile).toBe('notes.mid')
    expect(Object.keys(b.files).sort()).toEqual(['guitar.opus', 'notes.mid'])
    expect(b.meta.intensity).toEqual({ guitar: 0, bass: -1, rhythm: -1, keys: 0, coop: -1 })
    expect(new Uint8Array(await b.files['notes.mid'].arrayBuffer())).toEqual(GUITAR_MIDI)
  })

  it('gives the same song the same id every time', async () => {
    const first = await importFiles([file('Pack.zip', PACK)])
    const again = await importFiles([file('Copy.zip', PACK)])
    const ids = first.songs.map((s) => s.id)
    expect(ids.every((id) => /^[0-9a-f]{16}$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(2)
    expect(again.songs.map((s) => s.id)).toEqual(ids)
    // Picking the same song twice in one go imports it once.
    const twice = await importFiles([file('Pack.zip', PACK), file('Copy.zip', PACK)])
    expect(twice.songs).toHaveLength(2)
  })

  it('parses saved songs with their song.ini settings', async () => {
    const { songs } = await importFiles([file('Pack.zip', PACK)])
    const chart = await loadChart(byName(songs)['Ini Name'])
    expect(chart.offset).toBe(0.5)
    expect(chart.tracks[0].notes[0].time).toBe(0.5)
    const midi = await loadChart(byName(songs)['Song B'])
    expect(midi.tracks.map((t) => t.instrument)).toEqual(['guitar', 'keys'])
  })

  it('imports loose files as one song', async () => {
    const { songs, errors } = await importFiles([
      file('notes.chart', chartText('Loose', 'Band')),
      file('song.ini', 'name = Loose From Ini\nsong_length = 90000'),
      file('Song.OGG', 'OggS'),
      file('random.txt'),
    ])
    expect(errors).toEqual([])
    expect(songs).toHaveLength(1)
    expect(songs[0].meta.name).toBe('Loose From Ini')
    expect(songs[0].meta.length).toBe(90)
    expect(Object.keys(songs[0].files).sort()).toEqual(['notes.chart', 'song.ini', 'song.ogg'])
  })

  it('prefers notes.mid, falling back to notes.chart when the MIDI has nothing to play', async () => {
    const both = await importFiles([file('notes.chart', chartText('C', 'A')), file('notes.mid', GUITAR_MIDI), file('song.ogg')])
    expect(both.songs[0].chartFile).toBe('notes.mid')
    expect(Object.keys(both.songs[0].files)).not.toContain('notes.chart')
    const drumMidi = makeMidi({ 'PART DRUMS': [[0, 96, 60]] })
    const fallback = await importFiles([file('notes.chart', chartText('C', 'A')), file('notes.mid', drumMidi), file('song.ogg')])
    expect(fallback.songs[0].chartFile).toBe('notes.chart')
  })

  it('asks for one song at a time when loose files hold several charts', async () => {
    const { songs, errors } = await importFiles([
      file('notes.chart', chartText('One', 'A')),
      file('notes.chart', chartText('Two', 'B')),
      file('song.ogg'),
    ])
    expect(songs).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].reason).toMatch(/one song at a time/)
    expect(errors[0].reason).toMatch(/\.zip/)
  })

  it('groups files by folder when the browser gives folder paths', async () => {
    const { songs, errors } = await importFiles([
      file('notes.chart', chartText('First', 'A'), 'Songs/First/notes.chart'),
      file('song.ogg', 'a', 'Songs/First/song.ogg'),
      file('notes.chart', chartText('', ''), 'Songs/Second Song/notes.chart'),
      file('guitar.mp3', 'b', 'Songs/Second Song/guitar.mp3'),
      file('cover.txt', 'c', 'Songs/cover.txt'),
    ])
    expect(errors).toEqual([])
    expect(songs.map((s) => s.meta.name).sort()).toEqual(['First', 'Second Song'])
  })

  it('imports .sng files, alone or inside a zip', async () => {
    const sng = makeSng(
      { name: 'Sng Name', artist: 'Sng Artist', diff_guitar: '3', charter: '<b>Bold</b> Charter' },
      { 'notes.chart': chartText('Chart Name', 'Chart Artist'), 'song.opus': 'Opus', 'album.jpg': 'JPG' },
    )
    const alone = await importFiles([file('My Song.sng', sng)])
    expect(alone.errors).toEqual([])
    const [song] = alone.songs
    expect(song.meta.name).toBe('Sng Name')
    expect(song.meta.artist).toBe('Sng Artist')
    expect(song.meta.charter).toBe('Bold Charter')
    expect(song.meta.intensity.guitar).toBe(3)
    expect(Object.keys(song.files).sort()).toEqual(['album.jpg', 'notes.chart', 'song.opus'])
    expect(await song.files['song.opus'].text()).toBe('Opus')

    const zipped = await importFiles([file('Sngs.zip', makeZip({ 'Songs/My Song.sng': sng }))])
    expect(zipped.songs.map((s) => s.id)).toEqual([song.id])
    expect(zipped.songs[0].source).toBe('Sngs.zip/Songs/My Song.sng')
  })

  it('falls back to the folder or file name when nothing names the song', async () => {
    const zip = makeZip({ 'notes.mid': GUITAR_MIDI, 'song.ogg': 'OggS' })
    const { songs } = await importFiles([file('Great Tune.zip', zip)])
    expect(songs[0].meta.name).toBe('Great Tune')
  })

  it('explains what it could not import', async () => {
    const { songs, errors } = await importFiles([
      file('Songs.rar'),
      file('Songs.7z'),
      file('Drums.zip', makeZip({ 'Drums/notes.chart': DRUM_CHART, 'Drums/song.ogg': 'OggS' })),
      file('Silent.zip', makeZip({ 'Silent/notes.chart': chartText('Silent', 'Band') })),
      file('Empty.zip', makeZip({ 'readme.txt': 'nothing here' })),
      file('Broken.zip', 'not really a zip'),
      file('Broken.sng', 'not really an sng file at all'),
    ])
    expect(songs).toEqual([])
    expect(errors).toEqual([
      { source: 'Songs.rar', reason: 'Extract .rar and .7z archives first, or re-save them as .zip' },
      { source: 'Songs.7z', reason: 'Extract .rar and .7z archives first, or re-save them as .zip' },
      { source: 'Empty.zip', reason: expect.stringMatching(/No songs found/) },
      { source: 'Broken.zip', reason: 'This is not a zip file' },
      { source: 'Broken.sng', reason: 'This is not a .sng file' },
      {
        source: 'Drums.zip/Drums',
        reason: "No guitar, bass, rhythm or keys part to play (drum-only charts aren't supported)",
      },
      { source: 'Silent.zip/Silent', reason: 'No audio file found' },
    ])
  })

  it('reports loose files that are not a song', async () => {
    const audioOnly = await importFiles([file('song.ogg')])
    expect(audioOnly.errors[0].reason).toMatch(/No notes\.chart or notes\.mid found/)
    const junk = await importFiles([file('photo.heic'), file('notes.txt')])
    expect(junk.errors).toEqual([{ source: 'photo.heic, notes.txt', reason: expect.stringMatching(/^Not a song/) }])
    // Junk next to a real import is ignored.
    const mixed = await importFiles([file('Pack.zip', PACK), file('photo.heic')])
    expect(mixed.errors).toEqual([])
  })

  it('lists the audio formats it accepts', () => {
    expect(AUDIO_EXTENSIONS).toEqual(['ogg', 'opus', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'webm'])
  })
})

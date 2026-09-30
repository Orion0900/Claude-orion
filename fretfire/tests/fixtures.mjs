// Builds a small importable song in memory: a .chart, a song.ini and a WAV,
// zipped the way chart packs usually come. Everything here is generated.
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc32 = (buf) => {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** A stored (uncompressed) zip of { path: Buffer }. */
export function zip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

/** A mono 16-bit WAV: a click on every beat at `bpm` for `seconds`. */
export function clickTrack(seconds, bpm = 120, rate = 22050) {
  const n = Math.round(seconds * rate)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  const beat = (60 / bpm) * rate
  for (let i = 0; i < n; i++) {
    const t = (i % beat) / rate
    const v = t < 0.05 ? Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 60) * 0.5 : 0
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

/** A .chart at 120 BPM: one note per beat from beat 4, with a chord, a sustain, a star phrase and a solo. */
export function chartText(beats = 36) {
  const lines = []
  for (let b = 4; b < 4 + beats; b++) {
    const tick = b * 192
    lines.push(`  ${tick} = N ${b % 5} ${b === 10 ? 384 : 0}`)
    if (b % 8 === 0) lines.push(`  ${tick} = N ${(b + 2) % 5} 0`)
  }
  return [
    '[Song]',
    '{',
    '  Name = "Fixture Song"',
    '  Artist = "Fretfire Tests"',
    '  Charter = "Fretfire Tests"',
    '  Resolution = 192',
    '  Offset = 0',
    '}',
    '[SyncTrack]',
    '{',
    '  0 = TS 4',
    '  0 = B 120000',
    '}',
    '[Events]',
    '{',
    '  768 = E "section Start"',
    '}',
    '[ExpertSingle]',
    '{',
    ...lines,
    `  ${12 * 192} = S 2 ${4 * 192}`,
    `  ${20 * 192} = E solo`,
    `  ${28 * 192} = E soloend`,
    '}',
    '',
  ].join('\r\n')
}

export function fixtureZip() {
  return zip({
    'Fixture Song/notes.chart': Buffer.from(chartText(), 'utf8'),
    'Fixture Song/song.ini': Buffer.from('[song]\nname = Fixture Song\nartist = Fretfire Tests\ndiff_guitar = 2\npreview_start_time = 4000\n', 'utf8'),
    'Fixture Song/song.wav': clickTrack(24),
  })
}

import { metaFromIni, parseIni, stripRichText } from './iniParser'

describe('parseIni', () => {
  it('reads the [song] section with lowercase keys and trimmed values', () => {
    const text = '\uFEFF[Song]\r\nName = My Song \r\nARTIST=The Band\r\n\r\n[other]\r\nname = Nope\r\n'
    expect(parseIni(text)).toEqual({ name: 'My Song', artist: 'The Band' })
  })

  it('matches the section name case-insensitively and lets the last duplicate win', () => {
    expect(parseIni('[SONG]\nname = One\nname = Two\n')).toEqual({ name: 'Two' })
  })

  it('skips comments and lines without a key', () => {
    const text = '[song]\n; comment\n# another\n// and another\njust text\n= no key\ndelay = 150\n'
    expect(parseIni(text)).toEqual({ delay: '150' })
  })

  it('reads top-level keys when there is no section header', () => {
    expect(parseIni('name=Loose\nartist = Someone')).toEqual({ name: 'Loose', artist: 'Someone' })
    expect(parseIni('name = Stray\n[song]\nartist = Someone')).toEqual({ artist: 'Someone' })
  })

  it('keeps everything after the first equals sign', () => {
    expect(parseIni('[song]\nloading_phrase = a = b')).toEqual({ loading_phrase: 'a = b' })
  })
})

describe('metaFromIni', () => {
  it('maps song.ini keys to song metadata', () => {
    const meta = metaFromIni(
      parseIni(
        [
          '[song]',
          'name = Through the Fire',
          'artist = Band',
          'album = Album',
          'genre = Rock',
          'year = 2004',
          'charter = Someone',
          'song_length = 441000',
          'preview_start_time = 60500',
          'delay = -120',
          'diff_guitar = 6',
          'diff_bass = 3',
          'diff_rhythm = -1',
          'diff_keys = 2',
          'diff_guitar_coop = 4',
          'hopo_frequency = 170',
          'sustain_cutoff_threshold = 80',
          'loading_phrase = Good luck!',
        ].join('\n'),
      ),
    )
    expect(meta).toEqual({
      name: 'Through the Fire',
      artist: 'Band',
      album: 'Album',
      genre: 'Rock',
      year: '2004',
      charter: 'Someone',
      length: 441,
      previewStart: 60.5,
      delay: -0.12,
      intensity: { guitar: 6, bass: 3, rhythm: -1, keys: 2, coop: 4 },
      hopoFrequency: 170,
      sustainCutoff: 80,
      loadingPhrase: 'Good luck!',
    })
  })

  it('falls back to frets for the charter', () => {
    expect(metaFromIni({ frets: 'Old Charter' }).charter).toBe('Old Charter')
    expect(metaFromIni({ charter: '', frets: 'Old Charter' }).charter).toBe('Old Charter')
    expect(metaFromIni({ charter: 'New', frets: 'Old' }).charter).toBe('New')
  })

  it('strips rich-text tags from display strings', () => {
    const meta = metaFromIni({
      name: '<color=#ff0000>Red</color> <b>Song</b>',
      artist: '<size=120%><i>Artist</i></size>',
      charter: '<#00ff00>Green</color>',
      loading_phrase: 'Line one<br>line two',
    })
    expect(meta.name).toBe('Red Song')
    expect(meta.artist).toBe('Artist')
    expect(meta.charter).toBe('Green')
    expect(meta.loadingPhrase).toBe('Line one line two')
  })

  it('ignores numbers it cannot read and states only what the file has', () => {
    const meta = metaFromIni({
      song_length: 'abc',
      delay: '',
      diff_guitar: 'lots',
      hopo_frequency: '0',
      preview_start_time: '-1',
      name: '   ',
    })
    expect(meta).toEqual({})
  })
})

describe('stripRichText', () => {
  it('leaves text that only looks like a tag alone', () => {
    expect(stripRichText('I <3 U')).toBe('I <3 U')
    expect(stripRichText('Song <Live>')).toBe('Song <Live>')
    expect(stripRichText('<font-weight=700>Bold</font-weight>')).toBe('Bold')
  })
})

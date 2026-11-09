import { JINGLE_IDS, TRACK_IDS } from './ids'
import { jingle, track } from './tracks'

describe('music', () => {
  it.each(TRACK_IDS)('track %s compiles with whole bars on every channel', (id) => {
    const song = track(id)
    expect(song.body.len).toBeGreaterThan(0)
    expect(song.body.len % song.barTicks).toBe(0)
  })
  it.each(JINGLE_IDS)('jingle %s compiles', (id) => {
    const song = jingle(id)
    expect(song.body.len).toBeGreaterThan(0)
  })
})

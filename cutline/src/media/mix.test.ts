import { decodedAudioReader, renderEditedAudio, type AudioReader, type DecodedAudio } from './mix'
import { buildTimeline } from './ranges'

/** A source whose every sample says what time it is: value = source seconds / 100. */
function clockSource(rate: number, seconds: number, channels = 1): DecodedAudio {
  const data = Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => i / rate / 100)
  return { sampleRate: rate, channels: Array.from({ length: channels }, () => data), duration: seconds }
}

describe('renderEditedAudio', () => {
  const rate = 1000
  const source = clockSource(rate, 30)
  const timeline = buildTimeline([
    { start: 0.4, end: 6 },
    { start: 8, end: 14.2 },
    { start: 15.5, end: 25 },
  ])

  it('places each kept span back to back at the right source moment', async () => {
    const out = await renderEditedAudio(decodedAudioReader(source), timeline, { sampleRate: rate, channelCount: 1, length: 21300 })
    expect(out.length).toBe(1)
    expect(out[0].length).toBe(21300)
    const at = (edited: number) => out[0][Math.round(edited * rate)] * 100
    expect(at(1)).toBeCloseTo(1.4, 4)
    expect(at(5.5)).toBeCloseTo(5.9, 4)
    expect(at(5.7)).toBeCloseTo(8.1, 4)
    expect(at(11.7)).toBeCloseTo(14.1, 4)
    expect(at(12)).toBeCloseTo(15.7, 4)
    expect(at(21.2)).toBeCloseTo(24.9, 4)
  })

  it('crossfades over 10 ms centred on each cut', async () => {
    const out = await renderEditedAudio(decodedAudioReader(source), timeline, { sampleRate: rate, channelCount: 1, length: 21300 })
    const join = 5600
    // 5 ms either side of the join is a blend of the two sources, reading each past its cut.
    for (let n = join - 5; n < join + 5; n++) {
      const t = n / rate
      const a = 0.4 + t // the first span carried on
      const b = 8 + (t - 5.6) // the second span started early
      const v = out[0][n] * 100
      const g = (v - a) / (b - a)
      expect(g).toBeGreaterThan(0)
      expect(g).toBeLessThan(1)
    }
    expect(out[0][join - 6] * 100).toBeCloseTo(0.4 + (join - 6) / rate, 4)
    expect(out[0][join + 5] * 100).toBeCloseTo(8 + (join + 5) / rate - 5.6, 4)
  })

  it('fades the very start and end', async () => {
    const out = await renderEditedAudio(decodedAudioReader(source), timeline, { sampleRate: rate, channelCount: 1, length: 21300 })
    // At this toy 1 kHz rate a 5 ms fade is 5 samples; the last one is at 2.4% gain.
    expect(Math.abs(out[0][0])).toBeLessThan(0.03 * 0.004)
    expect(Math.abs(out[0][21299])).toBeLessThan(0.03 * 0.25)
    expect(Math.abs(out[0][21290]) * 100).toBeCloseTo(24.99, 4)
  })

  it('resamples a source at another rate onto the output clock', async () => {
    const src: DecodedAudio = {
      sampleRate: 44100,
      channels: [Float32Array.from({ length: 44100 * 10 }, (_, i) => Math.sin((2 * Math.PI * 100 * i) / 44100))],
      duration: 10,
    }
    const tl = buildTimeline([
      { start: 1, end: 3 },
      { start: 5.0025, end: 7 },
    ])
    const out = await renderEditedAudio(decodedAudioReader(src), tl, { sampleRate: 48000, channelCount: 2, length: 48000 * 4 })
    expect(out.length).toBe(2)
    for (const edited of [0.5, 1.5, 2.5, 3.9]) {
      const s = edited < 2 ? 1 + edited : 5.0025 + edited - 2
      const n = Math.round(edited * 48000)
      expect(out[0][n]).toBeCloseTo(Math.sin(2 * Math.PI * 100 * (n / 48000 - edited + s)), 2)
      expect(out[1][n]).toBe(out[0][n])
    }
  })

  it('reads through the AudioReader interface, one span at a time', async () => {
    const calls: [number, number][] = []
    const inner = decodedAudioReader(source)
    const reader: AudioReader = { ...inner, read: (start, frames) => (calls.push([start, frames]), inner.read(start, frames)) }
    await renderEditedAudio(reader, timeline, { sampleRate: rate, channelCount: 1, length: 21300 })
    expect(calls.length).toBe(3)
    expect(calls[0][0]).toBeCloseTo(0.4, 9)
    expect(calls[1][0]).toBeCloseTo(8 - 0.005, 9)
    expect(calls[2][0]).toBeCloseTo(15.5 - 0.005, 9)
    expect(calls.reduce((n, c) => n + c[1], 0)).toBe(21300 + 2 * 10)
  })

  it('lays music under the speech, ducked while it talks', async () => {
    const r = 8000
    const speech: DecodedAudio = { sampleRate: r, channels: [new Float32Array(r * 6)], duration: 6 }
    speech.channels[0].set(Float32Array.from({ length: r * 2 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 200 * i) / r)), r * 3)
    const musicData = Float32Array.from({ length: r }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 50 * i) / r))
    const music: DecodedAudio = { sampleRate: r, channels: [musicData, musicData], duration: 1 }
    const tl = buildTimeline([{ start: 0, end: 6 }])
    const out = await renderEditedAudio(decodedAudioReader(speech), tl, {
      sampleRate: r,
      channelCount: 2,
      length: r * 6,
      music: { audio: music, volume: 0.8, ducking: true },
    })
    // Music level in a window: projection onto the (looped) music signal.
    const level = (from: number) => {
      let dot = 0
      let norm = 0
      for (let n = from * r; n < (from + 0.25) * r; n++) {
        const m = musicData[n % r] * 0.8
        dot += out[0][n] * m
        norm += m * m
      }
      return dot / norm
    }
    expect(level(1)).toBeCloseTo(1, 1)
    expect(level(4)).toBeCloseTo(0.25, 1)
    expect(level(5.5)).toBeGreaterThan(0.5)
  })

  it('makes a music-only soundtrack for a silent source', async () => {
    const music: DecodedAudio = { sampleRate: 1000, channels: [new Float32Array(1000).fill(0.5)], duration: 1 }
    const out = await renderEditedAudio(null, buildTimeline([{ start: 0, end: 3 }]), {
      sampleRate: 1000,
      channelCount: 1,
      length: 3000,
      music: { audio: music, volume: 1, ducking: true },
    })
    expect(out[0][500]).toBeCloseTo(0.5, 5)
    expect(out[0][2500]).toBeCloseTo(0.5, 5)
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      renderEditedAudio(decodedAudioReader(source), timeline, { sampleRate: rate, channelCount: 1, length: 21300, signal: controller.signal }),
    ).rejects.toThrow()
  })
})

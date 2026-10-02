import { describe, expect, it } from 'vitest'
import {
  analyse,
  loudUntil,
  planChunks,
  SAMPLE_RATE,
  speechAfter,
  speechIslands,
  speechSeconds,
} from './chunking'

/** A stand-in for speech: a loud tone. */
function tone(seconds: number, amplitude = 0.3): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE)
  return out
}

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * SAMPLE_RATE))
}

/** Steady hiss at a level in dBFS, the same every run. */
function hiss(seconds: number, db: number): Float32Array {
  const amplitude = 10 ** (db / 20) * Math.sqrt(3)
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  let seed = 1
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 16807) % 2147483647
    out[i] = (seed / 2147483647) * 2 * amplitude - amplitude
  }
  return out
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Tone with silent gaps: each [start, end] in seconds is a gap. */
function speechWithGaps(seconds: number, gaps: [number, number][]): Float32Array {
  const audio = tone(seconds)
  for (const [from, to] of gaps) audio.fill(0, Math.round(from * SAMPLE_RATE), Math.round(to * SAMPLE_RATE))
  return audio
}

const plan = (audio: Float32Array) => planChunks(analyse(audio), audio.length / SAMPLE_RATE)

describe('analyse', () => {
  it('measures the mean square of each 10 ms frame', () => {
    const profile = analyse(new Float32Array(SAMPLE_RATE / 2).fill(0.5))
    expect(profile.frameSeconds).toBe(0.01)
    expect(profile.power).toHaveLength(50)
    expect(profile.power[0]).toBeCloseTo(0.25)
  })

  it('finds no speech in digital silence', () => {
    const profile = analyse(silence(2))
    expect(profile.threshold).toBe(Infinity)
    expect(speechSeconds(profile, 0, 2)).toBe(0)
  })

  it('counts sound a little above the noise floor as speech, and the floor itself not', () => {
    const profile = analyse(concat(hiss(3, -50), tone(1), hiss(3, -50)))
    expect(speechSeconds(profile, 0, 3)).toBe(0)
    expect(speechSeconds(profile, 3, 4)).toBeCloseTo(1, 1)
  })

  it('ignores digital silence when finding the noise floor', () => {
    // Mostly padding, so the floor must come from the hiss, not the zeros.
    const profile = analyse(concat(silence(10), hiss(1, -40), tone(0.5)))
    expect(speechSeconds(profile, 10, 11)).toBe(0)
    expect(speechSeconds(profile, 11, 11.5)).toBeCloseTo(0.5, 1)
  })
})

describe('speech helpers', () => {
  // A quiet room's hiss between the sounds, as in any real recording.
  const room = (seconds: number) => hiss(seconds, -60)
  const profile = analyse(concat(room(1), tone(0.5), room(0.1), tone(0.4), room(0.5), tone(0.2), room(1)))

  it('splits sound into islands at gaps at least as long as asked', () => {
    const islands = speechIslands(profile, 0, 3.7, 0.25)
    expect(islands).toHaveLength(2)
    expect(islands[0].start).toBeCloseTo(1, 2)
    expect(islands[0].end).toBeCloseTo(2, 2)
    expect(islands[0].loud).toBeCloseTo(0.9, 1)
    expect(islands[1].start).toBeCloseTo(2.5, 2)
    expect(islands[1].end).toBeCloseTo(2.7, 2)
    expect(speechIslands(profile, 0, 3.7, 0.05)).toHaveLength(3)
  })

  it('follows sound past a time, up to a limit', () => {
    expect(loudUntil(profile, 1.2, -1, 0.3)).toBeCloseTo(1, 2)
    expect(loudUntil(profile, 1.4, -1, 0.3)).toBeCloseTo(1.1, 2)
    expect(loudUntil(profile, 1.3, 1, 0.3)).toBeCloseTo(1.5, 2)
    expect(loudUntil(profile, 0.5, 1, 0.3)).toBe(0.5)
    expect(loudUntil(profile, 3.5, -1, 0.3)).toBe(3.5)
  })

  it('finds speech after a time only when there is enough of it', () => {
    expect(speechAfter(profile, 0, 3.7, 0.5)).toBeCloseTo(1, 2)
    expect(speechAfter(profile, 2.1, 3.7, 0.5)).toBeNull()
    expect(speechAfter(profile, 2.1, 3.7, 0.15)).toBeCloseTo(2.5, 2)
  })
})

describe('planChunks', () => {
  it('returns nothing for no audio', () => {
    expect(plan(new Float32Array(0))).toEqual([])
  })

  it('keeps audio up to 28 s whole', () => {
    expect(plan(tone(20))).toEqual([{ start: 0, end: 20, speech: true }])
    expect(plan(tone(28))).toHaveLength(1)
  })

  it('cuts long audio into windows of at most 28 s, in the quiet', () => {
    const gaps: [number, number][] = [
      [5, 5.6],
      [17, 17.6],
      [38, 38.6],
    ]
    const audio = speechWithGaps(60, gaps)
    const chunks = plan(audio)
    expect(chunks).toHaveLength(3)
    expect(chunks[0].start).toBe(0)
    expect(chunks.at(-1)?.end).toBe(60)
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].end - chunks[i].start).toBeLessThanOrEqual(28)
      if (i > 0) expect(chunks[i].start).toBe(chunks[i - 1].end)
    }
    // Each cut sits in the middle of a gap, nowhere near the tone.
    expect(chunks[0].end).toBeCloseTo(17.3, 1)
    expect(chunks[1].end).toBeCloseTo(38.3, 1)
  })

  it('never cuts through a word', () => {
    // Words of 0.3-0.7 s with 0.15 s pauses between them, for two minutes.
    const gaps: [number, number][] = []
    for (let t = 0, i = 0; t < 120; i++) {
      t += 0.3 + ((i * 7) % 5) / 10
      gaps.push([t, t + 0.15])
      t += 0.15
    }
    const audio = speechWithGaps(120, gaps)
    const profile = analyse(audio)
    const chunks = planChunks(profile, 120)
    expect(chunks.length).toBeGreaterThanOrEqual(5)
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.end - chunk.start).toBeLessThanOrEqual(28)
      const frame = Math.round(chunk.end / profile.frameSeconds)
      expect(profile.power[frame - 1]).toBe(0)
      expect(profile.power[frame]).toBe(0)
    }
  })

  it('shares the audio out evenly, so the last window is no stub', () => {
    const chunks = plan(tone(29))
    expect(chunks).toHaveLength(2)
    expect(chunks[0].end).toBeCloseTo(14.5, 1)
  })

  it('marks windows with nothing to hear', () => {
    const chunks = plan(concat(tone(30), silence(30)))
    expect(chunks.map((c) => c.speech)).toEqual([true, true, false])
    expect(plan(hiss(20, -50))[0].speech).toBe(false)
    // A quiet bump is not speech either.
    expect(plan(concat(hiss(10, -60), hiss(0.05, -45), hiss(10, -60)))[0].speech).toBe(false)
  })

  it('always transcribes loud audio, even when nothing stands out in it', () => {
    // Steady loud sound, like a voice over music at the same level.
    expect(plan(hiss(20, -20))[0].speech).toBe(true)
  })
})

import { ChunkCollector } from './collector'
import { audioBitrate, avcCodecString, videoBitrate } from './codecs'
import { decodeFrameSize } from './export'

describe('videoBitrate', () => {
  it('gives ~10 Mbps for 1080x1920 H.264 at 30 fps, and scales sensibly', () => {
    expect(videoBitrate('avc', 1080, 1920, 30)).toBe(9_953_000)
    expect(videoBitrate('avc', 720, 1280, 30)).toBe(4_424_000)
    expect(videoBitrate('vp9', 1080, 1920, 30)).toBeLessThan(videoBitrate('avc', 1080, 1920, 30))
    const sixty = videoBitrate('avc', 1080, 1920, 60)
    expect(sixty / videoBitrate('avc', 1080, 1920, 30)).toBeCloseTo(1.516, 2)
    expect(videoBitrate('avc', 3840, 2160, 60)).toBe(24_000_000)
    expect(videoBitrate('avc', 160, 160, 30)).toBe(1_000_000)
  })
})

describe('avcCodecString', () => {
  it('picks a level that covers size, frame rate and bitrate', () => {
    expect(avcCodecString(1080, 1920, 30, 10e6)).toBe('avc1.640028') // 4.0
    expect(avcCodecString(1080, 1920, 60, 15e6)).toBe('avc1.64002a') // 4.2
    expect(avcCodecString(720, 1280, 30, 4.4e6)).toBe('avc1.64001f') // 3.1
    expect(avcCodecString(2160, 3840, 30, 24e6)).toBe('avc1.640033') // 5.1
    expect(avcCodecString(2160, 3840, 60, 24e6)).toBe('avc1.640034') // 5.2
  })
})

describe('audioBitrate', () => {
  it('uses AAC-legal rates', () => {
    expect(audioBitrate('aac', 2)).toBe(128_000)
    expect(audioBitrate('aac', 1)).toBe(96_000)
    expect(audioBitrate('opus', 2)).toBe(96_000)
  })
})

describe('decodeFrameSize', () => {
  it('fits inside the box given, keeping the aspect and never enlarging', () => {
    expect(decodeFrameSize({ width: 2160, height: 3840 }, { width: 1080, height: 1920 }, { width: 1350, height: 2400 })).toEqual({ width: 1350, height: 2400 })
    expect(decodeFrameSize({ width: 3840, height: 2160 }, { width: 1080, height: 1920 }, { width: 1080, height: 1920 })).toEqual({ width: 1080, height: 608 })
    expect(decodeFrameSize({ width: 720, height: 1280 }, { width: 1080, height: 1920 }, { width: 1080, height: 1920 })).toEqual({ width: 720, height: 1280 })
  })

  it('without a box, covers the output with room to zoom', () => {
    expect(decodeFrameSize({ width: 2160, height: 3840 }, { width: 1080, height: 1920 })).toEqual({ width: 1350, height: 2400 })
    expect(decodeFrameSize({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toEqual({ width: 1920, height: 1080 })
  })
})

describe('ChunkCollector', () => {
  const bytes = async (blob: Blob) => Array.from(new Uint8Array(await blob.arrayBuffer()))
  const seq = (from: number, n: number) => Uint8Array.from({ length: n }, (_, i) => from + i)

  it('appends, patches earlier bytes in place across chunks, and fills gaps with zeros', async () => {
    const c = new ChunkCollector(false)
    c.write(seq(0, 10), 0)
    c.write(seq(10, 10), 10)
    c.write(Uint8Array.of(100, 101, 102, 103), 8) // across the two chunks
    c.write(Uint8Array.of(200, 201, 202, 203, 204), 18) // overlaps the end and extends it
    c.write(Uint8Array.of(7), 25) // after a gap
    const out = await bytes(c.toBlob('video/webm'))
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 100, 101, 102, 103, 12, 13, 14, 15, 16, 17, 200, 201, 202, 203, 204, 0, 0, 7])
  })

  it('hands append-only output over to Blobs as it goes', async () => {
    const c = new ChunkCollector(true)
    const big = new Uint8Array(17 * 1024 * 1024).fill(3)
    c.write(big, 0)
    c.write(Uint8Array.of(9), big.length)
    expect(() => c.write(Uint8Array.of(1), 0)).toThrow()
    const blob = c.toBlob('video/mp4')
    expect(blob.size).toBe(big.length + 1)
    expect(blob.type).toBe('video/mp4')
    expect(Array.from(new Uint8Array(await blob.slice(blob.size - 2).arrayBuffer()))).toEqual([3, 9])
  })

  it('takes writes through its WritableStream, as an Output delivers them', async () => {
    const c = new ChunkCollector(false)
    const writer = c.writable.getWriter()
    await writer.write({ type: 'write', data: seq(0, 4), position: 0 })
    await writer.write({ type: 'write', data: Uint8Array.of(9), position: 1 })
    await writer.close()
    expect(await bytes(c.toBlob(''))).toEqual([0, 9, 2, 3])
  })
})

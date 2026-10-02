import type { StreamTargetChunk } from 'mediabunny'

const PIECE = 16 * 1024 * 1024

type Bytes = Uint8Array<ArrayBuffer>

/**
 * Gathers what an Output writes into a Blob. Unlike BufferTarget, which grows
 * one ArrayBuffer by doubling and then copies it out, this keeps the written
 * chunks as they are; when writes only ever append (MP4 with in-memory fast
 * start) it hands every 16 MB to a Blob straight away, so the encoded file
 * doesn't sit in the JS heap twice while it's being finished. Writes that go
 * back over earlier bytes (WebM patching its header) are applied in place.
 */
export class ChunkCollector {
  readonly writable: WritableStream<StreamTargetChunk>
  private pieces: Blob[] = []
  private piecesSize = 0
  private parts: Bytes[] = []
  private partsSize = 0

  constructor(private readonly appendOnly: boolean) {
    this.writable = new WritableStream<StreamTargetChunk>({ write: (chunk) => this.write(chunk.data, chunk.position) })
  }

  get size(): number {
    return this.piecesSize + this.partsSize
  }

  write(data: Bytes, position: number): void {
    const start = position - this.piecesSize
    if (start < 0) throw new Error('Output wrote into a part of the file already handed over.')
    if (start > this.partsSize) this.append(new Uint8Array(start - this.partsSize))
    const existing = this.partsSize
    const overlapEnd = Math.min(start + data.length, existing)
    if (start < overlapEnd) {
      let offset = 0
      for (const part of this.parts) {
        const partEnd = offset + part.length
        const from = Math.max(start, offset)
        const to = Math.min(overlapEnd, partEnd)
        if (from < to) part.set(data.subarray(from - start, to - start), from - offset)
        offset = partEnd
        if (offset >= overlapEnd) break
      }
    }
    if (start + data.length > existing) {
      const consumed = existing - start
      this.append(consumed === 0 ? data : data.slice(consumed))
    }
    if (this.appendOnly && this.partsSize >= PIECE) this.flush()
  }

  private append(data: Bytes): void {
    this.parts.push(data)
    this.partsSize += data.length
  }

  private flush(): void {
    this.pieces.push(new Blob(this.parts))
    this.piecesSize += this.partsSize
    this.parts = []
    this.partsSize = 0
  }

  toBlob(type: string): Blob {
    const blob = new Blob([...this.pieces, ...this.parts], { type })
    this.pieces = []
    this.parts = []
    this.piecesSize = 0
    this.partsSize = 0
    return blob
  }
}

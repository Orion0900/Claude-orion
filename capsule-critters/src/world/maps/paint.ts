/**
 * A little drawing kit for laying maps out in code: start from a fill and
 * paint rectangles, lines, blobs and pasted patterns of legend characters.
 * Routes are easier to shape (and to fix) this way than as typed rows.
 */
export class Paint {
  private readonly g: string[][]

  constructor(
    readonly w: number,
    readonly h: number,
    fill: string,
  ) {
    this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => fill))
  }

  set(x: number, y: number, ch: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = ch
    return this
  }

  get(x: number, y: number): string {
    return this.g[y]?.[x] ?? ''
  }

  rect(x: number, y: number, w: number, h: number, ch: string): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ch)
    return this
  }

  hline(x: number, y: number, len: number, ch: string): this {
    return this.rect(x, y, len, 1, ch)
  }

  vline(x: number, y: number, len: number, ch: string): this {
    return this.rect(x, y, 1, len, ch)
  }

  /** Fills an ellipse centred in the box (x, y, w, h). */
  blob(x: number, y: number, w: number, h: number, ch: string): this {
    const cx = x + (w - 1) / 2
    const cy = y + (h - 1) / 2
    const rx = w / 2
    const ry = h / 2
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) if (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1) this.set(xx, yy, ch)
    return this
  }

  /** Replaces one character with another inside a box. */
  swap(x: number, y: number, w: number, h: number, from: string, to: string): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (this.get(xx, yy) === from) this.set(xx, yy, to)
    return this
  }

  /** Pastes literal rows at (x, y); '?' leaves the cell as it was. */
  paste(x: number, y: number, rows: readonly string[]): this {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] !== '?') this.set(x + dx, y + dy, row[dx])
    })
    return this
  }

  rows(): string[] {
    return this.g.map((r) => r.join(''))
  }
}

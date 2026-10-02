import type { CaptionPage, CaptionStyle, TimedWord } from '../lib/types'
import { presetStyle } from './presets'
import { displayText, drawCaptions, resetCaptionCaches } from './render'

/** Just enough of a 2D context to see what the renderer drew, and where. */
class FakeCtx {
  font = '10px sans-serif'
  fillStyle: unknown = '#000000'
  strokeStyle: unknown = '#000000'
  lineWidth = 1
  globalAlpha = 1
  shadowColor = 'rgba(0, 0, 0, 0)'
  shadowBlur = 0
  shadowOffsetX = 0
  shadowOffsetY = 0
  textAlign = 'start'
  textBaseline = 'alphabetic'
  lineJoin = 'miter'
  lineCap = 'butt'
  m = [1, 0, 0, 1, 0, 0]
  stack: Record<string, unknown>[] = []
  calls: { op: string; text: string; x: number; y: number; font: string; style: unknown; alpha: number; m: number[]; blur: number }[] = []
  fills: unknown[] = []
  saves = 0
  restores = 0

  static KEYS = [
    'font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'shadowColor', 'shadowBlur', 'shadowOffsetX',
    'shadowOffsetY', 'textAlign', 'textBaseline', 'lineJoin', 'lineCap',
  ] as const

  state(): Record<string, unknown> {
    const out: Record<string, unknown> = { m: [...this.m] }
    for (const k of FakeCtx.KEYS) out[k] = this[k]
    return out
  }
  save() {
    this.saves++
    this.stack.push(this.state())
  }
  restore() {
    this.restores++
    const s = this.stack.pop()
    if (s) Object.assign(this, s)
  }
  px() {
    return Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10)
  }
  measureText(text: string) {
    const px = this.px()
    return { width: [...text].length * px * 0.6, actualBoundingBoxAscent: px * 0.7, actualBoundingBoxDescent: px * 0.2 }
  }
  record(op: string, text: string, x: number, y: number) {
    const style = op === 'stroke' ? this.strokeStyle : this.fillStyle
    this.calls.push({ op, text, x, y, font: this.font, style, alpha: this.globalAlpha, m: [...this.m], blur: this.shadowBlur })
  }
  fillText(text: string, x: number, y: number) {
    this.record('fill', text, x, y)
  }
  strokeText(text: string, x: number, y: number) {
    this.record('stroke', text, x, y)
  }
  getTransform() {
    const [a, b, c, d, e, f] = this.m
    return { a, b, c, d, e, f }
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.m = [a, b, c, d, e, f]
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const [A, B, C, D, E, F] = this.m
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F]
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y)
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0)
  }
  beginPath() {}
  moveTo() {}
  arcTo() {}
  closePath() {}
  fill() {
    this.fills.push(this.fillStyle)
  }
  createLinearGradient() {
    const stops: [number, string][] = []
    return { stops, addColorStop: (o: number, c: string) => stops.push([o, c]) }
  }
  /** Where a recorded point lands on the canvas. */
  static device(call: { x: number; y: number; m: number[] }) {
    const [a, b, c, d, e, f] = call.m
    return { x: a * call.x + c * call.y + e, y: b * call.x + d * call.y + f }
  }
}

const asCtx = (c: FakeCtx) => c as unknown as CanvasRenderingContext2D
const FRAME = { width: 1080, height: 1920 }

function word(id: string, text: string, start: number, end: number, emphasis = false): TimedWord {
  return { id, text, start, end, emphasis }
}

const PAGE: CaptionPage = {
  index: 0,
  start: 1,
  end: 3,
  emoji: '💰',
  words: [word('a', 'thing', 1, 1.4), word('b', 'nobody', 1.5, 2, true), word('c', 'tells', 2, 2.5)],
}

function draw(style: CaptionStyle, t: number, page: CaptionPage | null = PAGE, frame = FRAME) {
  const ctx = new FakeCtx()
  drawCaptions(asCtx(ctx), page, t, style, frame)
  return ctx
}

/** The last fill of each word: what's left showing on the canvas. */
function finalFills(ctx: FakeCtx) {
  const out = new Map<string, FakeCtx['calls'][number]>()
  for (const c of ctx.calls) if (c.op === 'fill') out.set(c.text, c)
  return out
}

beforeEach(() => resetCaptionCaches())

describe('displayText', () => {
  it('trims, tidies spaces and uppercases with punctuation kept', () => {
    expect(displayText('  here’s  ', { uppercase: true })).toBe('HERE’S')
    expect(displayText('money, ', { uppercase: false })).toBe('money,')
    expect(displayText('straße!', { uppercase: true })).toBe('STRASSE!')
    expect(displayText('a  b', presetStyle('subtitle'))).toBe('a b')
  })
})

describe('drawCaptions', () => {
  it('does nothing without a page or outside it', () => {
    for (const ctx of [draw(presetStyle('bold'), 2, null), draw(presetStyle('bold'), 0.99), draw(presetStyle('bold'), 3)]) {
      expect(ctx.calls).toHaveLength(0)
      expect(ctx.saves).toBe(0)
    }
    expect(draw(presetStyle('bold'), 2, PAGE, { width: 0, height: 0 }).calls).toHaveLength(0)
  })

  it('leaves the context as it found it', () => {
    for (const id of ['bold', 'karaoke', 'box', 'neon', 'subtitle', 'marker'] as const) {
      const ctx = new FakeCtx()
      ctx.setTransform(2, 0, 0, 2, 5, 7)
      ctx.globalAlpha = 0.8
      ctx.fillStyle = '#123456'
      const before = ctx.state()
      drawCaptions(asCtx(ctx), PAGE, 1.7, presetStyle(id), FRAME)
      expect(ctx.state()).toEqual(before)
      expect(ctx.saves).toBe(ctx.restores)
      expect(ctx.calls.length).toBeGreaterThan(0)
    }
  })

  it('draws each word in its colour: active, emphasis or plain', () => {
    const style = presetStyle('bold')
    const fills = finalFills(draw(style, 2.2))
    expect([...fills.keys()].sort()).toEqual(['NOBODY', 'TELLS', 'THING', '💰'])
    expect(fills.get('TELLS')?.style).toBe(style.activeColor)
    expect(fills.get('NOBODY')?.style).toBe(style.emphasisColor)
    expect(fills.get('THING')?.style).toBe(style.textColor)
  })

  it('keeps the highlight on the last word through a pause', () => {
    const style = presetStyle('bold')
    const fills = finalFills(draw(style, 1.45))
    expect(fills.get('THING')?.style).toBe(style.activeColor)
  })

  it('outlines before filling', () => {
    const ctx = draw(presetStyle('bold'), 2.2)
    const firstFill = ctx.calls.findIndex((c) => c.op === 'fill' && c.text === 'THING')
    const firstStroke = ctx.calls.findIndex((c) => c.op === 'stroke' && c.text === 'THING')
    expect(firstStroke).toBeGreaterThanOrEqual(0)
    expect(firstStroke).toBeLessThan(firstFill)
  })

  it('hides typewriter words until they are spoken', () => {
    const style = presetStyle('typewriter')
    expect(draw(style, 1.2).calls.filter((c) => c.text !== '💰').map((c) => c.text)).not.toContain('nobody')
    expect(finalFills(draw(style, 1.6)).has('nobody')).toBe(true)
    expect(finalFills(draw(style, 1.6)).has('tells')).toBe(false)
  })

  it('fills karaoke words as they are said and keeps them filled', () => {
    const style = presetStyle('karaoke')
    const fills = finalFills(draw(style, 2.25))
    expect(fills.get('thing')?.style).toBe(style.activeColor)
    const sung = fills.get('tells')?.style as { stops: [number, string][] }
    expect(sung.stops.map((s) => s[1])).toEqual([style.activeColor, style.activeColor, style.textColor, style.textColor])
    expect(sung.stops[1][0]).toBeGreaterThan(0.3)
    expect(sung.stops[2][0]).toBeLessThan(0.7)
  })

  it('draws a highlight box behind the spoken word and a panel behind subtitles', () => {
    const box = presetStyle('box')
    expect(draw(box, 1.2).fills).toContain(box.activeColor)
    expect(draw(box, 0.5, { ...PAGE, start: 0 }).fills).not.toContain(box.activeColor)
    const sub = presetStyle('subtitle')
    expect(draw(sub, 2).fills).toContain(sub.backgroundColor)
  })

  it('shows the emoji only when the style wants emojis', () => {
    expect(finalFills(draw(presetStyle('bold'), 2)).has('💰')).toBe(true)
    expect(finalFills(draw({ ...presetStyle('bold'), emojis: false }, 2)).has('💰')).toBe(false)
  })

  it('wraps long pages inside the frame and within maxLines', () => {
    const words = 'this is a much longer page of captions than anyone should really put on one screen'
      .split(' ')
      .map((text, i) => word(String(i), text, 1 + i * 0.1, 1.1 + i * 0.1))
    const page = { ...PAGE, emoji: null, words }
    for (const id of ['bold', 'subtitle', 'bounce'] as const) {
      const style = { ...presetStyle(id), maxLines: 2 }
      const ctx = draw(style, 2.95, page)
      const fills = finalFills(ctx)
      expect(fills.size).toBe(words.length)
      const baselines = new Set<number>()
      for (const call of fills.values()) {
        // Layout baselines: the active word is drawn scaled about its middle, which moves its own.
        baselines.add(Math.round(call.y))
        const px = Number(/([\d.]+)px/.exec(call.font)?.[1])
        const left = FakeCtx.device(call).x
        expect(left).toBeGreaterThanOrEqual(0)
        expect(left + [...call.text].length * px * 0.6).toBeLessThanOrEqual(FRAME.width)
      }
      expect(baselines.size).toBeLessThanOrEqual(2)
      // It had to shrink to fit.
      const px = Number(/([\d.]+)px/.exec([...fills.values()][0].font)?.[1])
      expect(px).toBeLessThan(style.size * FRAME.width)
    }
  })

  it('keeps the text inside the frame wherever it is placed', () => {
    for (const position of [0, 1]) {
      const style = { ...presetStyle('bold'), position }
      for (const call of finalFills(draw(style, 2.6)).values()) {
        // Laid out inside the safe band; a popping word may poke a few pixels past it.
        if (call.text !== '💰') {
          expect(call.y).toBeGreaterThanOrEqual(FRAME.height * 0.05)
          expect(call.y).toBeLessThanOrEqual(FRAME.height * 0.95 + 1e-6)
        }
        const y = FakeCtx.device(call).y
        expect(y).toBeGreaterThan(FRAME.height * 0.03)
        expect(y).toBeLessThan(FRAME.height * 0.97)
      }
    }
  })

  it('draws the same frame for the same t, however it got there', () => {
    const style = presetStyle('box')
    const fresh = draw(style, 1.55).calls
    const ctx = new FakeCtx()
    for (const t of [2.9, 1.1, 2.2, 1.55]) {
      ctx.calls = []
      drawCaptions(asCtx(ctx), PAGE, t, style, FRAME)
    }
    expect(ctx.calls).toEqual(fresh)
  })

  it('looks the same through a scaled context (a retina preview) as at full size', () => {
    const style = presetStyle('neon')
    const full = draw(style, 1.55)
    const half = new FakeCtx()
    half.setTransform(2, 0, 0, 2, 0, 0)
    drawCaptions(asCtx(half), PAGE, 1.55, style, { width: 540, height: 960 })
    expect(half.calls.length).toBe(full.calls.length)
    half.calls.forEach((call, i) => {
      const a = FakeCtx.device(call)
      const b = FakeCtx.device(full.calls[i])
      expect(a.x).toBeCloseTo(b.x, 0)
      expect(a.y).toBeCloseTo(b.y, 0)
      // Shadow blur ignores the transform, so the renderer must scale it itself.
      expect(call.blur).toBeCloseTo(full.calls[i].blur, 1)
    })
  })
})

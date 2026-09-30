/**
 * Surfing: the player sits on a friendly, generic sea beast (32×32). The rider
 * is the overworld sprite cut at the waist; frames 0–1 bob on the swell.
 */
import type { Facing, Look } from '../look'
import { geoOf, person } from './people'
import { createPixels, getPx, hex, inEllipse, mixc, outlineOf, setPx, type Pixels, type Rgba } from './gfx'

const h = hex
const BODY = [h('#a8e0f8'), h('#68b8e8'), h('#4890d0'), h('#3068a8')]
const BELLY = [h('#f8f4e0'), h('#e0d8c0')]
const OUT = h('#182848')

function shade(nx: number, ny: number): Rgba {
  const lit = -(nx * 0.65 + ny * 0.75)
  return lit > 0.5 ? BODY[0] : lit > -0.15 ? BODY[1] : lit > -0.6 ? BODY[2] : BODY[3]
}

function fillEllipse(p: Pixels, cx: number, cy: number, rx: number, ry: number, col: (nx: number, ny: number) => Rgba): void {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      if (!inEllipse(x, y, cx, cy, rx, ry)) continue
      setPx(p, x, y, col((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry))
    }
}

function outline(p: Pixels): Pixels {
  const out = createPixels(p.w, p.h)
  out.data.set(p.data)
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if ((getPx(p, x, y) & 255) !== 0) continue
      let src = 0
      for (const [ax, ay] of [
        [x, y + 1],
        [x, y - 1],
        [x - 1, y],
        [x + 1, y],
      ] as const) {
        const c = getPx(p, ax, ay)
        if ((c & 255) !== 0) {
          src = c
          break
        }
      }
      if (src) setPx(out, x, y, mixc(outlineOf(src), OUT, 0.6))
    }
  return out
}

/** The beast alone, facing down, up or left. */
function beast(view: 'down' | 'up' | 'left'): Pixels {
  const p = createPixels(32, 32)
  if (view === 'left') {
    // tail fin on the right, body, head on the left
    fillEllipse(p, 28, 20, 3, 5, shade)
    fillEllipse(p, 17, 22, 11, 6.5, shade)
    fillEllipse(p, 17, 25, 9, 3, (nx) => (nx < 0.4 ? BELLY[0] : BELLY[1]))
    fillEllipse(p, 7, 20, 6, 5.5, shade)
    // flipper
    fillEllipse(p, 14, 27, 3.5, 2, (nx, ny) => shade(nx, ny + 0.4))
    // eye and smile
    setPx(p, 4, 19, h('#182030'))
    setPx(p, 4, 18, h('#182030'))
    setPx(p, 3, 18, h('#ffffff'))
    setPx(p, 3, 22, h('#284070'))
    setPx(p, 4, 23, h('#284070'))
    setPx(p, 5, 23, h('#284070'))
    // a blowhole spout of shine
    setPx(p, 12, 16, BODY[0])
    return outline(p)
  }
  if (view === 'down') {
    // flippers, body, head toward us
    fillEllipse(p, 6, 21, 4, 2.4, (nx, ny) => shade(nx, ny + 0.3))
    fillEllipse(p, 26, 21, 4, 2.4, (nx, ny) => shade(nx, ny + 0.3))
    fillEllipse(p, 16, 18, 10, 8, shade)
    fillEllipse(p, 16, 25, 7.5, 5.5, shade)
    fillEllipse(p, 16, 27.5, 5, 2.4, (nx) => (nx < 0.3 ? BELLY[0] : BELLY[1]))
    for (const ex of [13, 19]) {
      setPx(p, ex, 24, h('#182030'))
      setPx(p, ex, 25, h('#182030'))
      setPx(p, ex - 1, 24, h('#ffffff'))
    }
    setPx(p, 15, 28, h('#284070'))
    setPx(p, 16, 28, h('#284070'))
    setPx(p, 17, 28, h('#284070'))
    return outline(p)
  }
  // up: tail toward us
  fillEllipse(p, 6, 17, 4, 2.4, (nx, ny) => shade(nx, ny + 0.3))
  fillEllipse(p, 26, 17, 4, 2.4, (nx, ny) => shade(nx, ny + 0.3))
  fillEllipse(p, 16, 17, 10, 8, shade)
  fillEllipse(p, 16, 25, 4.5, 4, shade)
  fillEllipse(p, 12, 29, 4, 2, shade)
  fillEllipse(p, 20, 29, 4, 2, shade)
  return outline(p)
}

export function surf(look: Look, facing: Facing, frame: 0 | 1): Pixels {
  if (facing === 'right') {
    const src = surf(look, 'left', frame)
    const out = createPixels(32, 32)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) setPx(out, 31 - x, y, getPx(src, x, y))
    return out
  }
  const view = facing
  const out = createPixels(32, 32)
  const bob = frame
  const b = beast(view)
  // rider: the overworld sprite cut at the waist
  const rider = person(look, facing, 0)
  const g = geoOf(look)
  const cut = g.torsoBot - 1
  const riderTop = 0
  const seatY = view === 'left' ? 17 : view === 'down' ? 14 : 16
  const riderX = view === 'left' ? 9 : 8
  const draw = (src: Pixels, dx: number, dy: number, maxRow = src.h): void => {
    for (let y = 0; y < Math.min(src.h, maxRow); y++)
      for (let x = 0; x < src.w; x++) {
        const c = getPx(src, x, y)
        if ((c & 255) !== 0) setPx(out, dx + x, dy + y, c)
      }
  }
  const riderDy = seatY - cut + riderTop + bob
  if (view === 'up') {
    draw(b, 0, bob)
    draw(rider, riderX, riderDy, cut + 1)
  } else {
    draw(b, 0, bob)
    draw(rider, riderX, riderDy, cut + 1)
    if (view === 'down') {
      // the beast's head is in front of the rider's lap
      for (let y = 20; y < 32; y++)
        for (let x = 8; x < 24; x++) {
          const c = getPx(b, x, y - bob)
          if ((c & 255) !== 0 && y - bob >= 20) setPx(out, x, y, c)
        }
    }
  }
  // splashes along the waterline
  const foam = h('#f0f8ff')
  const wy = view === 'left' ? 29 : 30
  for (let x = 2; x < 30; x += 3) if ((x + frame * 2) % 6 < 3) setPx(out, x, wy + (x % 2), foam)
  return out
}

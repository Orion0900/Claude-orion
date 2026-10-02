// Renders the demo faces: MediaPipe's canonical face mesh — the average face —
// lit and textured procedurally, on a simple head with hair, ears and neck.
// Nobody's real face, so it can illustrate the app and drive its tests.
// Writes public/demo/front.jpg and public/demo/profile.jpg.
// Run: node scripts/render-demo.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src/face/canonical.ts'), 'utf8')
const grab = (name) => JSON.parse('[' + src.split(`export const ${name}`)[1].split(' = [')[1].split('\n]')[0].replace(/,\s*$/, '') + ']')
const V = grab('CANONICAL_VERTICES')
const T = grab('TRIANGLES')
if (V.length !== 468 * 3 || T.length !== 898 * 3) throw new Error(`mesh not read: ${V.length} ${T.length}`)

const groups = {
  eyeR: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  eyeL: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
  upperR: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  upperL: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  browR: [107, 66, 105, 63, 70, 46, 53, 52, 65, 55],
  browL: [336, 296, 334, 293, 300, 276, 283, 282, 295, 285],
  lips: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  lipLine: [61, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 291],
}

/** Runs in the page: rasterises the scene and returns a JPEG data URL. */
function render({ V, T, groups, view, width, height }) {
  const n = V.length / 3
  const P = (i) => [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]]

  // Vertex normals from the triangles, oriented to face the viewer (+z).
  const N = Array.from({ length: n }, () => [0, 0, 0])
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [P(T[t]), P(T[t + 1]), P(T[t + 2])]
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    let f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    // Outward: away from a point deep inside the head.
    const out = [centroid[0], centroid[1] - 1, centroid[2] + 4]
    if (f[0] * out[0] + f[1] * out[1] + f[2] * out[2] < 0) f = f.map((x) => -x)
    for (const i of [T[t], T[t + 1], T[t + 2]]) for (let k = 0; k < 3; k++) N[i][k] += f[k]
  }
  N.forEach((v) => {
    const l = Math.hypot(...v) || 1
    v[0] /= l
    v[1] /= l
    v[2] /= l
  })

  // Camera: the head turned by `view.yaw` degrees, seen through a long lens
  // (orthographic), `view.focal` pixels to the centimetre.
  const yaw = (view.yaw * Math.PI) / 180
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const toCam = ([x, y, z]) => [x * cy + z * sy, y, -x * sy + z * cy]
  const rotN = toCam
  const F = view.focal
  const project = ([x, y, z]) => [width / 2 + (x - view.cx) * F, height / 2 - (y - view.cy) * F, z]

  const SS = 2
  const W = width * SS
  const H = height * SS
  // Head parts and the face mesh are drawn in separate layers and composited:
  // the face mesh always covers the skull and neck behind it (the skull is a
  // rough ellipsoid that would otherwise poke through the eye sockets), while
  // the ears are depth-tested against the face.
  const zbuf = new Float32Array(W * H).fill(-1e9)
  const color = new Float32Array(W * H * 3)
  const earZ = new Float32Array(W * H).fill(-1e9)
  const earColor = new Float32Array(W * H * 3)

  // Background: a soft studio grey.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const g = 214 - 30 * Math.hypot(x / W - 0.5, y / H - 0.35)
      color[i] = g
      color[i + 1] = g - 2
      color[i + 2] = g - 6
    }
  }

  const L1 = norm([-0.28, 0.5, 0.82])
  const L2 = norm([0.55, 0.15, 0.7])
  function norm(v) {
    const l = Math.hypot(...v)
    return v.map((x) => x / l)
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  const shade = (albedo, nrm, gloss = 0.08) => {
    const d1 = Math.max(0, dot(nrm, L1))
    const d2 = Math.max(0, dot(nrm, L2))
    const wrap = 0.5 + 0.5 * dot(nrm, L1)
    const light = 0.34 + 0.52 * d1 + 0.16 * d2 + 0.12 * wrap
    const h = norm([L1[0], L1[1], L1[2] + 1])
    const spec = gloss * Math.pow(Math.max(0, dot(nrm, h)), 24) * 255
    return albedo.map((c) => Math.min(255, c * light + spec))
  }

  const SKIN = [226, 178, 152]
  const HAIR = [58, 40, 30]

  // 2D (front, canonical x/y) polygons for the face's painted regions.
  const poly = (ids) => ids.map((i) => [V[i * 3], V[i * 3 + 1]])
  const inPoly = (p, pts) => {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[j]
      if (ay > p[1] !== by > p[1] && p[0] < ((bx - ax) * (p[1] - ay)) / (by - ay) + ax) inside = !inside
    }
    return inside
  }
  const distToPolyline = (p, pts) => {
    let best = 1e9
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]
      const [bx, by] = pts[i]
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
      best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy))
    }
    return best
  }
  const eyes = [
    { outline: poly(groups.eyeR), upper: poly(groups.upperR) },
    { outline: poly(groups.eyeL), upper: poly(groups.upperL) },
  ].map((e) => {
    const xs = e.outline.map((p) => p[0])
    const ys = e.outline.map((p) => p[1])
    return { ...e, c: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2 - 0.02] }
  })
  const brows = [poly(groups.browR), poly(groups.browL)]
  const lips = poly(groups.lips)
  const lipLine = poly(groups.lipLine)

  function faceAlbedo([x, y]) {
    for (const e of eyes) {
      if (inPoly([x, y], e.outline)) {
        const r = Math.hypot(x - e.c[0], y - e.c[1])
        let c
        if (r < 0.2) c = [18, 14, 12]
        else if (r < 0.56) {
          const k = (r - 0.2) / 0.36
          const streak = 0.85 + 0.15 * Math.sin(Math.atan2(y - e.c[1], x - e.c[0]) * 23)
          c = [92 - 30 * k, 112 - 40 * k, 98 - 30 * k].map((v) => v * streak)
          if (r > 0.5) c = c.map((v) => v * 0.6)
        } else c = [232, 226, 220]
        // Catchlight.
        if (Math.hypot(x - e.c[0] + 0.16, y - e.c[1] - 0.16) < 0.07) c = [250, 250, 250]
        // Shadow and lashes under the upper lid.
        const d = distToPolyline([x, y], e.upper)
        if (d < 0.1) c = c.map((v) => v * (0.25 + 0.75 * (d / 0.1)))
        else if (d < 0.25) c = c.map((v) => v * (0.75 + (0.25 * (d - 0.1)) / 0.15))
        return { c, gloss: 0.25 }
      }
      // Lashes just outside the upper lid.
      const d = distToPolyline([x, y], e.upper)
      if (d < 0.07 && y > e.c[1] - 0.05) return { c: [40, 30, 26], gloss: 0 }
    }
    for (const b of brows) {
      if (inPoly([x, y], b)) {
        const n = hash(Math.floor(x * 30), Math.floor(y * 9))
        return { c: n > 0.25 ? [62, 44, 34] : SKIN.map((v) => v * 0.85), gloss: 0 }
      }
    }
    if (inPoly([x, y], lips)) {
      const d = distToPolyline([x, y], lipLine)
      const k = d < 0.06 ? 0.55 + (0.45 * d) / 0.06 : 1
      return { c: [196, 118, 112].map((v) => v * k), gloss: 0.2 }
    }
    // A little warmth on the cheeks and nose, and fine skin texture.
    const blush = Math.max(0, 1 - Math.hypot(Math.abs(x) - 3.6, y + 1.2) / 2.4) * 0.07
    const t = 0.97 + 0.03 * hash(Math.floor(x * 40), Math.floor(y * 40))
    return { c: [SKIN[0] * (1 + blush) * t, SKIN[1] * (1 - blush * 0.6) * t, SKIN[2] * (1 - blush * 0.5) * t], gloss: 0.09 }
  }

  // Analytic parts of the head, ray-cast per pixel: hair (an ellipsoid behind
  // the face), ears and a neck.
  // The skull carries the forehead up to the hairline, so the face has a
  // full upper third, and hair over the top, back and upper sides.
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
  // Hairline: high across the forehead, sweeping down behind the temples to the nape.
  const headHair = ([x, y, z]) => y > Math.min(11.0 - 0.05 * x * x, -4.5 + 15.5 * smooth((z + 6.5) / 9.5))
  const ellipsoids = [
    // Fitted to meet the top of the face mesh and reach the crown and back of the head.
    { c: [0, 3.99, -4.45], r: [8.0, 9.31, 10.05], albedo: null, head: true },
    // The jaw and the underside of the chin, joining the face to the neck.
    { c: [0, -6.5, -1.0], r: [4.8, 4.0, 5.4], albedo: null, head: true },
    { c: [-7.6, 0.6, -2.9], r: [0.9, 2.9, 1.7], albedo: SKIN, ear: true },
    { c: [7.6, 0.6, -2.9], r: [0.9, 2.9, 1.7], albedo: SKIN, ear: true },
  ]
  const neck = { c: [0, -2.2], r: 4.8, top: -6, bottom: -40 }
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      // Ray through the pixel, in camera space (approximately orthographic per pixel).
      const sx = (px / SS - width / 2) / F + view.cx
      const syy = -(py / SS - height / 2) / F + view.cy
      let best = -1e9
      let hit = null
      let earBest = -1e9
      let earHit = null
      for (const e of ellipsoids) {
        // Ellipsoid in camera space: rotate its centre; radii stay axis-aligned in head space,
        // so transform the ray into head space instead.
        const o = [sx * cy - 100 * sy, syy, sx * sy + 100 * cy]
        const d = [sy, 0, -cy]
        const oc = [(o[0] - e.c[0]) / e.r[0], (o[1] - e.c[1]) / e.r[1], (o[2] - e.c[2]) / e.r[2]]
        const dd = [d[0] / e.r[0], d[1] / e.r[1], d[2] / e.r[2]]
        const a = dot(dd, dd)
        const b = 2 * dot(oc, dd)
        const c = dot(oc, oc) - 1
        const disc = b * b - 4 * a * c
        if (disc < 0) continue
        const tt = (-b - Math.sqrt(disc)) / (2 * a)
        const p = [o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt]
        const zc = toCam(p)[2]
        if (e.ear) {
          if (zc > earBest) {
            earBest = zc
            earHit = { nrm: rotN(norm([(p[0] - e.c[0]) / e.r[0] ** 2, (p[1] - e.c[1]) / e.r[1] ** 2, (p[2] - e.c[2]) / e.r[2] ** 2])), albedo: e.albedo }
          }
          continue
        }
        if (zc > best) {
          best = zc
          const nrm = rotN(norm([(p[0] - e.c[0]) / e.r[0] ** 2, (p[1] - e.c[1]) / e.r[1] ** 2, (p[2] - e.c[2]) / e.r[2] ** 2]))
          const hair = e.head ? headHair(p) : false
          hit = { nrm, albedo: e.head ? (hair ? HAIR : SKIN) : e.albedo, hair, p }
        }
      }
      if (syy < neck.top && syy > neck.bottom) {
        const o = [sx * cy - 100 * sy, syy, sx * sy + 100 * cy]
        const d = [sy, 0, -cy]
        // Cylinder along y: (x - cx)^2 + (z - cz)^2 = r^2.
        const ox = o[0] - neck.c[0]
        const oz = o[2] - neck.c[1]
        const a = d[0] ** 2 + d[2] ** 2
        const b = 2 * (ox * d[0] + oz * d[2])
        const c = ox * ox + oz * oz - neck.r ** 2
        const disc = b * b - 4 * a * c
        if (disc >= 0) {
          const tt = (-b - Math.sqrt(disc)) / (2 * a)
          const p = [o[0] + d[0] * tt, o[1], o[2] + d[2] * tt]
          const zc = toCam(p)[2]
          if (zc > best) {
            best = zc
            hit = { nrm: rotN(norm([p[0] - neck.c[0], 0.25, p[2] - neck.c[1]])), albedo: SKIN.map((v) => v * 0.93), hair: false, p }
          }
        }
      }
      if (earHit) {
        const i = (py * W + px) * 3
        earZ[py * W + px] = earBest
        const c = shade(earHit.albedo, earHit.nrm, 0.05)
        earColor[i] = c[0]
        earColor[i + 1] = c[1]
        earColor[i + 2] = c[2]
      }
      if (hit) {
        const i = (py * W + px) * 3
        let albedo = hit.albedo
        if (hit.hair) {
          const strand = 0.8 + 0.2 * Math.sin((hit.p[0] * 3 + hit.p[1] * 0.6) * 4 + hash(Math.floor(hit.p[0] * 8), 0) * 3)
          albedo = albedo.map((v) => v * strand)
        }
        const c = shade(albedo, hit.nrm, hit.hair ? 0.18 : 0.06)
        color[i] = c[0]
        color[i + 1] = c[1]
        color[i + 2] = c[2]
      }
    }
  }

  // The face mesh, rasterised with its own z-buffer over the head.
  zbuf.fill(-1e9)
  const projected = Array.from({ length: n }, (_, i) => project(toCam(P(i))))
  const camN = N.map(rotN)
  for (let t = 0; t < T.length; t += 3) {
    const ids = [T[t], T[t + 1], T[t + 2]]
    const [a, b, c] = ids.map((i) => projected[i].map((v, k) => (k < 2 ? v * SS : v)))
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])))
    const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])))
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])))
    const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])))
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (Math.abs(area) < 1e-9) continue
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area
        const w2 = 1 - w0 - w1
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2]
        const k = y * W + x
        if (z <= zbuf[k]) continue
        zbuf[k] = z
        const pos = [0, 1, 2].map((d) => w0 * P(ids[0])[d] + w1 * P(ids[1])[d] + w2 * P(ids[2])[d])
        const nrm = norm([0, 1, 2].map((d) => w0 * camN[ids[0]][d] + w1 * camN[ids[1]][d] + w2 * camN[ids[2]][d]))
        const { c: albedo, gloss } = faceAlbedo(pos)
        const col = shade(albedo, nrm, gloss)
        color[k * 3] = col[0]
        color[k * 3 + 1] = col[1]
        color[k * 3 + 2] = col[2]
      }
    }
  }

  // Ears in front of whatever they're nearer than.
  for (let k = 0; k < W * H; k++) {
    if (earZ[k] > zbuf[k]) {
      color[k * 3] = earColor[k * 3]
      color[k * 3 + 1] = earColor[k * 3 + 1]
      color[k * 3 + 2] = earColor[k * 3 + 2]
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  const img = g.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let gg = 0
      let b = 0
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const k = ((y * SS + j) * W + (x * SS + i)) * 3
          r += color[k]
          gg += color[k + 1]
          b += color[k + 2]
        }
      }
      const o = (y * width + x) * 4
      img.data[o] = r / (SS * SS)
      img.data[o + 1] = gg / (SS * SS)
      img.data[o + 2] = b / (SS * SS)
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.9)
}

const out = join(root, 'public', 'demo')
mkdirSync(out, { recursive: true })
const VIEWS = {
  front: { yaw: 0, focal: 38, cx: 0, cy: 0.5 },
  profile: { yaw: 90, focal: 30, cx: 1.5, cy: -1 },
}

// The profile points, exactly, from the geometry: seen from the subject's
// right, image x follows head depth (z) and image y follows height.
{
  const v = VIEWS.profile
  const at = ([z, y]) => ({ x: Math.round((900 / 2 + (z - v.cx) * v.focal) * 10) / 10, y: Math.round((1125 / 2 - (y - v.cy) * v.focal) * 10) / 10 })
  const lm = (i) => at([V[i * 3 + 2], V[i * 3 + 1]])
  const points = {
    g: lm(9),
    n: lm(168),
    prn: lm(4),
    cm: lm(19),
    sn: lm(2),
    ac: lm(129),
    ls: lm(0),
    li: lm(17),
    sm: lm(18),
    pg: lm(199),
    me: lm(152),
    // Where the chin's underside meets the front of the neck cylinder, and lower on the neck.
    c: at([2.6, -9.5]),
    np: at([2.6, -14]),
    go: lm(172),
    // The front of the ear, by the canal.
    ea: at([-1.5, 0.3]),
  }
  writeFileSync(join(out, 'profile-points.json'), JSON.stringify(points, null, 2) + '\n')
  console.log('wrote public/demo/profile-points.json')
}

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, view] of Object.entries(VIEWS)) {
  const data = await page.evaluate(`(${render.toString()})(${JSON.stringify({ V, T, groups, view, width: 900, height: 1125 })})`)
  writeFileSync(join(out, `${name}.jpg`), Buffer.from(data.split(',')[1], 'base64'))
  console.log(`wrote public/demo/${name}.jpg`)
}
await browser.close()

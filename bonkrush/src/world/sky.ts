import * as THREE from 'three'
import type { StageDef } from '../game/types'
import { buildCloud } from './models'
import { hash2, smoothstep } from './noise'

/** Inside the camera's far plane (400 m) even with the camera a few metres off the focus. */
const DOME_RADIUS = 300
const DISC_DISTANCE = 255

/** Sun (or moon) per stage: disc and halo radii in metres at DISC_DISTANCE, and the halo's peak opacity. */
const DISCS: ReadonlyArray<{ disc: number; halo: number; alpha: number; color: string; haloColor: string }> = [
  { disc: 10, halo: 34, alpha: 0.45, color: '#fffbe8', haloColor: '#fff1c4' },
  { disc: 24, halo: 72, alpha: 0.5, color: '#fff4d6', haloColor: '#ffd27a' },
  { disc: 13, halo: 42, alpha: 0.35, color: '#e9edff', haloColor: '#7d8cff' },
]

/**
 * Everything overhead: a vertex-coloured gradient dome that shades from the
 * fog colour at the horizon to a deeper sky at the zenith, two rings of
 * distant hills, the sun or moon, stars at night and drifting clouds by day.
 * The dome, hills and discs ride along with the focus so they never get
 * closer; clouds live in the world and drift across it.
 */
export class Sky {
  private readonly follow = new THREE.Group()
  private readonly disposables: Array<{ dispose(): void }> = []
  private clouds: THREE.InstancedMesh | null = null
  /** Per cloud: x, y, z, scale, yaw, speed. */
  private cloudState = new Float32Array(0)
  private readonly wind = new THREE.Vector2(1, 0.35).normalize()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 1, 0)

  constructor(
    private readonly root: THREE.Group,
    stage: StageDef,
    sunDir: THREE.Vector3,
    seed: number,
  ) {
    const pal = stage.palette
    const horizon = new THREE.Color(pal.fog)
    const sky = new THREE.Color(pal.sky)
    const zenith = sky.clone().offsetHSL(0, 0.06, -0.12)

    this.follow.add(this.buildDome(horizon, sky, zenith))
    const tone = new THREE.Color(stage.index === 0 ? pal.groundLow : pal.cliff)
    this.follow.add(this.buildHills(horizon, tone, 285, 0.3, stage.index === 1, seed))
    this.follow.add(this.buildHills(horizon, tone, 250, 0.5, stage.index === 1, seed + 1))
    this.follow.add(this.buildDisc(stage.index, sunDir))
    if (stage.index === 2) this.follow.add(this.buildStars(seed))
    root.add(this.follow)

    if (stage.index <= 1) this.buildClouds(stage.index === 0 ? 12 : 6, stage.index === 1 ? '#fff1dc' : '#ffffff', seed)
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.follow.position.copy(focus)
    this.driftClouds(dt)
  }

  private driftClouds(dt: number): void {
    const clouds = this.clouds
    if (!clouds) return
    const st = this.cloudState
    const edge = 210
    for (let i = 0; i < clouds.count; i++) {
      const o = i * 6
      st[o] += this.wind.x * st[o + 5] * dt
      st[o + 2] += this.wind.y * st[o + 5] * dt
      if (st[o] > edge) st[o] -= 2 * edge
      else if (st[o] < -edge) st[o] += 2 * edge
      if (st[o + 2] > edge) st[o + 2] -= 2 * edge
      else if (st[o + 2] < -edge) st[o + 2] += 2 * edge
      this.q.setFromAxisAngle(this.up, st[o + 4])
      this.s.set(st[o + 3], st[o + 3] * 0.8, st[o + 3])
      clouds.setMatrixAt(i, this.m.compose(this.p.set(st[o], st[o + 1], st[o + 2]), this.q, this.s))
    }
    clouds.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.root.remove(this.follow)
    if (this.clouds) {
      this.root.remove(this.clouds)
      this.clouds.dispose()
    }
    for (const d of this.disposables) d.dispose()
    this.disposables.length = 0
  }

  private keep<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing)
    return thing
  }

  private buildDome(horizon: THREE.Color, sky: THREE.Color, zenith: THREE.Color): THREE.Mesh {
    const geo = this.keep(new THREE.SphereGeometry(DOME_RADIUS, 32, 16))
    const pos = geo.getAttribute('position')
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    for (let v = 0; v < pos.count; v++) {
      const t = pos.getY(v) / DOME_RADIUS
      c.copy(horizon).lerp(sky, smoothstep(0, 0.3, t)).lerp(zenith, smoothstep(0.3, 1, t))
      colors[v * 3] = c.r
      colors[v * 3 + 1] = c.g
      colors[v * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }))
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    return mesh
  }

  /**
   * A ring of far-off hills (or mesas on the dunes) that fade from `tone`
   * at the peaks into the horizon colour, giving the skyline some depth.
   */
  private buildHills(horizon: THREE.Color, tone: THREE.Color, radius: number, strength: number, mesas: boolean, seed: number): THREE.Mesh {
    const segments = 90
    const heights: number[] = []
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2
      if (mesas) {
        const block = Math.floor(k / 5)
        heights.push(hash2(block, 3, seed) > 0.55 ? 22 + hash2(block, 4, seed) * 16 : 6 + hash2(k, 5, seed) * 5)
      } else {
        heights.push(14 + Math.sin(a * 3 + seed) * 9 + Math.sin(a * 7 + seed * 2) * 5 + hash2(k, 6, seed) * 9)
      }
    }
    const top = horizon.clone().lerp(tone, strength)
    const pos = new Float32Array(segments * 6 * 3)
    const col = new Float32Array(segments * 6 * 3)
    const bottom = -45
    let v = 0
    const put = (a: number, y: number, c: THREE.Color): void => {
      pos[v * 3] = Math.cos(a) * radius
      pos[v * 3 + 1] = y
      pos[v * 3 + 2] = Math.sin(a) * radius
      col[v * 3] = c.r
      col[v * 3 + 1] = c.g
      col[v * 3 + 2] = c.b
      v++
    }
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2
      const a1 = ((k + 1) / segments) * Math.PI * 2
      const h0 = heights[k]
      const h1 = heights[(k + 1) % segments]
      put(a0, bottom, horizon)
      put(a1, bottom, horizon)
      put(a1, h1, top)
      put(a0, bottom, horizon)
      put(a1, h1, top)
      put(a0, h0, top)
    }
    const geo = this.keep(new THREE.BufferGeometry())
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }))
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = -9
    mesh.frustumCulled = false
    return mesh
  }

  /** The sun, or on the crypt a cratered moon, with a soft additive halo. */
  private buildDisc(stageIndex: number, sunDir: THREE.Vector3): THREE.Group {
    const spec = DISCS[Math.min(stageIndex, DISCS.length - 1)]
    const group = new THREE.Group()
    group.position.copy(sunDir).multiplyScalar(DISC_DISTANCE)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sunDir.clone().negate())

    const discMat = this.keep(new THREE.MeshBasicMaterial({ color: spec.color, fog: false, depthWrite: false }))
    const disc = new THREE.Mesh(this.keep(new THREE.CircleGeometry(spec.disc, 24)), discMat)
    disc.renderOrder = -8
    group.add(disc)

    if (stageIndex === 2) {
      const craterMat = this.keep(new THREE.MeshBasicMaterial({ color: '#c3c9e6', fog: false, depthWrite: false }))
      const craters: Array<[number, number, number]> = [
        [-3.5, 3, 2.6],
        [4, -1.5, 3.2],
        [-1, -5.5, 1.8],
        [2.5, 5.5, 1.4],
      ]
      for (const [x, y, r] of craters) {
        const crater = new THREE.Mesh(this.keep(new THREE.CircleGeometry(r, 10)), craterMat)
        crater.position.set(x, y, 0.2)
        crater.renderOrder = -7
        group.add(crater)
      }
    }

    // A fan whose alpha fades from the centre to nothing at the rim.
    const haloGeo = this.keep(new THREE.CircleGeometry(spec.halo, 32))
    const count = haloGeo.getAttribute('position').count
    const rgba = new Float32Array(count * 4)
    const hc = new THREE.Color(spec.haloColor)
    for (let v = 0; v < count; v++) {
      rgba[v * 4] = hc.r
      rgba[v * 4 + 1] = hc.g
      rgba[v * 4 + 2] = hc.b
      rgba[v * 4 + 3] = v === 0 ? spec.alpha : 0
    }
    haloGeo.setAttribute('color', new THREE.BufferAttribute(rgba, 4))
    const haloMat = this.keep(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    const halo = new THREE.Mesh(haloGeo, haloMat)
    halo.position.z = -0.5
    group.add(halo)
    group.traverse((o) => (o.frustumCulled = false))
    return group
  }

  private buildStars(seed: number): THREE.Points {
    const count = 320
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const a = hash2(i, 1, seed) * Math.PI * 2
      // Bias toward the zenith a little; none sit in the horizon haze.
      const y = 0.12 + Math.sqrt(hash2(i, 2, seed)) * 0.88
      const r = Math.sqrt(1 - y * y) * 280
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = y * 280
      pos[i * 3 + 2] = Math.sin(a) * r
    }
    const geo = this.keep(new THREE.BufferGeometry())
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = this.keep(
      new THREE.PointsMaterial({ color: '#f4f2ff', size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }),
    )
    const stars = new THREE.Points(geo, mat)
    stars.renderOrder = -9
    stars.frustumCulled = false
    return stars
  }

  private buildClouds(count: number, tint: string, seed: number): void {
    const geo = this.keep(buildCloud())
    const mat = this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }))
    const clouds = new THREE.InstancedMesh(geo, mat, count)
    clouds.frustumCulled = false
    const color = new THREE.Color(tint)
    this.cloudState = new Float32Array(count * 6)
    for (let i = 0; i < count; i++) {
      const o = i * 6
      this.cloudState[o] = (hash2(i, 11, seed) * 2 - 1) * 200
      this.cloudState[o + 1] = 48 + hash2(i, 12, seed) * 28
      this.cloudState[o + 2] = (hash2(i, 13, seed) * 2 - 1) * 200
      this.cloudState[o + 3] = 8 + hash2(i, 14, seed) * 8
      this.cloudState[o + 4] = hash2(i, 15, seed) * Math.PI * 2
      this.cloudState[o + 5] = 1.2 + hash2(i, 16, seed) * 1.8
      clouds.setColorAt(i, color)
    }
    this.clouds = clouds
    this.driftClouds(0)
    this.root.add(clouds)
  }
}

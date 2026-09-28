/**
 * Enemy shots: spores, stingers, bolts, seeds, spears and bones. One pooled
 * list and two instanced meshes (round orbs and pointed darts). Shots fly
 * where they were aimed, hurt the player on contact, and vanish into terrain
 * or at the end of their range.
 */
import * as THREE from 'three'
import type { GameContext } from '../game/types'

const CAP = 400
export const SHAPE_ORB = 0
export const SHAPE_DART = 1

/** Spores and bombs fall; this is gentler than real gravity so lobs read as arcs. */
export const LOB_GRAVITY = 9

/**
 * The player's body to a shot: a vertical segment from the ankles up,
 * swept by the player's radius. Standing it tops out at 1.6 m (about 2 m
 * with the radius); sliding, the whole body is about 0.9 m tall, so a shot
 * aimed at a standing player's chest flies over a slide.
 */
const BODY_BOTTOM = 0.2
const BODY_TOP = 1.6
const SLIDE_BODY_HEIGHT = 0.9

/** Top of the body segment above the player's feet. */
function bodyTop(sliding: boolean, radius: number): number {
  return sliding ? Math.max(BODY_BOTTOM, SLIDE_BODY_HEIGHT - radius) : BODY_TOP
}

class Shot {
  x = 0
  y = 0
  z = 0
  vx = 0
  vy = 0
  vz = 0
  damage = 0
  life = 0
  size = 0.2
  gravity = 0
  /** When > 0 the shot skims the terrain at this height instead of flying straight. */
  hug = 0
  shape = SHAPE_ORB
  r = 1
  g = 1
  b = 1
  color = '#ffffff'
  source = ''
}

const _pos = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _scl = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _mat = new THREE.Matrix4()
const _col = new THREE.Color()
const _hit = new THREE.Vector3()
const FORWARD = new THREE.Vector3(0, 0, 1)

export class EnemyProjectiles {
  private readonly live: Shot[] = []
  private readonly free: Shot[] = []
  private readonly orbs: THREE.InstancedMesh
  private readonly darts: THREE.InstancedMesh

  constructor(private readonly scene: THREE.Scene) {
    const make = (geo: THREE.BufferGeometry, name: string) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), CAP)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3)
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.count = 0
      mesh.visible = false
      mesh.name = name
      scene.add(mesh)
      return mesh
    }
    this.orbs = make(new THREE.IcosahedronGeometry(1, 0), 'enemies:shots:orbs')
    this.darts = make(new THREE.OctahedronGeometry(1, 0).scale(0.32, 0.32, 1.3), 'enemies:shots:darts')
  }

  get count(): number {
    return this.live.length
  }

  /**
   * Fires a shot from (x, y, z) with velocity (vx, vy, vz). It lives
   * `life` seconds; `size` is its hit and draw radius. With `hug` > 0 it
   * skims the ground at that height, so boss volleys cross hills at chest
   * height (and a jump clears them).
   */
  fire(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    damage: number, life: number, color: string, shape: number, size: number, gravity: number, source: string, hug = 0,
  ): void {
    if (this.live.length >= CAP || !(damage > 0) || !(life > 0)) return
    const s = this.free.pop() ?? new Shot()
    s.x = x
    s.y = y
    s.z = z
    s.vx = vx
    s.vy = vy
    s.vz = vz
    s.damage = damage
    s.life = life
    s.size = size
    s.gravity = gravity
    s.hug = hug
    s.shape = shape
    s.source = source
    s.color = color
    _col.set(color)
    s.r = _col.r
    s.g = _col.g
    s.b = _col.b
    this.live.push(s)
  }

  update(dt: number, ctx: GameContext, time: number): void {
    const world = ctx.world
    const player = ctx.player
    const limit = world.halfSize + 4
    const pr = player.radius
    const px = player.pos.x
    const py = player.pos.y
    const pz = player.pos.z
    const bottom = py + BODY_BOTTOM
    const top = py + bodyTop(player.sliding, pr)

    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i]
      s.x += s.vx * dt
      s.z += s.vz * dt
      s.life -= dt
      const ground = world.heightAt(s.x, s.z)
      if (s.hug > 0) {
        s.y = ground + s.hug
      } else {
        s.vy -= s.gravity * dt
        s.y += s.vy * dt
      }
      if (s.y < ground || s.life <= 0 || Math.abs(s.x) > limit || Math.abs(s.z) > limit) {
        if (s.y < ground + 0.5 && s.life > -0.1) ctx.fx.burst(_hit.set(s.x, ground + 0.1, s.z), s.color, 4, 2, 0.12)
        this.release(i)
        continue
      }
      if (!player.alive) continue
      // Distance to the player's body, a vertical segment from ankles to head (lower while sliding).
      const cy = s.y < bottom ? bottom : s.y > top ? top : s.y
      const dx = s.x - px
      const dy = s.y - cy
      const dz = s.z - pz
      const reach = s.size + pr
      if (dx * dx + dy * dy + dz * dz <= reach * reach) {
        player.hurt(s.damage, s.source, _hit.set(s.x, s.y, s.z))
        ctx.fx.burst(_hit, s.color, 6, 3, 0.14)
        this.release(i)
      }
    }
    this.render(time)
  }

  clear(): void {
    while (this.live.length) this.release(this.live.length - 1)
    this.orbs.count = this.darts.count = 0
    this.orbs.visible = this.darts.visible = false
  }

  dispose(): void {
    for (const m of [this.orbs, this.darts]) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
      m.dispose()
    }
    this.live.length = 0
    this.free.length = 0
  }

  private render(time: number): void {
    let nOrb = 0
    let nDart = 0
    const spin = Math.floor(time * 10) * 0.7
    for (const s of this.live) {
      _pos.set(s.x, s.y, s.z)
      _scl.setScalar(s.size)
      _col.setRGB(s.r, s.g, s.b)
      if (s.shape === SHAPE_DART) {
        _dir.set(s.vx, s.vy, s.vz)
        if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1)
        _quat.setFromUnitVectors(FORWARD, _dir.normalize())
        this.darts.setMatrixAt(nDart, _mat.compose(_pos, _quat, _scl))
        this.darts.setColorAt(nDart++, _col)
      } else {
        _quat.setFromAxisAngle(FORWARD, spin + s.life)
        this.orbs.setMatrixAt(nOrb, _mat.compose(_pos, _quat, _scl))
        this.orbs.setColorAt(nOrb++, _col)
      }
    }
    finish(this.orbs, nOrb)
    finish(this.darts, nDart)
  }

  private release(i: number): void {
    const s = this.live[i]
    const last = this.live.pop() as Shot
    if (i < this.live.length) this.live[i] = last
    this.free.push(s)
  }
}

function finish(mesh: THREE.InstancedMesh, n: number): void {
  mesh.count = n
  mesh.visible = n > 0
  if (n === 0) return
  mesh.instanceMatrix.clearUpdateRanges()
  mesh.instanceMatrix.addUpdateRange(0, n * 16)
  mesh.instanceMatrix.needsUpdate = true
  const c = mesh.instanceColor as THREE.InstancedBufferAttribute
  c.clearUpdateRanges()
  c.addUpdateRange(0, n * 3)
  c.needsUpdate = true
}

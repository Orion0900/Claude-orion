import * as THREE from 'three'
import type { StageDef } from '../game/types'
import { PLAY_LIMIT } from './colliders'
import { buildCliffRock, buildPropModel, TUMBLEWEED_RADIUS, type PropModel } from './models'
import { hash2 } from './noise'
import type { PropGroup, PropInstance } from './scatter'
import type { HeightField } from './terrain'

/** Emissive strength of each glowing kind, and how hard it flickers (0 = steady pulse). */
const GLOW_STYLE: Record<string, { intensity: number; flicker: number }> = {
  candle: { intensity: 1.6, flicker: 1 },
  pumpkin: { intensity: 1.25, flicker: 0.6 },
  crypt: { intensity: 0.9, flicker: 0 },
}

/**
 * Draws the scattered props: one InstancedMesh per kind and variant (plus
 * one for a model's glowing part), all from merged vertex-coloured models,
 * and a ring of stretched boulders walling the map in. Trees and flowers
 * sway in the vertex shader, candles flicker, tumbleweeds roll.
 */
export class PropLayer {
  private readonly meshes: THREE.InstancedMesh[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly solidMat = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
  private readonly swayMats = new Map<number, THREE.MeshLambertMaterial>()
  private readonly swayTime = { value: 0 }
  private readonly flickers: Array<{ mat: THREE.MeshLambertMaterial; base: number; flicker: number; phase: number }> = []
  private tumble: Tumbleweeds | null = null
  private time = 0

  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()
  private readonly c = new THREE.Color()

  constructor(
    private readonly root: THREE.Group,
    groups: readonly PropGroup[],
    walls: readonly PropInstance[],
    field: HeightField,
    palette: StageDef['palette'],
  ) {
    // Rocks and walls take on the stage's stone colour, lightened a little so they read against the cliffs.
    const stone = new THREE.Color(palette.cliff).lerp(new THREE.Color('#9a9aa2'), 0.4).multiplyScalar(1.15)

    for (const group of groups) {
      if (group.instances.length === 0) continue
      if (group.kind === 'tumbleweed') {
        const model = buildPropModel('tumbleweed')
        this.geometries.push(model.body)
        const mesh = this.instanced(model.body, this.solidMat, group.instances.length, group.spec.castShadow)
        mesh.frustumCulled = false
        this.tumble = new Tumbleweeds(mesh, group.instances, field)
        continue
      }
      const variants = Math.max(1, group.spec.variants)
      for (let v = 0; v < variants; v++) {
        const list = group.instances.filter((p) => p.variant === v)
        if (list.length === 0) continue
        const model = buildPropModel(group.kind, v)
        const mat = group.spec.sway > 0 ? this.swayMaterial(group.spec.sway) : this.solidMat
        const tint = group.spec.tint === 'cliff' ? stone : null
        this.addInstances(model, list, mat, group.spec.castShadow, tint, group.kind, group.spec.glow)
      }
    }

    if (walls.length > 0) {
      const rock = buildCliffRock()
      this.geometries.push(rock)
      const mesh = this.instanced(rock, this.solidMat, walls.length, true)
      this.fill(mesh, walls, stone)
    }
  }

  update(dt: number): void {
    this.time += dt
    this.swayTime.value = this.time
    const t = this.time
    for (const f of this.flickers) {
      const wobble = f.flicker > 0
        ? 0.12 * Math.sin(t * 11 + f.phase) + 0.07 * Math.sin(t * 27.3 + f.phase * 2.1) + 0.04 * Math.sin(t * 5.1)
        : 0.15 * Math.sin(t * 1.3 + f.phase)
      f.mat.emissiveIntensity = f.base * (1 + wobble * (f.flicker > 0 ? f.flicker : 1))
    }
    this.tumble?.update(dt)
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.root.remove(mesh)
      mesh.dispose()
    }
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    this.meshes.length = 0
    this.geometries.length = 0
    this.materials.length = 0
    this.swayMats.clear()
    this.flickers.length = 0
    this.tumble = null
  }

  private addInstances(
    model: PropModel,
    list: readonly PropInstance[],
    mat: THREE.Material,
    castShadow: boolean,
    tint: THREE.Color | null,
    kind: string,
    glow: string | undefined,
  ): void {
    this.geometries.push(model.body)
    this.fill(this.instanced(model.body, mat, list.length, castShadow), list, tint)
    if (!model.glow) return
    this.geometries.push(model.glow)
    const style = GLOW_STYLE[kind] ?? { intensity: 1.2, flicker: 0 }
    const glowMat = this.own(
      new THREE.MeshLambertMaterial({ color: 0x000000, emissive: glow ?? '#ffc05a', emissiveIntensity: style.intensity }),
    )
    this.flickers.push({ mat: glowMat, base: style.intensity, flicker: style.flicker, phase: this.flickers.length * 2.3 })
    const glowMesh = this.instanced(model.glow, glowMat, list.length, false)
    glowMesh.receiveShadow = false
    this.fill(glowMesh, list, null, false)
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, castShadow: boolean): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    this.meshes.push(mesh)
    this.root.add(mesh)
    return mesh
  }

  /** Writes each instance's transform and a colour: the tint (or white) with a little brightness jitter. */
  private fill(mesh: THREE.InstancedMesh, list: readonly PropInstance[], tint: THREE.Color | null, colours = true): void {
    list.forEach((inst, i) => {
      this.e.set(inst.leanX, inst.yaw, inst.leanZ, 'YXZ')
      this.m.compose(this.p.set(inst.x, inst.y, inst.z), this.q.setFromEuler(this.e), this.s.set(inst.sx, inst.sy, inst.sz))
      mesh.setMatrixAt(i, this.m)
      if (colours) {
        const k = 0.88 + hash2(Math.round(inst.x * 10), Math.round(inst.z * 10), 5) * 0.2
        if (tint) this.c.copy(tint).multiplyScalar(k)
        else this.c.setScalar(k)
        mesh.setColorAt(i, this.c)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }

  /**
   * Lambert plus a wind sway in the vertex shader: each instance leans by
   * `amount × height²`, phased by where it stands so a forest ripples
   * instead of nodding in unison. One material per amount, sharing a clock.
   */
  private swayMaterial(amount: number): THREE.MeshLambertMaterial {
    const cached = this.swayMats.get(amount)
    if (cached) return cached
    const mat = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
    const time = this.swayTime
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSwayTime = time
      shader.vertexShader = 'uniform float uSwayTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swayPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float swayPhase = 0.0;
        #endif
        float swayH = max(transformed.y - 0.1, 0.0);
        float swayK = ${amount.toFixed(5)} * swayH * swayH;
        transformed.x += sin(uSwayTime * 1.3 + swayPhase) * swayK;
        transformed.z += cos(uSwayTime * 1.1 + swayPhase * 1.3) * swayK * 0.6;`,
      )
    }
    mat.customProgramCacheKey = () => `bonk-sway-${amount}`
    this.swayMats.set(amount, mat)
    return mat
  }

  private own<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat)
    return mat
  }
}

/**
 * Tumbleweeds bowl along with the wind, hopping and rolling over the dunes,
 * and wrap around to the far side when they reach the edge.
 */
class Tumbleweeds {
  private readonly x: Float32Array
  private readonly z: Float32Array
  private readonly scale: Float32Array
  private readonly speed: Float32Array
  private readonly roll: Float32Array
  private readonly hop: Float32Array
  private readonly wind = new THREE.Vector3(1, 0, 0.4).normalize()
  private readonly axis = new THREE.Vector3()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(
    private readonly mesh: THREE.InstancedMesh,
    list: readonly PropInstance[],
    private readonly field: HeightField,
  ) {
    const n = list.length
    this.x = Float32Array.from(list, (p) => p.x)
    this.z = Float32Array.from(list, (p) => p.z)
    this.scale = Float32Array.from(list, (p) => p.scale)
    this.speed = Float32Array.from(list, (_, i) => 2.2 + hash2(i, 1, 9) * 2.6)
    this.roll = Float32Array.from(list, (_, i) => hash2(i, 2, 9) * 6)
    this.hop = Float32Array.from(list, (_, i) => hash2(i, 3, 9) * 6)
    // Rolling forward along the wind turns about up × wind.
    this.axis.set(this.wind.z, 0, -this.wind.x).normalize()
    for (let i = 0; i < n; i++) mesh.setColorAt(i, new THREE.Color().setScalar(0.9 + hash2(i, 4, 9) * 0.2))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    this.update(0)
  }

  update(dt: number): void {
    const lim = PLAY_LIMIT - 2
    for (let i = 0; i < this.x.length; i++) {
      const sc = this.scale[i]
      const r = TUMBLEWEED_RADIUS * sc
      let x = this.x[i] + this.wind.x * this.speed[i] * dt
      let z = this.z[i] + this.wind.z * this.speed[i] * dt
      if (x > lim) x -= 2 * lim
      if (z > lim) z -= 2 * lim
      this.x[i] = x
      this.z[i] = z
      this.roll[i] += (this.speed[i] / r) * dt
      this.hop[i] += this.speed[i] * 1.1 * dt
      const y = this.field.heightAt(x, z) + r + Math.abs(Math.sin(this.hop[i])) * 0.35 * sc
      this.q.setFromAxisAngle(this.axis, this.roll[i])
      this.mesh.setMatrixAt(i, this.m.compose(this.p.set(x, y, z), this.q, this.s.setScalar(sc)))
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

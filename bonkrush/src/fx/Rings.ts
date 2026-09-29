import * as THREE from 'three'
import { ringAlpha, ringScale } from './fxMath'

const MAX_RINGS = 64

const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _matrix = new THREE.Matrix4()

/**
 * Expanding flat rings (shockwaves, explosions, shrine pulses) from one
 * pooled InstancedMesh. Each instance has its own colour and opacity; the
 * opacity comes in through a per-instance attribute the material reads.
 */
export class Rings {
  readonly mesh: THREE.InstancedMesh
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.MeshBasicMaterial
  private readonly alphas: THREE.InstancedBufferAttribute
  private readonly colors: Float32Array
  private readonly pos = new Float32Array(MAX_RINGS * 3)
  private readonly quat = new Float32Array(MAX_RINGS * 4)
  private readonly radius = new Float32Array(MAX_RINGS)
  private readonly age = new Float32Array(MAX_RINGS)
  private readonly duration = new Float32Array(MAX_RINGS)
  private alive = 0

  constructor(private readonly scene: THREE.Scene) {
    const geometry = new THREE.RingGeometry(0.84, 1, 48, 1)
    geometry.rotateX(-Math.PI / 2)
    geometry.deleteAttribute('uv')
    geometry.deleteAttribute('normal')
    this.alphas = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS), 1)
    this.alphas.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('instanceAlpha', this.alphas)
    this.geometry = geometry

    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Pulls the ring toward the camera so it doesn't flicker into the ground it lies on.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    })
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstanceAlpha;')
    }

    const mesh = new THREE.InstancedMesh(geometry, this.material, MAX_RINGS)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS * 3), 3)
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = 2
    mesh.name = 'fx-rings'
    this.colors = mesh.instanceColor.array as Float32Array
    this.mesh = mesh
    scene.add(mesh)
  }

  get count(): number {
    return this.alive
  }

  /** A ring centred on (x, y, z), tilted by `tilt` to lie on the ground, growing to `radius`. */
  spawn(x: number, y: number, z: number, tilt: THREE.Quaternion, radius: number, color: THREE.Color, duration: number): void {
    let i: number
    if (this.alive < MAX_RINGS) i = this.alive++
    else i = this.oldest()
    const i3 = i * 3
    this.pos[i3] = x
    this.pos[i3 + 1] = y
    this.pos[i3 + 2] = z
    this.quat[i * 4] = tilt.x
    this.quat[i * 4 + 1] = tilt.y
    this.quat[i * 4 + 2] = tilt.z
    this.quat[i * 4 + 3] = tilt.w
    this.radius[i] = radius
    this.age[i] = 0
    this.duration[i] = duration
    this.colors[i3] = color.r
    this.colors[i3 + 1] = color.g
    this.colors[i3 + 2] = color.b
    this.write(i)
    this.flush(true)
  }

  update(dt: number): void {
    if (!(dt > 0) || this.alive === 0) return
    let recolored = false
    for (let i = 0; i < this.alive; ) {
      this.age[i] += dt
      if (this.age[i] >= this.duration[i]) {
        this.removeAt(i)
        recolored = true
        continue
      }
      this.write(i)
      i++
    }
    this.flush(recolored)
  }

  clear(): void {
    this.alive = 0
    this.mesh.count = 0
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.dispose()
    this.geometry.dispose()
    this.material.dispose()
  }

  private write(i: number): void {
    const t = this.age[i] / this.duration[i]
    const r = this.radius[i] * ringScale(t)
    const i3 = i * 3
    _pos.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2])
    _quat.set(this.quat[i * 4], this.quat[i * 4 + 1], this.quat[i * 4 + 2], this.quat[i * 4 + 3])
    _scale.set(r, 1, r)
    _matrix.compose(_pos, _quat, _scale)
    this.mesh.setMatrixAt(i, _matrix)
    this.alphas.setX(i, ringAlpha(t) * 0.9)
  }

  private removeAt(i: number): void {
    const last = --this.alive
    if (i === last) return
    const i3 = i * 3
    const l3 = last * 3
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[l3 + k]
      this.colors[i3 + k] = this.colors[l3 + k]
    }
    for (let k = 0; k < 4; k++) this.quat[i * 4 + k] = this.quat[last * 4 + k]
    this.radius[i] = this.radius[last]
    this.age[i] = this.age[last]
    this.duration[i] = this.duration[last]
  }

  private oldest(): number {
    let best = 0
    for (let i = 1; i < this.alive; i++) if (this.age[i] / this.duration[i] > this.age[best] / this.duration[best]) best = i
    return best
  }

  private flush(colors: boolean): void {
    const mesh = this.mesh
    mesh.count = this.alive
    if (this.alive === 0) return
    mesh.instanceMatrix.needsUpdate = true
    this.alphas.needsUpdate = true
    if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
}

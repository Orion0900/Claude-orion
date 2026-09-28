import * as THREE from 'three'

/** What every pooled thing carries so its pool can draw it. */
export interface Pooled {
  readonly pos: THREE.Vector3
  readonly quat: THREE.Quaternion
  readonly scale: THREE.Vector3
  /** Multiplies the vertex colours; additive pools fade out through it. */
  readonly tint: THREE.Color
}

export function pooled(): Pooled {
  return {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
    tint: new THREE.Color(1, 1, 1),
  }
}

const _m = new THREE.Matrix4()

/**
 * A fixed number of look-alike things drawn by one InstancedMesh, so a
 * hundred arrows cost one draw call. `active` stays packed: removing swaps
 * the last item in, so iterate it backwards when removing as you go.
 */
export class InstancePool<T extends Pooled> {
  readonly mesh: THREE.InstancedMesh
  readonly active: T[] = []
  private readonly free: T[] = []

  constructor(
    private readonly scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly capacity: number,
    create: () => T,
    tinted = false,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity)
    // Instances roam the whole map; a stale bounding sphere would cull them.
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    if (tinted) {
      const colors = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3)
      colors.setUsage(THREE.DynamicDrawUsage)
      this.mesh.instanceColor = colors
    }
    this.mesh.count = 0
    this.mesh.visible = false
    for (let i = 0; i < capacity; i++) this.free.push(create())
    scene.add(this.mesh)
  }

  /** A free item appended to `active`, or null when the pool is full. */
  spawn(): T | null {
    const item = this.free.pop()
    if (!item) return null
    this.active.push(item)
    return item
  }

  removeAt(index: number): void {
    const list = this.active
    const item = list[index]
    const last = list.pop()
    if (last !== undefined && index < list.length) list[index] = last
    if (item !== undefined) this.free.push(item)
  }

  clear(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.free.push(this.active[i])
    this.active.length = 0
  }

  /** Uploads every active item's transform (and tint) for this frame. */
  sync(): void {
    const n = this.active.length
    const mesh = this.mesh
    mesh.count = n
    mesh.visible = n > 0
    if (n === 0) return
    const colors = mesh.instanceColor
    for (let i = 0; i < n; i++) {
      const item = this.active[i]
      _m.compose(item.pos, item.quat, item.scale)
      mesh.setMatrixAt(i, _m)
      if (colors) colors.setXYZ(i, item.tint.r, item.tint.g, item.tint.b)
    }
    const matrices = mesh.instanceMatrix
    matrices.clearUpdateRanges()
    matrices.addUpdateRange(0, n * 16)
    matrices.needsUpdate = true
    if (colors) {
      colors.clearUpdateRanges()
      colors.addUpdateRange(0, n * 3)
      colors.needsUpdate = true
    }
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    const material = this.mesh.material
    if (Array.isArray(material)) for (const m of material) m.dispose()
    else material.dispose()
    this.mesh.dispose()
    this.active.length = 0
    this.free.length = 0
  }
}

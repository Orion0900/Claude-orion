import * as THREE from 'three'
import type { HeightField } from './terrain'

/** One warm pool of light on the ground. */
export interface GlowPool {
  x: number
  z: number
  radius: number
  /** Peak brightness at the centre, 0..1. */
  strength: number
  color: THREE.ColorRepresentation
}

/** Rings and segments per pool; the brightness falls off ring by ring. */
const RINGS = 3
const SEGMENTS = 14
/** Lift off the ground, on top of the depth offset, so the pools never flicker into it. */
const LIFT = 0.05

/**
 * Warm pools of light on the ground under candles and jack-o'-lanterns,
 * faked with one mesh of terrain-hugging discs, added on top of the ground.
 * Real point lights would light every pixel of every lit material on the
 * map for the whole stage; these cost one draw call and only where they are.
 * They fade into the fog like everything else and flicker together.
 */
export class GroundGlow {
  private readonly mesh: THREE.Mesh
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.MeshBasicMaterial
  private time = 0

  constructor(
    private readonly root: THREE.Group,
    pools: readonly GlowPool[],
    field: HeightField,
  ) {
    this.geometry = buildPools(pools, field)
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    })
    // Added light has to fade to nothing in the fog, not to the fog's colour.
    this.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          #ifdef FOG_EXP2
            float glowFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float glowFog = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor.rgb *= 1.0 - glowFog;
        #endif`,
      )
    }
    this.material.customProgramCacheKey = () => 'bonk-ground-glow'
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.name = 'ground-glow'
    this.mesh.renderOrder = 1
    this.mesh.visible = pools.length > 0
    root.add(this.mesh)
  }

  update(dt: number): void {
    this.time += dt
    const t = this.time
    this.material.opacity = 0.86 + 0.09 * Math.sin(t * 9) + 0.05 * Math.sin(t * 23.3 + 1.7)
  }

  dispose(): void {
    this.root.remove(this.mesh)
    this.geometry.dispose()
    this.material.dispose()
  }
}

/** Polar discs draped over the ground, with RGBA vertex colours falling off from the centre. */
export function buildPools(pools: readonly GlowPool[], field: HeightField): THREE.BufferGeometry {
  const perPool = 1 + RINGS * SEGMENTS
  const pos = new Float32Array(pools.length * perPool * 3)
  const col = new Float32Array(pools.length * perPool * 4)
  const index: number[] = []
  const c = new THREE.Color()
  pools.forEach((pool, p) => {
    c.set(pool.color)
    const base = p * perPool
    const put = (v: number, x: number, z: number, alpha: number) => {
      pos[v * 3] = x
      pos[v * 3 + 1] = field.heightAt(x, z) + LIFT
      pos[v * 3 + 2] = z
      col[v * 4] = c.r
      col[v * 4 + 1] = c.g
      col[v * 4 + 2] = c.b
      col[v * 4 + 3] = alpha
    }
    put(base, pool.x, pool.z, pool.strength)
    for (let ring = 1; ring <= RINGS; ring++) {
      const f = ring / RINGS
      const r = pool.radius * f
      const alpha = pool.strength * (1 - f) * (1 - f)
      for (let k = 0; k < SEGMENTS; k++) {
        const a = (k / SEGMENTS) * Math.PI * 2
        put(base + 1 + (ring - 1) * SEGMENTS + k, pool.x + Math.cos(a) * r, pool.z + Math.sin(a) * r, alpha)
      }
    }
    // Counter-clockwise seen from above, so the faces point up.
    for (let k = 0; k < SEGMENTS; k++) {
      const k1 = (k + 1) % SEGMENTS
      index.push(base, base + 1 + k1, base + 1 + k)
      for (let ring = 1; ring < RINGS; ring++) {
        const inner = base + 1 + (ring - 1) * SEGMENTS
        const outer = inner + SEGMENTS
        index.push(inner + k, inner + k1, outer + k1, inner + k, outer + k1, outer + k)
      }
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 4))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}

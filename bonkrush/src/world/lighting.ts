import * as THREE from 'three'
import type { Settings, StageDef } from '../game/types'

/** Sun elevation and azimuth per stage, degrees. The dunes' sun hangs low and huge; the crypt's "sun" is the moon. */
const SUN_ANGLES: ReadonlyArray<{ elevation: number; azimuth: number }> = [
  { elevation: 52, azimuth: 35 },
  { elevation: 26, azimuth: -55 },
  { elevation: 40, azimuth: 150 },
]

/** The shadow camera covers this far either side of the player. */
const SHADOW_HALF = 22
const LIGHT_DISTANCE = 90

export function sunDirection(stageIndex: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = SUN_ANGLES[Math.min(Math.max(0, stageIndex), SUN_ANGLES.length - 1)]
  const el = (a.elevation * Math.PI) / 180
  const az = (a.azimuth * Math.PI) / 180
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize()
}

/**
 * Hemisphere fill plus one shadow-casting sun whose shadow camera follows
 * the player. The shadow camera moves in whole shadow-map texels along the
 * light's own axes, so shadows don't shimmer as the player runs.
 */
export class Lighting {
  readonly sunDir: THREE.Vector3
  private readonly hemi: THREE.HemisphereLight
  private readonly sun: THREE.DirectionalLight
  private readonly torches: THREE.PointLight[] = []
  private readonly right = new THREE.Vector3()
  private readonly lightUp = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private quality: Settings['quality'] | null = null
  private time = 0

  constructor(
    private readonly root: THREE.Group,
    stage: StageDef,
    private readonly settings: Settings,
  ) {
    const pal = stage.palette
    this.sunDir = sunDirection(stage.index)

    const skyTone = new THREE.Color(pal.ambient)
    // Night on the crypt: a touch bluer than its palette.
    if (stage.index === 2) skyTone.lerp(new THREE.Color('#8fa4ff'), 0.25)
    const bounce = new THREE.Color(pal.groundLow).multiplyScalar(0.6)
    this.hemi = new THREE.HemisphereLight(skyTone, bounce, pal.ambientIntensity)
    root.add(this.hemi)

    const sunColor = new THREE.Color(pal.sun)
    if (stage.index === 2) sunColor.lerp(new THREE.Color('#9fb4ff'), 0.2)
    this.sun = new THREE.DirectionalLight(sunColor, pal.sunIntensity)
    const cam = this.sun.shadow.camera
    cam.left = -SHADOW_HALF
    cam.right = SHADOW_HALF
    cam.top = SHADOW_HALF
    cam.bottom = -SHADOW_HALF
    cam.near = 1
    cam.far = LIGHT_DISTANCE + 70
    cam.updateProjectionMatrix()
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.04
    root.add(this.sun, this.sun.target)

    // Light-space axes for texel snapping.
    this.right.crossVectors(new THREE.Vector3(0, 1, 0), this.sunDir)
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0)
    this.right.normalize()
    this.lightUp.crossVectors(this.sunDir, this.right).normalize()

    this.applyQuality()
  }

  /** Warm flickering point lights at a few spots (the candles ringing the crypt start). At most four. */
  addTorches(points: readonly THREE.Vector3[], color: string): void {
    for (const p of points.slice(0, 4 - this.torches.length)) {
      const light = new THREE.PointLight(color, 14, 16, 2)
      light.position.set(p.x, p.y + 0.9, p.z)
      this.torches.push(light)
      this.root.add(light)
    }
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt
    if (this.settings.quality !== this.quality) this.applyQuality()

    const texel = (2 * SHADOW_HALF) / this.sun.shadow.mapSize.x
    const u = Math.round(focus.dot(this.right) / texel) * texel
    const v = Math.round(focus.dot(this.lightUp) / texel) * texel
    const w = focus.dot(this.sunDir)
    this.target.copy(this.right).multiplyScalar(u).addScaledVector(this.lightUp, v).addScaledVector(this.sunDir, w)
    this.sun.target.position.copy(this.target)
    this.sun.position.copy(this.target).addScaledVector(this.sunDir, LIGHT_DISTANCE)

    const t = this.time
    for (let k = 0; k < this.torches.length; k++) {
      this.torches[k].intensity = 14 * (0.82 + 0.12 * Math.sin(t * 9 + k * 1.7) + 0.06 * Math.sin(t * 23.3 + k * 4.1))
    }
  }

  dispose(): void {
    this.root.remove(this.hemi, this.sun, this.sun.target, ...this.torches)
    this.sun.dispose()
    this.hemi.dispose()
    for (const light of this.torches) light.dispose()
    this.torches.length = 0
  }

  /** Shadows off on low, 1024² on medium, 2048² on high; re-applied if the setting changes mid-run. */
  private applyQuality(): void {
    this.quality = this.settings.quality
    const size = this.quality === 'high' ? 2048 : 1024
    this.sun.castShadow = this.quality !== 'low'
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size)
      // The renderer makes a new map at the new size once the old one is gone.
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null
    }
  }
}

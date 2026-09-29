import * as THREE from 'three'
import type { Settings, StageDef } from '../game/types'

/**
 * Sun elevation and azimuth per stage, degrees; the crypt's "sun" is the
 * moon. The disc drawn in the sky sits lower on the same bearing than the
 * light itself, so the huge dune sun and the moon actually show up in a
 * third-person view while the ground stays brightly lit.
 */
const SUN_ANGLES: ReadonlyArray<{ elevation: number; azimuth: number; disc: number }> = [
  { elevation: 52, azimuth: 35, disc: 30 },
  { elevation: 38, azimuth: -55, disc: 14 },
  { elevation: 55, azimuth: 150, disc: 22 },
]

/** The shadow camera covers this far either side of the player. */
const SHADOW_HALF = 22
const LIGHT_DISTANCE = 90

/** Unit vector toward the light (or, with `disc`, toward where its disc is drawn). */
export function sunDirection(stageIndex: number, disc = false, out = new THREE.Vector3()): THREE.Vector3 {
  const a = SUN_ANGLES[Math.min(Math.max(0, stageIndex), SUN_ANGLES.length - 1)]
  const el = ((disc ? a.disc : a.elevation) * Math.PI) / 180
  const az = (a.azimuth * Math.PI) / 180
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize()
}

/**
 * Hemisphere fill plus one shadow-casting sun whose shadow camera follows
 * the player. The shadow camera moves in whole shadow-map texels along the
 * light's own axes, so shadows don't shimmer as the player runs. There are
 * deliberately no point lights: every lit pixel pays for each one, all
 * stage long, so candle light is faked on the ground (`glow.ts`).
 */
export class Lighting {
  readonly sunDir: THREE.Vector3
  private readonly hemi: THREE.HemisphereLight
  private readonly sun: THREE.DirectionalLight
  private readonly right = new THREE.Vector3()
  private readonly lightUp = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private quality: Settings['quality'] | null = null

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

  /** The frustum the sun's shadow map is drawn with; the same object every frame. */
  get shadowFrustum(): THREE.Frustum {
    return this.sun.shadow.getFrustum()
  }

  update(focus: THREE.Vector3): void {
    if (this.settings.quality !== this.quality) this.applyQuality()

    const texel = (2 * SHADOW_HALF) / this.sun.shadow.mapSize.x
    const u = Math.round(focus.dot(this.right) / texel) * texel
    const v = Math.round(focus.dot(this.lightUp) / texel) * texel
    const w = focus.dot(this.sunDir)
    this.target.copy(this.right).multiplyScalar(u).addScaledVector(this.lightUp, v).addScaledVector(this.sunDir, w)
    this.sun.target.position.copy(this.target)
    this.sun.position.copy(this.target).addScaledVector(this.sunDir, LIGHT_DISTANCE)
  }

  dispose(): void {
    this.root.remove(this.hemi, this.sun, this.sun.target)
    this.sun.dispose()
    this.hemi.dispose()
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

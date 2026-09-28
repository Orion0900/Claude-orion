import * as THREE from 'three'
import type { CameraApi, GameContext, PlayerApi, Vec3, WorldApi } from '../game/types'
import { ColliderGrid } from './colliders'
import { GroundGlow, type GlowPool } from './glow'
import { Lighting, sunDirection } from './lighting'
import { Motes } from './motes'
import { PropLayer } from './props'
import { boundaryRocks, scatterProps, type PropGroup } from './scatter'
import { Sky } from './sky'
import { placeSpots, type WorldSpots } from './spots'
import { generateTerrain, WORLD_HALF_SIZE, type HeightField } from './terrain'
import { buildTerrainGeometries } from './terrainMesh'

/**
 * One stage's map: rolling terrain with a flat start, a few long slide
 * ramps and a walled rim, scattered props, the spots interactables use,
 * sky, fog and lights. Solid props between the camera and the player
 * dither out of the way.
 *
 * The layout comes from a fork of the run's rng salted by the stage, so a
 * run seed always rebuilds the same maps while every run gets new ones.
 * The title screen builds one too, from a context holding only scene,
 * renderer, rng, stage, settings, meta and events, so nothing here may
 * assume a player exists.
 */
export class World implements WorldApi {
  readonly halfSize = WORLD_HALF_SIZE
  readonly spots: WorldSpots
  private readonly field: HeightField
  private readonly colliders: ColliderGrid
  private readonly root = new THREE.Group()
  private readonly terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  private readonly terrainGeos: THREE.BufferGeometry[]
  private readonly props: PropLayer
  private readonly lighting: Lighting
  private readonly sky: Sky
  private readonly motes: Motes
  private readonly glow: GroundGlow
  private readonly focus = new THREE.Vector3()
  /** Where the camera has to see: the player's chest. */
  private readonly sightline = new THREE.Vector3()
  private disposed = false

  constructor(private readonly ctx: GameContext) {
    const stage = ctx.stage
    const layout = ctx.rng.fork(0x77071d + stage.index * 7919)
    const seed = (Math.imul(stage.terrain.seed, 0x9e3779b1) ^ layout.int(0, 0x7fffffff)) >>> 0

    // Spots first (they level the ground they need), then props around them.
    this.field = generateTerrain({ ...stage.terrain, seed })
    this.spots = placeSpots(this.field, layout)
    const scattered = scatterProps(this.field, this.spots, stage.props, layout)
    this.colliders = new ColliderGrid(scattered.colliders, this.halfSize)

    this.root.name = 'world'
    this.terrainGeos = buildTerrainGeometries(this.field, stage.palette, seed)
    for (const geo of this.terrainGeos) {
      const mesh = new THREE.Mesh(geo, this.terrainMat)
      mesh.receiveShadow = true
      this.root.add(mesh)
    }

    this.lighting = new Lighting(this.root, stage, ctx.settings)
    this.props = new PropLayer(
      this.root,
      scattered.groups,
      boundaryRocks(this.field, layout),
      this.field,
      stage.palette,
      this.colliders,
      this.lighting.shadowFrustum,
    )
    this.sky = new Sky(this.root, stage, sunDirection(stage.index, true), seed)
    // On every stage; empty and hidden where nothing glows.
    this.glow = new GroundGlow(this.root, glowPools(scattered.groups), this.field)

    this.focus.copy(this.spots.playerStart)
    this.motes = new Motes(this.root, stage.index, ctx.settings, this.focus)

    ctx.scene.background = new THREE.Color(stage.palette.sky)
    ctx.scene.fog = new THREE.Fog(stage.palette.fog, stage.palette.fogNear, stage.palette.fogFar)
    ctx.scene.add(this.root)
    this.update(0)
  }

  heightAt(x: number, z: number): number {
    return this.field.heightAt(x, z)
  }

  normalAt(x: number, z: number, out: Vec3): Vec3 {
    return this.field.normalAt(x, z, out)
  }

  collide(pos: Vec3, radius: number): void {
    this.colliders.collide(pos, radius)
  }

  update(dt: number): void {
    if (this.disposed) return
    // In a run the player exists from its construction on; on the title screen it never does.
    const player = this.ctx.player as PlayerApi | undefined
    const at = player?.pos
    const valid = !!at && Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.z)
    if (valid) this.focus.copy(at)
    else if (!player) this.focus.copy(this.spots.playerStart)

    this.lighting.update(this.focus)
    this.sky.update(dt, this.focus)
    this.props.update(dt)
    // Last frame's camera is close enough; the fade eases over 0.15 s anyway.
    const eye = (this.ctx.camera as CameraApi | undefined)?.camera.position
    const seen = valid ? this.sightline.set(at.x, at.y + 1, at.z) : null
    this.props.updateOcclusion(dt, eye ?? null, seen)
    this.glow.update(dt)
    this.motes.update(dt, this.focus)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.props.dispose()
    this.glow.dispose()
    this.sky.dispose()
    this.lighting.dispose()
    this.motes.dispose()
    for (const geo of this.terrainGeos) geo.dispose()
    this.terrainMat.dispose()
    this.root.clear()
    this.ctx.scene.remove(this.root)
    this.ctx.scene.fog = null
    this.ctx.scene.background = null
  }
}

/**
 * A pool of warm light under every candle and jack-o'-lantern: wide and
 * bright around the start's candle ring, small elsewhere.
 */
function glowPools(groups: readonly PropGroup[]): GlowPool[] {
  const pools: GlowPool[] = []
  for (const g of groups) {
    if (g.kind !== 'candle' && g.kind !== 'pumpkin') continue
    const color = g.spec.glow ?? '#ffc05a'
    const ring = g.spec.startRing
    for (const p of g.instances) {
      const lit = ring && Math.hypot(p.x, p.z) <= ring.max + 0.5
      if (g.kind === 'candle') pools.push({ x: p.x, z: p.z, radius: lit ? 4.5 : 2.4 * p.scale, strength: lit ? 0.6 : 0.4, color })
      else pools.push({ x: p.x, z: p.z, radius: 1.7 * p.scale, strength: 0.3, color })
    }
  }
  return pools
}

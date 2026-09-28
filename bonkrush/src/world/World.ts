import * as THREE from 'three'
import type { GameContext, PlayerApi, Vec3, WorldApi } from '../game/types'
import { ColliderGrid } from './colliders'
import { Lighting } from './lighting'
import { Motes } from './motes'
import { PropLayer } from './props'
import { boundaryRocks, scatterProps, type PropGroup } from './scatter'
import { Sky } from './sky'
import { placeSpots, type WorldSpots } from './spots'
import { generateTerrain, WORLD_HALF_SIZE, type HeightField } from './terrain'
import { buildTerrainGeometries } from './terrainMesh'

/**
 * One stage's map: rolling terrain with a flat start and a walled rim,
 * scattered props, the spots interactables use, sky, fog and lights.
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
  private readonly focus = new THREE.Vector3()
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

    this.props = new PropLayer(this.root, scattered.groups, boundaryRocks(this.field, layout), this.field, stage.palette)
    this.lighting = new Lighting(this.root, stage, ctx.settings)
    this.sky = new Sky(this.root, stage, this.lighting.sunDir, seed)
    const candles = scattered.groups.find((g) => g.kind === 'candle')
    if (candles) this.lighting.addTorches(torchSpots(candles), candles.spec.glow ?? '#ffc05a')

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
    if (at && Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.z)) this.focus.copy(at)
    else if (!player) this.focus.copy(this.spots.playerStart)

    this.lighting.update(dt, this.focus)
    this.sky.update(dt, this.focus)
    this.props.update(dt)
    this.motes.update(dt, this.focus)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.props.dispose()
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

/** Up to four candles from the ring around the start, spread evenly by angle, to hang lights over. */
function torchSpots(candles: PropGroup): THREE.Vector3[] {
  const ring = candles.spec.startRing
  const near = candles.instances
    .filter((c) => !ring || Math.hypot(c.x, c.z) <= ring.max + 0.5)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
    .slice(0, 8)
    .sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x))
  const step = Math.max(1, near.length / 4)
  const out: THREE.Vector3[] = []
  for (let k = 0; k < 4 && Math.floor(k * step) < near.length; k++) {
    const c = near[Math.floor(k * step)]
    out.push(new THREE.Vector3(c.x, c.y, c.z))
  }
  return out
}

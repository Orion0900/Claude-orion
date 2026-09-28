/**
 * Everything on the map the player can use: chests, pots, shrines, the boss
 * altar and the exit portal. Numerous things are instanced (one draw per
 * model), unique ones are plain meshes. The pure rules live in `rules.ts`.
 */
import * as THREE from 'three'
import type { Rng } from '../core/rng'
import { MINIBOSSES } from '../data/stages'
import type { Enemy, GameContext, InteractableApi, PlayerApi } from '../game/types'
import { flatMaterial, flush, instanced } from '../pickups/modelKit'
import { popScale } from '../pickups/attraction'
import { RARITY_COLOR } from '../progression/rarity'
import {
  beamGeometry,
  bossAltarGeometry,
  challengeObeliskGeometry,
  chargePlinthGeometry,
  CHEST_BODY_H,
  CHEST_DEPTH,
  chestBodyGeometry,
  chestLidGeometry,
  crystalGeometry,
  curseAltarGeometry,
  greedIdolGeometry,
  magnetTotemGeometry,
  pegGeometry,
  portalDiscGeometry,
  portalRingGeometry,
  potGeometry,
} from './interactableModels'
import {
  assignShrineKinds,
  challengeSize,
  CHARGE_RADIUS,
  chargeSpeed,
  chargeText,
  chestCost as priceOfChest,
  CURSE_CURSE,
  forceLegendary,
  GOLDEN_SHRINE_CHANCE,
  GREED_CURSE,
  GREED_GOLD,
  keyFreeChance,
  pickNearest,
  REACH,
  ringOffsets,
  rollPotLoot,
  SHRINE_COUNTS,
  SILVER_POT_CHANCE,
  stepCharge,
  type ShrineKind,
} from './rules'

const MAX_MAP_CHESTS = 26
const MAX_POTS = 40
/** Chests alive at once (map + rewards); past this the oldest opened chest is recycled. */
const CHEST_CAP = 96
const POT_RADIUS = 0.45
const PEGS_PER_RING = 16
/** Things more than this far above or below the player are out of reach. */
const VERTICAL_REACH = 3
const ALTAR_REACH = 3.2
const PORTAL_REACH = 3
/** Stepping this close to the portal's centre takes you through. */
const PORTAL_RADIUS = 1.8
/** Boss reward chests fan out this far from where it died (and the portal opens). */
const REWARD_RING = 4.5
const CHEST_SPACING = 1.6
const WIND_PARTICLES = 36
const PORTAL_SPARKS = 48

type ShrineLook = 'charge' | 'chargeGold' | 'greed' | 'magnet' | 'challenge' | 'curse'

const SHRINE_COLOR: Record<ShrineKind, string> = {
  shrineCharge: '#3ee8d0',
  shrineGreed: '#ffb400',
  shrineMagnet: '#4aa8ff',
  shrineChallenge: '#b060ff',
  shrineCurse: '#ff3b3b',
}
const GOLD_HEX = '#ffd23f'

const UP = new THREE.Vector3(0, 1, 0)
const WHITE = new THREE.Color(1, 1, 1)
const DIM = new THREE.Color(0.42, 0.42, 0.48)
const OPENED = new THREE.Color(0.72, 0.7, 0.68)
const PEG_OFF = new THREE.Color('#1b4a45')
const PEG_ON = new THREE.Color('#5dfff0')
const PEG_OFF_GOLD = new THREE.Color('#5a4712')
const PEG_ON_GOLD = new THREE.Color('#fff09a')
const PEG_USED = new THREE.Color('#3a3d44')
/** Additive beams add light, so their tints stay well under full brightness. */
const beamTint = (hex: string, k = 0.55) => new THREE.Color(hex).multiplyScalar(k)
const CHEST_BEAM = beamTint('#ffd23f')
const FREE_BEAM = beamTint('#fff2a0', 0.75)
const ALTAR_BEAM = beamTint('#ff5a4a', 0.6)
const CHALLENGE_BEAM = beamTint('#b060ff', 0.8)
const SHRINE_BEAM: Record<ShrineKind, THREE.Color> = {
  shrineCharge: beamTint(SHRINE_COLOR.shrineCharge, 0.45),
  shrineGreed: beamTint(SHRINE_COLOR.shrineGreed, 0.45),
  shrineMagnet: beamTint(SHRINE_COLOR.shrineMagnet, 0.45),
  shrineChallenge: beamTint(SHRINE_COLOR.shrineChallenge, 0.45),
  shrineCurse: beamTint(SHRINE_COLOR.shrineCurse, 0.45),
}
const GOLD_SHRINE_BEAM = beamTint(GOLD_HEX, 0.55)
const CRYSTAL_TEAL = new THREE.Color('#5dfff0')
const CRYSTAL_GOLD = new THREE.Color('#ffe066')

interface Thing {
  /** XZ distance to the player, refreshed every frame (Infinity when out of vertical reach). */
  dist: number
  reach: number
  usable: boolean
  pos: THREE.Vector3
  used: boolean
  golden?: boolean
}

interface Chest extends Thing {
  kind: 'chest'
  free: boolean
  yaw: number
  /** Lid opening progress 0..1. */
  lid: number
  /** Pop-in progress 0..1 (1 for chests placed with the map). */
  appear: number
  /** The Rusty Key rolls once per chest, so mashing Interact can't reroll it. */
  keyRolled: boolean
  keyFree: boolean
}

interface Shrine extends Thing {
  kind: ShrineKind
  yaw: number
  look: ShrineLook
  /** Instance index inside its look's mesh. */
  slot: number
  /** Index among charge shrines (crystal and peg ring), or -1. */
  ring: number
  charge: number
  spin: number
  /** Live challenge fight, tracked by uid because enemy objects are pooled. */
  foes: Enemy[] | null
  foeUids: number[]
}

interface Altar extends Thing {
  kind: 'altar'
}

interface PortalThing extends Thing {
  kind: 'portal'
  age: number
  /** Set once the player has been outside the portal, so it never swallows them the frame it opens. */
  armed: boolean
}

type Usable = Chest | Shrine | Altar | PortalThing

interface Pot {
  pos: THREE.Vector3
  yaw: number
  scale: number
  silvery: boolean
  alive: boolean
}

/** Meshes of the exit portal, built when it first opens. */
interface PortalView {
  group: THREE.Group
  ring: THREE.Mesh
  disc: THREE.Mesh
  sparks: THREE.Points
  sparkData: Float32Array
  geometries: THREE.BufferGeometry[]
  materials: THREE.Material[]
}

export class InteractableManager implements InteractableApi {
  private readonly rng: Rng
  private readonly root = new THREE.Group()
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly unsubs: Array<() => void> = []

  private readonly chestBodies: [THREE.InstancedMesh, THREE.InstancedMesh]
  private readonly chestLids: [THREE.InstancedMesh, THREE.InstancedMesh]
  private readonly potMeshes: [THREE.InstancedMesh, THREE.InstancedMesh]
  private readonly shrineMeshes: Record<ShrineLook, THREE.InstancedMesh>
  private readonly crystals: THREE.InstancedMesh
  private readonly pegs: THREE.InstancedMesh
  private readonly beams: THREE.InstancedMesh
  private readonly beamMat: THREE.MeshBasicMaterial
  private readonly altarGroup = new THREE.Group()
  private readonly altarMat: THREE.MeshLambertMaterial
  private readonly wind: THREE.Points
  private readonly windMat: THREE.PointsMaterial
  /** Per wind particle: angle, angular speed, radius, phase. */
  private readonly windData = new Float32Array(WIND_PARTICLES * 4)

  private readonly things: Usable[] = []
  private readonly chests: Chest[] = []
  private readonly shrines: Shrine[] = []
  private readonly chargeShrines: Shrine[] = []
  private readonly pots: Pot[] = []
  private altar!: Altar
  private portal: PortalThing | null = null
  private portalView: PortalView | null = null
  private portalEntered = false

  private paid = 0
  /** Extra free chests owed to the next boss or miniboss by curse shrines. */
  private curseChests = 0
  private focus: Usable | null = null
  private promptValue: { text: string; cost?: number } | null = null

  private chestsDirty = true
  private potsDirty = true
  private beamsDirty = true
  private pegsDirty = true

  // Scratch objects reused every frame.
  private readonly v = new THREE.Vector3()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly m = new THREE.Matrix4()
  private readonly hinge = new THREE.Matrix4()
  private readonly lidM = new THREE.Matrix4()
  private readonly c = new THREE.Color()

  constructor(private readonly ctx: GameContext) {
    this.rng = ctx.rng.fork(0x1e7 + ctx.stage.index * 977)
    this.root.name = 'interactables'

    const solid = flatMaterial()
    const golden = flatMaterial(0x6a4800)
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true })
    this.beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    this.altarMat = flatMaterial()
    this.materials.push(solid, golden, glow, this.beamMat, this.altarMat)

    const geo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.geometries.push(g)
      return g
    }
    const add = (mesh: THREE.InstancedMesh, name: string): THREE.InstancedMesh => {
      mesh.name = name
      this.root.add(mesh)
      return mesh
    }

    this.chestBodies = [
      add(instanced(geo(chestBodyGeometry(false)), solid, CHEST_CAP, true), 'chest'),
      add(instanced(geo(chestBodyGeometry(true)), golden, CHEST_CAP, true), 'chest:free'),
    ]
    this.chestLids = [
      add(instanced(geo(chestLidGeometry(false)), solid, CHEST_CAP, true), 'chest:lid'),
      add(instanced(geo(chestLidGeometry(true)), golden, CHEST_CAP, true), 'chest:freeLid'),
    ]
    this.potMeshes = [
      add(instanced(geo(potGeometry(false)), solid, MAX_POTS, true), 'pot'),
      add(instanced(geo(potGeometry(true)), solid, MAX_POTS, true), 'pot:silver'),
    ]
    const charges = SHRINE_COUNTS.shrineCharge
    this.shrineMeshes = {
      charge: add(instanced(geo(chargePlinthGeometry(false)), solid, charges, true), 'shrine:charge'),
      chargeGold: add(instanced(geo(chargePlinthGeometry(true)), golden, charges, true), 'shrine:chargeGold'),
      greed: add(instanced(geo(greedIdolGeometry()), solid, SHRINE_COUNTS.shrineGreed, true), 'shrine:greed'),
      magnet: add(instanced(geo(magnetTotemGeometry()), solid, SHRINE_COUNTS.shrineMagnet, true), 'shrine:magnet'),
      challenge: add(instanced(geo(challengeObeliskGeometry()), solid, SHRINE_COUNTS.shrineChallenge, true), 'shrine:challenge'),
      curse: add(instanced(geo(curseAltarGeometry()), solid, SHRINE_COUNTS.shrineCurse, true), 'shrine:curse'),
    }
    this.crystals = add(instanced(geo(crystalGeometry()), glow, charges), 'shrine:crystals')
    this.pegs = add(instanced(geo(pegGeometry()), glow, charges * PEGS_PER_RING), 'shrine:pegs')
    this.beams = add(
      instanced(geo(beamGeometry()), this.beamMat, CHEST_CAP + charges + 16 + 2),
      'beams',
    )
    this.beams.renderOrder = 2

    const altarMesh = new THREE.Mesh(geo(bossAltarGeometry()), this.altarMat)
    altarMesh.castShadow = true
    this.windMat = new THREE.PointsMaterial({
      color: '#e8f4ff',
      size: 0.16,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
    this.materials.push(this.windMat)
    const windGeo = geo(new THREE.BufferGeometry())
    windGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WIND_PARTICLES * 3), 3))
    this.wind = new THREE.Points(windGeo, this.windMat)
    this.wind.frustumCulled = false
    for (let i = 0; i < WIND_PARTICLES; i++) {
      // Purely cosmetic, so Math.random keeps the gameplay stream untouched.
      this.windData[i * 4] = Math.random() * Math.PI * 2
      this.windData[i * 4 + 1] = 1.2 + Math.random() * 1.6
      this.windData[i * 4 + 2] = 0.35 + Math.random() * 0.65
      this.windData[i * 4 + 3] = Math.random() * Math.PI * 2
    }
    this.altarGroup.add(altarMesh, this.wind)
    this.altarGroup.name = 'altar'
    this.root.add(this.altarGroup)

    this.layout()

    this.unsubs.push(
      ctx.events.on('bossKilled', ({ enemy }) => this.rewardBoss(enemy.pos)),
      ctx.events.on('enemyKilled', ({ enemy }) => {
        // Curse shrines also pay out on the next miniboss.
        if (this.curseChests > 0 && !enemy.boss && MINIBOSSES.includes(enemy.def.id)) {
          const n = this.curseChests
          this.curseChests = 0
          this.fanChests(enemy.pos, n, 3)
        }
      }),
    )
    ctx.scene.add(this.root)
  }

  // ─────────────────────────── api ───────────────────────────

  get prompt(): { text: string; cost?: number } | null {
    return this.promptValue
  }

  get chestCost(): number {
    return priceOfChest(this.paid)
  }

  get markers(): ReadonlyArray<Usable> {
    return this.things
  }

  interact(): void {
    const ctx = this.ctx
    if (!ctx.player.alive) return
    this.refreshFocus()
    const t = this.focus
    if (!t) return
    switch (t.kind) {
      case 'chest':
        this.tryOpenChest(t)
        break
      case 'shrineCharge':
        // Charged by standing in the ring; Interact does nothing here.
        break
      case 'shrineGreed':
        ctx.addGold(GREED_GOLD, true)
        this.addCurse(GREED_CURSE)
        ctx.audio.play('gold')
        ctx.audio.play('shrine', { pitch: 1.1 })
        ctx.ui.toast(`+${GREED_GOLD} gold · +${Math.round(GREED_CURSE * 100)}% difficulty`, SHRINE_COLOR.shrineGreed)
        this.useShrine(t)
        break
      case 'shrineMagnet':
        ctx.pickups.magnetAll()
        ctx.audio.play('shrine', { pitch: 1.3 })
        ctx.ui.toast('Magnet!', SHRINE_COLOR.shrineMagnet)
        this.useShrine(t)
        break
      case 'shrineChallenge': {
        const foes = ctx.spawner.spawnChallenge(challengeSize(ctx.stage.index), t.pos.clone())
        if (foes.length === 0) {
          // The horde is at its cap; keep the shrine for later rather than hand out a free chest.
          ctx.ui.toast('Too crowded for a challenge. Try again soon', SHRINE_COLOR.shrineChallenge)
          ctx.audio.play('uiMove')
          break
        }
        t.foes = foes.slice()
        t.foeUids = foes.map((e) => e.uid)
        ctx.audio.play('shrine', { pitch: 0.8 })
        ctx.ui.toast(`Challenge: defeat ${foes.length} elites for a free chest!`, SHRINE_COLOR.shrineChallenge)
        this.useShrine(t)
        break
      }
      case 'shrineCurse':
        this.addCurse(CURSE_CURSE)
        this.curseChests++
        ctx.audio.play('shrine', { pitch: 0.6 })
        ctx.ui.toast(`Cursed: +${Math.round(CURSE_CURSE * 100)}% difficulty, extra boss chest`, SHRINE_COLOR.shrineCurse)
        this.useShrine(t)
        break
      case 'altar':
        this.summon()
        break
      case 'portal':
        this.enterPortal()
        break
    }
    this.refreshFocus()
  }

  openPortal(pos: THREE.Vector3): void {
    if (this.portal) return
    const ctx = this.ctx
    const p = this.onGround(pos, 1.5)
    const view = this.buildPortalView()
    view.group.position.copy(p)
    view.group.rotation.y = this.yawToPlayer(p)
    view.group.scale.setScalar(0.01)
    this.root.add(view.group)
    this.portal = { kind: 'portal', pos: p, used: false, dist: Infinity, reach: PORTAL_REACH, usable: false, age: 0, armed: false }
    this.things.push(this.portal)
    ctx.events.emit('portalOpened', { pos: p.clone() })
    ctx.ui.banner('PORTAL OPEN', 'Step in to leave the stage', '#c86bff')
    ctx.audio.play('portal')
    ctx.fx.ring(p.clone(), 5, '#c86bff', 0.9)
    ctx.fx.burst(p.clone().setY(p.y + 2.4), '#e0a8ff', 36, 8, 0.35)
  }

  hitBreakables(center: THREE.Vector3, radius: number): void {
    if (!Number.isFinite(radius) || radius < 0) return
    const r = radius + POT_RADIUS
    for (const pot of this.pots) {
      if (!pot.alive) continue
      const dx = pot.pos.x - center.x
      const dz = pot.pos.z - center.z
      if (dx * dx + dz * dz > r * r) continue
      if (Math.abs(center.y - (pot.pos.y + 0.4)) > radius + 1.5) continue
      this.breakPot(pot)
    }
  }

  spawnChest(pos: THREE.Vector3, free: boolean): void {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return
    if (this.chests.length >= CHEST_CAP && !this.recycleChest()) return
    const p = this.onGround(pos, 0.8)
    this.spaceOut(p)
    p.y = this.ctx.world.heightAt(p.x, p.z) - 0.05
    this.addChest(p, free, this.yawToPlayer(p), true)
    this.ctx.fx.burst(p.clone().setY(p.y + 0.6), free ? GOLD_HEX : '#fff2a0', 16, 5, 0.25)
  }

  reset(): void {
    this.things.length = 0
    this.chests.length = 0
    this.shrines.length = 0
    this.chargeShrines.length = 0
    this.pots.length = 0
    this.paid = 0
    this.curseChests = 0
    this.focus = null
    this.promptValue = null
    this.removePortal()
    this.layout()
  }

  update(dt: number): void {
    const ctx = this.ctx
    const player = ctx.player
    if (player.alive) this.touchPots(player)
    this.updateCharge(dt, player)
    this.updateChallenges()
    if (!this.altar.used && ctx.run.bossSpawned) this.markAltarUsed()
    this.updatePortal(dt, player)

    this.animateChests(dt)
    this.animateShrines(dt)
    this.animateAltar(dt)
    if (this.potsDirty) this.writePots()
    if (this.beamsDirty) this.writeBeams()
    if (this.pegsDirty) {
      flush(this.pegs, this.chargeShrines.length * PEGS_PER_RING, true)
      this.pegsDirty = false
    }
    this.beamMat.color.setScalar(0.8 + 0.2 * Math.sin(ctx.time * 3))
    this.refreshFocus()
  }

  dispose(): void {
    for (const off of this.unsubs) off()
    this.unsubs.length = 0
    this.removePortal()
    this.ctx.scene.remove(this.root)
    this.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose()
    })
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    this.geometries.length = 0
    this.materials.length = 0
  }

  // ─────────────────────────── layout ───────────────────────────

  private layout(): void {
    const spots = this.ctx.world.spots
    const rng = this.rng

    for (const spot of spots.chests.slice(0, MAX_MAP_CHESTS)) {
      const p = this.onGround(spot, 0)
      p.y -= 0.05
      this.addChest(p, false, rng.range(0, Math.PI * 2), false)
    }

    for (const spot of spots.pots.slice(0, MAX_POTS)) {
      this.pots.push({
        pos: this.onGround(spot, 0),
        yaw: rng.range(0, Math.PI * 2),
        scale: rng.range(0.95, 1.2),
        silvery: rng.chance(SILVER_POT_CHANCE),
        alive: true,
      })
    }
    this.potsDirty = true

    const slots: Record<ShrineLook, number> = { charge: 0, chargeGold: 0, greed: 0, magnet: 0, challenge: 0, curse: 0 }
    const kinds = assignShrineKinds(spots.shrines.length, rng)
    kinds.forEach((kind, i) => {
      const golden = kind === 'shrineCharge' && rng.chance(GOLDEN_SHRINE_CHANCE)
      const look = this.lookOf(kind, golden)
      const pos = this.onGround(spots.shrines[i], 0)
      const shrine: Shrine = {
        kind,
        pos,
        used: false,
        golden: golden || undefined,
        dist: Infinity,
        reach: kind === 'shrineCharge' ? CHARGE_RADIUS : REACH,
        usable: false,
        // Face the middle of the map, where the player spends most of the run.
        yaw: Math.atan2(-pos.x, -pos.z),
        look,
        slot: slots[look]++,
        ring: kind === 'shrineCharge' ? this.chargeShrines.length : -1,
        charge: 0,
        spin: rng.range(0, Math.PI * 2),
        foes: null,
        foeUids: [],
      }
      this.shrines.push(shrine)
      this.things.push(shrine)
      if (shrine.ring >= 0) this.chargeShrines.push(shrine)
    })
    this.writeShrines(slots)

    const altarPos = this.onGround(spots.altar, 0)
    const start = spots.playerStart
    this.altar = { kind: 'altar', pos: altarPos, used: false, dist: Infinity, reach: ALTAR_REACH, usable: false }
    this.things.push(this.altar)
    this.altarGroup.position.copy(altarPos)
    this.altarGroup.rotation.y = Math.atan2(start.x - altarPos.x, start.z - altarPos.z)
    this.altarMat.color.setScalar(1)
    this.windMat.color.set('#e8f4ff')

    this.chestsDirty = true
    this.beamsDirty = true
  }

  private lookOf(kind: ShrineKind, golden: boolean): ShrineLook {
    switch (kind) {
      case 'shrineCharge':
        return golden ? 'chargeGold' : 'charge'
      case 'shrineGreed':
        return 'greed'
      case 'shrineMagnet':
        return 'magnet'
      case 'shrineChallenge':
        return 'challenge'
      case 'shrineCurse':
        return 'curse'
    }
  }

  /** Shrine bodies and peg rings are static: written once per layout. */
  private writeShrines(counts: Record<ShrineLook, number>): void {
    const world = this.ctx.world
    for (const shrine of this.shrines) {
      const mesh = this.shrineMeshes[shrine.look]
      this.q.setFromAxisAngle(UP, shrine.yaw)
      mesh.setMatrixAt(shrine.slot, this.m.compose(shrine.pos, this.q, this.s.setScalar(1)))
      mesh.setColorAt(shrine.slot, WHITE)
      if (shrine.ring < 0) continue
      for (let i = 0; i < PEGS_PER_RING; i++) {
        const a = (i / PEGS_PER_RING) * Math.PI * 2
        const x = shrine.pos.x + Math.sin(a) * CHARGE_RADIUS
        const z = shrine.pos.z + Math.cos(a) * CHARGE_RADIUS
        this.v.set(x, world.heightAt(x, z), z)
        this.q.setFromAxisAngle(UP, a)
        this.pegs.setMatrixAt(shrine.ring * PEGS_PER_RING + i, this.m.compose(this.v, this.q, this.s.setScalar(1)))
      }
      this.paintPegs(shrine)
      this.crystals.setColorAt(shrine.ring, shrine.golden ? CRYSTAL_GOLD : CRYSTAL_TEAL)
    }
    for (const look of Object.keys(this.shrineMeshes) as ShrineLook[]) {
      flush(this.shrineMeshes[look], counts[look], true)
    }
    this.pegsDirty = true
  }

  private addChest(pos: THREE.Vector3, free: boolean, yaw: number, spawned: boolean): void {
    const chest: Chest = {
      kind: 'chest',
      pos,
      used: false,
      golden: free || undefined,
      dist: Infinity,
      reach: REACH,
      usable: false,
      free,
      yaw,
      lid: 0,
      appear: spawned ? 0 : 1,
      keyRolled: false,
      keyFree: false,
    }
    this.chests.push(chest)
    this.things.push(chest)
    this.chestsDirty = true
    this.beamsDirty = true
  }

  /** Frees a slot by dropping the oldest fully opened chest; false if every chest is still closed. */
  private recycleChest(): boolean {
    const i = this.chests.findIndex((c) => c.used && c.lid >= 1)
    if (i < 0) return false
    const [chest] = this.chests.splice(i, 1)
    const j = this.things.indexOf(chest)
    if (j >= 0) this.things.splice(j, 1)
    if (this.focus === chest) this.focus = null
    this.chestsDirty = true
    return true
  }

  /** A copy of `pos` inside the map, pushed out of props, standing on the ground. */
  private onGround(pos: THREE.Vector3, radius: number): THREE.Vector3 {
    const world = this.ctx.world
    const edge = world.halfSize - 2
    const p = new THREE.Vector3(
      Math.min(edge, Math.max(-edge, Number.isFinite(pos.x) ? pos.x : 0)),
      0,
      Math.min(edge, Math.max(-edge, Number.isFinite(pos.z) ? pos.z : 0)),
    )
    if (radius > 0) world.collide(p, radius)
    p.y = world.heightAt(p.x, p.z)
    return p
  }

  /** Nudges a new chest off other chests and out of the portal's mouth. */
  private spaceOut(p: THREE.Vector3): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      let moved = false
      for (const other of this.chests) moved = this.pushAway(p, other.pos, CHEST_SPACING, attempt) || moved
      if (this.portal) moved = this.pushAway(p, this.portal.pos, PORTAL_REACH + 0.8, attempt) || moved
      if (!moved) break
    }
    this.ctx.world.collide(p, 0.8)
  }

  private pushAway(p: THREE.Vector3, from: THREE.Vector3, gap: number, attempt: number): boolean {
    let dx = p.x - from.x
    let dz = p.z - from.z
    let d = Math.hypot(dx, dz)
    if (d >= gap) return false
    if (d < 1e-3) {
      const a = attempt * 2.4
      dx = Math.sin(a)
      dz = Math.cos(a)
      d = 1
    }
    p.x = from.x + (dx / d) * (gap + 0.1)
    p.z = from.z + (dz / d) * (gap + 0.1)
    return true
  }

  private yawToPlayer(p: THREE.Vector3): number {
    const player = this.ctx.player as PlayerApi | undefined
    if (!player) return 0
    return Math.atan2(player.pos.x - p.x, player.pos.z - p.z)
  }

  // ─────────────────────────── chests ───────────────────────────

  private tryOpenChest(chest: Chest): void {
    const ctx = this.ctx
    let free = chest.free
    if (!free && !chest.keyRolled) {
      chest.keyRolled = true
      const keys = ctx.progression.items.get('key') ?? 0
      chest.keyFree = keys > 0 && this.rng.chance(keyFreeChance(keys))
    }
    if (!free && chest.keyFree) {
      free = true
      ctx.ui.toast('Rusty Key: free chest!', GOLD_HEX)
    }
    if (!free) {
      const cost = this.chestCost
      if (ctx.run.gold < cost) {
        ctx.ui.toast(`Need ${cost} gold`, '#ff8a3d')
        ctx.audio.play('uiMove')
        return
      }
      ctx.addGold(-cost, true)
      this.paid++
    }
    this.openChest(chest, free)
  }

  private openChest(chest: Chest, free: boolean): void {
    const ctx = this.ctx
    chest.used = true
    chest.lid = 0
    this.chestsDirty = true
    this.beamsDirty = true

    const offer = ctx.progression.rollChestItem()
    ctx.progression.applyOffer(offer)
    ctx.events.emit('chestOpened', { offer, free })
    ctx.audio.play('chest', { pos: chest.pos })
    const color = RARITY_COLOR[offer.rarity]
    ctx.fx.burst(chest.pos.clone().setY(chest.pos.y + 0.8), color, 30, 7, 0.3)
    ctx.fx.ring(chest.pos.clone(), 2.4, color, 0.6)
    void ctx.ui.openModal({ kind: 'chest', offer })
  }

  /** Reward chests for a boss kill: one, plus one per curse shrine used this stage. */
  private rewardBoss(at: THREE.Vector3): void {
    const n = 1 + this.curseChests
    this.curseChests = 0
    this.fanChests(at, n, REWARD_RING)
  }

  /** Free chests on a circle around `at`, the first on the player's side. */
  private fanChests(at: THREE.Vector3, n: number, radius: number): void {
    const center = at.clone()
    const offsets = ringOffsets(n, radius, this.yawToPlayer(center))
    for (const [ox, oz] of offsets) this.spawnChest(new THREE.Vector3(center.x + ox, center.y, center.z + oz), true)
  }

  private animateChests(dt: number): void {
    let moving = false
    for (const chest of this.chests) {
      if (chest.appear < 1) {
        chest.appear = Math.min(1, chest.appear + dt / 0.6)
        moving = true
        if (chest.appear >= 1) this.beamsDirty = true
      }
      if (chest.used && chest.lid < 1) {
        chest.lid = Math.min(1, chest.lid + dt / 0.4)
        moving = true
      }
    }
    if (moving || this.chestsDirty) this.writeChests()
  }

  private writeChests(): void {
    let wooden = 0
    let golden = 0
    for (const chest of this.chests) {
      const g = chest.free ? 1 : 0
      const slot = g ? golden++ : wooden++
      const a = chest.appear
      // Reward chests drop in from above with a pop.
      this.v.set(chest.pos.x, chest.pos.y + 2.5 * (1 - a) * (1 - a), chest.pos.z)
      this.q.setFromAxisAngle(UP, chest.yaw)
      this.s.setScalar(a < 1 ? popScale(a * 0.6, 0.45) : 1)
      this.m.compose(this.v, this.q, this.s)
      // The lid hinges on the body's back top edge and swings up past vertical.
      const t = chest.lid - 1
      const ease = chest.used ? 1 + 2.70158 * t * t * t + 1.70158 * t * t : 0
      this.hinge.makeRotationX(-1.9 * ease).setPosition(0, CHEST_BODY_H, -CHEST_DEPTH / 2)
      this.lidM.multiplyMatrices(this.m, this.hinge)
      const tint = chest.used ? OPENED : WHITE
      this.chestBodies[g].setMatrixAt(slot, this.m)
      this.chestBodies[g].setColorAt(slot, tint)
      this.chestLids[g].setMatrixAt(slot, this.lidM)
      this.chestLids[g].setColorAt(slot, tint)
    }
    flush(this.chestBodies[0], wooden, true)
    flush(this.chestLids[0], wooden, true)
    flush(this.chestBodies[1], golden, true)
    flush(this.chestLids[1], golden, true)
    this.chestsDirty = false
  }

  // ─────────────────────────── pots ───────────────────────────

  private touchPots(player: PlayerApi): void {
    const pp = player.pos
    const r = (Number.isFinite(player.radius) ? player.radius : 0.4) + POT_RADIUS
    for (const pot of this.pots) {
      if (!pot.alive) continue
      const dx = pot.pos.x - pp.x
      const dz = pot.pos.z - pp.z
      if (dx * dx + dz * dz > r * r) continue
      if (pp.y < pot.pos.y - 0.6 || pp.y > pot.pos.y + 1.0) continue
      this.breakPot(pot)
    }
  }

  private breakPot(pot: Pot): void {
    const ctx = this.ctx
    pot.alive = false
    this.potsDirty = true
    const at = pot.pos.clone().setY(pot.pos.y + 0.4)
    const loot = rollPotLoot(this.rng, pot.silvery)
    if (loot) {
      switch (loot.kind) {
        case 'gold':
        case 'silver':
          for (let i = 0; i < loot.amount; i++) ctx.pickups.spawn(loot.kind, at, 1)
          break
        case 'xp':
        case 'health':
          ctx.pickups.spawn(loot.kind, at, loot.amount)
          break
      }
    }
    ctx.fx.burst(at, pot.silvery ? '#e6edf5' : '#c8663a', 12, 5, 0.22)
    ctx.audio.play('bonk', { pitch: 0.55, volume: 0.8, pos: pot.pos })
  }

  private writePots(): void {
    let clay = 0
    let silver = 0
    for (const pot of this.pots) {
      if (!pot.alive) continue
      const mesh = pot.silvery ? this.potMeshes[1] : this.potMeshes[0]
      const slot = pot.silvery ? silver++ : clay++
      this.q.setFromAxisAngle(UP, pot.yaw)
      mesh.setMatrixAt(slot, this.m.compose(pot.pos, this.q, this.s.setScalar(pot.scale)))
    }
    flush(this.potMeshes[0], clay)
    flush(this.potMeshes[1], silver)
    this.potsDirty = false
  }

  // ─────────────────────────── shrines ───────────────────────────

  private updateCharge(dt: number, player: PlayerApi): void {
    if (this.chargeShrines.length === 0) return
    const pp = player.pos
    const speed = chargeSpeed(this.ctx.progression.items.get('wrench') ?? 0)
    for (const shrine of this.chargeShrines) {
      if (shrine.used) continue
      const dx = pp.x - shrine.pos.x
      const dz = pp.z - shrine.pos.z
      const inside =
        player.alive &&
        dx * dx + dz * dz <= CHARGE_RADIUS * CHARGE_RADIUS &&
        Math.abs(pp.y - shrine.pos.y) < VERTICAL_REACH
      const before = shrine.charge
      shrine.charge = stepCharge(before, inside, dt, speed)
      if (shrine.charge === before) continue
      this.paintPegs(shrine)
      this.beamsDirty = true
      if (shrine.charge >= 1) {
        this.completeCharge(shrine)
        // One boon modal at a time.
        break
      }
    }
  }

  private completeCharge(shrine: Shrine): void {
    const ctx = this.ctx
    let offers = ctx.progression.rollShrineOffers()
    if (shrine.golden) offers = offers.map(forceLegendary)
    ctx.audio.play('shrine')
    this.useShrine(shrine)
    void ctx.ui.openModal({ kind: 'shrine', offers })
  }

  private paintPegs(shrine: Shrine): void {
    const lit = shrine.charge * PEGS_PER_RING
    const off = shrine.golden ? PEG_OFF_GOLD : PEG_OFF
    const on = shrine.golden ? PEG_ON_GOLD : PEG_ON
    for (let i = 0; i < PEGS_PER_RING; i++) {
      if (shrine.used) this.c.copy(PEG_USED)
      else this.c.copy(off).lerp(on, Math.min(1, Math.max(0, lit - i)))
      this.pegs.setColorAt(shrine.ring * PEGS_PER_RING + i, this.c)
    }
    this.pegsDirty = true
  }

  /** Every shrine: announce, dim, and stop drawing its beam. */
  private useShrine(shrine: Shrine): void {
    const ctx = this.ctx
    shrine.used = true
    ctx.events.emit('shrineUsed', { kind: shrine.kind })
    const mesh = this.shrineMeshes[shrine.look]
    mesh.setColorAt(shrine.slot, DIM)
    flush(mesh, mesh.count, true)
    if (shrine.ring >= 0) {
      this.paintPegs(shrine)
      this.crystals.setColorAt(shrine.ring, DIM)
    }
    this.beamsDirty = true
    const color = shrine.golden ? GOLD_HEX : SHRINE_COLOR[shrine.kind]
    ctx.fx.ring(shrine.pos.clone(), shrine.kind === 'shrineCharge' ? CHARGE_RADIUS + 0.5 : 3, color, 0.7)
    ctx.fx.burst(shrine.pos.clone().setY(shrine.pos.y + 2.2), color, 24, 6, 0.28)
  }

  private addCurse(amount: number): void {
    this.ctx.run.curse += amount
    this.ctx.progression.recompute()
  }

  private updateChallenges(): void {
    for (const shrine of this.shrines) {
      const foes = shrine.foes
      if (!foes) continue
      let cleared = true
      for (let i = 0; i < foes.length; i++) {
        if (foes[i].alive && foes[i].uid === shrine.foeUids[i]) {
          cleared = false
          break
        }
      }
      if (!cleared) continue
      shrine.foes = null
      shrine.foeUids = []
      this.beamsDirty = true
      const at = new THREE.Vector3(
        shrine.pos.x + Math.sin(shrine.yaw) * 2.8,
        shrine.pos.y,
        shrine.pos.z + Math.cos(shrine.yaw) * 2.8,
      )
      this.spawnChest(at, true)
      this.ctx.ui.toast('Challenge complete: free chest!', SHRINE_COLOR.shrineChallenge)
    }
  }

  private animateShrines(dt: number): void {
    const n = this.chargeShrines.length
    if (n === 0) return
    const time = this.ctx.time
    for (const shrine of this.chargeShrines) {
      if (!shrine.used) shrine.spin += dt * (1.2 + shrine.charge * 9)
      const bob = shrine.used ? 0 : Math.sin(time * 2 + shrine.ring) * 0.12
      this.v.set(shrine.pos.x, shrine.pos.y + 2.65 + bob, shrine.pos.z)
      this.q.setFromAxisAngle(UP, shrine.spin)
      this.s.setScalar(shrine.used ? 0.75 : 1 + shrine.charge * 0.25)
      this.crystals.setMatrixAt(shrine.ring, this.m.compose(this.v, this.q, this.s))
    }
    flush(this.crystals, n, true)
  }

  private writeBeams(): void {
    let n = 0
    for (const chest of this.chests) {
      if (chest.used || chest.appear < 1) continue
      if (chest.free) n = this.putBeam(n, chest.pos, 9, 1.3, FREE_BEAM)
      else n = this.putBeam(n, chest.pos, 6.5, 1, CHEST_BEAM)
    }
    for (const shrine of this.shrines) {
      if (shrine.foes) n = this.putBeam(n, shrine.pos, 12, 1.6, CHALLENGE_BEAM)
      else if (!shrine.used) {
        const tint = shrine.golden ? GOLD_SHRINE_BEAM : SHRINE_BEAM[shrine.kind]
        const height = shrine.kind === 'shrineCharge' ? 4 + shrine.charge * 10 : 4.5
        n = this.putBeam(n, shrine.pos, height, 1.2, tint)
      }
    }
    if (!this.altar.used) n = this.putBeam(n, this.altar.pos, 16, 2.4, ALTAR_BEAM)
    flush(this.beams, n, true)
    this.beamsDirty = false
  }

  /** Writes beam `n` and returns the next free index. */
  private putBeam(n: number, pos: THREE.Vector3, height: number, width: number, tint: THREE.Color): number {
    if (n >= this.beams.instanceMatrix.count) return n
    this.v.set(pos.x, pos.y + 0.2, pos.z)
    this.q.identity()
    this.s.set(width, height, width)
    this.beams.setMatrixAt(n, this.m.compose(this.v, this.q, this.s))
    this.beams.setColorAt(n, tint)
    return n + 1
  }

  // ─────────────────────────── altar & portal ───────────────────────────

  private summon(): void {
    const ctx = this.ctx
    if (this.altar.used || ctx.run.bossSpawned) return
    this.markAltarUsed()
    ctx.spawner.summonBoss()
    ctx.fx.ring(this.altar.pos.clone(), 8, '#ff5a4a', 0.9)
    ctx.fx.shake(0.5)
  }

  private markAltarUsed(): void {
    this.altar.used = true
    this.altarMat.color.setScalar(0.6)
    this.windMat.color.set('#ff5a4a')
    this.beamsDirty = true
  }

  /** Wind swirling through the arch: faster and red once the boss is called. */
  private animateAltar(dt: number): void {
    const attr = this.wind.geometry.getAttribute('position') as THREE.BufferAttribute
    const out = attr.array as Float32Array
    const d = this.windData
    const pace = this.altar.used ? 2.4 : 1
    for (let i = 0; i < WIND_PARTICLES; i++) {
      const angle = (d[i * 4] += dt * d[i * 4 + 1] * pace)
      const r = d[i * 4 + 2]
      out[i * 3] = Math.cos(angle) * 1.15 * r
      out[i * 3 + 1] = 2.4 + Math.sin(angle) * 1.8 * r
      out[i * 3 + 2] = Math.sin(angle * 0.7 + d[i * 4 + 3]) * 0.45
    }
    attr.needsUpdate = true
  }

  private buildPortalView(): PortalView {
    if (this.portalView) return this.portalView
    const ringGeo = portalRingGeometry()
    const discGeo = portalDiscGeometry()
    const columnGeo = beamGeometry()
    const sparkGeo = new THREE.BufferGeometry()
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PORTAL_SPARKS * 3), 3))

    const additive = {
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    } as const
    const ringMat = new THREE.MeshBasicMaterial({ vertexColors: true })
    const discMat = new THREE.MeshBasicMaterial({ vertexColors: true, ...additive })
    const columnMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#b36bff', ...additive })
    const sparkMat = new THREE.PointsMaterial({
      color: '#f0c8ff',
      size: 0.2,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const group = new THREE.Group()
    group.name = 'portal'
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.y = 2.5
    const disc = new THREE.Mesh(discGeo, discMat)
    disc.position.y = 2.5
    disc.renderOrder = 3
    const column = new THREE.Mesh(columnGeo, columnMat)
    column.scale.set(5, 40, 5)
    column.renderOrder = 2
    const sparks = new THREE.Points(sparkGeo, sparkMat)
    sparks.position.y = 2.5
    sparks.frustumCulled = false
    sparks.renderOrder = 3
    group.add(ring, disc, column, sparks)

    const sparkData = new Float32Array(PORTAL_SPARKS * 3)
    for (let i = 0; i < PORTAL_SPARKS; i++) {
      sparkData[i * 3] = Math.random() * Math.PI * 2
      sparkData[i * 3 + 1] = 0.3 + Math.random() * 2
      sparkData[i * 3 + 2] = 0.6 + Math.random() * 0.8
    }
    this.portalView = {
      group,
      ring,
      disc,
      sparks,
      sparkData,
      geometries: [ringGeo, discGeo, columnGeo, sparkGeo],
      materials: [ringMat, discMat, columnMat, sparkMat],
    }
    return this.portalView
  }

  private updatePortal(dt: number, player: PlayerApi): void {
    const portal = this.portal
    const view = this.portalView
    if (!portal || !view) return
    portal.age += dt
    const grow = Math.min(1, portal.age / 0.8)
    view.group.scale.setScalar(Math.max(0.01, 1 - (1 - grow) ** 3))
    view.ring.rotation.z += dt * 0.9
    view.disc.rotation.z -= dt * 2.4

    // Sparks spiral into the centre and respawn at the rim.
    const attr = view.sparks.geometry.getAttribute('position') as THREE.BufferAttribute
    const out = attr.array as Float32Array
    const d = view.sparkData
    for (let i = 0; i < PORTAL_SPARKS; i++) {
      let r = d[i * 3 + 1] - dt * d[i * 3 + 2] * 1.4
      if (r < 0.1) r = 2.2
      d[i * 3 + 1] = r
      const angle = (d[i * 3] += dt * (3.5 - r))
      out[i * 3] = Math.cos(angle) * r
      out[i * 3 + 1] = Math.sin(angle) * r
      out[i * 3 + 2] = Math.sin(angle * 2 + i) * 0.25
    }
    attr.needsUpdate = true

    if (this.portalEntered || !player.alive || grow < 1) return
    const dx = player.pos.x - portal.pos.x
    const dz = player.pos.z - portal.pos.z
    const dy = player.pos.y - portal.pos.y
    const dist = Math.hypot(dx, dz)
    if (dist > PORTAL_REACH) portal.armed = true
    else if (portal.armed && dist <= PORTAL_RADIUS && dy > -1.5 && dy < 4) this.enterPortal()
  }

  private enterPortal(): void {
    if (!this.portal || this.portalEntered) return
    this.portalEntered = true
    this.portal.used = true
    this.ctx.advanceStage()
  }

  private removePortal(): void {
    const view = this.portalView
    if (view) {
      this.root.remove(view.group)
      for (const g of view.geometries) g.dispose()
      for (const m of view.materials) m.dispose()
      this.portalView = null
    }
    this.portal = null
    this.portalEntered = false
  }

  // ─────────────────────────── prompt ───────────────────────────

  private refreshFocus(): void {
    const ctx = this.ctx
    const player = ctx.player
    const pp = player.pos
    for (const t of this.things) {
      const dy = pp.y - t.pos.y
      t.dist = Math.abs(dy) > VERTICAL_REACH ? Infinity : Math.hypot(pp.x - t.pos.x, pp.z - t.pos.z)
      t.usable = this.canUse(t)
    }
    const focus = player.alive ? pickNearest(this.things) : null
    this.focus = focus
    if (!focus) {
      this.promptValue = null
      return
    }
    switch (focus.kind) {
      case 'chest':
        this.setPrompt('Open chest', focus.free ? undefined : this.chestCost)
        break
      case 'shrineCharge':
        this.setPrompt(chargeText(focus.charge))
        break
      case 'shrineGreed':
        this.setPrompt(`Greed shrine: +${GREED_GOLD} gold, +${Math.round(GREED_CURSE * 100)}% difficulty`)
        break
      case 'shrineMagnet':
        this.setPrompt('Magnet shrine')
        break
      case 'shrineChallenge':
        this.setPrompt('Challenge shrine')
        break
      case 'shrineCurse':
        this.setPrompt(`Curse shrine: +${Math.round(CURSE_CURSE * 100)}% difficulty, extra boss chest`)
        break
      case 'altar':
        this.setPrompt('Summon the boss')
        break
      case 'portal':
        this.setPrompt('Enter the portal')
        break
    }
  }

  private canUse(t: Usable): boolean {
    switch (t.kind) {
      case 'chest':
        return !t.used && t.appear >= 1
      case 'altar':
        return !t.used && !this.ctx.run.bossSpawned
      case 'portal':
        return !this.portalEntered
      default:
        return !t.used
    }
  }

  /** Keeps the same object while nothing changed, so the HUD can compare by identity. */
  private setPrompt(text: string, cost?: number): void {
    const p = this.promptValue
    if (p && p.text === text && p.cost === cost) return
    this.promptValue = cost === undefined ? { text } : { text, cost }
  }
}

import { AuraBehavior } from './aura'
import { AxeBehavior } from './axe'
import { BananarangBehavior } from './bananarang'
import { BoneBehavior } from './bone'
import { ChunkersBehavior } from './chunkers'
import { DaggerBehavior } from './dagger'
import { FirestaffBehavior } from './firestaff'
import { LightningBehavior } from './lightning'
import { KATANA_STYLE, SWORD_STYLE, SlashBehavior } from './melee'
import { MinesBehavior } from './mines'
import { BOW_STYLE, REVOLVER_STYLE, ShotBehavior } from './shots'
import { TornadoBehavior } from './tornado'
import type { BehaviorFactory } from './types'
import { WalkerBehavior } from './walkers'

/** Every weapon behavior, keyed by `WeaponDef.behavior`. */
export const BEHAVIORS: Readonly<Record<string, BehaviorFactory>> = {
  sword: (kit, arm) => new SlashBehavior(kit, arm, SWORD_STYLE),
  katana: (kit, arm) => new SlashBehavior(kit, arm, KATANA_STYLE),
  bone: (kit, arm) => new BoneBehavior(kit, arm),
  firestaff: (kit, arm) => new FirestaffBehavior(kit, arm),
  lightning: (kit, arm) => new LightningBehavior(kit, arm),
  aura: (kit, arm) => new AuraBehavior(kit, arm),
  chunkers: (kit, arm) => new ChunkersBehavior(kit, arm),
  bow: (kit, arm) => new ShotBehavior(kit, arm, BOW_STYLE),
  revolver: (kit, arm) => new ShotBehavior(kit, arm, REVOLVER_STYLE),
  bananarang: (kit, arm) => new BananarangBehavior(kit, arm),
  frostwalker: (kit, arm) => new WalkerBehavior(kit, arm, true),
  flamewalker: (kit, arm) => new WalkerBehavior(kit, arm, false),
  axe: (kit, arm) => new AxeBehavior(kit, arm),
  mines: (kit, arm) => new MinesBehavior(kit, arm),
  tornado: (kit, arm) => new TornadoBehavior(kit, arm),
  dagger: (kit, arm) => new DaggerBehavior(kit, arm),
}

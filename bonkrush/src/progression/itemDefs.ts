import type { ItemDef, StatId, StatMod } from '../game/types'
import { ITEM_HOOKS } from './itemEffects'

const add = (stat: StatId, value: number): StatMod => ({ stat, op: 'add', value })

/**
 * Every item a chest can give. Pure stat items carry `mods`; effect items
 * carry `hooks` (see itemEffects.ts). A few have neither because another
 * system reads their stack count: the Rusty Key and Wrench (interactables),
 * the Anvil (weapon upgrade offers), the conditional damage items and Big
 * Bonk (Progression.outgoingMultiplier) and the Stopwatch (tryCheatDeath).
 */
export const ITEMS: readonly ItemDef[] = [
  // Common
  { id: 'protein_shake', name: 'Protein Shake', icon: '🥤', rarity: 'common', description: '+10% damage.', mods: [add('damage', 0.1)] },
  { id: 'clover', name: 'Four-Leaf Clover', icon: '🍀', rarity: 'common', description: '+7% luck.', mods: [add('luck', 0.07)] },
  { id: 'battery', name: 'Battery', icon: '🔋', rarity: 'common', description: '+8% attack speed.', mods: [add('attackSpeed', 0.08)] },
  { id: 'oats', name: 'Oats', icon: '🥣', rarity: 'common', description: '+25 max HP.', mods: [add('maxHp', 25)] },
  { id: 'turbo_socks', name: 'Turbo Socks', icon: '🧦', rarity: 'common', description: '+12% move speed.', mods: [add('moveSpeed', 0.12)] },
  { id: 'medkit', name: 'Medkit', icon: '🩹', rarity: 'common', description: '+0.5 HP regen per second.', mods: [add('regen', 0.5)] },
  { id: 'hourglass', name: 'Hourglass', icon: '⌛', rarity: 'common', description: '+8% XP gain.', mods: [add('xpGain', 0.08)] },
  { id: 'golden_glove', name: 'Golden Glove', icon: '🧤', rarity: 'common', description: '+15% gold gain.', mods: [add('goldGain', 0.15)] },
  {
    id: 'moldy_cheese',
    name: 'Moldy Cheese',
    icon: '🧀',
    rarity: 'common',
    description: '12% chance on hit to poison: burns for 25% of the hit per second for 3 s. Stacks raise the burn.',
    hooks: ITEM_HOOKS.moldy_cheese,
  },
  {
    id: 'burger',
    name: 'Burger',
    icon: '🍔',
    rarity: 'common',
    description: 'Kills have a 2% chance to drop a health snack. Stacks raise the chance.',
    hooks: ITEM_HOOKS.burger,
  },
  { id: 'feathers', name: 'Feathers', icon: '🪶', rarity: 'common', description: '+15% jump height.', mods: [add('jumpHeight', 0.15)] },
  {
    id: 'key',
    name: 'Rusty Key',
    icon: '🗝️',
    rarity: 'common',
    description: 'A chance to open chests for free: 9% with one key, rising with each key (50% at ten).',
  },

  // Rare
  { id: 'slippery_ring', name: 'Slippery Ring', icon: '💍', rarity: 'rare', description: '+8% evasion.', mods: [add('evasion', 0.08)] },
  {
    id: 'tactical_glasses',
    name: 'Tactical Glasses',
    icon: '🕶️',
    rarity: 'rare',
    description: '+25% damage to enemies above 90% HP.',
  },
  { id: 'scarf', name: 'Sky Scarf', icon: '🧣', rarity: 'rare', description: '+30% damage while airborne.' },
  {
    id: 'cactus',
    name: 'Pocket Cactus',
    icon: '🌵',
    rarity: 'rare',
    description: 'When hit, fire 8 spikes around you for 15 damage plus your thorns.',
    hooks: ITEM_HOOKS.cactus,
  },
  {
    id: 'brass_knuckles',
    name: 'Brass Knuckles',
    icon: '👊',
    rarity: 'rare',
    description: '+25% damage to enemies within 4 m.',
  },
  {
    id: 'forbidden_juice',
    name: 'Forbidden Juice',
    icon: '🧃',
    rarity: 'rare',
    description: '+10% crit chance.',
    mods: [add('critChance', 0.1)],
  },
  { id: 'beefy_ring', name: 'Beefy Ring', icon: '🥩', rarity: 'rare', description: '+10% damage for every 100 max HP.' },
  {
    id: 'idle_juice',
    name: 'Idle Juice',
    icon: '🍵',
    rarity: 'rare',
    description: 'Standing still builds up to +50% damage over 2 s.',
    hooks: ITEM_HOOKS.idle_juice,
  },
  {
    id: 'wrench',
    name: 'Wrench',
    icon: '🔧',
    rarity: 'rare',
    description: 'Shrines charge 20% faster, and their boons roll one rarity higher 25% of the time.',
  },
  { id: 'backpack', name: 'Backpack', icon: '🎒', rarity: 'rare', description: '+1 projectile.', mods: [add('projectiles', 1)] },

  // Epic
  {
    id: 'demonic_blood',
    name: 'Demonic Blood',
    icon: '🧛',
    rarity: 'epic',
    description: 'On hit, every 8 s: heal 7.5% of max HP and blast 4 m around the target for 40 damage.',
    hooks: ITEM_HOOKS.demonic_blood,
  },
  {
    id: 'toxic_barrel',
    name: 'Toxic Barrel',
    icon: '☢️',
    rarity: 'epic',
    description: 'When hit, leave a 3 m poison cloud that deals 10 damage per second for 4 s.',
    hooks: ITEM_HOOKS.toxic_barrel,
  },
  {
    id: 'phantom_shroud',
    name: 'Phantom Shroud',
    icon: '👻',
    rarity: 'epic',
    description: 'After a dodge, +100% damage and +30% move speed for 3 s.',
  },
  {
    id: 'ice_cube',
    name: 'Ice Cube',
    icon: '🧊',
    rarity: 'epic',
    description: '10% chance on hit to freeze an enemy for 1.5 s (bosses are slowed instead).',
    hooks: ITEM_HOOKS.ice_cube,
  },
  {
    id: 'spicy_meatball',
    name: 'Spicy Meatball',
    icon: '🌶️',
    rarity: 'epic',
    description: '20% chance on hit to explode for 65% of the hit in 2.5 m.',
    hooks: ITEM_HOOKS.spicy_meatball,
  },

  // Legendary
  { id: 'anvil', name: 'Anvil', icon: '⚒️', rarity: 'legendary', description: 'Weapon upgrades raise 3 stats.' },
  { id: 'big_bonk', name: 'Big Bonk', icon: '🔨', rarity: 'legendary', description: '2% chance on hit to deal ×20 damage. BONK!' },
  {
    id: 'soul_reaper',
    name: 'Soul Reaper',
    icon: '☠️',
    rarity: 'legendary',
    description: 'Kills release a homing soul that deals 20 damage. +1 soul for every 2 more stacks.',
    hooks: ITEM_HOOKS.soul_reaper,
  },
  {
    id: 'vacuum',
    name: 'Vacuum Magnet',
    icon: '🌪️',
    rarity: 'legendary',
    description: 'Every 15 s, pull in all XP on the map (2 s faster per extra stack, down to 5 s).',
    hooks: ITEM_HOOKS.vacuum,
  },
  {
    id: 'holy_book',
    name: 'Holy Book',
    icon: '📖',
    rarity: 'legendary',
    description: '+100 max HP and +2 HP regen per second.',
    mods: [add('maxHp', 100), add('regen', 2)],
  },
  {
    id: 'reaper_dagger',
    name: "Reaper's Dagger",
    icon: '🗡️',
    rarity: 'legendary',
    description: '1% chance on hit to execute a non-boss enemy outright.',
    hooks: ITEM_HOOKS.reaper_dagger,
  },
  {
    id: 'stopwatch',
    name: 'Stopwatch',
    icon: '⏱️',
    rarity: 'legendary',
    description: 'Once per stage, a fatal hit leaves you at 1 HP, invulnerable for 2 s, with nearby enemies frozen.',
  },
  {
    id: 'storm_orb',
    name: 'Storm Orb',
    icon: '🔮',
    rarity: 'legendary',
    description: '8% chance on hit to call lightning for 50% of the hit, chaining to 2 more enemies.',
    hooks: ITEM_HOOKS.storm_orb,
  },
]

export const ITEM_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((i) => [i.id, i]))

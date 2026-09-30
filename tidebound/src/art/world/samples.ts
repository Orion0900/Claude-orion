/**
 * Sample looks for previews and tests: a named cast and a deterministic
 * generator that walks through every body, hair, hat, outfit and accessory.
 */
import { PLAYER_LOOKS, type Look } from '../look'

export const HAIRS = ['short', 'spiky', 'long', 'ponytail', 'bun', 'bob', 'bald', 'curly', 'braids', 'mohawk'] as const
export const HATS = ['none', 'cap', 'bandana', 'sunhat', 'beanie', 'hardhat', 'captain', 'hood'] as const
export const OUTFITS = ['tee', 'jacket', 'dress', 'labcoat', 'uniform', 'swimsuit', 'overalls', 'robe', 'vest', 'sailor'] as const
export const ACCS = ['none', 'glasses', 'backpack', 'rod', 'satchel'] as const
export const BODIES = ['kid', 'teen', 'adult', 'elder', 'big'] as const
const HAIRCOLS = ['#402818', '#784028', '#f0c848', '#202028', '#c85830', '#e8e8e8', '#5868c8', '#a04878']
const TOPS = ['#e04838', '#2878d8', '#48b048', '#f0c030', '#9858c8', '#f8f8f8', '#303848', '#f08838', '#28a8c8', '#e878a8']
const BOTTOMS = ['#304060', '#604830', '#383838', '#e0d8c0', '#3868a8', '#a83838', '#f8a838', '#487038']

export function variedLook(i: number): Look {
  const pick = <T,>(arr: readonly T[], k: number): T => arr[(i * k + (i >> 2)) % arr.length]
  return {
    body: pick(BODIES, 3),
    sex: i % 2 === 0 ? 'm' : 'f',
    skin: (i % 5) as Look['skin'],
    hair: pick(HAIRS, 7),
    hairColor: pick(HAIRCOLS, 5),
    headwear: i % 3 === 0 ? pick(HATS, 5) : 'none',
    headwearColor: pick(TOPS, 3),
    outfit: pick(OUTFITS, 3),
    top: pick(TOPS, 7),
    bottom: pick(BOTTOMS, 5),
    accessory: i % 4 === 1 ? pick(ACCS, 3) : 'none',
  }
}


export const SAMPLE_LOOKS: Record<string, Look> = {
  player: PLAYER_LOOKS[0],
  player2: PLAYER_LOOKS[1],
  mum: { body: 'adult', sex: 'f', skin: 1, hair: 'bun', hairColor: '#784028', headwear: 'none', headwearColor: '#ffffff', outfit: 'dress', top: '#f09090', bottom: '#f8f0e0', accessory: 'none' },
  prof: { body: 'adult', sex: 'f', skin: 2, hair: 'long', hairColor: '#303040', headwear: 'none', headwearColor: '#ffffff', outfit: 'labcoat', top: '#48a8a0', bottom: '#404858', accessory: 'glasses' },
  rival: { body: 'teen', sex: 'm', skin: 0, hair: 'spiky', hairColor: '#f0c848', headwear: 'none', headwearColor: '#ffffff', outfit: 'vest', top: '#28a060', bottom: '#383040', accessory: 'none' },
  fisher: { body: 'adult', sex: 'm', skin: 3, hair: 'short', hairColor: '#302018', headwear: 'sunhat', headwearColor: '#e8d098', outfit: 'vest', top: '#e8a040', bottom: '#405080', accessory: 'rod' },
  swimmer: { body: 'teen', sex: 'f', skin: 2, hair: 'ponytail', hairColor: '#c85830', headwear: 'none', headwearColor: '#ffffff', outfit: 'swimsuit', top: '#e84888', bottom: '#e84888', accessory: 'none' },
  grunt: { body: 'adult', sex: 'm', skin: 1, hair: 'short', hairColor: '#202028', headwear: 'bandana', headwearColor: '#303040', outfit: 'uniform', top: '#384058', bottom: '#282830', accessory: 'none' },
  captain: { body: 'big', sex: 'm', skin: 2, hair: 'curly', hairColor: '#a03020', headwear: 'captain', headwearColor: '#282838', outfit: 'jacket', top: '#8c2830', bottom: '#302830', accessory: 'none' },
  elder: { body: 'elder', sex: 'm', skin: 1, hair: 'bald', hairColor: '#e8e8e8', headwear: 'none', headwearColor: '#ffffff', outfit: 'robe', top: '#6878a8', bottom: '#e0c070', accessory: 'none' },
  kid: { body: 'kid', sex: 'm', skin: 3, hair: 'short', hairColor: '#202020', headwear: 'cap', headwearColor: '#e04040', outfit: 'tee', top: '#f0d040', bottom: '#3868a8', accessory: 'none' },
  sailor: { body: 'big', sex: 'm', skin: 2, hair: 'short', hairColor: '#503020', headwear: 'beanie', headwearColor: '#d84848', outfit: 'sailor', top: '#f8f8f8', bottom: '#304880', accessory: 'none' },
  worker: { body: 'adult', sex: 'm', skin: 4, hair: 'short', hairColor: '#181818', headwear: 'hardhat', headwearColor: '#f8c830', outfit: 'overalls', top: '#e0e0d0', bottom: '#3868a8', accessory: 'none' },
  hiker: { body: 'big', sex: 'm', skin: 2, hair: 'curly', hairColor: '#503020', headwear: 'none', headwearColor: '#ffffff', outfit: 'vest', top: '#a06838', bottom: '#586838', accessory: 'backpack' },
  lass: { body: 'teen', sex: 'f', skin: 0, hair: 'braids', hairColor: '#f0c848', headwear: 'none', headwearColor: '#ffffff', outfit: 'dress', top: '#8868d8', bottom: '#f8f8f8', accessory: 'satchel' },
  mystic: { body: 'adult', sex: 'f', skin: 3, hair: 'long', hairColor: '#5868c8', headwear: 'hood', headwearColor: '#503878', outfit: 'robe', top: '#503878', bottom: '#f0c048', accessory: 'none' },
  breck: { body: 'big', sex: 'm', skin: 3, hair: 'mohawk', hairColor: '#503020', headwear: 'none', headwearColor: '#ffffff', outfit: 'vest', top: '#8c7058', bottom: '#504038', accessory: 'none' },
  volta: { body: 'adult', sex: 'f', skin: 1, hair: 'bob', hairColor: '#f8e048', headwear: 'none', headwearColor: '#ffffff', outfit: 'jacket', top: '#303040', bottom: '#f0c030', accessory: 'glasses' },
  marina: { body: 'adult', sex: 'f', skin: 2, hair: 'long', hairColor: '#28a8c8', headwear: 'none', headwearColor: '#ffffff', outfit: 'swimsuit', top: '#2878d8', bottom: '#f8f8f8', accessory: 'none' },
  nerissa: { body: 'adult', sex: 'f', skin: 4, hair: 'curly', hairColor: '#f8f8f8', headwear: 'none', headwearColor: '#ffffff', outfit: 'robe', top: '#1c5c88', bottom: '#e8c060', accessory: 'none' },
}

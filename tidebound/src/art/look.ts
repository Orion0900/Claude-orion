/**
 * How a person looks. Every character in the game — the player, the rival,
 * townsfolk, trainers, Wardens — is one of these, and the art in
 * src/art/world draws the overworld sprite and the battle portrait from it.
 * All combinations must draw; a hat simply covers whatever hair is under it.
 */
export type BodyType = 'kid' | 'teen' | 'adult' | 'elder' | 'big'

export type HairStyle = 'short' | 'spiky' | 'long' | 'ponytail' | 'bun' | 'bob' | 'bald' | 'curly' | 'braids' | 'mohawk'

export type Headwear = 'none' | 'cap' | 'bandana' | 'sunhat' | 'beanie' | 'hardhat' | 'captain' | 'hood'

export type Outfit = 'tee' | 'jacket' | 'dress' | 'labcoat' | 'uniform' | 'swimsuit' | 'overalls' | 'robe' | 'vest' | 'sailor'

export type Accessory = 'none' | 'glasses' | 'backpack' | 'rod' | 'satchel'

export interface Look {
  body: BodyType
  /** 'f' gets a slimmer build and, with a dress or robe, a skirt line. */
  sex: 'm' | 'f'
  /** 0 lightest … 4 darkest. */
  skin: 0 | 1 | 2 | 3 | 4
  hair: HairStyle
  hairColor: string
  headwear: Headwear
  headwearColor: string
  outfit: Outfit
  /** Shirt, jacket or dress colour. */
  top: string
  /** Trousers, shorts or skirt colour. */
  bottom: string
  accessory: Accessory
}

export type Facing = 'down' | 'up' | 'left' | 'right'

/** The two looks the player chooses between at the start. */
export const PLAYER_LOOKS: readonly Look[] = [
  {
    body: 'teen',
    sex: 'm',
    skin: 1,
    hair: 'spiky',
    hairColor: '#503020',
    headwear: 'bandana',
    headwearColor: '#2878d8',
    outfit: 'jacket',
    top: '#e04838',
    bottom: '#304060',
    accessory: 'backpack',
  },
  {
    body: 'teen',
    sex: 'f',
    skin: 1,
    hair: 'ponytail',
    hairColor: '#784028',
    headwear: 'sunhat',
    headwearColor: '#f8f0e0',
    outfit: 'tee',
    top: '#28a8c8',
    bottom: '#f8a838',
    accessory: 'satchel',
  },
]

/** A quick way to vary looks from a template. */
export function look(base: Look, over: Partial<Look>): Look {
  return { ...base, ...over }
}

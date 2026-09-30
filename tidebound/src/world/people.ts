import type { Look } from '../art/look'

/** The cast's looks. Every person in the isles is one of these, or a variation. */
const base: Look = {
  body: 'adult',
  sex: 'm',
  skin: 1,
  hair: 'short',
  hairColor: '#503020',
  headwear: 'none',
  headwearColor: '#ffffff',
  outfit: 'tee',
  top: '#5890d0',
  bottom: '#484858',
  accessory: 'none',
}

const L = (o: Partial<Look>): Look => ({ ...base, ...o })

export const PEOPLE = {
  mom: L({ sex: 'f', skin: 1, hair: 'long', hairColor: '#784028', outfit: 'dress', top: '#f09078', bottom: '#f09078' }),
  rival: L({ body: 'teen', sex: 'f', skin: 2, hair: 'bob', hairColor: '#3050a0', headwear: 'cap', headwearColor: '#f8f8f8', outfit: 'jacket', top: '#30b090', bottom: '#383850', accessory: 'backpack' }),
  rivalDad: L({ skin: 2, hair: 'short', hairColor: '#283870', outfit: 'vest', top: '#e0d0a0', bottom: '#506070', accessory: 'glasses' }),
  prof: L({ sex: 'f', skin: 3, hair: 'bun', hairColor: '#e0e0e8', outfit: 'labcoat', top: '#f8f8f8', bottom: '#6878a0', accessory: 'glasses' }),
  aide: L({ skin: 0, hair: 'short', hairColor: '#c89048', outfit: 'labcoat', top: '#f0f0f0', bottom: '#405068' }),
  keeper: L({ sex: 'f', skin: 0, hair: 'ponytail', hairColor: '#f07898', outfit: 'dress', top: '#f8f8f8', bottom: '#f8b0c0' }),
  clerk: L({ skin: 2, hair: 'short', hairColor: '#282828', headwear: 'cap', headwearColor: '#f0a030', outfit: 'vest', top: '#f0a030', bottom: '#404040' }),
  boy: L({ body: 'kid', skin: 1, hair: 'spiky', hairColor: '#402818', outfit: 'tee', top: '#f0d040', bottom: '#3060b0' }),
  girl: L({ body: 'kid', sex: 'f', skin: 3, hair: 'braids', hairColor: '#281810', outfit: 'dress', top: '#f07898', bottom: '#f07898' }),
  lass: L({ body: 'teen', sex: 'f', skin: 0, hair: 'long', hairColor: '#e8c060', outfit: 'dress', top: '#a070d0', bottom: '#a070d0' }),
  youngster: L({ body: 'kid', skin: 2, hair: 'short', hairColor: '#302018', headwear: 'cap', headwearColor: '#e04040', outfit: 'tee', top: '#f8f8f8', bottom: '#4070c0' }),
  bugKid: L({ body: 'kid', skin: 1, hair: 'short', hairColor: '#584020', headwear: 'sunhat', headwearColor: '#e8d8a0', outfit: 'overalls', top: '#f8f8f8', bottom: '#68a048', accessory: 'satchel' }),
  hiker: L({ body: 'big', skin: 2, hair: 'curly', hairColor: '#402810', headwear: 'beanie', headwearColor: '#c85030', outfit: 'vest', top: '#a07040', bottom: '#586048', accessory: 'backpack' }),
  fisher: L({ skin: 3, hair: 'short', hairColor: '#202020', headwear: 'sunhat', headwearColor: '#d8c890', outfit: 'vest', top: '#58a068', bottom: '#485870', accessory: 'rod' }),
  swimmerM: L({ body: 'teen', skin: 2, hair: 'spiky', hairColor: '#201810', outfit: 'swimsuit', top: '#2878d8', bottom: '#2878d8' }),
  swimmerF: L({ body: 'teen', sex: 'f', skin: 1, hair: 'ponytail', hairColor: '#f0c050', outfit: 'swimsuit', top: '#f05878', bottom: '#f05878' }),
  sailor: L({ body: 'big', skin: 1, hair: 'short', hairColor: '#503018', headwear: 'captain', headwearColor: '#f8f8f8', outfit: 'sailor', top: '#f8f8f8', bottom: '#28406c' }),
  oldMan: L({ body: 'elder', skin: 1, hair: 'bald', hairColor: '#d8d8d8', outfit: 'robe', top: '#a08868', bottom: '#806850' }),
  oldWoman: L({ body: 'elder', sex: 'f', skin: 2, hair: 'bun', hairColor: '#e8e8e8', outfit: 'dress', top: '#8890c8', bottom: '#8890c8' }),
  man: L({ skin: 4, hair: 'short', hairColor: '#181818', outfit: 'tee', top: '#e87830', bottom: '#384858' }),
  woman: L({ sex: 'f', skin: 2, hair: 'bob', hairColor: '#a03828', outfit: 'tee', top: '#58c0b0', bottom: '#f0e0c0' }),
  worker: L({ body: 'big', skin: 3, hair: 'short', hairColor: '#281810', headwear: 'hardhat', headwearColor: '#f8c828', outfit: 'overalls', top: '#f07028', bottom: '#3858a0' }),
  scientist: L({ skin: 0, hair: 'mohawk', hairColor: '#50c0f0', outfit: 'labcoat', top: '#f0f0f0', bottom: '#303848', accessory: 'glasses' }),
  camper: L({ body: 'teen', skin: 1, hair: 'short', hairColor: '#704020', headwear: 'bandana', headwearColor: '#d84830', outfit: 'vest', top: '#789048', bottom: '#a07850', accessory: 'backpack' }),
  picnicker: L({ body: 'teen', sex: 'f', skin: 3, hair: 'ponytail', hairColor: '#281810', headwear: 'sunhat', headwearColor: '#f8e0a0', outfit: 'tee', top: '#f8a0b0', bottom: '#5878c0' }),
  grunt: L({ body: 'teen', skin: 1, hair: 'short', hairColor: '#202020', headwear: 'bandana', headwearColor: '#282830', outfit: 'uniform', top: '#384058', bottom: '#282830' }),
  gruntF: L({ body: 'teen', sex: 'f', skin: 2, hair: 'ponytail', hairColor: '#c02838', headwear: 'bandana', headwearColor: '#282830', outfit: 'uniform', top: '#384058', bottom: '#282830' }),
  captain: L({ body: 'big', skin: 1, hair: 'curly', hairColor: '#a83020', headwear: 'captain', headwearColor: '#202028', outfit: 'jacket', top: '#602030', bottom: '#282830', accessory: 'none' }),
  breck: L({ body: 'big', skin: 4, hair: 'mohawk', hairColor: '#e8e8e8', outfit: 'vest', top: '#806040', bottom: '#504840', accessory: 'none' }),
  volta: L({ sex: 'f', skin: 0, hair: 'spiky', hairColor: '#f8d838', headwear: 'none', outfit: 'jacket', top: '#303040', bottom: '#f8d838', accessory: 'glasses' }),
  marina: L({ sex: 'f', skin: 3, hair: 'long', hairColor: '#40b8d8', headwear: 'none', outfit: 'swimsuit', top: '#2860c0', bottom: '#2860c0' }),
  nerissa: L({ sex: 'f', skin: 2, hair: 'long', hairColor: '#f8f8f8', headwear: 'captain', headwearColor: '#284078', outfit: 'robe', top: '#284078', bottom: '#f0d070' }),
  ferryman: L({ skin: 3, hair: 'short', hairColor: '#e8e8e8', headwear: 'captain', headwearColor: '#284078', outfit: 'sailor', top: '#f8f8f8', bottom: '#284078' }),
} satisfies Record<string, Look>

export type PersonId = keyof typeof PEOPLE

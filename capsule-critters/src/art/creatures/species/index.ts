import type { SpeciesId } from '../../../data/species'
import type { Recipe } from '../kit'
import { FIELD_RECIPES } from './field'
import { HILLS_RECIPES } from './hills'
import { MYSTIC_RECIPES } from './mystic'
import { STARTER_RECIPES } from './starters'
import { WATER_RECIPES } from './water'
import { WOODS_RECIPES } from './woods'

/** Every species' recipe. Species without one yet are drawn as a placeholder. */
export const RECIPES: Partial<Record<SpeciesId, Recipe>> = {
  ...STARTER_RECIPES,
  ...FIELD_RECIPES,
  ...WOODS_RECIPES,
  ...WATER_RECIPES,
  ...HILLS_RECIPES,
  ...MYSTIC_RECIPES,
}

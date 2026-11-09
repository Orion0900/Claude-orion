import type { SpeciesId } from '../../../data/species'
import type { Recipe } from '../kit'
import { STARTER_RECIPES } from './starters'

/** Every species' recipe. Species without one yet are drawn as a placeholder. */
export const RECIPES: Partial<Record<SpeciesId, Recipe>> = {
  ...STARTER_RECIPES,
}

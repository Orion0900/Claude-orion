/**
 * All species recipes, keyed by id. One file per evolution line.
 */
import type { SpeciesId } from '../../../data/dex'
import type { Recipe } from '../kit'
import { BUG_LINE } from './bugs'
import { CAPY_LINE } from './capy'
import { DEEP_LINE } from './deep'
import { KINDLET_LINE } from './kindlet'
import { LEAFOLIN_LINE } from './leafolin'
import { LEMUR_LINE } from './lemur'
import { NARLET_LINE } from './narlet'
import { REEF_LINE } from './reef'
import { SHORE_LINE } from './shore'
import { STONE_LINE } from './stone'
import { WYRM_LINE } from './wyrm'

export const RECIPES: Record<SpeciesId, Recipe> = {
  ...LEAFOLIN_LINE,
  ...KINDLET_LINE,
  ...NARLET_LINE,
  ...CAPY_LINE,
  ...BUG_LINE,
  ...LEMUR_LINE,
  ...STONE_LINE,
  ...REEF_LINE,
  ...DEEP_LINE,
  ...SHORE_LINE,
  ...WYRM_LINE,
}

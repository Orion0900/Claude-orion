import { defaultBag, type ClubId, type SkillLevel } from './clubs'
import type { Unit } from './units'

export type Aggressiveness = 'conservative' | 'balanced' | 'aggressive'

export const AGGRESSIVENESS: Array<{ id: Aggressiveness; label: string; hint: string }> = [
  { id: 'conservative', label: 'Safe', hint: 'Middle of the green, lay up short of trouble' },
  { id: 'balanced', label: 'Balanced', hint: 'Attack when the odds are fair' },
  { id: 'aggressive', label: 'Aggressive', hint: 'Go at flags, carry hazards, take the long club' },
]

export interface Profile {
  skill: SkillLevel
  aggressiveness: Aggressiveness
  unit: Unit
  bag: ClubId[]
}

export const DEFAULT_PROFILE: Profile = {
  skill: 'intermediate',
  aggressiveness: 'balanced',
  unit: 'yd',
  bag: defaultBag('intermediate'),
}

/** Fill in anything missing from a stored profile, so an old save still loads. */
export function normalizeProfile(raw: unknown): Profile {
  const p = (raw ?? {}) as Partial<Profile>
  const skill = SKILLS.has(p.skill as SkillLevel) ? (p.skill as SkillLevel) : DEFAULT_PROFILE.skill
  return {
    skill,
    aggressiveness: AGGRESSIVENESS.some((a) => a.id === p.aggressiveness)
      ? (p.aggressiveness as Aggressiveness)
      : DEFAULT_PROFILE.aggressiveness,
    unit: p.unit === 'm' ? 'm' : 'yd',
    bag: Array.isArray(p.bag) && p.bag.length > 0 ? p.bag : defaultBag(skill),
  }
}

const SKILLS = new Set<SkillLevel>(['beginner', 'intermediate', 'advanced', 'scratch'])

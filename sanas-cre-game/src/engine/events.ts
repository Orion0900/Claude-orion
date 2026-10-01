/*
 * Decision cards: the things that land on an asset manager's desk. Each one
 * is generated with concrete numbers and its options carry their effects as
 * plain data, so a pending decision saves with the game.
 */
import { appraiseHeld, equityValue, marketRent, occupancyTarget } from './asset'
import { DEPTS, MARKETS, RIVALS, TENANTS, TYPES } from './data'
import { clamp } from './finance'
import { money, roman } from './funds'
import type { Rng } from './rng'
import type { Dept, GameEvent, GameState, Property } from './types'

interface Ctx {
  s: GameState
  rng: Rng
  id: () => string
}

const pct = (x: number) => `${Math.round(x * 100)}%`

interface PropertyTemplate {
  kind: string
  weight: number
  when: (p: Property, s: GameState) => boolean
  make: (p: Property, ctx: Ctx) => GameEvent
}

interface FirmTemplate {
  kind: string
  weight: number
  when: (s: GameState) => boolean
  make: (ctx: Ctx) => GameEvent
}

const SYSTEMS: Record<Property['type'], string> = {
  office: 'chiller', multifamily: 'boiler', industrial: 'roof', retail: 'parking deck', hotel: 'elevator',
  datacenter: 'backup generator', storage: 'roof', lifescience: 'air handling',
}

const PROPERTY_EVENTS: PropertyTemplate[] = [
  {
    kind: 'renewal',
    weight: 3,
    when: (p) => p.concentration > 0.15 && p.occupancy > 0.5 && p.type !== 'hotel',
    make: (p, { s, rng, id }) => {
      const tenant = rng.pick(TENANTS)
      const share = clamp(p.concentration * rng.range(0.5, 0.9), 0.08, 0.6)
      const cut = rng.range(0.08, 0.15)
      const years = rng.int(7, 12)
      return {
        id: id(), kind: 'renewal', q: s.q, propertyId: p.id,
        title: `${tenant} wants a discount to stay`,
        body: `${tenant} pays about ${pct(share)} of the rent at ${p.name}. It will sign a ${years}-year renewal today if you cut its rent ${pct(cut)}.`,
        options: [
          {
            label: 'Sign the renewal', hint: `Rent down ${pct(cut * share)} overall, the tenant locked in`,
            effect: { rentMult: 1 - cut * share, concentration: -0.08, premium: 1.01, text: `${tenant} signed for ${years} more years at ${p.name}.`, tone: 'neutral' },
          },
          {
            label: 'Hold firm', hint: '55% they renew at full rent; 45% they leave',
            effect: {
              odds: {
                p: 0.55,
                win: { text: `${tenant} blinked and renewed at full rent.`, tone: 'good' },
                lose: { occ: -share, text: `${tenant} is leaving. ${pct(share)} of ${p.name} goes dark.`, tone: 'bad' },
              },
            },
          },
        ],
      }
    },
  },
  {
    kind: 'failure',
    weight: 3,
    when: () => true,
    make: (p, { s, rng, id }) => {
      const cost = p.value * rng.range(0.006, 0.016)
      const system = SYSTEMS[p.type]
      return {
        id: id(), kind: 'failure', q: s.q, propertyId: p.id,
        title: `The ${system} failed at ${p.name}`,
        body: `Your property manager says the ${system} is beyond repair. A proper replacement runs ${money(cost)}. A patch would buy time for a fraction of that.`,
        options: [
          { label: 'Replace it properly', hint: `${money(cost)} from the fund; quality up`, effect: { fundCost: cost, quality: 3, text: `New ${system} at ${p.name}.`, tone: 'neutral' } },
          {
            label: 'Patch it', hint: `${money(cost * 0.3)} now; 40% it fails again`,
            effect: {
              fundCost: cost * 0.3, quality: -3,
              odds: {
                p: 0.6,
                win: { text: `The patch at ${p.name} is holding.`, tone: 'good' },
                lose: { fundCost: cost * 0.9, text: `The patch at ${p.name} failed. You paid for the replacement anyway.`, tone: 'bad' },
              },
            },
          },
        ],
      }
    },
  },
  {
    kind: 'offer',
    weight: 2.5,
    when: (p, s) => s.q - p.acquiredQ >= 4 && !p.plan,
    make: (p, { s, rng, id }) => {
      const value = appraiseHeld(p, s.macro).value
      const premium = rng.range(1.04, 1.12)
      const offer = value * premium
      const rival = RIVALS.filter((r) => r.focus.includes(p.type))
      const buyer = rival.length && rng.chance(0.6) ? rng.pick(rival).name : 'A family office'
      const equityNow = equityValue({ value: offer, loan: p.loan }, s.macro, s.q)
      return {
        id: id(), kind: 'offer', q: s.q, propertyId: p.id,
        title: `An unsolicited offer for ${p.name}`,
        body: `${buyer} offers ${money(offer)}, ${pct(premium - 1)} above your latest appraisal. That would return about ${money(equityNow)} to the fund after the loan and costs.`,
        options: [
          { label: 'Take it', hint: `Sell for ${money(offer)}`, effect: { sellAt: offer } },
          {
            label: 'Counter 5% higher', hint: '45% they agree; otherwise they walk',
            effect: { odds: { p: 0.45, win: { sellAt: offer * 1.05 }, lose: { text: `${buyer} walked away from ${p.name}.`, tone: 'neutral' } } },
          },
          { label: 'Not for sale', hint: 'Keep the building', effect: { text: `You turned down ${buyer} for ${p.name}.` } },
        ],
      }
    },
  },
  {
    kind: 'taxes',
    weight: 2,
    when: () => true,
    make: (p, { s, rng, id }) => {
      const rise = rng.range(0.04, 0.09)
      return {
        id: id(), kind: 'taxes', q: s.q, propertyId: p.id,
        title: `A property tax reassessment at ${p.name}`,
        body: `The county reassessed ${p.name} and its tax bill rises enough to lift operating costs ${pct(rise)}. A tax attorney thinks an appeal has a fair shot.`,
        options: [
          {
            label: 'Appeal it', hint: '$60K in fees; 55% you win most of it back',
            effect: {
              fundCost: 60000,
              odds: {
                p: 0.55,
                win: { opexMult: 1 + rise * 0.3, text: `The appeal at ${p.name} succeeded.`, tone: 'good' },
                lose: { opexMult: 1 + rise, text: `The appeal at ${p.name} failed. The full increase stands.`, tone: 'bad' },
              },
            },
          },
          { label: 'Pay it', hint: `Costs up ${pct(rise)}`, effect: { opexMult: 1 + rise, text: `Higher taxes at ${p.name}.` } },
        ],
      }
    },
  },
  {
    kind: 'prospect',
    weight: 3,
    when: (p, s) => ['office', 'industrial', 'lifescience', 'retail', 'datacenter'].includes(p.type) && p.occupancy < occupancyTarget(p, s.macro) - 0.08,
    make: (p, { s, rng, id }) => {
      const tenant = rng.pick(TENANTS)
      const share = Math.min(occupancyTarget(p, s.macro) - p.occupancy, rng.range(0.06, 0.16))
      const ti = share * p.size * marketRent(p, s.macro) * TYPES[p.type].leasingCost * 1.25
      return {
        id: id(), kind: 'prospect', q: s.q, propertyId: p.id,
        title: `${tenant} wants space at ${p.name}`,
        body: `${tenant} will lease ${pct(share)} of the building at market rent if you pay for ${money(ti)} of improvements and commissions up front.`,
        options: [
          { label: 'Sign the lease', hint: `${money(ti)} from the fund; occupancy up ${pct(share)}`, effect: { fundCost: ti, occ: share, text: `${tenant} signed at ${p.name}.`, tone: 'good' } },
          { label: 'Pass', hint: 'Wait for a better tenant', effect: { text: `You passed on ${tenant}.` } },
        ],
      }
    },
  },
  {
    kind: 'insurance',
    weight: 2,
    when: (p) => !!MARKETS[p.market].hurricane || p.market === 'la' || p.market === 'sf',
    make: (p, { s, rng, id }) => {
      const jump = rng.range(0.05, 0.09)
      return {
        id: id(), kind: 'insurance', q: s.q, propertyId: p.id,
        title: `Insurance renewal shock at ${p.name}`,
        body: `Carriers are pulling back from ${MARKETS[p.market].name}. The renewal quote lifts operating costs ${pct(jump)}. A higher deductible would soften it.`,
        options: [
          { label: 'Renew as quoted', hint: `Costs up ${pct(jump)}`, effect: { opexMult: 1 + jump, text: `Insurance renewed at ${p.name}.` } },
          {
            label: 'Raise the deductible', hint: `Costs up ${pct(jump * 0.4)}; 15% a claim costs you`,
            effect: {
              opexMult: 1 + jump * 0.4,
              odds: { p: 0.85, win: { text: `A quiet year at ${p.name}. The deductible never bit.`, tone: 'good' }, lose: { fundCost: p.value * 0.012, text: `A claim at ${p.name} landed inside the deductible.`, tone: 'bad' } },
            },
          },
        ],
      }
    },
  },
  {
    kind: 'storm',
    weight: 1.2,
    when: (p, s) => !!MARKETS[p.market].hurricane && s.q % 4 === 2,
    make: (p, { s, rng, id }) => {
      const damage = p.value * rng.range(0.02, 0.05)
      const deductible = damage * 0.3
      return {
        id: id(), kind: 'storm', q: s.q, propertyId: p.id,
        title: `A hurricane hits ${p.name}`,
        body: `Storm damage at ${p.name} comes to ${money(damage)}. Insurance covers most of it after a ${money(deductible)} deductible. You could rebuild stronger while the crews are there.`,
        options: [
          { label: 'Rebuild stronger', hint: `${money(deductible + damage * 0.15)}; quality up`, effect: { fundCost: deductible + damage * 0.15, quality: 6, occ: -0.03, text: `${p.name} was rebuilt to a higher standard.` } },
          { label: 'Repair to code', hint: `${money(deductible)}`, effect: { fundCost: deductible, quality: -2, occ: -0.05, text: `Repairs at ${p.name} are under way.` } },
        ],
      }
    },
  },
  {
    kind: 'upzoning',
    weight: 0.8,
    when: (p) => p.type !== 'datacenter',
    make: (p, { s, rng, id }) => {
      const cost = p.value * rng.range(0.008, 0.015)
      return {
        id: id(), kind: 'upzoning', q: s.q, propertyId: p.id,
        title: `The block around ${p.name} was upzoned`,
        body: `${MARKETS[p.market].name} just allowed much taller buildings on ${p.name}'s block. Entitling the site for more density would make it worth more to the next buyer.`,
        options: [
          {
            label: 'Pursue entitlements', hint: `${money(cost)}; 60% approved, value up about 10%`,
            effect: { fundCost: cost, odds: { p: 0.6, win: { premium: 1.1, text: `Entitlements approved at ${p.name}. The site is worth more.`, tone: 'good' }, lose: { text: `Neighbors sued and the entitlements at ${p.name} stalled.`, tone: 'bad' } } },
          },
          { label: 'Not now', hint: 'Leave it', effect: { text: `You left the zoning upside at ${p.name} for the next owner.` } },
        ],
      }
    },
  },
  {
    kind: 'retrofit',
    weight: 1.5,
    when: (p) => p.type !== 'hotel' && p.type !== 'storage',
    make: (p, { s, rng, id }) => {
      const cost = p.value * rng.range(0.006, 0.012)
      const save = rng.range(0.04, 0.07)
      return {
        id: id(), kind: 'retrofit', q: s.q, propertyId: p.id,
        title: `A solar and LED retrofit for ${p.name}`,
        body: `An energy contractor proposes rooftop solar, LED lighting and controls for ${money(cost)}, cutting operating costs ${pct(save)}. LPs with sustainability goals will like it.`,
        options: [
          { label: 'Do the retrofit', hint: `${money(cost)}; costs down ${pct(save)}`, effect: { fundCost: cost, opexMult: 1 - save, rep: 1, text: `${p.name} went solar.`, tone: 'good' } },
          { label: 'Pass', hint: 'Keep the cash', effect: { text: `You passed on the retrofit at ${p.name}.` } },
        ],
      }
    },
  },
  {
    kind: 'pip',
    weight: 3,
    when: (p) => p.type === 'hotel',
    make: (p, { s, rng, id }) => {
      const cost = p.size * rng.range(9000, 16000) * s.macro.costIndex
      return {
        id: id(), kind: 'pip', q: s.q, propertyId: p.id,
        title: `The brand wants a renovation at ${p.name}`,
        body: `The hotel's brand demands a ${money(cost)} property improvement plan: new rooms, lobby and signage. Refuse and it pulls the flag and its booking engine.`,
        options: [
          { label: 'Fund the PIP', hint: `${money(cost)}; quality up`, effect: { fundCost: cost, quality: 7, text: `${p.name} completed its brand renovation.` } },
          { label: 'Go independent', hint: 'No cost; rates and occupancy slip', effect: { rentMult: 0.95, occ: -0.05, quality: -2, text: `${p.name} is now an independent hotel.`, tone: 'bad' } },
        ],
      }
    },
  },
  {
    kind: 'expansion',
    weight: 3,
    when: (p) => p.type === 'datacenter' && p.occupancy > 0.85,
    make: (p, { s, rng, id }) => {
      const add = rng.range(0.2, 0.35)
      const cost = p.size * add * rng.range(7.5e6, 9.5e6) * s.macro.costIndex
      return {
        id: id(), kind: 'expansion', q: s.q, propertyId: p.id,
        title: `Your tenant wants more megawatts at ${p.name}`,
        body: `A hyperscale tenant will pre-lease ${pct(add)} more capacity if you build it. The utility upgrade and fit-out come to ${money(cost)}.`,
        options: [
          { label: 'Build it', hint: `${money(cost)}; capacity up ${pct(add)}`, effect: { fundCost: cost, sizeMult: 1 + add, text: `${p.name} expanded by ${pct(add)}.`, tone: 'good' } },
          { label: 'Pass', hint: 'Let them go elsewhere', effect: { text: `Your tenant took its expansion to another campus.` } },
        ],
      }
    },
  },
  {
    kind: 'bankruptcy',
    weight: 2,
    when: (p, s) => (p.type === 'retail' || p.type === 'office') && p.concentration > 0.15 && s.macro.phase !== 'expansion',
    make: (p, { s, rng, id }) => {
      const tenant = rng.pick(TENANTS)
      const share = clamp(p.concentration * rng.range(0.4, 0.8), 0.06, 0.4)
      return {
        id: id(), kind: 'bankruptcy', q: s.q, propertyId: p.id,
        title: `${tenant} filed for bankruptcy`,
        body: `${tenant}, about ${pct(share)} of ${p.name}, is in Chapter 11 and can reject its lease. Its lawyers are asking for a rent cut to stay.`,
        options: [
          { label: 'Cut its rent 30%', hint: `Rent down ${pct(0.3 * share)} overall; it stays`, effect: { rentMult: 1 - 0.3 * share, text: `${tenant} stayed at ${p.name} at a lower rent.` } },
          { label: 'Let it go', hint: `Occupancy down ${pct(share)}`, effect: { occ: -share, text: `${tenant} rejected its lease at ${p.name}.`, tone: 'bad' } },
        ],
      }
    },
  },
  {
    kind: 'labor',
    weight: 2,
    when: (p) => p.type === 'hotel',
    make: (p, { s, id }) => ({
      id: id(), kind: 'labor', q: s.q, propertyId: p.id,
      title: `The union contract is up at ${p.name}`,
      body: `Housekeeping and kitchen staff want a 10% raise. Agreeing lifts operating costs; holding out risks a strike in peak season.`,
      options: [
        { label: 'Agree', hint: 'Costs up 5%', effect: { opexMult: 1.05, text: `A new labor contract at ${p.name}.` } },
        {
          label: 'Hold out', hint: '50% a smaller raise; 50% a strike',
          effect: { odds: { p: 0.5, win: { opexMult: 1.02, text: `A deal at ${p.name} for a smaller raise.`, tone: 'good' }, lose: { opexMult: 1.05, occ: -0.12, text: `A strike emptied ${p.name} for weeks.`, tone: 'bad' } } },
        },
      ],
    }),
  },
]

const CONFERENCES = ['the Cap Rate Summit', 'the Pinnacle Real Estate Forum', 'the LP-GP Roundtable', 'the Sunbelt Capital Conference']
const PUBLICATIONS = ['The Cap Rate Journal', 'Ground Floor Weekly', 'CRE Daily', 'The Rent Roll']

function heaviestDept(s: GameState): Dept | null {
  const staffed = (Object.keys(s.firm.staff) as Dept[]).filter((d) => s.firm.staff[d] > 0)
  return staffed.length ? staffed.sort((a, b) => DEPTS[b].salary - DEPTS[a].salary)[0] : null
}

const FIRM_EVENTS: FirmTemplate[] = [
  {
    kind: 'poach',
    weight: 3,
    when: (s) => heaviestDept(s) !== null,
    make: ({ s, rng, id }) => {
      const staffed = (Object.keys(s.firm.staff) as Dept[]).filter((d) => s.firm.staff[d] > 0)
      const dept = rng.pick(staffed)
      const rival = rng.pick(RIVALS)
      const bonus = DEPTS[dept].salary * rng.range(0.6, 1)
      return {
        id: id(), kind: 'poach', q: s.q,
        title: `${rival.name} is poaching your team`,
        body: `${rival.name} offered your best ${DEPTS[dept].label.toLowerCase()} person a bigger title and more carry. Keeping them takes a retention bonus.`,
        options: [
          { label: 'Pay to keep them', hint: `${money(bonus)} from the firm`, effect: { cash: -bonus, text: 'Your team stays intact.' } },
          { label: 'Wish them well', hint: `${DEPTS[dept].label} loses a person`, effect: { staff: { dept, n: -1 }, rep: -1, text: `You lost a ${DEPTS[dept].label.toLowerCase()} hire to ${rival.name}.`, tone: 'bad' } },
        ],
      }
    },
  },
  {
    kind: 'stake',
    weight: 1,
    when: (s) => s.firm.stakeSold < 0.3 && s.funds.reduce((sum, f) => sum + f.size, 0) >= 500e6,
    make: ({ s, id }) => {
      const fre = Math.max(0, s.firm.fre.reduce((a, b) => a + b, 0))
      const carry = s.funds.reduce((sum, f) => sum + f.accruedCarry, 0)
      const value = Math.max(15e6, 12 * fre + 0.5 * carry + 0.02 * s.funds.reduce((sum, f) => sum + f.size, 0))
      const price = value * 0.15
      return {
        id: id(), kind: 'stake', q: s.q,
        title: 'A GP-stakes fund wants a piece of the firm',
        body: `A GP-stakes investor offers ${money(price)} in cash for a passive 15% share of your firm's fees and carry, forever. That values the firm at ${money(value)}.`,
        options: [
          { label: 'Sell 15%', hint: `${money(price)} now; 15% of fees and carry from here`, effect: { cash: price, gpStake: 0.15, text: `You sold 15% of ${s.firm.name} for ${money(price)}.`, tone: 'good' } },
          { label: 'Keep it all', hint: 'Bet on yourself', effect: { text: 'You kept full ownership of the firm.' } },
        ],
      }
    },
  },
  {
    kind: 'conference',
    weight: 2,
    when: () => true,
    make: ({ s, rng, id }) => {
      const name = rng.pick(CONFERENCES)
      return {
        id: id(), kind: 'conference', q: s.q,
        title: `An invitation to speak at ${name}`,
        body: `${name} wants ${s.firm.founder} on the main-stage panel. Every allocator you'd want to meet will be there.`,
        options: [
          { label: 'Go', hint: '$40K; reputation up', effect: { cash: -40000, rep: 2, text: `${s.firm.founder}'s panel at ${name} landed well.`, tone: 'good' } },
          { label: 'Skip it', hint: 'Stay on the deals', effect: { text: `You skipped ${name}.` } },
        ],
      }
    },
  },
  {
    kind: 'exam',
    weight: 1.2,
    when: (s) => s.q > 4,
    make: ({ s, id }) => ({
      id: id(), kind: 'exam', q: s.q,
      title: 'Regulators open an exam of the firm',
      body: 'A routine compliance exam: fee calculations, expense allocations, valuation policy. Outside counsel is expensive. Doing it yourself is a gamble.',
      options: [
        { label: 'Hire outside counsel', hint: '$250K; a clean exam', effect: { cash: -250000, text: 'A clean exam, with expensive help.' } },
        {
          label: 'Handle it in-house', hint: '70% clean; 30% a fine and bad press',
          effect: { odds: { p: 0.7, win: { text: 'The exam came back clean.', tone: 'good' }, lose: { cash: -175000, rep: -4, text: 'A deficiency letter and a fine over expense allocations.', tone: 'bad' } } },
        },
      ],
    }),
  },
  {
    kind: 'press',
    weight: 1.5,
    when: () => true,
    make: ({ s, rng, id }) => {
      const pub = rng.pick(PUBLICATIONS)
      return {
        id: id(), kind: 'press', q: s.q,
        title: `${pub} wants a profile of ${s.firm.founder}`,
        body: `A reporter from ${pub} wants a sit-down for a feature on the next generation of real estate investors.`,
        options: [
          {
            label: 'Do the interview', hint: '80% a glowing profile; 20% a misquote',
            effect: { odds: { p: 0.8, win: { rep: 3, text: `${pub}'s profile of ${s.firm.founder} is everywhere.`, tone: 'good' }, lose: { rep: -2, text: `${pub} misquoted ${s.firm.founder} on cap rates. Awkward.`, tone: 'bad' } } },
          },
          { label: 'Decline', hint: 'Keep a low profile', effect: { text: 'You passed on the profile.' } },
        ],
      }
    },
  },
  {
    kind: 'burnout',
    weight: 2,
    when: (s) => s.tombstones.filter((t) => s.q - t.q < 4).length >= 3,
    make: ({ s, id }) => {
      const bonus = DEPTS.acquisitions.salary * 0.5
      return {
        id: id(), kind: 'burnout', q: s.q,
        title: 'Your deal team is exhausted',
        body: `Three closings in a year on a lean team. Your associates are working weekends and the recruiters are calling.`,
        options: [
          { label: 'Pay bonuses', hint: `${money(bonus)} from the firm`, effect: { cash: -bonus, text: 'Bonuses paid. Morale is up.' } },
          { label: 'Hire another associate', hint: '+1 acquisitions', effect: { staff: { dept: 'acquisitions', n: 1 }, text: 'A new associate joins the deal team.' } },
          {
            label: 'Push through', hint: '60% they rally; 40% someone quits',
            effect: { odds: { p: 0.6, win: { text: 'The team rallied.' }, lose: { staff: { dept: 'acquisitions', n: -1 }, text: 'Your best associate quit.', tone: 'bad' } } },
          },
        ],
      }
    },
  },
  {
    kind: 'anchor',
    weight: 4,
    when: (s) => !!s.firm.fundraise && s.firm.fundraise.elapsed < s.firm.fundraise.quarters - 1,
    make: ({ s, rng, id }) => {
      const raise = s.firm.fundraise!
      const lp = rng.pick(['Meridian Sovereign Investment Authority', 'Great Lakes Teachers\' Retirement System', 'Atlantic Mutual Life', 'Coral Gulf Investment Authority'])
      const ticket = Math.round((raise.target * rng.range(0.15, 0.25)) / 1e6) * 1e6
      return {
        id: id(), kind: 'anchor', q: s.q,
        title: `${lp} will anchor Fund ${roman(raise.number)}`,
        body: `${lp} will commit ${money(ticket)} if you cut its management fee by half a point. Anchors bring other LPs with them.`,
        options: [
          { label: 'Accept the side letter', hint: `${money(ticket)} committed; a slightly lower blended fee`, effect: { raiseCommit: { name: lp, amount: ticket }, raiseFee: -0.0008, text: `${lp} anchors Fund ${roman(raise.number)}.`, tone: 'good' } },
          { label: 'Hold the line on fees', hint: 'Keep full fees', effect: { text: `${lp} passed on Fund ${roman(raise.number)}.` } },
        ],
      }
    },
  },
]

/** Random decisions for the coming quarter: a few per portfolio, never a flood. */
export function rollEvents(s: GameState, rng: Rng, id: () => string): GameEvent[] {
  const ctx: Ctx = { s, rng, id }
  const out: GameEvent[] = []
  const recent = new Set(s.events.map((e) => e.propertyId).filter(Boolean))
  for (const p of rng.chance(0.5) ? s.properties : [...s.properties].reverse()) {
    if (out.length >= 2) break
    if (recent.has(p.id) || !rng.chance(0.07)) continue
    const options = PROPERTY_EVENTS.filter((t) => t.when(p, s))
    if (!options.length) continue
    const t = rng.weighted(options.map((o) => [o, o.weight] as const))
    out.push(t.make(p, ctx))
  }
  if (rng.chance(0.18) && out.length < 3) {
    const options = FIRM_EVENTS.filter((t) => t.when(s) && !s.events.some((e) => e.kind === t.kind))
    if (options.length) {
      const t = rng.weighted(options.map((o) => [o, o.weight] as const))
      out.push(t.make(ctx))
    }
  }
  return out
}

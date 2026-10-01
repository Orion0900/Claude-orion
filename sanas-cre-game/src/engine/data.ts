/*
 * The numbers the market is made of. Rents, costs and cap rates start near
 * where US commercial real estate sat going into 2027; everything after that
 * is the game's own weather.
 */
import type { Dept, Difficulty, MarketId, Phase, PropertyType, SellerKind, Storyline, Strategy } from './types'

export interface TypeSpec {
  label: string
  short: string
  unit: string
  unitOne: string
  /** Market rent per unit per year at average quality. A hotel's is room and other revenue per key at full occupancy. */
  rent: number
  opexFixed: number
  opexVar: number
  /** Share of leases repricing to market each quarter. */
  rollover: number
  /** Share of the gap to market occupancy leased up each quarter. */
  leaseSpeed: number
  occ: number
  /** How much better a top-quality building leases than an average one. */
  qualityOcc: number
  /** A new lease's commissions and improvements, in years of its rent. */
  leasingCost: number
  spread: number
  beta: number
  growth: number
  vol: number
  sizeMin: number
  sizeMax: number
  portfolioMax: number
  /** Renovation cost per unit for each point of quality. */
  renoCost: number
  /** Occupancy taken offline during a value-add program. */
  drag: number
  concentration: readonly [number, number]
  debtAdj: number
  weight: number
}

export const TYPES: Record<PropertyType, TypeSpec> = {
  multifamily: {
    label: 'Multifamily', short: 'Apartments', unit: 'units', unitOne: 'unit',
    rent: 21600, opexFixed: 7000, opexVar: 0.08, rollover: 0.2, leaseSpeed: 0.4, occ: 0.945, qualityOcc: 0.06,
    leasingCost: 0.04, spread: 0.01, beta: 0.7, growth: 0.03, vol: 0.01,
    sizeMin: 80, sizeMax: 600, portfolioMax: 5000, renoCost: 650, drag: 0.06, concentration: [0.01, 0.03], debtAdj: -0.003, weight: 1.4,
  },
  industrial: {
    label: 'Industrial', short: 'Warehouses', unit: 'SF', unitOne: 'SF',
    rent: 10.5, opexFixed: 1.2, opexVar: 0.02, rollover: 0.035, leaseSpeed: 0.2, occ: 0.94, qualityOcc: 0.1,
    leasingCost: 0.35, spread: 0.011, beta: 0.9, growth: 0.035, vol: 0.012,
    sizeMin: 80000, sizeMax: 1200000, portfolioMax: 9000000, renoCost: 0.4, drag: 0.02, concentration: [0.2, 0.8], debtAdj: -0.001, weight: 1.3,
  },
  office: {
    label: 'Office', short: 'Offices', unit: 'SF', unitOne: 'SF',
    rent: 38, opexFixed: 13, opexVar: 0.03, rollover: 0.03, leaseSpeed: 0.1, occ: 0.84, qualityOcc: 0.3,
    leasingCost: 1.3, spread: 0.039, beta: 1.2, growth: 0.012, vol: 0.015,
    sizeMin: 60000, sizeMax: 1500000, portfolioMax: 4000000, renoCost: 1.8, drag: 0.05, concentration: [0.15, 0.5], debtAdj: 0.006, weight: 1.1,
  },
  retail: {
    label: 'Retail', short: 'Shopping centers', unit: 'SF', unitOne: 'SF',
    rent: 24, opexFixed: 5, opexVar: 0.04, rollover: 0.03, leaseSpeed: 0.12, occ: 0.93, qualityOcc: 0.15,
    leasingCost: 0.7, spread: 0.026, beta: 1.0, growth: 0.025, vol: 0.012,
    sizeMin: 40000, sizeMax: 600000, portfolioMax: 3500000, renoCost: 0.95, drag: 0.04, concentration: [0.15, 0.35], debtAdj: 0.003, weight: 0.9,
  },
  hotel: {
    label: 'Hotel', short: 'Hotels', unit: 'keys', unitOne: 'key',
    rent: 83000, opexFixed: 14000, opexVar: 0.52, rollover: 1, leaseSpeed: 0.7, occ: 0.7, qualityOcc: 0.12,
    leasingCost: 0, spread: 0.037, beta: 2.0, growth: 0.03, vol: 0.03,
    sizeMin: 100, sizeMax: 1200, portfolioMax: 5000, renoCost: 1100, drag: 0.08, concentration: [0, 0.02], debtAdj: 0.006, weight: 0.7,
  },
  datacenter: {
    label: 'Data Center', short: 'Data centers', unit: 'MW', unitOne: 'MW',
    rent: 1150000, opexFixed: 90000, opexVar: 0.06, rollover: 0.02, leaseSpeed: 0.15, occ: 0.96, qualityOcc: 0.05,
    leasingCost: 0.25, spread: 0.013, beta: 0.8, growth: 0.05, vol: 0.02,
    sizeMin: 2, sizeMax: 120, portfolioMax: 500, renoCost: 40000, drag: 0.02, concentration: [0.5, 0.9], debtAdj: -0.002, weight: 0.6,
  },
  storage: {
    label: 'Self-Storage', short: 'Storage', unit: 'SF', unitOne: 'SF',
    rent: 18, opexFixed: 4.5, opexVar: 0.08, rollover: 0.25, leaseSpeed: 0.3, occ: 0.9, qualityOcc: 0.08,
    leasingCost: 0.02, spread: 0.014, beta: 0.6, growth: 0.025, vol: 0.01,
    sizeMin: 50000, sizeMax: 220000, portfolioMax: 5000000, renoCost: 0.55, drag: 0.02, concentration: [0, 0.01], debtAdj: 0, weight: 0.7,
  },
  lifescience: {
    label: 'Life Science', short: 'Labs', unit: 'SF', unitOne: 'SF',
    rent: 62, opexFixed: 15, opexVar: 0.03, rollover: 0.025, leaseSpeed: 0.08, occ: 0.8, qualityOcc: 0.25,
    leasingCost: 1.6, spread: 0.024, beta: 1.0, growth: 0.02, vol: 0.02,
    sizeMin: 50000, sizeMax: 800000, portfolioMax: 2500000, renoCost: 2.4, drag: 0.05, concentration: [0.2, 0.6], debtAdj: 0.005, weight: 0.5,
  },
}

export const TYPE_ORDER: PropertyType[] = [
  'multifamily', 'industrial', 'office', 'retail', 'hotel', 'datacenter', 'storage', 'lifescience',
]

export interface MarketSpec {
  name: string
  short: string
  region: 'Gateway' | 'West Coast' | 'Midwest' | 'Sunbelt'
  rent: number
  cap: number
  growth: number
  lon: number
  lat: number
  hurricane?: boolean
  rentControl?: boolean
  weights: Partial<Record<PropertyType, number>>
  places: string[]
}

export const MARKETS: Record<MarketId, MarketSpec> = {
  nyc: {
    name: 'New York', short: 'NYC', region: 'Gateway', rent: 1.55, cap: -0.0055, growth: 0.002, lon: -74.0, lat: 40.71, rentControl: true,
    weights: { office: 1.6, hotel: 1.4, datacenter: 0.3, lifescience: 0.5, industrial: 0.8, storage: 0.8 },
    places: ['Midtown', 'Hudson Square', 'Long Island City', 'Williamsburg', 'Flatiron', 'Downtown Brooklyn', 'Secaucus', 'the Meadowlands', 'Astoria', 'the South Bronx'],
  },
  bos: {
    name: 'Boston', short: 'BOS', region: 'Gateway', rent: 1.35, cap: -0.004, growth: 0.002, lon: -71.06, lat: 42.36,
    weights: { lifescience: 3, office: 1.1, hotel: 0.8, datacenter: 0.2, industrial: 0.6 },
    places: ['Kendall Square', 'the Seaport', 'Back Bay', 'Somerville', 'Waltham', 'Fenway', 'Assembly Row', 'Lexington'],
  },
  dc: {
    name: 'Washington, DC', short: 'DC', region: 'Gateway', rent: 1.2, cap: -0.001, growth: -0.002, lon: -77.04, lat: 38.9,
    weights: { datacenter: 3.5, office: 1.3, lifescience: 0.8, hotel: 0.8 },
    places: ['Ashburn', 'Tysons', 'Navy Yard', 'NoMa', 'Rockville', 'Reston', 'Arlington', 'Manassas'],
  },
  chi: {
    name: 'Chicago', short: 'CHI', region: 'Midwest', rent: 0.95, cap: 0.0035, growth: -0.004, lon: -87.63, lat: 41.88,
    weights: { industrial: 1.4, office: 1.2, datacenter: 0.8, hotel: 0.8, lifescience: 0.3 },
    places: ['Fulton Market', 'the Loop', 'River North', "O'Hare", 'Joliet', 'the West Loop', 'Elk Grove Village', 'Lincoln Park'],
  },
  sf: {
    name: 'San Francisco', short: 'SF', region: 'West Coast', rent: 1.45, cap: -0.0035, growth: -0.003, lon: -122.42, lat: 37.77, rentControl: true,
    weights: { office: 1.3, lifescience: 2, datacenter: 0.8, hotel: 0.8, industrial: 0.6 },
    places: ['SoMa', 'Mission Bay', 'South San Francisco', 'Oakland', 'Santa Clara', 'Dogpatch', 'Brisbane', 'Emeryville'],
  },
  la: {
    name: 'Los Angeles', short: 'LA', region: 'West Coast', rent: 1.35, cap: -0.0045, growth: 0, lon: -118.24, lat: 34.05, rentControl: true,
    weights: { industrial: 1.5, multifamily: 1.2, retail: 1.1, office: 0.9, lifescience: 0.3, datacenter: 0.4 },
    places: ['Culver City', 'the Inland Empire', 'Santa Monica', 'Downtown LA', 'Burbank', 'Koreatown', 'Ontario', 'Long Beach', 'Playa Vista'],
  },
  sea: {
    name: 'Seattle', short: 'SEA', region: 'West Coast', rent: 1.2, cap: -0.002, growth: 0.002, lon: -122.33, lat: 47.61,
    weights: { lifescience: 0.8, datacenter: 0.6, hotel: 0.7 },
    places: ['South Lake Union', 'Bellevue', 'the Kent Valley', 'Capitol Hill', 'Fremont', 'Redmond', 'Tukwila'],
  },
  dal: {
    name: 'Dallas', short: 'DAL', region: 'Sunbelt', rent: 0.95, cap: 0.0005, growth: 0.007, lon: -96.8, lat: 32.78,
    weights: { industrial: 1.6, multifamily: 1.5, datacenter: 1.8, retail: 1.1, lifescience: 0.2 },
    places: ['Uptown', 'Las Colinas', 'Alliance', 'Deep Ellum', 'Frisco', 'Plano', 'Grand Prairie', 'Irving'],
  },
  aus: {
    name: 'Austin', short: 'AUS', region: 'Sunbelt', rent: 1.0, cap: 0, growth: 0.006, lon: -97.74, lat: 30.27,
    weights: { multifamily: 1.6, office: 0.9, lifescience: 0.3, datacenter: 0.6, hotel: 0.8 },
    places: ['South Congress', 'the Domain', 'East Austin', 'Round Rock', 'Pflugerville', 'Mueller', 'San Marcos'],
  },
  atl: {
    name: 'Atlanta', short: 'ATL', region: 'Sunbelt', rent: 0.9, cap: 0.0015, growth: 0.005, lon: -84.39, lat: 33.75,
    weights: { industrial: 1.5, multifamily: 1.4, datacenter: 1.4, retail: 1.1, office: 0.9, lifescience: 0.2 },
    places: ['Midtown', 'Buckhead', 'West Midtown', 'the Airport submarket', 'Alpharetta', 'the Westside', 'Douglasville', 'Decatur'],
  },
  mia: {
    name: 'Miami', short: 'MIA', region: 'Sunbelt', rent: 1.15, cap: -0.0015, growth: 0.008, lon: -80.19, lat: 25.76, hurricane: true,
    weights: { multifamily: 1.3, hotel: 1.6, retail: 1.2, office: 0.8, datacenter: 0.3, lifescience: 0.2 },
    places: ['Brickell', 'Wynwood', 'Doral', 'Coral Gables', 'Little Havana', 'Hialeah', 'Edgewater', 'Aventura'],
  },
  phx: {
    name: 'Phoenix', short: 'PHX', region: 'Sunbelt', rent: 0.9, cap: 0.0015, growth: 0.006, lon: -112.07, lat: 33.45,
    weights: { industrial: 1.4, multifamily: 1.5, datacenter: 1.6, storage: 1.2, office: 0.7, lifescience: 0.2 },
    places: ['Tempe', 'Scottsdale', 'Chandler', 'Mesa', 'Goodyear', 'Glendale', 'Camelback', 'Gilbert'],
  },
  nash: {
    name: 'Nashville', short: 'NASH', region: 'Sunbelt', rent: 0.92, cap: 0.001, growth: 0.007, lon: -86.78, lat: 36.16,
    weights: { multifamily: 1.4, hotel: 1.4, office: 0.8, datacenter: 0.3, lifescience: 0.2 },
    places: ['the Gulch', 'Germantown', 'East Nashville', 'Midtown', 'Antioch', 'La Vergne', 'Franklin', 'Wedgewood-Houston'],
  },
}

export const MARKET_ORDER = Object.keys(MARKETS) as MarketId[]

export interface PhaseSpec {
  label: string
  /** Where the central bank wants the policy rate. */
  rate: number
  inflation: number
  spread: number
  ltv: number
  lp: number
  sentiment: number
  growth: number
  occ: number
  /** Share of new listings that are distressed. */
  distress: number
  pricing: number
  minAge: number
  next: ReadonlyArray<readonly [Phase, number]>
  blurb: string
}

export const PHASES: Record<Phase, PhaseSpec> = {
  recovery: {
    label: 'Recovery', rate: 0.03, inflation: 0.022, spread: 0.022, ltv: 0.62, lp: 0.85, sentiment: 0.004,
    growth: -0.004, occ: -0.01, distress: 0.14, pricing: 0.98, minAge: 4, next: [['expansion', 0.22]],
    blurb: 'Prices are still bruised and lenders cautious. Historically a great time to buy.',
  },
  expansion: {
    label: 'Expansion', rate: 0.0375, inflation: 0.026, spread: 0.0185, ltv: 0.7, lp: 1.1, sentiment: -0.002,
    growth: 0.008, occ: 0.006, distress: 0.04, pricing: 1.02, minAge: 6, next: [['late', 0.095]],
    blurb: 'Rents rise, debt is easy and LPs are writing checks.',
  },
  late: {
    label: 'Late cycle', rate: 0.05, inflation: 0.038, spread: 0.0195, ltv: 0.7, lp: 1.15, sentiment: 0,
    growth: 0.004, occ: 0, distress: 0.05, pricing: 1.03, minAge: 3, next: [['recession', 0.25], ['expansion', 0.04]],
    blurb: 'Rates are climbing and everyone is paying up. A good time to sell.',
  },
  recession: {
    label: 'Recession', rate: 0.0175, inflation: 0.015, spread: 0.034, ltv: 0.55, lp: 0.55, sentiment: 0.016,
    growth: -0.035, occ: -0.04, distress: 0.26, pricing: 0.95, minAge: 3, next: [['recovery', 0.35]],
    blurb: 'Tenants shrink, values fall and lenders pull back. Leverage bites.',
  },
}

export const PHASE_ORDER: Phase[] = ['recovery', 'expansion', 'late', 'recession']

export interface StrategySpec {
  label: string
  target: number
  fee: number
  carry: number
  pref: number
  blurb: string
}

export const STRATEGIES: Record<Strategy, StrategySpec> = {
  coreplus: {
    label: 'Core-Plus', target: 0.09, fee: 0.01, carry: 0.15, pref: 0.07,
    blurb: 'Well-leased buildings with light upside and moderate leverage. Lower fees, steadier returns.',
  },
  valueadd: {
    label: 'Value-Add', target: 0.13, fee: 0.015, carry: 0.2, pref: 0.08,
    blurb: 'Buy tired or half-empty buildings, renovate, re-lease and sell them stabilized.',
  },
  opportunistic: {
    label: 'Opportunistic', target: 0.17, fee: 0.0175, carry: 0.2, pref: 0.09,
    blurb: 'Distress, heavy repositioning and lease-up. The highest risk and the highest bar.',
  },
}

export interface DeptSpec {
  label: string
  salary: number
  blurb: string
}

export const DEPTS: Record<Dept, DeptSpec> = {
  acquisitions: { label: 'Acquisitions', salary: 425000, blurb: 'More deals each quarter, more of them off-market, and sellers trust your bids.' },
  assetMgmt: { label: 'Asset management', salary: 325000, blurb: 'Faster lease-up, tighter budgets and fewer surprises. Each covers about four buildings.' },
  investorRelations: { label: 'Investor relations', salary: 375000, blurb: 'Bigger fundraises and steadier LP confidence.' },
  research: { label: 'Research', salary: 250000, blurb: 'Catches problems in diligence and reads where the cycle is going.' },
}

export const DEPT_ORDER: Dept[] = ['acquisitions', 'assetMgmt', 'investorRelations', 'research']

export interface DifficultySpec {
  label: string
  blurb: string
  fund: number
  cash: number
  rep: number
  staff: Record<Dept, number>
  /** How much less return rivals will settle for: higher is harder. */
  rivalEdge: number
  vol: number
}

export const DIFFICULTIES: Record<Difficulty, DifficultySpec> = {
  easy: {
    label: 'Spinout', blurb: 'You left a big platform with a following: a $250M Fund I and $6M in the bank.',
    fund: 250e6, cash: 6e6, rep: 50, staff: { acquisitions: 1, assetMgmt: 2, investorRelations: 1, research: 1 }, rivalEdge: -0.01, vol: 0.8,
  },
  normal: {
    label: 'First-time fund', blurb: 'A $150M first fund from a seed LP, friends and family, and $3.5M in the bank.',
    fund: 150e6, cash: 3.5e6, rep: 35, staff: { acquisitions: 1, assetMgmt: 1, investorRelations: 0, research: 1 }, rivalEdge: 0, vol: 1,
  },
  hard: {
    label: 'Garage', blurb: 'A $75M fund, $2M in the bank, one associate and everything to prove.',
    fund: 75e6, cash: 2e6, rep: 20, staff: { acquisitions: 1, assetMgmt: 0, investorRelations: 0, research: 0 }, rivalEdge: 0.01, vol: 1.2,
  },
}

export const SELLERS: Record<SellerKind, { label: string; stories: string[] }> = {
  auction: {
    label: 'Marketed',
    stories: [
      'Marketed by a national brokerage. {n} groups toured and the call for offers is next week.',
      'A wide auction with a glossy offering memorandum. {n} bidders signed the confidentiality agreement.',
      'The broker says there is "strong interest" from {n} groups. There always is.',
    ],
  },
  offmarket: {
    label: 'Off-market',
    stories: [
      'Off-market. The owner called you directly after years of coffee meetings.',
      'A quiet approach through a lender you know. Nobody else has seen it yet.',
      'The seller wants certainty, not a beauty contest, and only two groups are looking.',
    ],
  },
  motivated: {
    label: 'Motivated',
    stories: [
      'A fund at the end of its life has to sell before its term runs out.',
      'The owner is consolidating into another strategy and wants this sold this quarter.',
      'A partnership dispute between the owners. They want out and they want it quick.',
    ],
  },
  distressed: {
    label: 'Distressed',
    stories: [
      'Lender-owned after the last sponsor handed back the keys. Sold as-is, with no diligence period.',
      'A special servicer is clearing defaulted loans. As-is, where-is, close in 30 days.',
      'Foreclosed last year and the bank wants it off its books. No reps, no diligence contingency.',
    ],
  },
  estate: {
    label: 'Estate sale',
    stories: [
      'A family estate sale. Forty years of ownership, deferred maintenance and rents well under market.',
      'The founder\'s heirs are selling. The books are a shoebox, and nobody has raised rents in years.',
    ],
  },
  developer: {
    label: 'New build',
    stories: [
      'A merchant developer selling at completion. Brand new and still leasing up.',
      'The developer needs to repay a construction loan. New, half-leased, and priced to move.',
    ],
  },
  recap: {
    label: 'Maturity',
    stories: [
      'The owner has a loan maturing that it cannot refinance at today\'s rates.',
      'Floating-rate debt with an expiring rate cap. The sponsor needs a buyer before the lender steps in.',
    ],
  },
}

/** Storylines at the start of a career, roughly the market going into 2027. */
export const OPENING_STORYLINES: Storyline[] = [
  { id: 'office-hangover', title: 'Hybrid work keeps offices half-empty', sector: 'office', growth: -0.015, occ: -0.02, spread: 0.004, quartersLeft: 10 },
  { id: 'sunbelt-supply', title: 'A record wave of new apartments floods the Sunbelt', sector: 'multifamily', markets: ['aus', 'phx', 'nash', 'dal', 'atl'], growth: -0.035, occ: -0.02, spread: 0, quartersLeft: 6, then: 'sunbelt-absorption' },
  { id: 'ai-buildout', title: 'The AI build-out: hyperscalers lease every megawatt they can find', sector: 'datacenter', growth: 0.03, occ: 0.01, spread: -0.002, quartersLeft: 12 },
  { id: 'lab-glut', title: 'Too many labs: life science vacancy at record highs', sector: 'lifescience', growth: -0.03, occ: -0.04, spread: 0.004, quartersLeft: 10, then: 'biotech-rebound' },
  { id: 'retail-scarcity', title: 'No new shopping centers in a decade: retail space is scarce', sector: 'retail', growth: 0.01, occ: 0.01, spread: -0.002, quartersLeft: 8 },
  { id: 'sf-ai-office', title: 'AI companies snap up San Francisco office space', sector: 'office', markets: ['sf'], growth: 0.03, occ: 0.04, spread: -0.002, quartersLeft: 10 },
]

/** Storylines that can start later. `{city}` is filled with the market they land in. */
export const STORYLINE_POOL: Array<Storyline & { pickMarkets?: MarketId[]; pickCount?: number }> = [
  { id: 'rto-push', title: 'Return-to-office mandates stick; leasing tours jump', sector: 'office', growth: 0.02, occ: 0.04, spread: -0.005, quartersLeft: 12 },
  { id: 'remote-deepens', title: 'Hybrid work becomes permanent and tenants shed space', sector: 'office', growth: -0.02, occ: -0.04, spread: 0.006, quartersLeft: 10 },
  { id: 'ai-pause', title: 'Hyperscalers pause AI data center spending', sector: 'datacenter', growth: -0.04, occ: -0.05, spread: 0.01, quartersLeft: 8 },
  { id: 'power-crunch', title: 'The grid is full: existing data centers command record rents', sector: 'datacenter', growth: 0.04, occ: 0.01, spread: -0.003, quartersLeft: 8 },
  { id: 'nearshoring', title: 'Nearshoring brings factories and suppliers to {city}', sector: 'industrial', pickMarkets: ['dal', 'phx', 'atl', 'la'], pickCount: 2, growth: 0.04, occ: 0.03, spread: -0.002, quartersLeft: 10 },
  { id: 'warehouse-glut', title: 'Record deliveries push warehouse vacancy to a decade high', sector: 'industrial', growth: -0.03, occ: -0.05, spread: 0.003, quartersLeft: 8 },
  { id: 'housing-shortage', title: 'Home prices out of reach keep renters renting', sector: 'multifamily', growth: 0.025, occ: 0.015, spread: -0.002, quartersLeft: 12 },
  { id: 'rent-control', title: '{city} passes strict rent stabilization', sector: 'multifamily', pickMarkets: ['nyc', 'la', 'sf'], pickCount: 1, growth: -0.03, occ: 0, spread: 0.004, quartersLeft: 16 },
  { id: 'supply-wave', title: 'Cranes everywhere: an apartment supply wave hits {city}', sector: 'multifamily', pickMarkets: ['dal', 'aus', 'atl', 'phx', 'nash', 'mia'], pickCount: 2, growth: -0.035, occ: -0.025, spread: 0, quartersLeft: 6, then: 'absorption' },
  { id: 'retail-renaissance', title: 'Shoppers return to open-air centers', sector: 'retail', growth: 0.02, occ: 0.02, spread: -0.004, quartersLeft: 12 },
  { id: 'retail-bankruptcies', title: 'A wave of retailer bankruptcies hits strip centers', sector: 'retail', growth: -0.02, occ: -0.04, spread: 0.003, quartersLeft: 6 },
  { id: 'travel-boom', title: 'A record travel season lifts hotel revenue per room', sector: 'hotel', growth: 0.05, occ: 0.05, spread: -0.004, quartersLeft: 8 },
  { id: 'travel-slump', title: 'Business travel slumps as corporate budgets tighten', sector: 'hotel', growth: -0.05, occ: -0.07, spread: 0.006, quartersLeft: 6 },
  { id: 'biotech-boom', title: 'A biotech IPO window opens and lab demand follows', sector: 'lifescience', growth: 0.03, occ: 0.05, spread: -0.005, quartersLeft: 12 },
  { id: 'moving-season', title: 'Home sales recover and storage demand jumps', sector: 'storage', growth: 0.03, occ: 0.03, spread: -0.002, quartersLeft: 8 },
  { id: 'tech-layoffs', title: 'Tech layoffs hit {city}', sector: 'all', pickMarkets: ['sf', 'sea', 'aus'], pickCount: 1, growth: -0.025, occ: -0.02, spread: 0.002, quartersLeft: 6 },
  { id: 'relocations', title: 'Corporate relocations to {city} accelerate', sector: 'all', pickMarkets: ['dal', 'nash', 'mia', 'atl', 'phx'], pickCount: 2, growth: 0.025, occ: 0.015, spread: -0.002, quartersLeft: 10 },
  { id: 'insurance-crisis', title: 'Florida insurance premiums soar after a brutal storm season', sector: 'all', pickMarkets: ['mia'], pickCount: 1, growth: -0.01, occ: 0, spread: 0.004, quartersLeft: 12 },
]

/** Follow-on storylines, started by `then`. */
export const FOLLOW_ONS: Record<string, Omit<Storyline, 'markets'>> = {
  'sunbelt-absorption': { id: 'sunbelt-absorption', title: 'The Sunbelt apartment glut is absorbed and rents snap back', sector: 'multifamily', growth: 0.03, occ: 0.015, spread: -0.002, quartersLeft: 8 },
  absorption: { id: 'absorption', title: 'New apartments fill up and landlords regain pricing power', sector: 'multifamily', growth: 0.03, occ: 0.015, spread: -0.002, quartersLeft: 8 },
  'biotech-rebound': { id: 'biotech-rebound', title: 'Biotech funding rebounds and lab tours pick up', sector: 'lifescience', growth: 0.025, occ: 0.04, spread: -0.004, quartersLeft: 10 },
}

export const RIVALS = [
  { id: 'obsidian', name: 'Obsidian Gate Capital', style: 'The mega-fund. Bids on everything and rarely blinks.', aum: 64e9, focus: [...TYPE_ORDER], aggression: 1.0 },
  { id: 'kestrel', name: 'Kestrel Ridge Partners', style: 'Industrial and data center specialists.', aum: 11e9, focus: ['industrial', 'datacenter'] as PropertyType[], aggression: 1.02 },
  { id: 'copperline', name: 'Copperline Residential', style: 'Sunbelt apartments at almost any price.', aum: 5.2e9, focus: ['multifamily'] as PropertyType[], aggression: 1.03 },
  { id: 'halcyon', name: 'Halcyon Bay Capital', style: 'Hotels, offices and opportunistic bets.', aum: 2.4e9, focus: ['hotel', 'office', 'retail'] as PropertyType[], aggression: 0.99 },
  { id: 'bluewater', name: 'Bluewater Peak Realty', style: 'Core-plus money with a low cost of capital.', aum: 1.1e9, focus: ['retail', 'storage', 'multifamily', 'industrial'] as PropertyType[], aggression: 1.01 },
  { id: 'fernhill', name: 'Fernhill Ventures', style: 'A first-time manager, like you were.', aum: 0.26e9, focus: ['storage', 'lifescience', 'office'] as PropertyType[], aggression: 0.98 },
]

export const LP_NAMES = {
  pension: [
    'Great Lakes Teachers\' Retirement System', 'Cascadia Public Employees\' Fund', 'Sun Valley Firefighters\' Pension',
    'Keystone State Employees\' Retirement', 'Prairie Municipal Pension Plan', 'Bayou State Retirement System',
    'Tri-County Police & Fire Pension', 'Granite Coast Teachers\' Pension',
  ],
  endowment: [
    'Halverson Foundation', 'Northfield University Endowment', 'Whitcombe College Endowment', 'Ardent Health Foundation',
    'Linwood Institute Endowment', 'St. Brendan\'s University Fund',
  ],
  sovereign: ['Meridian Sovereign Investment Authority', 'Nordhavn State Fund', 'Coral Gulf Investment Authority'],
  insurance: ['Atlantic Mutual Life', 'Granite State Insurance Group', 'Pinecrest Re', 'Harbor Shield Life'],
  family: ['Ironwood Family Office', 'Calloway Family Office', 'Ashbury Family Partners', 'The Okafor Family Office', 'Lindqvist Family Holdings'],
  fof: ['Larkspur Multi-Manager', 'Summit Ridge Fund of Funds', 'Brightwater Wealth Platform'],
}

export const SEED_LPS = ['Seed LP: Halverson Foundation', 'Friends and family', 'Former colleagues', 'Ironwood Family Office']

export const TENANTS = [
  'Northwind Analytics', 'Aldergrove Therapeutics', 'Kitebird Freight', 'Pemberton & Hale LLP', 'Quarry Lane Markets',
  'Solace Bio', 'Tallgrass Grocery', 'Ridgeway Fitness', 'Juniper Health', 'Copperleaf Apparel', 'Bramble & Co.',
  'Halftone Media', 'Mosaic Learning', 'Everline Software', 'Cardinal Freight', 'Larchmont Insurance', 'Vantor Robotics',
  'Saltbox Coffee', 'Fairweather Outfitters', 'Helix Diagnostics',
]

export const BUYERS = [
  'a public REIT', 'a pension fund\'s separate account', 'a Korean life insurer', 'a family office', 'a core fund',
  'a sovereign wealth fund', 'a 1031 exchange buyer', 'a non-traded REIT', 'a private wealth platform',
]

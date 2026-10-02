/*
 * The whole game is one plain, JSON-safe object. Every turn and every action
 * takes a GameState and returns a new one, so a save is just this object
 * written down, and the same seed always plays out the same way.
 */

export type PropertyType =
  | 'multifamily'
  | 'industrial'
  | 'office'
  | 'retail'
  | 'hotel'
  | 'datacenter'
  | 'storage'
  | 'lifescience'

export type MarketId =
  | 'nyc'
  | 'bos'
  | 'dc'
  | 'chi'
  | 'sf'
  | 'la'
  | 'sea'
  | 'dal'
  | 'aus'
  | 'atl'
  | 'mia'
  | 'phx'
  | 'nash'

export type Phase = 'recovery' | 'expansion' | 'late' | 'recession'
export type Strategy = 'coreplus' | 'valueadd' | 'opportunistic'
export type PlanKind = 'hold' | 'valueadd' | 'reposition'
export type LoanKind = 'fixed' | 'bridge'
export type Dept = 'acquisitions' | 'assetMgmt' | 'investorRelations' | 'research'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type SellerKind = 'auction' | 'offmarket' | 'motivated' | 'distressed' | 'estate' | 'developer' | 'recap'
export type Tone = 'good' | 'bad' | 'neutral'

/** A national storyline bending one sector (optionally only in some markets) for a while. */
export interface Storyline {
  id: string
  title: string
  sector: PropertyType | 'all'
  markets?: MarketId[]
  /** Added to annual rent growth while active. */
  growth: number
  /** Added to the market occupancy a building can reach. */
  occ: number
  /** Added to cap rates. */
  spread: number
  quartersLeft: number
  /** Storyline that starts when this one ends (a supply wave is followed by its absorption). */
  then?: string
}

export interface SectorState {
  /** National rent level, 1 at the start of the game. */
  level: number
  /** Trailing annual rent growth, for display. */
  growth: number
  capSpread: number
  occ: number
}

export interface MarketState {
  level: number
  /** A slow-moving local shock to growth (a tech layoff wave, a corporate relocation). */
  local: number
}

export interface Macro {
  phase: Phase
  phaseAge: number
  policyRate: number
  tenYear: number
  termPremium: number
  inflation: number
  creditSpread: number
  maxLtv: number
  lpAppetite: number
  /** Extra cap rate the market demands for risk right now. */
  sentiment: number
  costIndex: number
  sectors: Record<PropertyType, SectorState>
  markets: Record<MarketId, MarketState>
  /** Rent level for every property type in every market, keyed "type:market", 1 at the start. */
  rents: Record<string, number>
  storylines: Storyline[]
  /** Black swan effects still running: quarters left. */
  shocks: Record<string, number>
}

export interface HiddenIssue {
  kind: 'roof' | 'environmental' | 'tenant' | 'structural' | 'taxes' | 'title'
  label: string
  /** One-off cost when it surfaces. */
  cost: number
  /** Occupancy lost when it surfaces. */
  occHit: number
  /** Permanent opex increase multiplier (taxes). */
  opexHit: number
  /** Value haircut multiplier (title or zoning defects). */
  valueHit: number
  /** Quarters after closing when it surfaces if diligence missed it. */
  surfacesIn: number
}

/** The physical building and its leases, owned or not. */
export interface Asset {
  name: string
  type: PropertyType
  market: MarketId
  size: number
  /** Number of buildings when this is a portfolio of smaller ones. */
  count: number
  yearBuilt: number
  quality: number
  maxQuality: number
  occupancy: number
  /** Average annual rent per unit on the leases in place. */
  inPlaceRent: number
  opexAdj: number
  /** 0 (hundreds of small tenants) to 1 (one tenant pays everything). */
  concentration: number
  /** Value adjustment from one-off events: an upzoning, an easement. */
  premium: number
  hidden: HiddenIssue[]
}

export interface Loan {
  kind: LoanKind
  balance: number
  rate: number
  spread: number
  startQ: number
  maturityQ: number
  extensionsLeft: number
}

export interface Plan {
  kind: Exclude<PlanKind, 'hold'>
  budget: number
  spent: number
  quarters: number
  elapsed: number
  qualityGain: number
  /** Occupancy taken offline while the work is under way. */
  drag: number
}

export interface Offer {
  price: number
  buyer: string
  q: number
}

export interface PropertyPoint {
  q: number
  value: number
  noi: number
  occ: number
}

export interface Property extends Asset {
  id: string
  fundId: string
  acquiredQ: number
  purchasePrice: number
  closingCosts: number
  /** Total equity the fund has put in: purchase equity, capex, shortfalls. */
  equity: number
  distributions: number
  /** Equity cash flows by quarter since acquisition: negative in, positive out. */
  flows: number[]
  loan: Loan | null
  plan: Plan | null
  value: number
  noi: number
  lastCashFlow: number
  history: PropertyPoint[]
  offer: Offer | null
  log: Array<{ q: number; text: string; tone: Tone }>
  boughtInPhase: Phase
}

export interface SoldRecord {
  id: string
  name: string
  type: PropertyType
  market: MarketId
  fundId: string
  acquiredQ: number
  soldQ: number
  purchasePrice: number
  salePrice: number
  equity: number
  proceeds: number
  multiple: number
  irr: number | null
  foreclosed: boolean
}

export interface Tombstone {
  id: string
  name: string
  type: PropertyType
  market: MarketId
  price: number
  q: number
  fundNumber: number
}

export interface Deal {
  id: string
  asset: Asset
  seller: SellerKind
  story: string
  ask: number
  bidders: number
  /** Highest rival bid, hidden from the player until the auction resolves. */
  clearing: number
  postedQ: number
  expiresQ: number
  status: 'open' | 'bestfinal' | 'contract' | 'lost' | 'closed' | 'passed' | 'walked'
  /** True for as-is sales: no diligence contingency. */
  asIs: boolean
  bid: number | null
  terms: BidTerms | null
  ddCost: number
  ddDone: boolean
  ddFound: HiddenIssue[]
  retraded: boolean
  credit: number
  lostTo: string | null
  lostAt: number | null
  brokerIrr: number
  /** The building this deal became, once closed. */
  propertyId: string | null
}

export interface BidTerms {
  price: number
  plan: PlanKind
  ltv: number
  loan: LoanKind
}

export interface LpCommitment {
  name: string
  amount: number
}

export interface Fund {
  id: string
  number: number
  name: string
  strategy: Strategy
  vintageQ: number
  size: number
  gpCommit: number
  feeRate: number
  carry: number
  pref: number
  investEndQ: number
  termEndQ: number
  extensions: number
  called: number
  /** Distributions to the fund's investors (the GP's own commitment included), carry excluded. */
  distributed: number
  carryPaid: number
  /** Capital not yet returned plus the preferred return accrued on it. */
  hurdle: number
  feesPaid: number
  status: 'investing' | 'harvesting' | 'liquidated'
  /** Cash held at the fund between a building paying it and the fund distributing it. */
  cash: number
  /** A bank credit line that covers shortfalls once commitments run out, repaid before any distribution. */
  creditLine: number
  accruedCarry: number
  /** Investor net cash flows by quarter since vintage. */
  flows: number[]
  lps: LpCommitment[]
  nav: number
  netIrr: number | null
  tvpi: number
  dpi: number
  /** The J-curve at each quarter-end: cumulative net cash to investors and the NAV still held. */
  curve: Array<{ q: number; net: number; nav: number }>
}

export interface Fundraise {
  number: number
  strategy: Strategy
  target: number
  feeRate: number
  carry: number
  pref: number
  startQ: number
  quarters: number
  elapsed: number
  committed: number
  demand: number
  placementAgent: boolean
  lps: LpCommitment[]
}

export interface Rival {
  id: string
  name: string
  style: string
  aum: number
  focus: PropertyType[]
  aggression: number
}

export interface Effect {
  /** Change to the firm's cash. */
  cash?: number
  /** Cost paid by the property's fund (capital call or reserves). */
  fundCost?: number
  quality?: number
  occ?: number
  rentMult?: number
  opexMult?: number
  premium?: number
  concentration?: number
  sizeMult?: number
  rep?: number
  staff?: { dept: Dept; n: number }
  sellAt?: number
  gpStake?: number
  rateBump?: number
  refi?: { kind: LoanKind; ltv: number }
  raiseCommit?: { name: string; amount: number }
  raiseFee?: number
  foreclose?: boolean
  extendLoan?: boolean
  extendFund?: string
  liquidateFund?: string
  text?: string
  tone?: Tone
  odds?: { p: number; win: Effect; lose: Effect }
}

export interface EventOption {
  label: string
  hint: string
  effect: Effect
}

export interface GameEvent {
  id: string
  kind: string
  q: number
  title: string
  body: string
  propertyId?: string
  fundId?: string
  options: EventOption[]
}

export interface NewsItem {
  q: number
  text: string
  tone: Tone
  tag: 'macro' | 'sector' | 'firm' | 'rival' | 'deal' | 'asset'
}

export interface QuarterReport {
  q: number
  headlines: NewsItem[]
  noi: number
  noiPrev: number
  valueChange: number
  occupancy: number
  calls: number
  distributions: number
  fees: number
  carry: number
  expenses: number
  gpFlows: number
  cashBefore: number
  cashAfter: number
  newDeals: number
  notes: Array<{ text: string; tone: Tone }>
  letter: string[]
}

export interface Firm {
  name: string
  founder: string
  cash: number
  reputation: number
  staff: Record<Dept, number>
  /** Share of fees and carry sold to a GP-stakes investor. */
  stakeSold: number
  carryReceived: number
  feesReceived: number
  /** Last four quarters of fee-related earnings, for the franchise value. */
  fre: number[]
  lastPnl: Pnl
  brokeQuarters: number
  fundraise: Fundraise | null
  gpInvested: number
  gpReturned: number
}

export interface Pnl {
  fees: number
  carry: number
  gpIncome: number
  gpCalls: number
  salaries: number
  overhead: number
  dealCosts: number
  other: number
}

export interface HistoryPoint {
  q: number
  aum: number
  nav: number
  cash: number
  tenYear: number
  policyRate: number
  reputation: number
}

export interface Stats {
  bids: number
  wins: number
  losses: number
  closings: number
  sales: number
  foreclosures: number
  refis: number
  recessionBuys: number
  cashOutRefis: number
  cleanCycles: number
  /** Foreclosures on the books when the current recession began, or -1 outside one. */
  recessionMark: number
  peakAum: number
}

export interface GameState {
  version: 1
  seed: number
  rng: number
  q: number
  quarters: number
  difficulty: Difficulty
  firm: Firm
  macro: Macro
  properties: Property[]
  sold: SoldRecord[]
  tombstones: Tombstone[]
  funds: Fund[]
  deals: Deal[]
  events: GameEvent[]
  news: NewsItem[]
  rivals: Rival[]
  reports: QuarterReport[]
  history: HistoryPoint[]
  achievements: string[]
  stats: Stats
  status: 'playing' | 'ended'
  endReason: 'retired' | 'bankrupt' | null
  nextId: number
  /** Quarter-local bookkeeping that resets every turn. */
  turn: TurnLedger
}

export interface TurnLedger {
  cashStart: number
  calls: number
  distributions: number
  fees: number
  carry: number
  gpIncome: number
  gpCalls: number
  dealCosts: number
  other: number
  notes: Array<{ text: string; tone: Tone }>
}

export interface ActionResult {
  state: GameState
  message?: string
  tone?: Tone
}

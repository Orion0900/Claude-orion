import { appraise, qualityClass } from '../engine/asset'
import { MARKETS, SELLERS, TYPES } from '../engine/data'
import { dryPowder, investingFund } from '../engine/funds'
import { quarterLabel } from '../engine/game'
import type { Deal, GameState } from '../engine/types'
import { money, pct, perUnit, sizeLabel } from '../lib/format'
import { BuildingGlyph, Icon } from './Icons'
import { Chip, Term } from './Shared'

export function statusChip(d: Deal, q: number) {
  if (d.status === 'contract') return <Chip tone="good" solid>Under contract</Chip>
  if (d.status === 'bestfinal') return <Chip tone="warn" solid>Best and final</Chip>
  if (d.status === 'lost') return <Chip tone="bad">Lost to {d.lostTo}</Chip>
  if (d.status === 'closed') return <Chip tone="good">Closed</Chip>
  if (d.status === 'passed' || d.status === 'walked') return <Chip>Passed</Chip>
  return d.expiresQ <= q ? <Chip tone="warn">Last quarter</Chip> : <Chip>Until {quarterLabel(d.expiresQ)}</Chip>
}

export function DealCard({ s, d, onOpen }: { s: GameState; d: Deal; onOpen: () => void }) {
  const a = d.asset
  const ap = appraise(a, s.macro)
  const goingIn = ap.noi / d.ask
  return (
    <button type="button" className={`card deal-card s-${d.status}`} onClick={onOpen}>
      <div className="deal-top">
        <BuildingGlyph type={a.type} size={40} />
        <div className="deal-id">
          <h3>{a.name}</h3>
          <p>
            {TYPES[a.type].label} · {MARKETS[a.market].name} · {sizeLabel(a)}
          </p>
        </div>
        <Icon name="chevron" />
      </div>
      <div className="deal-nums">
        <div>
          <span>Ask</span>
          <strong>{money(d.ask)}</strong>
          <small>{perUnit(d.ask, a)}</small>
        </div>
        <div>
          <span>Going-in cap</span>
          <strong>{pct(goingIn, 2)}</strong>
          <small>Market {pct(ap.cap, 2)}</small>
        </div>
        <div>
          <span>Leased</span>
          <strong>{pct(a.occupancy, 0)}</strong>
          <small>Class {qualityClass(a.quality)}, built {a.yearBuilt}</small>
        </div>
      </div>
      <div className="deal-tags">
        <Chip tone={d.seller === 'offmarket' || d.seller === 'distressed' || d.seller === 'motivated' ? 'info' : undefined}>{SELLERS[d.seller].label}</Chip>
        <Chip>{d.bidders === 1 ? '1 other bidder' : `${d.bidders} other bidders`}</Chip>
        {statusChip(d, s.q)}
      </div>
    </button>
  )
}

export function DealsView({ s, onOpen }: { s: GameState; onOpen: (id: string) => void }) {
  const fund = investingFund(s)
  const live = s.deals.filter((d) => d.status === 'contract' || d.status === 'bestfinal' || d.status === 'open')
  const done = s.deals.filter((d) => !live.includes(d))
  return (
    <div className="view">
      <header className="view-head">
        <div>
          <p className="kicker">Pipeline · {quarterLabel(s.q)}</p>
          <h1>Deals</h1>
        </div>
        <div className="view-head-stat">
          {fund ? (
            <>
              <span>
                <Term t="dry powder">Dry powder</Term>, {fund.name.replace(s.firm.name + ' ', '')}
              </span>
              <strong>{money(dryPowder(s, fund))}</strong>
            </>
          ) : (
            <>
              <span>No fund is investing</span>
              <strong>Raise one</strong>
            </>
          )}
        </div>
      </header>
      <p className="view-lede">
        Brokers send new listings every quarter and each stays open for two. Open one to underwrite it: your inputs are in blue, the model does the rest.
      </p>
      {live.length === 0 && <p className="empty">Nothing on the market right now. New listings arrive next quarter.</p>}
      <div className="card-grid">
        {live.map((d) => (
          <DealCard key={d.id} s={s} d={d} onOpen={() => onOpen(d.id)} />
        ))}
      </div>
      {done.length > 0 && (
        <>
          <h2 className="section-title">This quarter's results</h2>
          <div className="card-grid">
            {done.map((d) => (
              <DealCard key={d.id} s={s} d={d} onOpen={() => onOpen(d.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

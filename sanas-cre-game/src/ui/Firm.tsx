import { useState } from 'react'
import { DEPTS, DEPT_ORDER, MARKETS, TYPES } from '../engine/data'
import { detectionOdds } from '../engine/deals'
import { ACHIEVEMENTS, amSkill, aum, overhead, quarterLabel, retire, salaries, setStaff, START_YEAR } from '../engine/game'
import type { ActionResult, Dept, GameState } from '../engine/types'
import { money, ordinal, pct } from '../lib/format'
import { BuildingGlyph, Icon } from './Icons'
import { Meter, Stat, Term } from './Shared'

export function repTier(rep: number): string {
  return rep >= 80 ? 'Elite' : rep >= 60 ? 'Top tier' : rep >= 40 ? 'Respected' : rep >= 20 ? 'Emerging' : 'Unknown'
}

export function league(s: GameState) {
  const you = { id: 'you', name: s.firm.name, style: 'Your firm', aum: aum(s), you: true }
  const rows = [...s.rivals.map((r) => ({ id: r.id, name: r.name, style: r.style, aum: r.aum, you: false })), you].sort((a, b) => b.aum - a.aum)
  return { rows, rank: rows.findIndex((r) => r.you) + 1 }
}

function effect(s: GameState, d: Dept): string {
  const n = s.firm.staff[d]
  switch (d) {
    case 'acquisitions':
      return `About ${(2.2 + 0.9 * n + s.firm.reputation / 45).toFixed(1)} new deals a quarter, ${pct(0.06 + 0.035 * n + s.firm.reputation / 700, 0)} of them off-market.`
    case 'assetMgmt': {
      const cover = 4 * n + 2
      return `Covers ${cover} buildings (you own ${s.properties.length}). Execution at ${pct(amSkill(s), 0)}.`
    }
    case 'investorRelations':
      return `${n ? `+${n * 8}%` : 'No'} lift to fundraising, and a read on LP appetite.`
    case 'research':
      return `Diligence catches ${pct(detectionOdds(n), 0)} of hidden problems.${n >= 1 ? ' Sector storylines visible.' : ''}${n >= 2 ? ' Recession odds visible.' : ''}`
  }
}

export function FirmView({ s, run, onNewCareer, onHelp }: { s: GameState; run: (fn: (s: GameState) => ActionResult) => ActionResult; onNewCareer: () => void; onHelp: () => void }) {
  const [confirm, setConfirm] = useState<'retire' | 'abandon' | null>(null)
  const pnl = s.firm.lastPnl
  const net = pnl.fees + pnl.carry + pnl.gpIncome - pnl.gpCalls - pnl.salaries - pnl.overhead - pnl.dealCosts + pnl.other
  const fre = s.firm.fre.reduce((a, b) => a + b, 0)
  const burn = (salaries(s) + overhead(s)) / 4
  const { rows, rank } = league(s)
  const shelf = [...s.tombstones].reverse()
  return (
    <div className="view">
      <header className="view-head">
        <div>
          <p className="kicker">
            Founded {START_YEAR} by {s.firm.founder}
          </p>
          <h1>{s.firm.name}</h1>
        </div>
        <div className="view-head-stat">
          <span>League table</span>
          <strong>
            {ordinal(rank)} of {rows.length}
          </strong>
        </div>
      </header>

      <section className="card panel-card">
        <h2 className="section-title">Reputation</h2>
        <div className="rep-row">
          <strong className="rep-number">{Math.round(s.firm.reputation)}</strong>
          <div className="rep-meter">
            <Meter value={s.firm.reputation / 100} label="Reputation" tone="good" />
            <span>{repTier(s.firm.reputation)}. It drifts toward your fund returns, your size, your IR team and your realized deals. Foreclosures and failed raises knock it down.</span>
          </div>
        </div>
      </section>

      <section className="card panel-card">
        <h2 className="section-title">Team</h2>
        <ul className="team">
          {DEPT_ORDER.map((d) => (
            <li key={d}>
              <div className="team-info">
                <strong>{DEPTS[d].label}</strong>
                <span>{effect(s, d)}</span>
                <small>{money(DEPTS[d].salary)} a year each, fully loaded</small>
              </div>
              <div className="stepper" role="group" aria-label={`${DEPTS[d].label} headcount`}>
                <button type="button" className="icon-btn" aria-label={`Cut one from ${DEPTS[d].label}`} disabled={s.firm.staff[d] === 0} onClick={() => run((x) => setStaff(x, d, -1))}>
                  <Icon name="minus" />
                </button>
                <output>{s.firm.staff[d]}</output>
                <button type="button" className="icon-btn" aria-label={`Hire into ${DEPTS[d].label}`} disabled={s.firm.staff[d] >= 12} onClick={() => run((x) => setStaff(x, d, 1))}>
                  <Icon name="plus" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="aside">{s.firm.founder} covers the gaps. Cutting someone costs a quarter's salary in severance.</p>
      </section>

      <section className="card panel-card">
        <h2 className="section-title">The management company, last quarter</h2>
        <table className="ledger">
          <tbody>
            <tr><th><Term t="management fee">Management fees</Term></th><td>{money(pnl.fees)}</td></tr>
            <tr><th><Term t="carry">Carried interest</Term></th><td>{money(pnl.carry)}</td></tr>
            <tr><th>Returns on your <Term t="gp commitment">GP commitment</Term></th><td>{money(pnl.gpIncome)}</td></tr>
            <tr><th>GP commitment calls</th><td>−{money(pnl.gpCalls)}</td></tr>
            <tr><th>Salaries</th><td>−{money(pnl.salaries)}</td></tr>
            <tr><th>Rent, systems, audit</th><td>−{money(pnl.overhead)}</td></tr>
            {pnl.dealCosts !== 0 && <tr><th>Dead deal costs</th><td>−{money(pnl.dealCosts)}</td></tr>}
            {pnl.other !== 0 && <tr><th>Other</th><td>{money(pnl.other)}</td></tr>}
            <tr className="total"><th>Net cash flow</th><td className={net >= 0 ? 'good' : 'bad'}>{money(net)}</td></tr>
          </tbody>
        </table>
        <div className="stat-grid">
          <Stat label="Firm cash" value={money(s.firm.cash)} tone={s.firm.cash < 0 ? 'bad' : undefined} />
          <Stat label="Fee earnings, last 4 quarters" term="fre" value={money(fre)} tone={fre >= 0 ? 'good' : 'bad'} />
          <Stat label="Running costs" value={`${money(burn)} a quarter`} />
          {s.firm.stakeSold > 0 && <Stat label="Sold to GP-stakes" term="gp stake" value={pct(s.firm.stakeSold, 0)} />}
        </div>
      </section>

      <section className="card panel-card">
        <h2 className="section-title">League table</h2>
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col" className="left">Firm</th>
                <th scope="col">
                  <Term t="aum">AUM</Term>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.you ? 'you' : ''}>
                  <td>{i + 1}</td>
                  <th scope="row">
                    {r.name}
                    <small>{r.style}</small>
                  </th>
                  <td>{money(r.aum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card panel-card">
        <h2 className="section-title">Tombstones</h2>
        {shelf.length ? (
          <div className="shelf">
            {shelf.map((t) => {
              const sold = s.sold.find((x) => x.id === t.id)
              return (
                <div key={t.id} className={`tombstone t-${t.type}`}>
                  <BuildingGlyph type={t.type} size={30} />
                  <strong>{t.name}</strong>
                  <span>{money(t.price)}</span>
                  <small>
                    {TYPES[t.type].label} · {MARKETS[t.market].short} · {quarterLabel(t.q)}
                  </small>
                  {sold && <em className={sold.foreclosed ? 'bad' : sold.multiple >= 1 ? 'good' : 'bad'}>{sold.foreclosed ? 'Foreclosed' : `Sold ${sold.multiple.toFixed(2)}x`}</em>}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="aside">Every closing earns a lucite tombstone for the shelf. The shelf is empty.</p>
        )}
      </section>

      <section className="card panel-card">
        <h2 className="section-title">
          Achievements · {s.achievements.length} of {ACHIEVEMENTS.length}
        </h2>
        <ul className="achievements">
          {ACHIEVEMENTS.map((a) => {
            const got = s.achievements.includes(a.id)
            return (
              <li key={a.id} className={got ? 'got' : ''}>
                <Icon name={got ? 'trophy' : 'spark'} size={18} />
                <div>
                  <strong>{a.title}</strong>
                  <span>{a.desc}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card panel-card">
        <h2 className="section-title">Career</h2>
        <p className="aside">
          {quarterLabel(s.q)}: quarter {s.q + 1} of {s.quarters}. Seed {s.seed}.
        </p>
        {confirm === null && (
          <div className="btn-row">
            <button type="button" className="btn" onClick={onHelp}>
              How to play
            </button>
            <button type="button" className="btn" onClick={() => setConfirm('retire')}>
              Retire now
            </button>
            <button type="button" className="btn ghost" onClick={() => setConfirm('abandon')}>
              Start a new career
            </button>
          </div>
        )}
        {confirm === 'retire' && (
          <div className="confirm">
            <p>Retire today and take what you've built? The career ends and is scored.</p>
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                Keep going
              </button>
              <button type="button" className="btn primary" onClick={() => run((x) => retire(x))}>
                Retire
              </button>
            </div>
          </div>
        )}
        {confirm === 'abandon' && (
          <div className="confirm">
            <p>Start a new career? This one ends unscored when the new one begins.</p>
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                Keep going
              </button>
              <button type="button" className="btn danger" onClick={onNewCareer}>
                Set up a new career
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

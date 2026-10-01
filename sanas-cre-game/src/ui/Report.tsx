import { quarterLabel, score } from '../engine/game'
import type { GameState, QuarterReport } from '../engine/types'
import { money, mult, pct, signedMoney } from '../lib/format'
import { Sheet, Stat, toneOf } from './Shared'

/** The quarterly letter to LPs, with the numbers behind it. */
export function ReportSheet({ s, report, onClose }: { s: GameState; report: QuarterReport; onClose: () => void }) {
  const cashDelta = report.cashAfter - report.cashBefore
  return (
    <Sheet
      onClose={onClose}
      kicker="Quarterly update"
      title={`${quarterLabel(report.q)} letter`}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          On to {quarterLabel(report.q + 1)}
        </button>
      }
    >
      <section className="panel letter">
        <p>Dear limited partners,</p>
        {report.letter.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        <p className="signoff">{s.firm.founder}, Managing Partner</p>
      </section>

      <section className="panel">
        <h3 className="panel-title">The quarter in numbers</h3>
        <div className="stat-grid">
          <Stat label="NOI, annualized" term="noi" value={money(report.noi)} sub={report.noiPrev ? signedMoney(report.noi - report.noiPrev) : undefined} tone={toneOf(report.noi - report.noiPrev)} />
          <Stat label="Change in values" value={signedMoney(report.valueChange)} tone={toneOf(report.valueChange)} />
          <Stat label="Leased" term="occupancy" value={report.occupancy ? pct(report.occupancy, 1) : '–'} />
          <Stat label="Capital called" value={money(report.calls)} />
          <Stat label="Distributed to LPs" value={money(report.distributions)} tone={report.distributions > 0 ? 'good' : undefined} />
          <Stat label="Carry to you" term="carry" value={money(report.carry)} tone={report.carry > 0 ? 'good' : undefined} />
          <Stat label="Fees earned" term="management fee" value={money(report.fees)} />
          <Stat label="Firm costs" value={money(report.expenses)} />
          <Stat label="Firm cash" value={money(report.cashAfter)} sub={`${signedMoney(cashDelta)} this quarter`} tone={toneOf(cashDelta)} />
        </div>
      </section>

      {report.notes.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">What happened</h3>
          <ul className="log">
            {report.notes.map((n, i) => (
              <li key={i} className={`n-${n.tone}`}>
                {n.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.headlines.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">Headlines</h3>
          <ul className="news">
            {report.headlines.map((n, i) => (
              <li key={i} className={`n-${n.tone}`}>
                {n.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.newDeals > 0 && <p className="aside">{report.newDeals} new listing{report.newDeals === 1 ? '' : 's'} hit your desk.</p>}
    </Sheet>
  )
}

export function EndScreen({ s, onNew, onTitle }: { s: GameState; onNew: () => void; onTitle: () => void }) {
  const result = score(s)
  const realized = s.sold.filter((x) => !x.foreclosed)
  const best = [...realized].sort((a, b) => (b.irr ?? -1) - (a.irr ?? -1))[0]
  const bankrupt = s.endReason === 'bankrupt'
  return (
    <div className="end">
      <div className="end-card">
        <p className="kicker">{bankrupt ? `The firm folded in ${quarterLabel(s.q - 1)}` : `${s.firm.founder} retires, ${quarterLabel(Math.max(0, s.q - 1))}`}</p>
        <h1>{result.title}</h1>
        <p className="end-blurb">{result.blurb}</p>
        <div className="end-worth">
          <span>Net worth</span>
          <strong>{money(result.netWorth)}</strong>
        </div>
        <div className="stat-grid">
          <Stat label="Firm cash" value={money(result.cash)} />
          <Stat label="GP commitments" term="gp commitment" value={money(result.gpNav)} />
          <Stat label="Carry still to come" term="carry" value={money(result.carry)} />
          <Stat label="The management company" term="fre" value={money(result.franchise)} sub="Eight times fee earnings" />
        </div>
        <h2 className="section-title">Funds</h2>
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th scope="col">Fund</th>
                <th scope="col">Size</th>
                <th scope="col">Net IRR</th>
                <th scope="col">TVPI</th>
              </tr>
            </thead>
            <tbody>
              {s.funds.map((f) => (
                <tr key={f.id}>
                  <th scope="row">{f.name.replace(s.firm.name + ' ', '')}</th>
                  <td>{money(f.size)}</td>
                  <td className={(f.netIrr ?? 0) >= 0 ? 'good' : 'bad'}>{pct(f.netIrr, 1)}</td>
                  <td>{mult(f.tvpi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="stat-grid">
          <Stat label="Buildings bought" value={String(s.tombstones.length)} />
          <Stat label="Sold" value={String(realized.length)} />
          <Stat label="Foreclosures" value={String(s.stats.foreclosures)} tone={s.stats.foreclosures ? 'bad' : undefined} />
          <Stat label="Peak AUM" term="aum" value={money(s.stats.peakAum)} />
          <Stat label="Carry earned" value={money(s.firm.carryReceived)} />
          <Stat label="Best deal" value={best ? `${pct(best.irr, 1)} IRR` : '–'} sub={best?.name} />
        </div>
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={onTitle}>
            Title screen
          </button>
          <button type="button" className="btn primary" onClick={onNew}>
            Start a new career
          </button>
        </div>
      </div>
    </div>
  )
}

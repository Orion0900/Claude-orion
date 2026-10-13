import { setBonus, setBonusShare, setGross, takeHomeShare, type Budget } from '../lib/budget'
import { money, percent } from '../lib/money'
import { MoneyInput, PercentInput } from './Fields'

type Update = (change: (b: Budget) => Budget) => void

/**
 * Pay before taxes: gross income and the bonus, both a year. For reference
 * beside the budget, which runs on the net paycheck: the bonus isn't in the
 * month's income.
 */
export function GrossSection({ budget: b, update }: { budget: Budget; update: Update }) {
  const kept = takeHomeShare(b)
  const any = b.gross > 0 || b.bonus > 0

  return (
    <section className="section gross" aria-labelledby="gross-title">
      <div className="section-head">
        <h2 className="eyebrow" id="gross-title">
          Gross pay
        </h2>
        <span className="section-aside">before taxes</span>
      </div>

      <div className="buckets">
        <div className="bucket pay-tile">
          <div className="bucket-head">Gross income</div>
          <MoneyInput id="gross" className="bucket-money" value={b.gross} label="Gross income a year" blank onChange={(n) => update((x) => setGross(x, n))} />
          <div className="bucket-line">a year</div>
        </div>

        <div className="bucket pay-tile">
          <div className="bucket-head">Bonus</div>
          <MoneyInput id="bonus" className="bucket-money" value={b.bonus} label="Bonus a year" blank onChange={(n) => update((x) => setBonus(x, n))} />
          <div className="bucket-line">
            {b.gross > 0 ? (
              <>
                <PercentInput id="bonus-pct" value={b.bonus / b.gross} max={10} label="Bonus, percent of gross income" onChange={(n) => update((x) => setBonusShare(x, n))} />
                <span>of gross</span>
              </>
            ) : (
              'a year'
            )}
          </div>
        </div>
      </div>

      {any ? (
        <dl className="facts gross-facts">
          <div>
            <dt>Total a year</dt>
            <dd className="num">{money(b.gross + b.bonus)}</dd>
          </div>
          <div>
            <dt>Gross a month</dt>
            <dd className="num">{money(b.gross / 12)}</dd>
          </div>
          <div>
            <dt>Take-home</dt>
            <dd className="num">{kept === null ? '–' : percent(kept)}</dd>
          </div>
        </dl>
      ) : (
        <p className="note-line">Add your gross income and bonus to see them beside the take-home pay.</p>
      )}
      {kept !== null && <p className="note-line">Take-home is a year of net paychecks as a share of gross. The bonus stays out of the monthly income.</p>}
    </section>
  )
}

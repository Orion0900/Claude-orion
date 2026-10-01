import { useState } from 'react'
import { DIFFICULTIES, STRATEGIES } from '../engine/data'
import { quarterLabel, type NewGameOptions } from '../engine/game'
import type { Difficulty, GameState, Strategy } from '../engine/types'
import { money, pct } from '../lib/format'
import type { HallEntry } from '../lib/storage'
import { Segmented, Sheet } from './Shared'
import { Skyline } from './Skyline'

export function TitleScreen({
  saved,
  hall,
  onContinue,
  onNew,
  onHelp,
}: {
  saved: GameState | null
  hall: HallEntry[]
  onContinue: () => void
  onNew: () => void
  onHelp: () => void
}) {
  return (
    <div className="title-screen">
      <div className="title-sky">
        <Skyline demo buildings={[]} phase="expansion" height={300} label="A city skyline at dusk" />
      </div>
      <div className="title-body">
        <p className="kicker">A real estate private equity game</p>
        <h1 className="game-title">
          Sana's <span>CRE</span> Game
        </h1>
        <p className="title-lede">
          Start with a small first fund. Buy buildings, fix them up, survive the cycle, return the money and raise
          the next fund, bigger. Twenty years from now, how big is your skyline?
        </p>
        <div className="title-actions">
          {saved && saved.status === 'playing' && (
            <button type="button" className="btn primary big" onClick={onContinue}>
              Continue · {saved.firm.name}, {quarterLabel(saved.q)}
            </button>
          )}
          <button type="button" className={saved && saved.status === 'playing' ? 'btn big' : 'btn primary big'} onClick={onNew}>
            New career
          </button>
          <button type="button" className="btn ghost big" onClick={onHelp}>
            How to play
          </button>
        </div>
        {hall.length > 0 && (
          <section className="hall">
            <h2 className="section-title">Hall of fame</h2>
            <ol>
              {hall.map((h, i) => (
                <li key={i}>
                  <span className="hall-rank">{i + 1}</span>
                  <span className="hall-firm">
                    <strong>{h.firm}</strong>
                    <small>
                      {h.title} · {h.years} years · {DIFFICULTIES[h.difficulty as Difficulty]?.label ?? h.difficulty}
                    </small>
                  </span>
                  <span className="hall-worth">{money(h.netWorth)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

export function NewCareer({ onStart, onBack }: { onStart: (o: NewGameOptions) => void; onBack: () => void }) {
  const [firmName, setFirmName] = useState('Sana Capital Partners')
  const [founder, setFounder] = useState('Sana')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [years, setYears] = useState('15')
  const [strategy, setStrategy] = useState<Strategy>('valueadd')
  return (
    <div className="setup">
      <form
        className="setup-card"
        onSubmit={(e) => {
          e.preventDefault()
          onStart({ firmName, founder, difficulty, years: Number(years), strategy })
        }}
      >
        <p className="kicker">New career</p>
        <h1>Open the firm</h1>
        <div className="field-row">
          <label className="text-field" htmlFor="firm-name">
            <span>Firm name</span>
            <input id="firm-name" value={firmName} maxLength={40} onChange={(e) => setFirmName(e.target.value)} />
          </label>
          <label className="text-field" htmlFor="founder-name">
            <span>Founder</span>
            <input id="founder-name" value={founder} maxLength={24} onChange={(e) => setFounder(e.target.value)} />
          </label>
        </div>

        <fieldset className="field">
          <legend>How you start</legend>
          <div className="choice-grid">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
              <button key={d} type="button" className={d === difficulty ? 'choice on' : 'choice'} aria-pressed={d === difficulty} onClick={() => setDifficulty(d)}>
                <strong>{DIFFICULTIES[d].label}</strong>
                <span>
                  {money(DIFFICULTIES[d].fund)} fund · {money(DIFFICULTIES[d].cash)} cash
                </span>
                <small>{DIFFICULTIES[d].blurb}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Fund I strategy</legend>
          <div className="choice-grid">
            {(Object.keys(STRATEGIES) as Strategy[]).map((k) => (
              <button key={k} type="button" className={k === strategy ? 'choice on' : 'choice'} aria-pressed={k === strategy} onClick={() => setStrategy(k)}>
                <strong>{STRATEGIES[k].label}</strong>
                <span>
                  {pct(STRATEGIES[k].fee, 2)} fee · {pct(STRATEGIES[k].carry, 0)} carry · targets {pct(STRATEGIES[k].target, 0)}
                </span>
                <small>{STRATEGIES[k].blurb}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Career length</legend>
          <Segmented<string>
            label="Career length"
            value={years}
            onChange={setYears}
            options={[
              { value: '10', label: '10 years', sub: '40 quarters' },
              { value: '15', label: '15 years', sub: '60 quarters' },
              { value: '20', label: '20 years', sub: '80 quarters' },
            ]}
          />
        </fieldset>

        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="btn primary">
            Open the doors
          </button>
        </div>
      </form>
    </div>
  )
}

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} kicker="How to play" title="Running a real estate private equity firm">
      <section className="panel prose">
        <h3>The goal</h3>
        <p>
          You are the founder and managing partner. Investors (LPs) commit money to your funds; you buy buildings with
          it, make them worth more and sell them. The firm earns a management fee on every fund and 20% of the profits,
          the carried interest, once LPs have their money back plus an 8% preferred return. Your score at retirement is
          what you've built: the firm's cash, your own stake in the funds, carry still to come, and what the
          management company is worth.
        </p>
        <h3>A quarter</h3>
        <p>
          Each turn is three months. Underwrite and bid on deals, manage your buildings, staff the firm and raise funds,
          then end the quarter. Rent comes in, loans get paid, the economy moves and new deals arrive. Some decisions
          land on your desk and must be answered before the quarter can end.
        </p>
        <h3>Buying</h3>
        <p>
          Every deal has an asking price, a story and some competition. Your model shows the levered IRR for your bid,
          business plan and loan. Wide auctions get bid up to what the keenest rival will accept; off-market,
          distressed and motivated sellers are where the bargains are. Win, then order diligence to find hidden
          problems (and ask for a price cut), or close as-is and hope.
        </p>
        <h3>Running buildings</h3>
        <p>
          Lit windows on your skyline are occupancy. Leases roll to market rent over time; a value-add program or a
          full repositioning raises quality, rents and occupancy but takes part of the building offline. Watch your
          loans: bridge debt floats with the Fed, and every loan matures. In a recession, lenders lend less, so
          refinancing can cost equity. You can always sell, or hand back the keys.
        </p>
        <h3>Funds</h3>
        <p>
          A fund buys for three years and must sell everything within seven, plus up to two extensions. LPs judge you
          on net IRR against your strategy's target, and on cash actually returned. Beat the target and the next fund
          can be bigger. Once a fund is 70% committed and two years old, you can raise the next one; it takes three
          quarters on the road.
        </p>
        <h3>The firm</h3>
        <p>
          Fees pay salaries. Acquisitions brings more and better deals; asset management runs buildings better;
          investor relations helps you raise; research catches problems and reads the cycle. Run out of cash two
          quarters in a row and the firm folds.
        </p>
        <h3>Tips from the old hands</h3>
        <ul>
          <li>Buy in recessions and recoveries. Sell late in the cycle.</li>
          <li>Leverage is a loaded gun. Bridge loans at high LTV can wipe out equity in a downturn.</li>
          <li>The sensitivity table tells you how wrong you can be and still make money.</li>
          <li>DPI matters to LPs. Return some cash before you ask for more.</li>
        </ul>
      </section>
    </Sheet>
  )
}

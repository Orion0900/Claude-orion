import type { DateKey } from '../lib/dates'
import { HAPPINESS, OFFER, WHY } from '../lib/plan'
import { RoutineList } from './Routine'
import { RulesList } from './Shared'

/** The whiteboard: why, the rules, the routine, happiness and the offer. */
export function PlanView({ today }: { today: DateKey }) {
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Plan</h1>
      </header>

      <section className="why">
        <h2 className="board-title">Why</h2>
        <p className="why-quote">{WHY}</p>
      </section>

      <section className="card">
        <h2 className="board-title volt">92 Hard</h2>
        <RulesList />
      </section>

      <section className="card">
        <h2 className="board-title">Routine</h2>
        <RoutineList today={today} />
      </section>

      <section className="card">
        <h2 className="board-title">Happiness</h2>
        <ul className="happiness">
          {HAPPINESS.map((thing) => (
            <li key={thing}>{thing}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="board-title">Offer</h2>
        <p className="offer">
          <b>{OFFER.lead}</b> {OFFER.rest}
        </p>
      </section>
    </>
  )
}

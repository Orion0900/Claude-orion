import { useCallback, useEffect, useState } from 'react'
import { PHASES } from '../engine/data'
import { dryPowder, investingFund } from '../engine/funds'
import { endQuarter, pending, quarterLabel } from '../engine/game'
import type { ActionResult, GameState, Tone } from '../engine/types'
import { lookup } from '../lib/glossary'
import { money } from '../lib/format'
import { DealsView } from './Deals'
import { DeskView, type Open } from './Desk'
import { FirmView } from './Firm'
import { FundsView, RaiseSheet } from './Funds'
import { Icon, type IconName } from './Icons'
import { MarketsSheet } from './Markets'
import { AssetSheet, PortfolioView } from './Portfolio'
import { ReportSheet } from './Report'
import { Chip, GlossaryContext } from './Shared'
import { HelpSheet } from './Title'
import { UnderwriteSheet } from './Underwrite'

type Tab = 'desk' | 'deals' | 'portfolio' | 'funds' | 'firm'

const TABS: Array<{ id: Tab; icon: IconName; label: string }> = [
  { id: 'desk', icon: 'desk', label: 'Desk' },
  { id: 'deals', icon: 'deals', label: 'Deals' },
  { id: 'portfolio', icon: 'portfolio', label: 'Portfolio' },
  { id: 'funds', icon: 'funds', label: 'Funds' },
  { id: 'firm', icon: 'firm', label: 'Firm' },
]

interface Toast {
  n: number
  text: string
  tone: Tone
}

export function Game({ state, setState, onNewCareer }: { state: GameState; setState: (s: GameState) => void; onNewCareer: () => void }) {
  const [tab, setTab] = useState<Tab>('desk')
  const [open, setOpen] = useState<Open | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [term, setTerm] = useState<string | null>(null)
  const s = state

  const say = useCallback((text: string, tone: Tone = 'neutral') => setToast((t) => ({ n: (t?.n ?? 0) + 1, text, tone })), [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.tone === 'bad' ? 6000 : 4200)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    if (!term) return
    const timer = setTimeout(() => setTerm(null), 12000)
    return () => clearTimeout(timer)
  }, [term])
  useEffect(() => window.scrollTo(0, 0), [tab])

  const run = (fn: (x: GameState) => ActionResult): ActionResult => {
    const r = fn(s)
    if (r.state !== s) setState(r.state)
    if (r.message) say(r.message, r.tone)
    return r
  }

  const blocking = pending(s)
  const finish = () => {
    if (blocking.length) {
      const first = blocking[0]
      if (first.kind === 'deal') setOpen({ kind: 'deal', id: first.id })
      else setTab('desk')
      say(`Before the quarter ends: ${first.label}.`, 'neutral')
      return
    }
    const r = endQuarter(s)
    setState(r.state)
    if (r.message) say(r.message, r.tone)
    else if (r.state.status === 'playing') setOpen({ kind: 'report' })
  }

  const close = useCallback(() => setOpen(null), [])
  const fund = investingFund(s)
  const deal = open?.kind === 'deal' ? s.deals.find((d) => d.id === open.id) : undefined
  const asset = open?.kind === 'asset' ? s.properties.find((p) => p.id === open.id) : undefined

  return (
    <GlossaryContext.Provider value={setTerm}>
      <div className="app">
        <header className="topbar">
          <div className="topbar-id">
            <span className="monogram" aria-hidden="true">{initials(s.firm.name)}</span>
            <div>
              <strong className="topbar-q">{quarterLabel(s.q)}</strong>
              <Chip tone={s.macro.phase === 'recession' ? 'bad' : s.macro.phase === 'late' ? 'warn' : 'good'}>{PHASES[s.macro.phase].label}</Chip>
            </div>
          </div>
          <dl className="topbar-stats">
            <div>
              <dt>Cash</dt>
              <dd className={s.firm.cash < 0 ? 'bad' : ''}>{money(s.firm.cash)}</dd>
            </div>
            <div className="wide-only">
              <dt>Dry powder</dt>
              <dd>{fund ? money(dryPowder(s, fund)) : '–'}</dd>
            </div>
            <div className="wide-only">
              <dt>10-yr</dt>
              <dd>{(s.macro.tenYear * 100).toFixed(2)}%</dd>
            </div>
          </dl>
          <button type="button" className="icon-btn help-btn" aria-label="How to play" onClick={() => setOpen({ kind: 'help' })}>
            <Icon name="help" />
          </button>
          <button type="button" className={blocking.length ? 'btn end-btn waiting' : 'btn primary end-btn'} onClick={finish}>
            {blocking.length ? `${blocking.length} to decide` : `End ${quarterLabel(s.q).split(' ')[0]}`}
            <Icon name="arrow" size={18} />
          </button>
        </header>

        <nav className="tabbar" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'tab on' : 'tab'} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
              {t.id === 'desk' && s.events.length > 0 && <i className="badge">{s.events.length}</i>}
              {t.id === 'deals' && s.deals.some((d) => d.status === 'contract' || d.status === 'bestfinal') && <i className="badge">!</i>}
            </button>
          ))}
        </nav>

        <main className="main" key={tab}>
          {tab === 'desk' && <DeskView s={s} run={run} open={setOpen} goTo={setTab} />}
          {tab === 'deals' && <DealsView s={s} onOpen={(id) => setOpen({ kind: 'deal', id })} />}
          {tab === 'portfolio' && <PortfolioView s={s} onOpen={(id) => setOpen({ kind: 'asset', id })} />}
          {tab === 'funds' && <FundsView s={s} run={run} onRaise={() => setOpen({ kind: 'raise' })} />}
          {tab === 'firm' && <FirmView s={s} run={run} onNewCareer={onNewCareer} onHelp={() => setOpen({ kind: 'help' })} />}
        </main>

        {deal && <UnderwriteSheet key={deal.id + deal.status} s={s} deal={deal} run={run} onClose={close} onViewProperty={(id) => setOpen({ kind: 'asset', id })} />}
        {asset && <AssetSheet key={asset.id} s={s} p={asset} run={run} onClose={close} />}
        {open?.kind === 'raise' && <RaiseSheet s={s} run={run} onClose={close} />}
        {open?.kind === 'markets' && <MarketsSheet s={s} onClose={close} />}
        {open?.kind === 'report' && s.reports[0] && <ReportSheet s={s} report={s.reports[0]} onClose={close} />}
        {open?.kind === 'help' && <HelpSheet onClose={close} />}

        {toast && (
          <div className={`toast ${toast.tone}`} role="status" key={toast.n} onClick={() => setToast(null)}>
            {toast.text}
          </div>
        )}
        {term && (
          <div className="glossary" role="note" onClick={() => setTerm(null)}>
            <strong>{term}</strong>
            <span>{lookup(term)}</span>
          </div>
        )}
      </div>
    </GlossaryContext.Provider>
  )
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w))
  return (words[0]?.[0] ?? 'S') + (words[1]?.[0] ?? '')
}

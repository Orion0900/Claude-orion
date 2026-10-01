import { useEffect, useRef, useState } from 'react'
import { aum, newGame, score, type NewGameOptions } from './engine/game'
import type { GameState } from './engine/types'
import { addToHall, loadGame, loadHall, saveGame, type HallEntry } from './lib/storage'
import { Game } from './ui/Game'
import { EndScreen } from './ui/Report'
import { HelpSheet, NewCareer, TitleScreen } from './ui/Title'

type Screen = 'title' | 'new' | 'game' | 'end'

interface Hot {
  snapshot?: (fn: () => unknown) => void
}

function hot(): Hot | undefined {
  return (window as Window & { claude?: { hot?: Hot } }).claude?.hot
}

export default function App({ restored }: { restored?: GameState | null }) {
  const [game, setGame] = useState<GameState | null>(() => restored ?? loadGame())
  const [screen, setScreen] = useState<Screen>(() => (restored?.status === 'playing' ? 'game' : 'title'))
  const [hall, setHall] = useState<HallEntry[]>(loadHall)
  const [help, setHelp] = useState(false)
  const [saved, setSaved] = useState(true)
  const latest = useRef(game)
  latest.current = game
  const scored = useRef<string | null>(null)

  useEffect(() => {
    if (game) setSaved(saveGame(game))
  }, [game])

  useEffect(() => {
    // Keeps the career through a page update in hosts that offer one.
    try {
      hot()?.snapshot?.(() => ({ save: latest.current }))
    } catch {
      // The browser's own save covers it.
    }
  }, [])

  useEffect(() => {
    if (!game || game.status !== 'ended' || screen !== 'game') return
    const id = `${game.seed}:${game.q}:${game.firm.name}`
    if (scored.current !== id) {
      scored.current = id
      const result = score(game)
      const best = game.funds.reduce<number | null>((b, f) => (f.netIrr !== null && (b === null || f.netIrr > b) ? f.netIrr : b), null)
      setHall(
        addToHall({
          firm: game.firm.name, founder: game.firm.founder, title: result.title, netWorth: result.netWorth, aum: aum(game),
          funds: game.funds.length, bestIrr: best, years: Math.round(game.quarters / 4), difficulty: game.difficulty,
          endedOn: new Date().toISOString().slice(0, 10), bankrupt: game.endReason === 'bankrupt',
        }),
      )
    }
    setScreen('end')
  }, [game, screen])

  const start = (o: NewGameOptions) => {
    setGame(newGame(o))
    setScreen('game')
  }

  return (
    <>
      {screen === 'title' && (
        <TitleScreen
          saved={game}
          hall={hall}
          onContinue={() => setScreen(game?.status === 'ended' ? 'end' : 'game')}
          onNew={() => setScreen('new')}
          onHelp={() => setHelp(true)}
        />
      )}
      {screen === 'new' && <NewCareer onStart={start} onBack={() => setScreen('title')} />}
      {screen === 'game' && game && <Game state={game} setState={setGame} onNewCareer={() => setScreen('new')} />}
      {screen === 'end' && game && <EndScreen s={game} onNew={() => setScreen('new')} onTitle={() => setScreen('title')} />}
      {help && <HelpSheet onClose={() => setHelp(false)} />}
      {!saved && screen === 'game' && (
        <p className="save-warning" role="alert">
          This browser isn't saving your career right now. Keep the tab open to keep playing.
        </p>
      )}
    </>
  )
}

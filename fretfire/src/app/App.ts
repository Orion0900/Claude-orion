import { AudioEngine } from '../audio/engine'
import { AudioClock, SongPlayer } from '../audio/player'
import { playSfx, scheduleClick } from '../audio/sfx'
import {
  DIFFICULTIES,
  DIFFICULTY_NAMES,
  INSTRUMENT_NAMES,
  availableParts,
  findTrack,
  type Chart,
  type Difficulty,
  type Instrument,
} from '../chart/types'
import { Game } from '../game/Game'
import { eventTime } from '../game/input'
import { soloGrade, type Results } from '../game/session'
import { requestPersistence, saveSong } from '../library/db'
import { importFiles } from '../library/importer'
import { button, formatTime, h, segmented, slider, stars, toggle } from '../ui/dom'
import { albumArt, listLibrary, loadEntryChart, loadStems, previewAudio, removeFromLibrary, type SongEntry } from './library'
import { bestForSong, getBest, recordScore } from './scores'
import { loadSettings, saveSettings, type Settings } from './settings'

/**
 * The app shell: one screen at a time (title, songs, game, results,
 * calibration) plus sliding sheets (song setup, settings, import, help).
 */

interface Screen {
  el: HTMLElement
  destroy?: () => void
}

interface Setup {
  entry: SongEntry
  instrument: Instrument
  difficulty: Difficulty
  rate: number
}

interface Sheet {
  body: HTMLElement
  close: () => void
}

const LAST_KEY = 'fretfire.last.v1'
const SCHEME_HINTS = {
  tap: 'Tap a lane as its note crosses the line. Tap chords with two fingers and keep holding for sustains.',
  guitar: 'Hold the fret buttons at the bottom and tap anywhere above them to strum, like a guitar controller. HOPOs and taps need no strum.',
}

interface LastPlayed {
  id?: string
  instrument?: Instrument
  difficulty?: Difficulty
}

function readLast(): LastPlayed {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as LastPlayed
  } catch {
    return {}
  }
}

function writeLast(last: LastPlayed): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(last))
  } catch {
    // Not critical.
  }
}

export class App {
  readonly engine = new AudioEngine()
  settings: Settings
  private screen: Screen | null = null
  private sheet: HTMLElement | null = null
  private closeSheetFn: (() => void) | null = null
  private game: Game | null = null
  private readonly preview: Preview
  private readonly bot = new URLSearchParams(location.search).has('bot')
  private wake: WakeLockSentinel | null = null
  private toastTimer = 0
  /** The last results, for tests and the debug handle. */
  lastResults: Results | null = null

  constructor(private readonly root: HTMLElement) {
    this.settings = loadSettings()
    this.engine.setVolumes(this.settings.musicVolume, this.settings.sfxVolume)
    this.preview = new Preview(this.engine)
    // Audio may only start inside a gesture; any first touch or key will do.
    const unlock = () => this.engine.unlock()
    for (const type of ['touchend', 'click', 'keydown', 'pointerup']) window.addEventListener(type, unlock, { capture: true })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.preview.stop()
      else this.engine.resume()
    })
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.closeSheetFn && !this.game) this.closeSheetFn()
    })
  }

  start(): void {
    const params = new URLSearchParams(location.search)
    const play = params.get('play')
    if (play) {
      const rate = Number(params.get('rate')) || 1
      void this.quickPlay(play, (params.get('part') as Instrument) || 'guitar', (params.get('diff') as Difficulty) || 'expert', rate)
      return
    }
    this.showTitle()
  }

  // ── plumbing ─────────────────────────────────────────────────────────

  private setScreen(screen: Screen | null): void {
    this.screen?.destroy?.()
    this.screen?.el.remove()
    this.screen = screen
    if (screen) this.root.appendChild(screen.el)
  }

  private openSheet(className: string, onClose?: () => void): Sheet {
    this.closeSheetFn?.()
    const body = h('div', { class: `sheet ${className}`, attrs: { role: 'dialog', 'aria-modal': 'true' } })
    const backdrop = h('div', { class: 'sheet-backdrop' }, body)
    const close = () => {
      if (this.sheet !== backdrop) return
      this.sheet = null
      this.closeSheetFn = null
      backdrop.classList.add('closing')
      window.setTimeout(() => backdrop.remove(), 220)
      onClose?.()
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close()
    })
    this.root.appendChild(backdrop)
    this.sheet = backdrop
    this.closeSheetFn = close
    return { body, close }
  }

  private closeSheet(): void {
    this.closeSheetFn?.()
  }

  private toast(message: string): void {
    document.querySelector('.toast')?.remove()
    const el = h('div', { class: 'toast', text: message, attrs: { role: 'status' } })
    this.root.appendChild(el)
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => el.remove(), 5200)
  }

  private showLoading(label: string): { update: (fraction: number, label?: string) => void; close: () => void } {
    const text = h('p', { class: 'loading-label', text: label })
    const fill = h('i')
    const el = h(
      'div',
      { class: 'loading', attrs: { role: 'status', 'aria-live': 'polite' } },
      h('div', { class: 'loading-gems', attrs: { 'aria-hidden': 'true' } }, ...[0, 1, 2, 3, 4].map((i) => h('span', { class: `gem g${i}` }))),
      text,
      h('div', { class: 'loading-bar' }, fill),
    )
    this.root.appendChild(el)
    return {
      update: (fraction, next) => {
        fill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`
        if (next) text.textContent = next
      },
      close: () => el.remove(),
    }
  }

  private setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings = { ...this.settings, [key]: value }
    saveSettings(this.settings)
    if (key === 'musicVolume' || key === 'sfxVolume') this.engine.setVolumes(this.settings.musicVolume, this.settings.sfxVolume)
  }

  // ── title ────────────────────────────────────────────────────────────

  showTitle(): void {
    this.closeSheet()
    const play = button('Play', 'primary big', () => {
      this.engine.unlock()
      playSfx(this.engine, 'select')
      void this.showSongs()
    })
    const lanes = h('div', { class: 'title-stage', attrs: { 'aria-hidden': 'true' } })
    for (let i = 0; i < 5; i++) {
      const lane = h('div', { class: `title-lane l${i}` })
      for (let k = 0; k < 3; k++) lane.appendChild(h('span', { class: `gem g${i}`, style: { animationDelay: `${-(i * 0.37 + k * 0.9)}s` } }))
      lanes.appendChild(lane)
    }
    const el = h(
      'section',
      { class: 'screen title-screen' },
      lanes,
      h(
        'div',
        { class: 'title-content' },
        h('h1', { class: 'logo' }, h('span', { class: 'logo-word', text: 'Fretfire' })),
        h('p', { class: 'tagline', text: 'Five frets, two thumbs, no guitar needed.' }),
        play,
        h(
          'div',
          { class: 'title-links' },
          button('How to play', 'ghost', () => this.openHelp()),
          button('Settings', 'ghost', () => this.openSettings()),
        ),
      ),
      h('p', { class: 'title-foot', text: 'Four original songs built in. Import your own .chart, .mid or .sng songs.' }),
    )
    this.setScreen({ el })
  }

  // ── song list ────────────────────────────────────────────────────────

  async showSongs(focusId?: string): Promise<void> {
    this.closeSheet()
    const list = h('div', { class: 'song-list', attrs: { role: 'list' } })
    const search = h('input', {
      class: 'search-input',
      attrs: { type: 'search', placeholder: 'Search songs or artists', 'aria-label': 'Search songs', autocomplete: 'off', enterkeyhint: 'search', id: 'song-search' },
    })
    const note = h('p', { class: 'list-note' })
    const el = h(
      'section',
      { class: 'screen songs-screen' },
      h(
        'header',
        { class: 'topbar' },
        button('‹', 'icon', () => this.showTitle(), { 'aria-label': 'Back to title' }),
        h('h1', { text: 'Songs' }),
        button('+ Import', 'small', () => this.openImport()),
        button('⚙', 'icon', () => this.openSettings(), { 'aria-label': 'Settings' }),
      ),
      h('div', { class: 'search' }, search),
      list,
      note,
    )
    this.setScreen({ el })

    const { songs, storageError } = await listLibrary()
    if (this.screen?.el !== el) return
    const render = () => {
      const q = search.value.trim().toLowerCase()
      const shown = songs.filter((s) => !q || `${s.meta.name} ${s.meta.artist} ${s.meta.album}`.toLowerCase().includes(q))
      list.replaceChildren(...shown.map((s) => this.songCard(s)))
      const imported = songs.filter((s) => !s.builtin).length
      note.textContent = storageError
        ? `Imported songs can't be saved in this browser mode (${storageError}).`
        : shown.length === 0
          ? 'No songs match that search.'
          : imported === 0
            ? 'Add your own songs with Import: a .zip of song folders, a .sng, or a chart with its audio.'
            : `${imported} imported song${imported === 1 ? '' : 's'} on this device.`
    }
    search.addEventListener('input', render)
    render()
    const focus = focusId ?? readLast().id
    const card = focus ? list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focus)}"]`) : null
    card?.scrollIntoView({ block: 'center' })
  }

  private songCard(entry: SongEntry): HTMLElement {
    const best = bestForSong(entry.id)
    const intensity = Math.max(0, ...entry.instruments.map((i) => entry.meta.intensity[i] ?? 0))
    const flames = h('span', { class: 'intensity', attrs: { 'aria-label': `Intensity ${intensity} of 6` } })
    for (let i = 0; i < 6; i++) flames.appendChild(h('i', { class: i < intensity ? 'on' : '' }))
    const card = h(
      'button',
      { class: 'song-card', attrs: { type: 'button', role: 'listitem', 'data-id': entry.id }, on: { click: () => void this.openSong(entry) } },
      artTile(entry, 'art'),
      h(
        'span',
        { class: 'info' },
        h('span', { class: 'name', text: entry.meta.name || 'Untitled' }),
        h('span', { class: 'artist', text: entry.meta.artist || 'Unknown artist' }),
        h('span', { class: 'meta', text: [formatTime(entry.meta.length), entry.meta.genre, entry.builtin ? 'Built-in' : ''].filter(Boolean).join(' · ') }),
      ),
      h(
        'span',
        { class: 'side' },
        flames,
        best ? h('span', { class: 'best-stars', text: stars(best.stars), attrs: { 'aria-label': `Best ${best.stars} stars` } }) : null,
      ),
    )
    return card
  }

  // ── song setup ───────────────────────────────────────────────────────

  private async openSong(entry: SongEntry): Promise<void> {
    playSfx(this.engine, 'tick')
    const last = readLast()
    const { body, close } = this.openSheet('song-sheet', () => this.preview.stop())
    const art = artTile(entry, 'art big')
    const hero = h(
      'div',
      { class: 'song-hero' },
      art,
      h(
        'div',
        { class: 'song-titles' },
        h('h2', { text: entry.meta.name || 'Untitled' }),
        h('p', { class: 'song-artist', text: entry.meta.artist || 'Unknown artist' }),
        h(
          'p',
          { class: 'song-details' },
          [entry.meta.album, entry.meta.year, entry.meta.charter ? `Charted by ${entry.meta.charter}` : ''].filter(Boolean).join(' · '),
        ),
      ),
    )
    const partsSlot = h('div', { class: 'field' })
    const diffGrid = h('div', { class: 'diff-grid', attrs: { role: 'radiogroup', 'aria-label': 'Difficulty' } })
    const speedNote = h('p', { class: 'row-hint' })
    let rate = 1
    const speed = slider('Song speed', '', { min: 50, max: 150, step: 5, value: 100, format: (v) => `${v}%` }, (v) => {
      rate = v / 100
      speedNote.textContent = rate === 1 ? '' : 'Scores are only saved at 100% speed.'
    })
    const play = button('Play', 'primary big play-button', () => void this.startPlay({ entry, instrument, difficulty, rate }))
    const status = h('p', { class: 'row-hint sheet-status' })
    body.append(
      h('div', { class: 'sheet-grab', attrs: { 'aria-hidden': 'true' } }),
      hero,
      partsSlot,
      h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Difficulty' }), diffGrid),
      h('div', { class: 'field' }, speed, speedNote),
      play,
      status,
    )
    if (!entry.builtin) {
      let armed = false
      const remove = button('Remove from library', 'ghost danger', async () => {
        if (!armed) {
          armed = true
          remove.textContent = 'Tap again to remove'
          return
        }
        try {
          await removeFromLibrary(entry)
          close()
          this.toast(`Removed “${entry.meta.name}”`)
          void this.showSongs()
        } catch (error) {
          this.toast(error instanceof Error ? error.message : String(error))
        }
      })
      body.appendChild(remove)
      void albumArt(entry).then((url) => {
        if (!url) return
        art.style.backgroundImage = `url("${url}")`
        art.classList.add('has-image')
        art.textContent = ''
      })
    }

    let instrument: Instrument = entry.instruments.includes(last.instrument as Instrument) ? (last.instrument as Instrument) : entry.instruments[0]
    let difficulty: Difficulty = last.difficulty ?? 'easy'
    let chart: Chart
    try {
      chart = await loadEntryChart(entry)
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
      play.disabled = true
      return
    }
    const parts = availableParts(chart)
    if (!parts.size) {
      status.textContent = 'This chart has no notes to play.'
      play.disabled = true
      return
    }
    if (!parts.has(instrument)) instrument = [...parts.keys()][0]

    const renderDiffs = () => {
      const available = parts.get(instrument) ?? []
      if (!available.includes(difficulty)) difficulty = available[available.length - 1]
      diffGrid.replaceChildren(
        ...DIFFICULTIES.map((d) => {
          const best = getBest(entry.id, instrument, d)
          const b = h(
            'button',
            { class: `diff diff-${d}`, attrs: { type: 'button', role: 'radio', 'aria-checked': String(d === difficulty) } },
            h('span', { class: 'diff-name', text: DIFFICULTY_NAMES[d] }),
            h('span', { class: 'diff-best', text: best ? stars(best.stars) : available.includes(d) ? 'Not played' : 'No chart' }),
          )
          b.disabled = !available.includes(d)
          b.addEventListener('click', () => {
            difficulty = d
            playSfx(this.engine, 'tick')
            renderDiffs()
          })
          return b
        }),
      )
    }
    if (parts.size > 1) {
      partsSlot.append(
        h('span', { class: 'field-label', text: 'Part' }),
        segmented(
          [...parts.keys()].map((i) => ({ value: i, label: INSTRUMENT_NAMES[i] })),
          instrument,
          (v) => {
            instrument = v
            renderDiffs()
          },
          'Part',
        ),
      )
    } else {
      partsSlot.append(h('span', { class: 'field-label', text: 'Part' }), h('p', { class: 'part-single', text: INSTRUMENT_NAMES[instrument] }))
    }
    renderDiffs()
    if (!this.bot) void this.preview.play(entry)
  }

  // ── playing ──────────────────────────────────────────────────────────

  private async quickPlay(id: string, instrument: Instrument, difficulty: Difficulty, rate: number): Promise<void> {
    const { songs } = await listLibrary()
    const entry = songs.find((s) => s.id === id || s.id === `builtin:${id}`)
    if (!entry) {
      this.showTitle()
      this.toast(`No song called ${id}`)
      return
    }
    this.engine.unlock()
    await this.startPlay({ entry, instrument, difficulty, rate })
  }

  private async startPlay(setup: Setup): Promise<void> {
    this.engine.unlock()
    this.preview.stop()
    this.closeSheet()
    writeLast({ id: setup.entry.id, instrument: setup.instrument, difficulty: setup.difficulty })
    const loading = this.showLoading('Loading…')
    try {
      const chart = await loadEntryChart(setup.entry)
      const track = findTrack(chart, setup.instrument, setup.difficulty)
      if (!track) throw new Error('That part has no notes on this difficulty.')
      const stems = await loadStems(setup.entry, this.engine, setup.instrument, (f, label) => loading.update(f, label))
      loading.close()
      this.setScreen(null)
      this.game = new Game(this.root, this.engine, {
        chart,
        track,
        stems,
        settings: this.settings,
        rate: setup.rate,
        bot: this.bot,
        onFinish: (results) => this.finishGame(setup, results),
        onQuit: () => {
          this.endGame()
          void this.showSongs(setup.entry.id)
        },
        onRestart: () => {
          this.endGame()
          void this.startPlay(setup)
        },
      })
      this.game.start()
      void this.keepAwake(true)
    } catch (error) {
      loading.close()
      if (!this.screen) void this.showSongs(setup.entry.id)
      this.toast(error instanceof Error ? error.message : String(error))
    }
  }

  private endGame(): void {
    this.game?.destroy()
    this.game = null
    void this.keepAwake(false)
  }

  private finishGame(setup: Setup, results: Results): void {
    this.endGame()
    this.lastResults = results
    const newBest = setup.rate === 1 && !this.bot ? recordScore(setup.entry.id, setup.instrument, setup.difficulty, results) : false
    this.showResults(setup, results, newBest)
  }

  private async keepAwake(on: boolean): Promise<void> {
    try {
      if (on && !this.wake && 'wakeLock' in navigator) this.wake = await navigator.wakeLock.request('screen')
      if (!on && this.wake) {
        await this.wake.release()
        this.wake = null
      }
    } catch {
      // Not offered or refused: the screen may dim on long songs.
    }
  }

  // ── results ──────────────────────────────────────────────────────────

  private showResults(setup: Setup, r: Results, newBest: boolean): void {
    const pct = Math.floor(r.accuracy * 1000) / 10
    const title = r.failed ? 'Song failed' : r.fullCombo ? 'Full combo!' : 'Song complete'
    const starRow = h('div', { class: 'result-stars', attrs: { role: 'img', 'aria-label': `${r.stars} of 5 stars` } })
    for (let i = 0; i < 5; i++) {
      starRow.appendChild(h('span', { class: i < r.stars ? 'on' : '', text: '★', style: { animationDelay: `${0.3 + i * 0.14}s` } }))
    }
    const score = h('div', { class: 'result-score', text: '0' })
    const stats = h('dl', { class: 'result-stats' })
    const stat = (label: string, value: string, sub = '') =>
      stats.appendChild(h('div', { class: 'stat' }, h('dt', { text: label }), h('dd', { text: value }), sub ? h('span', { class: 'stat-sub', text: sub }) : null))
    stat('Notes hit', `${pct}%`, `${r.hits} of ${r.total}`)
    stat('Best streak', String(r.bestStreak))
    stat('Star power', `${r.starPhrasesHit} of ${r.starPhrasesTotal}`, 'phrases')
    for (const solo of r.solos) stat('Solo', `${Math.round((solo.hit / solo.total) * 100)}%`, soloGrade(solo.hit, solo.total))

    const badges = h('div', { class: 'result-badges' })
    if (r.fullCombo && r.failed) badges.appendChild(h('span', { class: 'badge gold', text: 'Full combo' }))
    if (newBest) badges.appendChild(h('span', { class: 'badge', text: 'New best' }))
    if (setup.rate !== 1) badges.appendChild(h('span', { class: 'badge muted', text: `${Math.round(setup.rate * 100)}% speed` }))

    const hint = h('div', { class: 'result-hint' })
    const offsetMs = Math.round(r.meanOffset * 1000)
    if (r.hits >= 20 && Math.abs(offsetMs) >= 25 && !this.bot) {
      hint.append(
        h('p', { text: `Your taps land ${Math.abs(offsetMs)} ms ${offsetMs > 0 ? 'late' : 'early'} on average.` }),
        button('Calibrate sync', 'small', () => this.showCalibration(() => this.showResults(setup, r, newBest))),
      )
    }

    const el = h(
      'section',
      { class: `screen results-screen${r.failed ? ' failed' : ''}` },
      h(
        'div',
        { class: 'results-card' },
        h('p', { class: 'results-kicker', text: `${DIFFICULTY_NAMES[setup.difficulty]} · ${INSTRUMENT_NAMES[setup.instrument]}` }),
        h('h1', { class: 'results-title', text: title }),
        h('p', { class: 'results-song', text: `${setup.entry.meta.name} — ${setup.entry.meta.artist}` }),
        starRow,
        score,
        badges,
        stats,
        hint,
        h(
          'div',
          { class: 'results-actions' },
          button('Play again', 'primary', () => void this.startPlay(setup)),
          button('Song list', '', () => void this.showSongs(setup.entry.id)),
        ),
      ),
    )
    this.setScreen({ el })
    // Count the score up.
    const start = performance.now()
    const tick = (now: number) => {
      if (this.screen?.el !== el) return
      const k = Math.min(1, (now - start) / 1100)
      score.textContent = Math.round(r.score * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US')
      if (k < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    if (!r.failed && r.stars >= 4) playSfx(this.engine, 'cheer')
  }

  // ── settings ─────────────────────────────────────────────────────────

  openSettings(): void {
    const { body, close } = this.openSheet('settings-sheet')
    const s = this.settings
    const schemeHint = h('p', { class: 'row-hint', text: SCHEME_HINTS[s.scheme] })
    const section = (title: string, ...children: (Node | null)[]) =>
      h('section', { class: 'settings-group' }, h('h3', { text: title }), ...children.filter((c): c is Node => c !== null))
    body.append(
      h('div', { class: 'sheet-head' }, h('h2', { text: 'Settings' }), button('Done', 'small', close)),
      section(
        'Controls',
        segmented(
          [
            { value: 'tap', label: 'Tap lanes' },
            { value: 'guitar', label: 'Frets + strum' },
          ],
          s.scheme,
          (v) => {
            this.setSetting('scheme', v)
            schemeHint.textContent = SCHEME_HINTS[v]
          },
          'Controls',
        ),
        schemeHint,
        toggle('Left-handed', 'Mirror the highway so orange is on the left.', s.lefty, (v) => this.setSetting('lefty', v)),
        toggle('Flick for star power', 'Flick the phone up to deploy star power.', s.flick, (v) => {
          this.setSetting('flick', v)
          if (v) void requestMotion().then((ok) => !ok && this.toast('Motion access was refused, so flicking won’t work.'))
        }),
      ),
      section(
        'Gameplay',
        slider(
          'Note speed',
          'How fast notes travel down the highway.',
          { min: 0.6, max: 2, step: 0.05, value: s.noteSpeed, format: (v) => `${v.toFixed(2)}×` },
          (v) => this.setSetting('noteSpeed', v),
        ),
        toggle('Lenient timing', 'A wider window to hit each note.', s.lenient, (v) => this.setSetting('lenient', v)),
        toggle('Stray taps break the streak', 'Tapping or strumming where there is no note resets it.', s.ghostPenalty, (v) =>
          this.setSetting('ghostPenalty', v),
        ),
        toggle('Song can fail', 'Miss too many notes and the song stops.', s.canFail, (v) => this.setSetting('canFail', v)),
      ),
      section(
        'Sync',
        h('p', { class: 'row-hint', text: 'If notes feel early or late, calibrate once: tap along to a click and Fretfire measures your phone.' }),
        button('Calibrate sync', '', () => {
          close()
          this.showCalibration()
        }),
        slider(
          'Tap offset',
          'Raise it if you have to tap early to hit notes.',
          { min: -150, max: 250, step: 1, value: s.inputOffsetMs, format: (v) => `${v} ms` },
          (v) => this.setSetting('inputOffsetMs', v),
        ),
        slider(
          'Video offset',
          'Raise it if the notes look ahead of the music (Bluetooth headphones).',
          { min: -200, max: 400, step: 5, value: s.videoOffsetMs, format: (v) => `${v} ms` },
          (v) => this.setSetting('videoOffsetMs', v),
        ),
      ),
      section(
        'Sound',
        slider('Music', '', { min: 0, max: 1, step: 0.05, value: s.musicVolume, format: (v) => `${Math.round(v * 100)}%` }, (v) =>
          this.setSetting('musicVolume', v),
        ),
        slider('Effects', '', { min: 0, max: 1, step: 0.05, value: s.sfxVolume, format: (v) => `${Math.round(v * 100)}%` }, (v) =>
          this.setSetting('sfxVolume', v),
        ),
      ),
      section(
        'Display',
        toggle('Reduced effects', 'Fewer sparks and glows, for older phones.', s.reducedEffects, (v) => this.setSetting('reducedEffects', v)),
      ),
      section(
        'About',
        h('p', {
          class: 'row-hint',
          text: 'Fretfire is a fan-made rhythm game in the spirit of Clone Hero. It isn’t affiliated with Clone Hero, Guitar Hero or their makers. The built-in songs are originals written for it.',
        }),
      ),
    )
  }

  // ── calibration ──────────────────────────────────────────────────────

  showCalibration(back?: () => void): void {
    this.closeSheet()
    this.engine.unlock()
    const goBack = back ?? (() => void this.showSongs())
    const BEAT = 0.6
    const CLICKS = 20
    const WARMUP = 4
    const clock = new AudioClock(this.engine)
    let clickTimes: number[] = []
    let offsets: number[] = []
    let running = false
    let raf = 0

    const pad = h('button', { class: 'calib-pad', attrs: { type: 'button', 'aria-label': 'Tap here on each click' } }, h('span', { class: 'calib-ring' }))
    const count = h('p', { class: 'calib-count', text: 'Tap along with the click' })
    const result = h('p', { class: 'calib-result' })
    const startBtn = button('Start', 'primary', () => begin())
    const saveBtn = button('Save', '', () => save())
    saveBtn.disabled = true
    let measured = 0

    const begin = () => {
      const ctx = this.engine.ctx
      if (!ctx) return
      this.engine.unlock()
      running = true
      offsets = []
      startBtn.disabled = true
      saveBtn.disabled = true
      result.textContent = ''
      const first = ctx.currentTime + 1
      clickTimes = Array.from({ length: CLICKS }, (_, i) => first + i * BEAT)
      clickTimes.forEach((t, i) => scheduleClick(this.engine, t, i % 4 === 0))
      const loop = (now: number) => {
        clock.sync(now)
        const heard = clock.contextTimeAt(now)
        const since = clickTimes.reduce((acc, t) => (t <= heard ? heard - t : acc), Infinity)
        pad.style.setProperty('--pulse', String(Math.max(0, 1 - since / 0.25)))
        if (heard > clickTimes[CLICKS - 1] + 0.6) finish()
        else raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    const tap = (e: Event) => {
      e.preventDefault()
      if (!running) return
      const heard = clock.contextTimeAt(eventTime(e))
      let nearest = 0
      for (let i = 1; i < clickTimes.length; i++) if (Math.abs(clickTimes[i] - heard) < Math.abs(clickTimes[nearest] - heard)) nearest = i
      const offset = heard - clickTimes[nearest]
      if (nearest >= WARMUP && Math.abs(offset) < BEAT / 2) offsets.push(offset)
      count.textContent = `${offsets.length} taps counted`
      pad.classList.remove('hit')
      void pad.offsetWidth
      pad.classList.add('hit')
    }

    const finish = () => {
      running = false
      cancelAnimationFrame(raf)
      startBtn.disabled = false
      startBtn.textContent = 'Try again'
      if (offsets.length < 8) {
        result.textContent = 'Not enough taps landed near the clicks. Try again and tap on every click.'
        return
      }
      const sorted = [...offsets].sort((a, b) => a - b)
      measured = Math.round(sorted[Math.floor(sorted.length / 2)] * 1000)
      const spread = Math.round((sorted[Math.floor(sorted.length * 0.8)] - sorted[Math.floor(sorted.length * 0.2)]) * 1000)
      result.textContent =
        `Your taps land ${Math.abs(measured)} ms ${measured >= 0 ? 'after' : 'before'} the click` +
        (spread > 60 ? ' (they were uneven; another try may be more accurate).' : '.')
      saveBtn.disabled = false
      saveBtn.textContent = `Save ${measured} ms`
    }

    const save = () => {
      this.setSetting('inputOffsetMs', Math.max(-150, Math.min(250, measured)))
      this.toast(`Tap offset set to ${measured} ms`)
      goBack()
    }

    pad.addEventListener('touchstart', tap, { passive: false })
    pad.addEventListener('mousedown', tap)
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') tap(e)
    }
    window.addEventListener('keydown', onKey)

    const el = h(
      'section',
      { class: 'screen calib-screen' },
      h('header', { class: 'topbar' }, button('‹', 'icon', () => goBack(), { 'aria-label': 'Back' }), h('h1', { text: 'Calibrate sync' })),
      h(
        'div',
        { class: 'calib-body' },
        h('p', {
          class: 'calib-intro',
          text: 'Use the headphones or speaker you play with. Press Start, then tap the circle on every click. The first four clicks are practice.',
        }),
        pad,
        count,
        result,
        h('div', { class: 'calib-actions' }, startBtn, saveBtn),
        h('p', { class: 'row-hint', text: `Current tap offset: ${this.settings.inputOffsetMs} ms` }),
      ),
    )
    this.setScreen({
      el,
      destroy: () => {
        running = false
        cancelAnimationFrame(raf)
        window.removeEventListener('keydown', onKey)
      },
    })
  }

  // ── import ───────────────────────────────────────────────────────────

  openImport(): void {
    const { body, close } = this.openSheet('import-sheet')
    const input = h('input', { class: 'file-input', attrs: { type: 'file', multiple: '', id: 'import-files' } })
    const pick = h('label', { class: 'btn primary big', attrs: { for: 'import-files' } }, 'Choose files', input)
    const status = h('p', { class: 'import-status', attrs: { 'aria-live': 'polite' } })
    const log = h('ul', { class: 'import-log' })
    input.addEventListener('change', async () => {
      const files = Array.from(input.files ?? [])
      input.value = ''
      if (!files.length) return
      pick.classList.add('busy')
      log.replaceChildren()
      void requestPersistence()
      try {
        const result = await importFiles(files, (message) => (status.textContent = message), (song) => saveSong(song))
        status.textContent =
          result.added > 0
            ? `Added ${result.added} song${result.added === 1 ? '' : 's'}.`
            : result.errors.length
              ? 'Nothing was added.'
              : 'No songs found in those files.'
        for (const e of result.errors) log.appendChild(h('li', {}, h('strong', { text: e.source }), ' ', e.reason))
        if (result.added > 0 && this.screen?.el.classList.contains('songs-screen')) void this.showSongs()
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        pick.classList.remove('busy')
      }
    })
    body.append(
      h('div', { class: 'sheet-head' }, h('h2', { text: 'Import songs' }), button('Done', 'small', close)),
      h('p', {
        text: 'Add songs you’ve charted or downloaded, in the formats Clone Hero uses: a .zip of song folders, a .sng file, or one song’s notes.chart or notes.mid picked together with its audio and song.ini.',
      }),
      pick,
      status,
      log,
      h(
        'ul',
        { class: 'import-notes' },
        h('li', { text: 'Songs are stored on this device only.' }),
        h('li', { text: 'Guitar, bass, rhythm and keys parts play. Drum charts are skipped.' }),
        h('li', { text: 'If a song won’t play, its audio may be in a format this browser can’t decode. MP3 and M4A always work.' }),
        h('li', { text: 'Extract .rar and .7z packs first; zip them if you like.' }),
      ),
    )
  }

  // ── help ─────────────────────────────────────────────────────────────

  openHelp(): void {
    const { body, close } = this.openSheet('help-sheet')
    const part = (title: string, ...lines: string[]) =>
      h('section', { class: 'help-part' }, h('h3', { text: title }), ...lines.map((line) => h('p', { text: line })))
    body.append(
      h('div', { class: 'sheet-head' }, h('h2', { text: 'How to play' }), button('Done', 'small', close)),
      part(
        'Hit the notes',
        'Notes slide down five lanes toward the fret buttons. Tap a lane as its note crosses the line. For a chord, tap every lane in it at once.',
        'Long notes have tails: keep your finger down until the tail ends for extra points.',
      ),
      part(
        'Build your multiplier',
        'Every 10 notes in a row raises your multiplier, up to 4×. A miss resets it, and the guitar drops out until you hit again.',
      ),
      part(
        'Star power',
        'Glowing star notes come in phrases. Hit every note in a phrase to fill the star meter. When it’s half full, tap ⚡ (or press Shift) to double your multiplier until it runs out.',
      ),
      part(
        'Frets + strum mode',
        'Prefer the real thing? In Settings, switch to Frets + strum: hold the fret buttons at the bottom and tap above them to strum. Notes with white tops are HOPOs, which you can play just by changing frets after a hit. Dark-topped notes are taps.',
      ),
      part(
        'Keyboard and controllers',
        'Frets: A S D F G or 1–5. Strum: Enter, Space or the arrow keys. Star power: Shift. Pause: Esc. Xbox, PlayStation and guitar controllers work too.',
      ),
      part(
        'Install it',
        'In Safari, tap Share, then Add to Home Screen. Fretfire then opens full screen, with no browser bars, and works offline.',
      ),
    )
  }
}

/** Plays a taste of the selected song while the setup sheet is open. */
class Preview {
  private audio: HTMLAudioElement | null = null
  private player: SongPlayer | null = null
  private token = 0
  private timer = 0

  constructor(private readonly engine: AudioEngine) {}

  async play(entry: SongEntry): Promise<void> {
    this.stop()
    const token = ++this.token
    try {
      if (entry.builtin) {
        if (!this.engine.ctx) return
        const stems = await loadStems(entry, this.engine, 'guitar')
        if (token !== this.token) return
        this.player = new SongPlayer(this.engine, stems)
        this.player.play(entry.meta.previewStart)
      } else {
        const audio = await previewAudio(entry)
        if (!audio || token !== this.token) return
        this.audio = audio
        audio.currentTime = entry.meta.previewStart
        audio.volume = 0.8
        await audio.play().catch(() => undefined)
      }
      this.timer = window.setTimeout(() => this.stop(), 30_000)
    } catch {
      // A preview is a nicety; the song itself reports real problems.
    }
  }

  stop(): void {
    this.token++
    window.clearTimeout(this.timer)
    this.player?.stop()
    this.player = null
    if (this.audio) {
      this.audio.pause()
      URL.revokeObjectURL(this.audio.src)
      this.audio = null
    }
  }
}

/** Hand-picked tile colours for the built-in songs; imported ones get a hue from their id. */
const BUILTIN_HUES: Record<string, number> = {
  'builtin:first-light': 32,
  'builtin:glass-comet': 185,
  'builtin:neon-overdrive': 305,
  'builtin:iron-tempest': 225,
}

/** Album art, or a gradient tile with the song's initial for songs without any. */
function artTile(entry: SongEntry, className: string): HTMLElement {
  let hash = 2166136261
  for (const ch of entry.id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619)
  const hue = BUILTIN_HUES[entry.id] ?? (hash >>> 0) % 360
  const tile = h('span', {
    class: className,
    attrs: { 'aria-hidden': 'true' },
    style: { background: `linear-gradient(135deg, hsl(${hue} 85% 55%), hsl(${(hue + 70) % 360} 80% 32%))` },
  })
  tile.textContent = (entry.meta.name || '?').trim().charAt(0).toUpperCase()
  return tile
}

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> }

/** iOS asks before sharing motion data; the prompt has to come from a tap. */
async function requestMotion(): Promise<boolean> {
  const api = (window.DeviceMotionEvent as unknown as MotionPermission | undefined) ?? {}
  if (typeof api.requestPermission !== 'function') return true
  try {
    return (await api.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

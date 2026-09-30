import { OPEN_BIT, gemCount } from '../chart/types'
import type { InputScheme, PlaySession } from './session'

/**
 * Plays a session perfectly, pressing every note on its exact time. Drives
 * the unattended browser checks and the "watch it play" demo.
 */
export class Bot {
  private next = 0
  private readonly releases: { lane: number; at: number }[] = []
  private held = 0

  constructor(
    private readonly session: PlaySession,
    private readonly scheme: InputScheme,
  ) {}

  update(time: number): void {
    const session = this.session
    const notes = session.notes
    while (this.next < notes.length && notes[this.next].time <= time) {
      const note = notes[this.next++]
      this.releaseDue(note.time - 0.001)
      const lanes: number[] = []
      if (note.mask === OPEN_BIT) {
        if (this.scheme === 'tap') lanes.push(2)
      } else for (let lane = 0; lane < 5; lane++) if (note.mask & (1 << lane)) lanes.push(lane)

      if (this.scheme === 'tap') {
        for (const lane of lanes) {
          session.press(lane, note.time)
          this.releases.push({ lane, at: note.time + Math.max(0.05, note.sustain[note.mask === OPEN_BIT ? 5 : lane]) })
        }
      } else {
        // Fret exactly the note's shape, then strum.
        const shape = note.mask === OPEN_BIT ? 0 : note.mask
        for (let lane = 0; lane < 5; lane++) {
          const bit = 1 << lane
          if (this.held & bit && !(shape & bit)) this.release(lane, note.time - 0.002)
        }
        for (const lane of lanes) {
          if (!(this.held & (1 << lane))) {
            session.press(lane, note.time - 0.001)
            this.held |= 1 << lane
          }
        }
        if (session.status[this.next - 1] === 0) session.strum(note.time)
        const longest = Math.max(...note.sustain)
        if (longest > 0) for (const lane of lanes) this.releases.push({ lane, at: note.time + longest })
      }
      if (session.starReady && gemCount(note.mask) >= 1) session.activateStar(note.time)
    }
    this.releaseDue(time)
  }

  private releaseDue(time: number): void {
    for (let i = this.releases.length - 1; i >= 0; i--) {
      const r = this.releases[i]
      if (r.at > time) continue
      this.releases.splice(i, 1)
      if (this.scheme === 'tap') this.session.release(r.lane, r.at)
      else this.release(r.lane, r.at)
    }
  }

  private release(lane: number, at: number): void {
    const bit = 1 << lane
    if (!(this.held & bit)) return
    this.held &= ~bit
    this.session.release(lane, at)
  }
}

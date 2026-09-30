/**
 * The single AudioContext, unlocked on the first tap, with music and effects
 * buses. Handles the iPhone specifics: audio only starts inside a gesture, and
 * the ring/silent switch mutes Web Audio unless the page asks for playback.
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }

export class AudioEngine {
  ctx: AudioContext | null = null
  music: GainNode | null = null
  sfx: GainNode | null = null
  private silentLoop: HTMLAudioElement | null = null
  private volumes = { music: 1, sfx: 0.8 }

  get running(): boolean {
    return this.ctx?.state === 'running'
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000
  }

  /** Call from inside a tap or key press. Safe to call again and again. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor({ latencyHint: 'interactive' })
      this.music = this.ctx.createGain()
      this.sfx = this.ctx.createGain()
      this.music.connect(this.ctx.destination)
      this.sfx.connect(this.ctx.destination)
      this.setVolumes(this.volumes.music, this.volumes.sfx)
      const nav = navigator as AudioSessionNavigator
      if (nav.audioSession) {
        // Plays with the silent switch on, like a music app (Safari 16.4+).
        try {
          nav.audioSession.type = 'playback'
        } catch {
          // Older builds expose the object but refuse the type.
        }
      } else if (/iP(hone|ad|od)/.test(navigator.userAgent)) {
        // Earlier iOS: a looping silent <audio> element flips the session to playback.
        this.silentLoop = new Audio(silentWavUrl())
        this.silentLoop.loop = true
        this.silentLoop.setAttribute('playsinline', '')
      }
    }
    const ctx = this.ctx
    if (ctx.state !== 'running') void ctx.resume().catch(() => {})
    // One silent sample inside the gesture finishes the unlock on older WebKit.
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    src.connect(ctx.destination)
    src.start(0)
    void this.silentLoop?.play().catch(() => {})
  }

  /** Brings the context back after the app returns from the background. */
  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {})
  }

  setVolumes(music: number, sfx: number): void {
    this.volumes = { music, sfx }
    if (this.music) this.music.gain.value = music
    if (this.sfx) this.sfx.gain.value = sfx
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ctx
    if (!ctx) throw new Error('Audio is not started yet')
    // Old Safari only has the callback form.
    return new Promise<AudioBuffer>((resolve, reject) => {
      const done = ctx.decodeAudioData(data, resolve, (err) => reject(err ?? new Error('Could not decode audio')))
      if (done && typeof done.then === 'function') done.then(resolve, reject)
    })
  }

  bufferFrom(channels: Float32Array[], sampleRate: number): AudioBuffer {
    const ctx = this.ctx
    if (!ctx) throw new Error('Audio is not started yet')
    const buffer = ctx.createBuffer(channels.length, channels[0].length, sampleRate)
    channels.forEach((data, i) => buffer.getChannelData(i).set(data))
    return buffer
  }
}

let silentUrl = ''

/** A tenth of a second of silence as a WAV blob URL. */
function silentWavUrl(): string {
  if (silentUrl) return silentUrl
  const rate = 8000
  const samples = rate / 10
  const view = new DataView(new ArrayBuffer(44 + samples))
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, samples, true)
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128)
  silentUrl = URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }))
  return silentUrl
}

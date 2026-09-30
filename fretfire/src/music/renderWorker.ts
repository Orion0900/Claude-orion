import { arrange } from './arrange'
import { SongRenderer } from './render'
import { BUILTIN_SONGS } from './songs'

/** Renders a built-in song off the main thread and hands the stems back without copying. */

interface WorkerScope {
  onmessage: ((e: MessageEvent<{ id: string; sampleRate: number }>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (e) => {
  const def = BUILTIN_SONGS.find((s) => s.id === e.data.id)
  if (!def) {
    scope.postMessage({ type: 'error', message: `Unknown song ${e.data.id}` })
    return
  }
  try {
    const renderer = new SongRenderer(arrange(def), e.data.sampleRate)
    let reported = 0
    while (!renderer.done) {
      renderer.step(e.data.sampleRate)
      if (renderer.progress - reported >= 0.02) {
        reported = renderer.progress
        scope.postMessage({ type: 'progress', value: reported })
      }
    }
    renderer.normalize()
    const song = renderer.out
    scope.postMessage({ type: 'done', song }, [
      song.lead[0].buffer,
      song.lead[1].buffer,
      song.backing[0].buffer,
      song.backing[1].buffer,
    ])
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

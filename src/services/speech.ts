/**
 * Spoken directions.
 *
 * iOS only lets a page speak once speech has been started from a tap. The
 * first direction of a run arrives from a GPS callback, not a tap, so without
 * priming it — and every one after it — can be silently dropped. The tap that
 * starts the run primes it, with a line that doubles as confirmation.
 */
function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
}

export function speak(text: string): void {
  const engine = synth()
  if (!engine) return
  try {
    // Deliberately no cancel() first: on iOS, speaking straight after cancelling
    // can silently drop the new line. Announcements are spaced well apart, so
    // letting the queue play is the safer trade.
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    engine.speak(utterance)
  } catch {
    // Speech is a courtesy; the banner still says everything.
  }
}

/** Call from inside a tap. */
export function primeSpeech(text: string): void {
  speak(text)
}

export function silence(): void {
  try {
    synth()?.cancel()
  } catch {
    // Nothing to stop.
  }
}

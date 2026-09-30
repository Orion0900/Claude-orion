import { Component, type ReactNode } from 'react'
import { discardActiveRun } from '../lib/activeRun'

interface Props {
  /** Whether a run in progress was saved and can be picked back up. */
  hasRunToResume: () => boolean
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * A last line of defence. Without it, any unexpected error while rendering
 * takes the whole app down to a blank screen — mid-run, with no way back but
 * closing it. Here the runner gets a way back, and because the run in progress
 * is saved as it goes, reloading picks it up where it was.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('LoopMaker hit an unexpected error', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const resumable = this.props.hasRunToResume()
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>
          {resumable
            ? 'Your run is safe. Reopen it to carry on from where you were.'
            : 'Reload to get back to your routes.'}
        </p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          {resumable ? 'Back to my run' : 'Reload'}
        </button>
        {resumable ? (
          // If the run itself is what keeps failing, this is the way out.
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              discardActiveRun()
              window.location.reload()
            }}
          >
            End that run and start fresh
          </button>
        ) : null}
      </div>
    )
  }
}

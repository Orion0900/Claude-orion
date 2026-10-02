/** A crash shows a way back instead of a blank screen. Projects are saved as they're edited, so nothing is lost. */
import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen">
        <div className="busy">
          <h2>Something went wrong</h2>
          <p>Your projects are saved on this phone. Reloading usually sorts it out.</p>
          <div className="error-card" style={{ maxWidth: 360, overflowWrap: 'anywhere' }}>
            {this.state.error.message}
          </div>
          <button className="btn primary" onClick={() => location.reload()}>
            Reload Cutline
          </button>
        </div>
      </div>
    )
  }
}

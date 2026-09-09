import type { Course } from '../lib/course'
import type { NearbyCourse } from '../services/overpass'
import { formatAway, type Unit } from '../lib/units'

export type SetupStep = 'course' | 'hole'

interface SetupViewProps {
  step: SetupStep
  /** Null until a search has been run. */
  candidates: NearbyCourse[] | null
  searching: boolean
  error: string | null
  hasPosition: boolean
  course: Course | null
  /** The hole the player is standing closest to. */
  suggested: number | null
  unit: Unit
  canCancel: boolean
  onSearch: () => void
  onPickCourse: (course: Course) => void
  onManual: () => void
  onPlaceByTap: () => void
  onPickHole: (hole: number) => void
  onBack: () => void
  onCancel: () => void
}

const MANUAL_HOLES = Array.from({ length: 18 }, (_, i) => i + 1)

export function SetupView(p: SetupViewProps) {
  return p.step === 'course' ? <CourseStep {...p} /> : <HoleStep {...p} />
}

function CourseStep(p: SetupViewProps) {
  return (
    <div className="stack setup">
      <section className="card big-ask">
        <span className="mascot" aria-hidden="true">
          {p.searching ? '🛰️' : '📍'}
        </span>
        <h3>Where are you?</h3>
        <p>{p.hasPosition ? 'Pick your course' : 'Turn on location, or drop yourself on the map'}</p>

        {!p.hasPosition && (
          <div className="row">
            <button type="button" className="plain strong" onClick={p.onPlaceByTap}>
              Drop me on the map
            </button>
          </div>
        )}

        {p.hasPosition && p.candidates === null && !p.searching && (
          <div className="row">
            <button type="button" className="plain strong" onClick={p.onSearch}>
              Find my course
            </button>
          </div>
        )}

        {p.searching && <div className="spinner" role="status" aria-label="Searching" />}
        {p.error && <p className="note warn">{p.error}</p>}

        {p.candidates !== null && p.candidates.length > 0 && (
          <ul className="course-list">
            {p.candidates.map(({ course, distance }, i) => (
              <li key={course.id}>
                <button type="button" onClick={() => p.onPickCourse(course)} style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="pin" aria-hidden="true">
                    ⛳
                  </span>
                  <span>
                    <strong>{course.name}</strong>
                    <small>
                      {course.holes.length} holes · {formatAway(distance, p.unit)}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {p.candidates !== null && p.candidates.length === 0 && !p.searching && !p.error && (
          <p className="note">Nothing mapped nearby — build it yourself below.</p>
        )}

        <div className="row">
          {p.hasPosition && p.candidates !== null && !p.searching && (
            <button type="button" className="plain" onClick={p.onSearch}>
              Search again
            </button>
          )}
          <button type="button" className="plain" onClick={p.onManual}>
            ✏️ By hand
          </button>
          {p.canCancel && (
            <button type="button" className="plain" onClick={p.onCancel}>
              Cancel
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function HoleStep(p: SetupViewProps) {
  const holes = p.course?.holes ?? []
  const manual = holes.length === 0
  const numbers = manual ? MANUAL_HOLES : holes.map((h) => h.number)
  const byNumber = new Map(holes.map((h) => [h.number, h]))

  return (
    <div className="stack setup">
      <section className="card big-ask">
        <span className="mascot" aria-hidden="true">
          ⛳
        </span>
        <h3>Starting hole?</h3>
        <p>{p.course?.name}</p>

        <div className="hole-grid">
          {numbers.map((n, i) => (
            <button
              key={n}
              type="button"
              className={n === p.suggested ? 'on' : ''}
              onClick={() => p.onPickHole(n)}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              aria-label={`Hole ${n}`}
            >
              <strong>{n}</strong>
              {byNumber.get(n)?.par ? <small>par {byNumber.get(n)?.par}</small> : null}
            </button>
          ))}
        </div>

        <div className="row">
          <button type="button" className="plain" onClick={p.onBack}>
            ‹ Back
          </button>
        </div>
      </section>
    </div>
  )
}

import type { Course } from '../lib/course'
import type { NearbyCourse } from '../services/overpass'
import { formatDistance, type Unit } from '../lib/units'

export type SetupStep = 'course' | 'hole'

interface SetupViewProps {
  step: SetupStep
  /** Null until a search has been run. */
  candidates: NearbyCourse[] | null
  searching: boolean
  error: string | null
  hasPosition: boolean
  /** The course chosen in step one. */
  course: Course | null
  /** The hole the player is standing closest to, offered first. */
  suggested: number | null
  unit: Unit
  /** True once a course has been played, so setup can be backed out of. */
  canCancel: boolean
  onSearch: () => void
  onPickCourse: (course: Course) => void
  onManual: () => void
  onPlaceByTap: () => void
  onPickHole: (hole: number) => void
  onBack: () => void
  onCancel: () => void
}

/** A hand-built course starts with no holes, so offer a full round of them. */
const MANUAL_HOLES = Array.from({ length: 18 }, (_, i) => i + 1)

export function SetupView(p: SetupViewProps) {
  return p.step === 'course' ? <CourseStep {...p} /> : <HoleStep {...p} />
}

function CourseStep(p: SetupViewProps) {
  return (
    <div className="stack setup">
      <section className="card">
        <span className="step-mark">Step 1 of 2</span>
        <h3>Which course are you at?</h3>

        {!p.hasPosition && (
          <>
            <p className="muted small">
              The caddie needs to know where you are. Allow location when the phone asks, or drop yourself on the map.
            </p>
            <div className="button-row">
              <button type="button" onClick={p.onPlaceByTap}>
                Place me on the map
              </button>
            </div>
          </>
        )}

        {p.hasPosition && p.candidates === null && !p.searching && (
          <>
            <p className="muted small">Look for mapped courses within a mile and a half of you.</p>
            <div className="button-row">
              <button type="button" className="primary" onClick={p.onSearch}>
                Find courses near me
              </button>
            </div>
          </>
        )}

        {p.searching && <p className="status">Looking for courses around you…</p>}
        {p.error && <p className="status">{p.error}</p>}

        {p.candidates !== null && p.candidates.length > 0 && (
          <ul className="course-list">
            {p.candidates.map(({ course, distance }) => (
              <li key={course.id}>
                <button type="button" onClick={() => p.onPickCourse(course)}>
                  <strong>{course.name}</strong>
                  <span>
                    {course.holes.length} hole{course.holes.length === 1 ? '' : 's'} · {formatDistance(distance, p.unit)} away
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {p.candidates !== null && p.candidates.length === 0 && !p.searching && (
          <p className="muted small">
            No mapped courses within a mile and a half. Plenty of courses aren't in OpenStreetMap — set this one up by
            hand and it'll work just the same.
          </p>
        )}

        {p.hasPosition && p.candidates !== null && !p.searching && (
          <div className="button-row">
            <button type="button" onClick={p.onSearch}>
              Search again
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h4>Not listed?</h4>
        <p className="muted small">Set the course up yourself: you tap where each flag is, hole by hole, as you play.</p>
        <div className="button-row">
          <button type="button" onClick={p.onManual}>
            Set it up by hand
          </button>
          {p.canCancel && (
            <button type="button" onClick={p.onCancel}>
              Keep the course I had
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
      <section className="card">
        <span className="step-mark">Step 2 of 2</span>
        <h3>Which hole are you starting on?</h3>
        <p className="muted small">
          {p.course?.name}
          {p.suggested !== null ? ` · you're standing closest to hole ${p.suggested}` : ''}
          {manual ? ' · pick a number and tap the map where its flag is' : ''}
        </p>

        <div className="hole-grid">
          {numbers.map((n) => {
            const hole = byNumber.get(n)
            return (
              <button key={n} type="button" className={n === p.suggested ? 'on' : ''} onClick={() => p.onPickHole(n)}>
                <strong>{n}</strong>
                {hole?.par ? <span>par {hole.par}</span> : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="card">
        <div className="button-row">
          {p.suggested !== null && (
            <button type="button" className="primary" onClick={() => p.onPickHole(p.suggested as number)}>
              Start on hole {p.suggested}
            </button>
          )}
          <button type="button" onClick={p.onBack}>
            Back to courses
          </button>
        </div>
      </section>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdvisorCard } from './components/AdvisorCard'
import { Confetti } from './components/Confetti'
import { HoleHeader } from './components/HoleHeader'
import { MapView, type TapMode } from './components/MapView'
import { SettingsView } from './components/SettingsView'
import { SetupView, type SetupStep } from './components/SetupView'
import { ShotDock, ShotList } from './components/ShotTracker'
import { StatsView } from './components/StatsView'
import { advise, type Advice } from './lib/advisor'
import { defaultBag, type ClubId, type SkillLevel } from './lib/clubs'
import {
  greenDepth,
  hazardsAlongLine,
  manualCourse,
  nearestHole,
  setHolePar,
  setHoleTarget,
  setHoleTee,
  targetOf,
  type Course,
} from './lib/course'
import { haversine, type LatLng } from './lib/geo'
import { DEFAULT_PROFILE, normalizeProfile, type Aggressiveness, type Profile } from './lib/profile'
import { holeOut, markShot, newId, setManualDistance, shotsOnHole, undoLastShot, type Lie, type Round, type Shot } from './lib/shots'
import { readJson, writeJson } from './lib/storage'
import { useGeolocation } from './services/geolocation'
import { findNearbyCourses, type NearbyCourse } from './services/overpass'

type Tab = 'play' | 'stats' | 'settings'

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'play', icon: '⛳', label: 'Play' },
  { id: 'stats', icon: '🧠', label: 'Coach' },
  { id: 'settings', icon: '⚙️', label: 'You' },
]

const KEYS = {
  profile: 'caddieiq.profile',
  course: 'caddieiq.course',
  shots: 'caddieiq.shots',
  round: 'caddieiq.round',
  hole: 'caddieiq.hole',
}

function newRound(courseName: string | null): Round {
  return { id: newId('round'), courseName, startedAt: Date.now() }
}

export default function App() {
  const [profile, setProfile] = useState<Profile>(() => normalizeProfile(readJson(KEYS.profile, DEFAULT_PROFILE)))
  const [course, setCourse] = useState<Course | null>(() => readJson<Course | null>(KEYS.course, null))
  const [shots, setShots] = useState<Shot[]>(() => readJson<Shot[]>(KEYS.shots, []))
  const [round, setRound] = useState<Round>(() => readJson<Round | null>(KEYS.round, null) ?? newRound(null))
  const [holeNumber, setHoleNumber] = useState<number>(() => readJson<number>(KEYS.hole, 1))
  const [tab, setTab] = useState<Tab>('play')
  const [tapMode, setTapMode] = useState<TapMode>('none')
  const [manualPosition, setManualPosition] = useState<LatLng | null>(null)
  const [lie, setLie] = useState<Lie | null>(null)
  const [pickedClub, setPickedClub] = useState<ClubId | null>(null)
  const [courseStatus, setCourseStatus] = useState<string | null>(null)
  const [frameKey, setFrameKey] = useState(0)
  // Setup asks two questions before play: which course, then which hole. It
  // opens itself when there's no course yet, and can be re-entered later.
  const [setupStep, setSetupStep] = useState<SetupStep | null>(() =>
    readJson<Course | null>(KEYS.course, null) === null ? 'course' : null,
  )
  const [candidates, setCandidates] = useState<NearbyCourse[] | null>(null)
  const [searching, setSearching] = useState(false)
  // Bumped to fire confetti. Reserved for a hole worth celebrating, because
  // confetti for every routine tap stops meaning anything.
  const [celebrate, setCelebrate] = useState(0)

  useEffect(() => writeJson(KEYS.profile, profile), [profile])
  useEffect(() => writeJson(KEYS.course, course), [course])
  useEffect(() => writeJson(KEYS.shots, shots), [shots])
  useEffect(() => writeJson(KEYS.round, round), [round])
  useEffect(() => writeJson(KEYS.hole, holeNumber), [holeNumber])

  const gps = useGeolocation(true)
  const position = manualPosition ?? gps.position
  const accuracy = manualPosition ? null : gps.accuracy

  const hole = useMemo(() => course?.holes.find((h) => h.number === holeNumber) ?? null, [course, holeNumber])
  const holeShots = useMemo(() => shotsOnHole(shots, round.id, holeNumber), [shots, round.id, holeNumber])

  // The first shot on a hole is from the tee; after that, the fairway until told otherwise.
  const effectiveLie: Lie = lie ?? (holeShots.length === 0 ? 'tee' : 'fairway')

  const distance = hole && position ? haversine(position, targetOf(hole)) : null
  const green = hole && position ? greenDepth(position, hole) : null

  const advice: Advice | null = useMemo(() => {
    if (!hole || !position || distance === null) return null
    const hazards = hazardsAlongLine(position, targetOf(hole), course?.hazards ?? [])
    return advise({ distance, lie: effectiveLie, hazards, green }, profile, shots)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole, position?.lat, position?.lng, effectiveLie, profile, shots, course?.hazards])

  const updateProfile = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }))
  const setSkill = (skill: SkillLevel) =>
    setProfile((p) => {
      // A bag that was never customised follows the level.
      const stock = p.bag.join() === defaultBag(p.skill).join()
      return { ...p, skill, bag: stock ? defaultBag(skill) : p.bag }
    })
  const setAggressiveness = (aggressiveness: Aggressiveness) => updateProfile({ aggressiveness })

  const goToHole = (number: number) => {
    setHoleNumber(Math.max(1, number))
    setLie(null)
    setPickedClub(null)
  }
  const nextHole = () => {
    if (!course) return
    const after = course.holes.find((h) => h.number > holeNumber)
    goToHole(after ? after.number : course.holes[0]?.number ?? 1)
  }
  const prevHole = () => {
    if (!course) return
    const before = [...course.holes].reverse().find((h) => h.number < holeNumber)
    goToHole(before ? before.number : course.holes[course.holes.length - 1]?.number ?? 1)
  }

  const onTap = useCallback(
    (point: LatLng) => {
      if (tapMode === 'none') return
      if (tapMode === 'me') setManualPosition(point)
      if (tapMode === 'pin') setCourse((c) => setHoleTarget(c ?? manualCourse(), holeNumber, point))
      if (tapMode === 'tee') setCourse((c) => (c ? setHoleTee(c, holeNumber, point) : c))
      setTapMode('none')
    },
    [tapMode, holeNumber],
  )

  const searchCourses = async () => {
    if (!position) return
    setSearching(true)
    setCourseStatus(null)
    try {
      const found = await findNearbyCourses(position)
      setCandidates(found)
      if (found.length === 0) setCourseStatus(null)
    } catch (error) {
      setCandidates([])
      setCourseStatus(`Course lookup failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSearching(false)
    }
  }

  /** The hole the player is standing closest to on the course being set up. */
  const suggestedHole = useMemo(() => {
    if (!course || !position) return course?.holes[0]?.number ?? null
    return nearestHole(course, position)?.number ?? null
  }, [course, position])

  const pickCourse = (chosen: Course) => {
    setCourse(chosen)
    setCourseStatus(null)
    setSetupStep('hole')
  }

  /** Setup is finished: the round starts here, on this hole. */
  const startRound = (hole: number) => {
    setRound(newRound(course?.name ?? null))
    goToHole(hole)
    setSetupStep(null)
    setTab('play')
    setFrameKey((k) => k + 1)
    // A hand-built course has no flag for this hole yet; ask for it straight away.
    if (course && !course.holes.some((h) => h.number === hole)) setTapMode('pin')
  }

  const clubForShot = pickedClub ?? advice?.club ?? profile.bag[0]

  const mark = () => {
    if (!position) return
    setShots((s) =>
      markShot(s, {
        roundId: round.id,
        hole: holeNumber,
        club: clubForShot,
        lie: effectiveLie,
        at: position,
        toHole: distance,
        plan: advice ? { club: advice.club, mode: advice.mode, expected: advice.expected, aim: advice.aim } : null,
      }),
    )
    setLie(null)
    setPickedClub(null)
  }

  const finishHole = () => {
    if (!hole) return
    const strokes = holeShots.length
    setShots((s) => holeOut(s, round.id, holeNumber, targetOf(hole)))
    // Birdie or better, or an ace. Anything less is a fine hole, not a party.
    if (strokes > 0 && ((hole.par !== null && strokes <= hole.par - 1) || strokes === 1)) {
      setCelebrate((c) => c + 1)
    }
    nextHole()
  }

  const dock = (
    <ShotDock
      shots={holeShots}
      bag={profile.bag}
      suggested={advice?.club ?? null}
      selected={pickedClub}
      onSelectClub={setPickedClub}
      canMark={position !== null}
      onMark={mark}
      onHoleOut={finishHole}
      onUndo={() => setShots((s) => undoLastShot(s, round.id, holeNumber))}
    />
  )

  return (
    <div className="app">
      <aside className="sheet">
        {setupStep === null && (
          <HoleHeader
            hole={hole}
            distance={distance}
            green={green}
            unit={profile.unit}
            accuracy={manualPosition ? null : gps.accuracy}
            live={gps.status === 'live' && !manualPosition}
            onPrev={prevHole}
            onNext={nextHole}
            onFrame={() => setFrameKey((k) => k + 1)}
          />
        )}
        <div className="sheet-scroll">
          {setupStep !== null && (
            <SetupView
              step={setupStep}
              candidates={candidates}
              searching={searching}
              error={courseStatus}
              hasPosition={position !== null}
              course={course}
              suggested={suggestedHole}
              unit={profile.unit}
              canCancel={course !== null}
              onSearch={searchCourses}
              onPickCourse={pickCourse}
              onManual={() => {
                setCourse(manualCourse())
                setSetupStep('hole')
              }}
              onPlaceByTap={() => setTapMode('me')}
              onPickHole={startRound}
              onBack={() => setSetupStep('course')}
              onCancel={() => setSetupStep(null)}
            />
          )}
          {setupStep === null && tab === 'play' && (
            <div className="stack">
              {course && !hole && (
                <section className="card welcome">
                  <p>Hole {holeNumber} isn't set yet.</p>
                  <div className="button-row">
                    <button type="button" className="primary" onClick={() => setTapMode('pin')}>
                      Tap the map to set its flag
                    </button>
                  </div>
                </section>
              )}
              <AdvisorCard advice={advice} profile={profile} lie={effectiveLie} onLie={setLie} onAggressiveness={setAggressiveness} />
              <ShotList
                shots={holeShots}
                unit={profile.unit}
                onDistance={(id, meters) => setShots((s) => s.map((shot) => (shot.id === id ? setManualDistance(shot, meters) : shot)))}
                onDeleteShot={(id) => setShots((s) => s.filter((shot) => shot.id !== id))}
              />
            </div>
          )}
          {setupStep === null && tab === 'stats' && <StatsView shots={shots} profile={profile} />}
          {setupStep === null && tab === 'settings' && (
            <SettingsView
              profile={profile}
              course={course}
              hasPosition={position !== null}
              tapMode={tapMode}
              holeNumber={holeNumber}
              usingManualPosition={manualPosition !== null}
              onProfile={updateProfile}
              onSkill={setSkill}
              onChangeCourse={() => {
                setCandidates(null)
                setCourseStatus(null)
                setSetupStep('course')
                setTab('play')
              }}
              onTapMode={(mode) => {
                setTapMode(mode)
                if (mode !== 'none') setTab('play')
              }}
              onTeeHere={() => position && setCourse((c) => (c ? setHoleTee(c, holeNumber, position) : c))}
              onPar={(par) => setCourse((c) => (c ? setHolePar(c, holeNumber, par) : c))}
              onUseGps={() => setManualPosition(null)}
              onNewRound={() => {
                setSetupStep(course ? 'hole' : 'course')
                setTab('play')
              }}
              onClearHistory={() => {
                if (window.confirm('Forget every tracked shot? The caddie goes back to the chart for your level.')) setShots([])
              }}
            />
          )}
        </div>
        {setupStep === null && tab === 'play' && dock}
        <nav className="tabs" hidden={setupStep !== null}>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </aside>
      <MapView
        course={course}
        hole={hole}
        position={position}
        accuracy={accuracy}
        aim={advice && advice.mode !== 'putt' ? advice.aim : null}
        shots={holeShots}
        unit={profile.unit}
        tapMode={tapMode}
        onTap={onTap}
        frameKey={frameKey}
      />
      <Confetti trigger={celebrate} />
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdvisorCard } from './components/AdvisorCard'
import { HoleHeader } from './components/HoleHeader'
import { MapView, type TapMode } from './components/MapView'
import { SettingsView } from './components/SettingsView'
import { ShotTracker } from './components/ShotTracker'
import { StatsView } from './components/StatsView'
import { advise, type Advice } from './lib/advisor'
import { defaultBag, type ClubId, type SkillLevel } from './lib/clubs'
import { greenDepth, hazardsAlongLine, manualCourse, setHolePar, setHoleTarget, setHoleTee, targetOf, type Course } from './lib/course'
import { haversine, type LatLng } from './lib/geo'
import { DEFAULT_PROFILE, normalizeProfile, type Aggressiveness, type Profile } from './lib/profile'
import { holeOut, markShot, newId, setManualDistance, shotsOnHole, undoLastShot, type Lie, type Round, type Shot } from './lib/shots'
import { readJson, writeJson } from './lib/storage'
import { useGeolocation } from './services/geolocation'
import { loadNearbyCourse } from './services/overpass'

type Tab = 'play' | 'stats' | 'settings'

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
  const holeCount = course?.holes.length ?? 0
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

  const findCourse = async () => {
    if (!position) return
    setCourseStatus('Looking for holes around you…')
    try {
      const found = await loadNearbyCourse(position)
      if (!found) {
        setCourseStatus('No mapped holes within a mile and a half. Set flags by hand instead.')
        return
      }
      setCourse(found)
      setRound(newRound(found.name))
      const nearest = found.holes.reduce((a, b) => (haversine(position, b.tee ?? b.green) < haversine(position, a.tee ?? a.green) ? b : a))
      goToHole(nearest.number)
      setCourseStatus(`${found.name}: ${found.holes.length} holes, ${found.hazards.length} hazards.`)
      setTab('play')
    } catch (error) {
      setCourseStatus(`Course lookup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
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
    setShots((s) => holeOut(s, round.id, holeNumber, targetOf(hole)))
    nextHole()
  }

  const gpsStatus = manualPosition
    ? 'Placed by hand'
    : gps.status === 'live'
      ? `GPS ±${Math.round(gps.accuracy ?? 0)} m`
      : gps.status === 'waiting'
        ? 'Finding you…'
        : gps.status === 'denied'
          ? 'Location denied'
          : 'No GPS'

  const tracker = (
    <ShotTracker
      shots={holeShots}
      bag={profile.bag}
      suggested={advice?.club ?? null}
      selected={pickedClub}
      onSelectClub={setPickedClub}
      unit={profile.unit}
      canMark={position !== null}
      onMark={mark}
      onHoleOut={finishHole}
      onUndo={() => setShots((s) => undoLastShot(s, round.id, holeNumber))}
      onDistance={(id, meters) => setShots((s) => s.map((shot) => (shot.id === id ? setManualDistance(shot, meters) : shot)))}
      onDeleteShot={(id) => setShots((s) => s.filter((shot) => shot.id !== id))}
    />
  )

  return (
    <div className="app">
      <aside className="sidebar">
        <HoleHeader
          hole={hole}
          holeCount={holeCount}
          distance={distance}
          green={green}
          unit={profile.unit}
          gpsStatus={gpsStatus}
          onPrev={prevHole}
          onNext={nextHole}
          onFrame={() => setFrameKey((k) => k + 1)}
        />
        <div className="sidebar-scroll">
          {tab === 'play' && (
            <div className="stack">
              {!course && (
                <section className="card welcome">
                  <h3>First, the course</h3>
                  <p>
                    {position ? 'Load the holes around you from OpenStreetMap, or tap the map to set each flag yourself.' : 'Allow location so the caddie knows where you stand.'}
                  </p>
                  <div className="button-row">
                    <button type="button" className="primary" onClick={findCourse} disabled={!position}>
                      Find the course I'm on
                    </button>
                    <button type="button" onClick={() => setTapMode('pin')}>
                      Set flag by tap
                    </button>
                    {!position && (
                      <button type="button" onClick={() => setTapMode('me')}>
                        Place me by tap
                      </button>
                    )}
                  </div>
                  {courseStatus && <p className="status">{courseStatus}</p>}
                </section>
              )}
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
              <AdvisorCard advice={advice} profile={profile} lie={effectiveLie} onLie={setLie} onSkill={setSkill} onAggressiveness={setAggressiveness} />
              {tracker}
            </div>
          )}
          {tab === 'stats' && <StatsView shots={shots} profile={profile} />}
          {tab === 'settings' && (
            <SettingsView
              profile={profile}
              course={course}
              courseStatus={courseStatus}
              canFindCourse={position !== null}
              tapMode={tapMode}
              holeNumber={holeNumber}
              usingManualPosition={manualPosition !== null}
              onProfile={updateProfile}
              onFindCourse={findCourse}
              onNewManualCourse={() => {
                setCourse(manualCourse())
                setRound(newRound('My course'))
                goToHole(1)
                setTapMode('pin')
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
                setRound(newRound(course?.name ?? null))
                goToHole(course?.holes[0]?.number ?? 1)
                setTab('play')
              }}
              onClearHistory={() => {
                if (window.confirm('Forget every tracked shot? The caddie goes back to the chart for your level.')) setShots([])
              }}
            />
          )}
        </div>
        <nav className="tabs">
          {(['play', 'stats', 'settings'] as Tab[]).map((t) => (
            <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'play' ? 'Play' : t === 'stats' ? 'Coach' : 'Settings'}
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
    </div>
  )
}

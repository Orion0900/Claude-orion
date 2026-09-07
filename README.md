# LoopMaker

Enter what you want to run — distance, how much climbing you're willing to do,
where you're starting — and get back real routes drawn on a map that begin and
end at your door.

> "A five mile run from here, under 500 feet of climbing, finishing back where
> I started."

![LoopMaker](docs/screenshot.png)

## What it does

- **Loops that come home.** Routes start and finish at the same point, so
  there's no car shuffle and no doubling back unless you ask for it.
- **Hits your distance.** Candidate loops are refined against a real routing
  engine until the routed distance lands within a few percent of your target —
  not the straight-line distance, the distance you'll actually run.
- **Respects your climbing limit.** Every route is sampled against elevation
  data and filtered on total ascent, so "flat five miles" means flat.
- **Gives you options.** Several distinct routes in different directions, not
  one take-it-or-leave-it suggestion. "Find different routes" reshuffles.
- **Keeps the navigation simple.** Ask for fewer turns and it builds rounder,
  straighter loops and ranks them by how little you'll have to think. Every
  route shows its turn count.
- **Elevation profile.** Scrub the profile to see exactly where the hills are
  on the map.
- **Sends to your phone.** On an iPhone, the share sheet hands the GPX straight
  to Strava, Garmin, Files or AirDrop. Everywhere else it downloads.

Loop or out-and-back, miles or kilometres, feet or metres. Built for the phone
you'll actually hold at the front door: safe-area aware, no zoom-on-focus, and
sized for thumbs.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # typecheck + production bundle into dist/
npm test         # unit tests
```

No API keys, no account, no build-time configuration.

## How route finding works

Generating a loop of a given length is harder than point-to-point routing,
because you don't know the waypoints in advance — you only know the shape you
want. LoopMaker works backwards from the target:

1. **Spread candidates around the compass.** Each candidate claims a different
   bearing, so the results genuinely differ instead of being one loop redrawn.
2. **Guess a radius.** A loop of circumference *D* starts from the polygon
   inscribed in a circle of that perimeter, deliberately undershot — streets
   are always longer than the ideal shape.
3. **Refine against the router.** Route through the waypoints, compare the
   routed distance to the target, scale the radius by the ratio, repeat. Three
   or four passes land inside the tolerance.
4. **Sample the terrain.** Resample the route to 100 evenly spaced points and
   look up elevation for each.
5. **Score and filter.** Rank on distance error, ascent overage and turn
   density, drop near-duplicates, return the best few.

### Turns are a preference, not a limit

Distance and climbing are stated constraints: a route either satisfies them or
it doesn't. Turns are different — you'd rather have fewer, but you wouldn't
reject a good run over one extra corner. So turn count never disqualifies a
route, it only orders the ones that already qualify.

Asking for fewer turns also changes what gets built, not just what gets shown:
the loop is generated from a triangle rather than a pentagon, giving longer legs
along single roads. Turns are counted per kilometre, since a 10 km route
naturally has more corners than a 5 km one without being harder to follow. Only
real decisions count — a road bending gently or changing name under your feet
isn't something you have to remember.

### Elevation is smoothed, deliberately

Raw digital-elevation samples are noisy enough that naively summing every rise
can report roughly double a route's true ascent. Every figure here is smoothed
with a moving average, then accumulated with a hysteresis threshold — a rise
only counts once it clears 3 m above the last confirmed low. Wobble below that
is treated as sensor noise, while genuine gradual climbs still accumulate in
full.

## Data sources

All keyless and public:

| Purpose   | Service                                   |
| --------- | ----------------------------------------- |
| Map tiles | OpenStreetMap                             |
| Routing   | OSRM (FOSSGIS walking profile)            |
| Elevation | Open-Meteo Elevation API (Copernicus DEM) |
| Search    | Nominatim                                 |

These are community-run, fair-use endpoints. Requests are serialised per host
with a minimum gap between them, retried with backoff, and elevation lookups
are cached per coordinate. For heavy or commercial use, swap in your own
routing and elevation endpoints — both are injected as providers
(`RoutingProvider`, `ElevationProvider`), so it's a one-line change in
`src/App.tsx`. The same seam is what lets the search algorithm be tested
against a synthetic city.

Swapping the map for Google Maps means replacing `MapView.tsx`; nothing else
depends on Leaflet.

### Why there's no "open this route in Apple Maps"

Apple's URL scheme carries a single destination. There is no parameter for a
list of waypoints, let alone a polyline, so a loop cannot be expressed as a
Maps link at all. The honest substitutes are both here: **Send to phone** puts
the GPX into the iOS share sheet, which is how routes actually reach Strava,
Garmin and Files; and **Directions to start** opens Apple Maps walking
directions to the start line, which is the one thing its URL scheme can do.

## Layout

```
src/
  lib/
    geo.ts           great-circle maths, resampling, interpolation
    elevation.ts     smoothing and hysteresis ascent accumulation
    routeSearch.ts   candidate generation, refinement, scoring   <- the core
    turns.ts         which maneuvers count as a turn worth remembering
    effort.ts        grade-adjusted finish-time estimate
    gpx.ts           GPX 1.1 export
    share.ts         iOS share sheet, download fallback, Apple Maps links
    units.ts         miles/km, feet/metres, formatting
    __fixtures__/    synthetic grid city used by the tests
  services/          OSRM, Open-Meteo, Nominatim + shared fair-use HTTP client
  components/        MapView, ControlPanel, RouteList, ElevationProfile
```

## Tests

138 unit tests covering the geodesy, ascent accumulation, turn classification,
unit conversion, GPX output, sharing and its fallbacks, the OSRM adapter, and
the search algorithm end to end.

The search tests run against a synthetic city in `src/lib/__fixtures__` —
streets on a 120 m lattice and terrain that climbs steadily to the east — so
convergence on the target distance, the elevation constraint actually steering
routes toward flat ground, the turn preference measurably lowering turn density,
determinism per seed, de-duplication, and graceful degradation when a routing or
elevation service fails are all verified without touching the network.

```bash
npm test
```

## Known limits

- Route quality depends on OpenStreetMap footpath coverage; sparsely mapped
  areas give fewer and worse options.
- Elevation comes from a ~30 m DEM, so ascent figures are good estimates rather
  than survey data.
- The router optimises for distance, not for pleasantness — it doesn't know
  which roads have sidewalks or traffic.

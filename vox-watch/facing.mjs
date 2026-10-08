// Works out which way each apartment faces from SightMap's unit map (.umap).
//
// The unit map is a north-up floor plate drawing (its Georeference element
// carries the bearing, 0 for Vox, with East Pine St along the top and 15th Ave
// down the right) holding, per floor, one polygon per unit, the other rooms
// (fitness center, leasing office, elevator) and usually the floor's outline;
// the background level has the building's footprint for floors drawn without
// one. A wall faces outside when a line drawn straight out from it leaves the
// outline before running into another room on the same floor. Corridors and
// the core always end at a room, so they never count, and a line that crosses
// more than MAX_OPEN of undrawn floor (ground-floor retail, the garage) is
// ignored too. Each outside-facing stretch of wall votes for its compass
// direction by length.

const STEP = 4; // px between samples along a wall and along each ray
const MAX_OPEN = 300; // px (~12 m at 0.04 m/px); the courtyard is at most ~190 px deep
const MIN_SHARE = 0.4; // a second direction needs 40% of the main one's wall...
const MIN_WALL = 60; // ...and at least ~2.4 m of it

const COMPASS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];

function parsePoints(points) {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number));
}

function rectPoints({ x, y, width, height }) {
  const [x0, y0, w, h] = [x, y, width, height].map(Number);
  return [
    [x0, y0],
    [x0 + w, y0],
    [x0 + w, y0 + h],
    [x0, y0 + h],
  ];
}

function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function inside([x, y], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function* walk(el, skip = () => false) {
  for (const child of el.elements || []) {
    if (skip(child)) continue;
    yield child;
    yield* walk(child, skip);
  }
}

function centroid(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * Pulls the bearing and, per floor, the unit polygons, the other rooms and the
 * floor's outline out of a umap. Floors drawn without their own outline use the
 * building footprint from the background level.
 */
export function parseUnitMap(umap) {
  const geo = umap.elements.find((e) => e.type === 'Georeference');
  const levels = umap.elements.filter((e) => e.type === 'Level');
  const background = levels.find((l) => l.id === 'background');
  let building = null;
  for (const el of background ? walk(background) : []) {
    if (!el.points) continue;
    const poly = parsePoints(el.points);
    if (!building || area(poly) > area(building)) building = poly;
  }
  const floors = [];
  for (const level of levels) {
    if (level === background) continue;
    const units = new Map();
    const shapes = [];
    // Hit areas repeat the unit shapes; units come from the UnitLayer.
    for (const el of walk(level, (e) => e.type === 'HitAreaLayer')) {
      if (el.type === 'Unit' && el.shape?.points) units.set(String(el.id), parsePoints(el.shape.points));
      else if (el.type === 'Rect' && el.fill && el.fill !== 'none') shapes.push(rectPoints(el));
      else if (el.type === 'Polygon' && el.points && el.fill && el.fill !== 'none') shapes.push(parsePoints(el.points));
    }
    if (!units.size) continue;
    // A filled shape around (nearly) every unit is the floor's outline, not a room.
    const centres = [...units.values()].map(centroid);
    const wraps = (s) => centres.filter((c) => inside(c, s)).length >= centres.length * 0.8;
    const outline = shapes.filter(wraps).sort((a, b) => area(b) - area(a))[0] ?? null;
    floors.push({
      floorId: level.tags?.floor ?? null,
      units,
      rooms: shapes.filter((s) => s !== outline),
      footprint: outline ?? building,
    });
  }
  return { bearing: geo?.bearing ?? 0, floors };
}

function compass(nx, ny, bearing) {
  // Image y grows downwards, so "up" (north when bearing is 0) is -y.
  const deg = ((Math.atan2(nx, -ny) * 180) / Math.PI + bearing + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/**
 * Compass directions a unit's outside walls face, main one first, with the
 * length of outside wall behind each, e.g. { directions: ['East'], walls: { East: 344 } }.
 * Returns null when the unit isn't on the map.
 */
export function facingOf(unitId, map) {
  const floor = map.floors.find((f) => f.units.has(String(unitId)));
  if (!floor?.footprint) return null;
  const poly = floor.units.get(String(unitId));
  const obstacles = [...floor.units]
    .filter(([id]) => id !== String(unitId))
    .map(([, p]) => p)
    .concat(floor.rooms);
  const walls = {};

  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < STEP) continue;
    let nx = (y2 - y1) / len;
    let ny = -(x2 - x1) / len;
    if (inside([(x1 + x2) / 2 + nx * 1.5, (y1 + y2) / 2 + ny * 1.5], poly)) {
      nx = -nx;
      ny = -ny;
    }
    const dir = compass(nx, ny, map.bearing);
    for (let t = STEP / 2; t < len; t += STEP) {
      const sx = x1 + ((x2 - x1) * t) / len;
      const sy = y1 + ((y2 - y1) * t) / len;
      for (let d = 2; d <= MAX_OPEN; d += STEP) {
        const p = [sx + nx * d, sy + ny * d];
        if (obstacles.some((o) => inside(p, o))) break; // a neighbour, room or the corridor side
        if (!inside(p, floor.footprint)) {
          walls[dir] = (walls[dir] || 0) + STEP;
          break;
        }
      }
    }
  }

  const ranked = Object.entries(walls).sort((a, b) => b[1] - a[1]);
  const main = ranked[0]?.[1] ?? 0;
  const directions = ranked
    .filter(([, w], i) => i === 0 || (w >= main * MIN_SHARE && w >= MIN_WALL))
    .slice(0, 2)
    .map(([d]) => d);
  return { directions, walls };
}

// North/South before East/West, the way corners are usually named.
const ORDER = ['North', 'South', 'East', 'West', 'Northeast', 'Northwest', 'Southeast', 'Southwest'];

/** "East", or "North & East" for a corner unit. */
export function describeFacing(f) {
  if (!f || !f.directions.length) return '?';
  return [...f.directions].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join(' & ');
}

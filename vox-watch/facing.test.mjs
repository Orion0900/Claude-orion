import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnitMap, facingOf, describeFacing } from './facing.mjs';

const rect = (x0, y0, x1, y1) => `${x0},${y0} ${x1},${y0} ${x1},${y1} ${x0},${y1}`;
const unit = (id, points) => ({ type: 'Unit', id, shape: { type: 'Polygon', points } });

// A 300 x 200 building, north up: three units along the north wall, two along
// the south wall, a corridor between them and a fitness room in the corridor.
function building(bearing = 0, extra = []) {
  return {
    elements: [
      { type: 'Georeference', latitude: 47.6, longitude: -122.3, zoom: 20, bearing },
      { type: 'Level', id: 'background', elements: [{ type: 'Polygon', fill: '#F4F4F4', points: rect(0, 0, 300, 200) }] },
      {
        type: 'Level',
        tags: { floor: '1' },
        elements: [
          {
            type: 'HitAreaLayer',
            elements: [{ type: 'HitArea', target: { id: 'n2', type: 'Unit' }, shape: { points: rect(100, 0, 200, 90) } }],
          },
          {
            type: 'UnitLayer',
            elements: [
              unit('n1', rect(0, 0, 100, 90)),
              unit('n2', rect(100, 0, 200, 90)),
              unit('n3', rect(200, 0, 300, 90)),
              unit('s1', rect(0, 110, 150, 200)),
              unit('s2', rect(150, 110, 300, 200)),
            ],
          },
          ...extra,
        ],
      },
    ],
  };
}

test('a mid-row unit faces only its outside wall, not the corridor', () => {
  const map = parseUnitMap(building());
  assert.deepEqual(facingOf('n2', map).directions, ['North']);
});

test('corner units face both outside walls, named north/south first', () => {
  const map = parseUnitMap(building());
  assert.equal(describeFacing(facingOf('n1', map)), 'North & West');
  assert.equal(describeFacing(facingOf('s2', map)), 'South & East');
});

test('the bearing rotates directions', () => {
  const map = parseUnitMap(building(90));
  assert.deepEqual(facingOf('n2', map).directions, ['East']);
});

test("a floor's own outline wins over the building footprint", () => {
  // The north units' floor ends at y=40 here, so their outside wall is at the
  // outline, not the footprint, and the corridor still never counts.
  const outline = { type: 'Polygon', fill: '#F4F4F4', points: rect(0, -40, 300, 200) };
  const map = parseUnitMap(building(0, [{ type: 'Layer', elements: [outline] }]));
  assert.equal(map.floors[0].footprint.length, 4);
  assert.deepEqual(map.floors[0].rooms, []);
  assert.deepEqual(facingOf('n2', map).directions, ['North']);
});

test('rooms block the view like units do', () => {
  // A room filling the corridor below n2 changes nothing; one north of it
  // (inside a bigger outline) means n2 no longer looks outside.
  const room = { type: 'Rect', fill: '#E6E6E6', x: 100, y: -30, width: 100, height: 30 };
  const outline = { type: 'Polygon', fill: '#F4F4F4', points: rect(0, -40, 300, 200) };
  const map = parseUnitMap(building(0, [{ type: 'Layer', elements: [outline, room] }]));
  assert.deepEqual(facingOf('n2', map).directions, []);
  assert.equal(describeFacing(facingOf('n2', map)), '?');
});

test('unknown units have no facing', () => {
  assert.equal(facingOf('nope', parseUnitMap(building())), null);
  assert.equal(describeFacing(null), '?');
});

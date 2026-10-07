// Building footprint and the streets around it from OpenStreetMap, used to
// turn "which side of the building a unit is on" into a compass direction.
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = process.argv[2] || 'out';
const UA = 'vox-watch/1.0 (+https://github.com/Orion0900/Claude-orion)';
await fs.mkdir(OUT, { recursive: true });

const search = new URLSearchParams({
  q: '1527 15th Ave, Seattle, WA 98122',
  format: 'jsonv2',
  addressdetails: '1',
  limit: '5',
});
const geo = await (
  await fetch(`https://nominatim.openstreetmap.org/search?${search}`, { headers: { 'User-Agent': UA } })
).json();
await fs.writeFile(path.join(OUT, 'nominatim.json'), JSON.stringify(geo, null, 2));
console.log('nominatim', JSON.stringify(geo.map((g) => [g.display_name, g.lat, g.lon, g.osm_type, g.osm_id])));

const { lat, lon } = geo[0] ?? { lat: 47.6147, lon: -122.3131 };
const query = `[out:json][timeout:60];
(
  nwr["building"](around:90,${lat},${lon});
  way["highway"](around:220,${lat},${lon});
);
out geom tags;`;
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  body: new URLSearchParams({ data: query }),
  headers: { 'User-Agent': UA },
});
const text = await res.text();
await fs.writeFile(path.join(OUT, 'overpass.json'), text);
console.log(`overpass ${res.status} ${text.length} bytes`);

// Daily check of the apartments available at Vox (1527 15th Ave, Capitol
// Hill, Seattle). Essex's own site sits behind a bot checkpoint, but the
// interactive map on its Floor Plans & Pricing page is a SightMap embed whose
// JSON lists the same available units (number, plan, size, rent, date) and
// links the floor plate drawing that facing.mjs reads directions from.
//
//   node check.mjs <out dir> [previous latest.json]
//
// Writes latest.json and latest.md (the notification text) to <out dir>.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseUnitMap, facingOf, describeFacing } from './facing.mjs';

const EMBED = 'https://sightmap.com/embed/zdqw9zl5po9';
const FALLBACK_API = 'https://sightmap.com/app/api/v1/nrkwn9oevd2/sightmaps/6824';
const PAGE = 'https://www.essexapartmenthomes.com/apartments/seattle/vox/floor-plans-and-pricing';
const TZ = 'America/Los_Angeles';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Referer: 'https://www.essexapartmenthomes.com/',
  'Accept-Language': 'en-US,en;q=0.9',
};

const [outDir = 'out', previousPath] = process.argv.slice(2);

async function get(url, as = 'json') {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, attempt * 5_000));
    }
  }
  throw last;
}

/** The embed page names its SightMap API URL; fall back to the one seen before. */
async function apiUrl() {
  try {
    const html = await get(EMBED, 'text');
    const config = JSON.parse(html.match(/__APP_CONFIG__\s*=\s*(\{.*?\})\s*\n/s)[1]);
    return config.sightmaps[0].href;
  } catch (e) {
    console.log(`embed config unreadable (${e.message}); using ${FALLBACK_API}`);
    return FALLBACK_API;
  }
}

function planName(raw) {
  try {
    return JSON.parse(raw).name;
  } catch {
    return raw;
  }
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
}

function shortDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function check() {
  const data = (await get(await apiUrl())).data;
  const plans = new Map(data.floor_plans.map((p) => [p.id, p]));
  const map = parseUnitMap(await get(data.unit_map.url));
  const units = data.units.map((u) => {
    const plan = plans.get(u.floor_plan_id) ?? {};
    const facing = facingOf(u.id, map);
    return {
      unit: u.unit_number.replace(/^VO/i, ''),
      plan: planName(plan.name ?? ''),
      beds: plan.bedroom_count ?? null,
      baths: plan.bathroom_count ?? null,
      sqft: u.area,
      rent: u.price,
      available_on: u.available_on,
      facing: describeFacing(facing),
      special: u.specials_description || null,
    };
  });
  units.sort((a, b) => a.unit.localeCompare(b.unit, 'en', { numeric: true }));
  return units;
}

function layout(u) {
  if (u.beds === 0) return 'Studio';
  return `${u.beds}BR/${u.baths}BA`;
}

function format(result) {
  const date = shortDate(result.date);
  if (result.error) return `Vox check failed (${date}): ${result.error}\n${PAGE}\n`;
  if (!result.units.length) return `Vox: no units available today (${date})\n`;
  const seen = result.baseline && new Set(result.baseline);
  const lines = result.units.map((u) => {
    const when = u.available_on <= result.date ? 'avail now' : `avail ${shortDate(u.available_on)}`;
    const rent = `$${u.rent.toLocaleString('en-US')}`;
    const isNew = seen && !seen.has(u.unit) ? ' · NEW' : '';
    const facing = u.facing === '?' ? 'facing ?' : `faces ${u.facing}`;
    return `- #${u.unit} · ${layout(u)} · ${u.sqft} sq ft · ${facing} · ${rent} · ${when}${isNew}`;
  });
  return `Vox: ${result.units.length} available (${date})\n${lines.join('\n')}\n`;
}

let result = { checked_at: new Date().toISOString(), date: today(), source: PAGE, units: [] };
try {
  result.units = await check();
} catch (e) {
  result.error = e.message;
  process.exitCode = 1;
}
let previous = null;
if (previousPath) {
  try {
    previous = JSON.parse(await fs.readFile(previousPath, 'utf8'));
  } catch {
    // First run, or the data branch doesn't exist yet.
  }
}
if (result.error && previous?.date === result.date && !previous.error) {
  // A failed retry shouldn't replace a good result from earlier today.
  console.log(`check failed (${result.error}); keeping this morning's result`);
  result = previous;
} else if (previous) {
  // "NEW" means not listed on an earlier day, so a second run on the same day
  // keeps comparing against the day before rather than against the first run.
  result.baseline =
    previous.date === result.date || previous.error ? previous.baseline : previous.units.map((u) => u.unit);
}
const text = format(result);
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
await fs.writeFile(path.join(outDir, 'latest.md'), text);
process.stdout.write(text);

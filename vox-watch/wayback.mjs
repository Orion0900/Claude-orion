// Archived copies of the Vox pages from the Wayback Machine: they show how the
// page is built (data embedded in the HTML, API hosts, map embeds) even when the
// live site challenges automated browsers.
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.argv[2] || 'out', 'wayback');
await fs.mkdir(OUT, { recursive: true });

async function get(url, ms = 60_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  return { status: res.status, text: await res.text() };
}

async function cdx(params) {
  const q = new URLSearchParams({ output: 'json', fl: 'timestamp,original,statuscode,mimetype,length', ...params });
  try {
    const { text } = await get(`https://web.archive.org/cdx/search/cdx?${q}`);
    const rows = JSON.parse(text || '[]');
    return rows.slice(1);
  } catch (e) {
    console.log(`cdx ${JSON.stringify(params)} failed: ${e.message}`);
    return [];
  }
}

const pages = {
  fp: 'essexapartmenthomes.com/apartments/seattle/vox/floor-plans-and-pricing',
  home: 'essexapartmenthomes.com/apartments/seattle/vox',
};
for (const [name, url] of Object.entries(pages)) {
  const rows = await cdx({ url, filter: 'statuscode:200', limit: '-6' });
  console.log(`${name}: ${rows.length} snapshots ${JSON.stringify(rows.map((r) => r[0]))}`);
  for (const [ts, original] of rows.slice(-3)) {
    try {
      const { status, text } = await get(`https://web.archive.org/web/${ts}id_/${original}`);
      await fs.writeFile(path.join(OUT, `${name}-${ts}.html`), text);
      const hints = [...new Set(text.match(/https?:\/\/[a-z0-9.-]*(sightmap|engrain|api|rentcafe|realpage|yardi|entrata|map)[a-z0-9.-]*\.[a-z]+[^"'\s<>)]*/gi) || [])];
      console.log(`  ${ts} ${status} ${text.length}b hints=${JSON.stringify(hints.slice(0, 40))}`);
    } catch (e) {
      console.log(`  ${ts} failed: ${e.message}`);
    }
  }
}

// Endpoints the archive happened to capture under the site.
const prefixes = [
  'essexapartmenthomes.com/api/',
  'www.essexapartmenthomes.com/api/',
  'essexapartmenthomes.com/EPT_Feature/',
  'www.essexapartmenthomes.com/EPT_Feature/',
  'essexapartmenthomes.com/apartments/seattle/vox',
];
for (const url of prefixes) {
  const rows = await cdx({ url, matchType: 'prefix', limit: '300', collapse: 'urlkey' });
  await fs.writeFile(path.join(OUT, `prefix-${url.replace(/[^a-z0-9]+/gi, '_')}.json`), JSON.stringify(rows, null, 1));
  console.log(`prefix ${url}: ${rows.length} urls`);
  for (const r of rows.slice(0, 60)) console.log(`  ${r[0]} ${r[2]} ${r[3]} ${r[1]}`);
}

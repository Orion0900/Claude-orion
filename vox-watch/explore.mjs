// One-off reconnaissance of the Vox pages on essexapartmenthomes.com: saves
// the rendered HTML, every JSON/XHR response, frame URLs and screenshots
// (including any interactive map) so the real scraper can be written against
// what the site actually serves.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = process.argv[2] || 'out';
const BASE = 'https://www.essexapartmenthomes.com/apartments/seattle/vox';
const PAGES = [
  ['fp', `${BASE}/floor-plans-and-pricing`],
  ['home', BASE],
  ['tours', `${BASE}/virtual-tours`],
];

await fs.mkdir(path.join(OUT, 'responses'), { recursive: true });

const log = [];
let seq = 0;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});

context.on('response', async (res) => {
  const req = res.request();
  const type = req.resourceType();
  const url = res.url();
  const ct = res.headers()['content-type'] || '';
  const entry = { n: ++seq, type, status: res.status(), method: req.method(), url, ct };
  const post = req.postData();
  if (post) entry.post = post.slice(0, 4000);
  log.push(entry);
  const interesting =
    ['xhr', 'fetch', 'document'].includes(type) ||
    (type === 'script' && /sightmap|engrain|map|unit|avail|floor/i.test(url)) ||
    (type === 'image' && /svg/.test(ct) && /map|floor|plate|site/i.test(url));
  if (!interesting) return;
  try {
    const body = await res.body();
    if (body.length > 8_000_000) return;
    const ext = ct.includes('json')
      ? 'json'
      : ct.includes('html')
        ? 'html'
        : ct.includes('svg')
          ? 'svg'
          : ct.includes('javascript')
            ? 'js'
            : 'txt';
    const file = `responses/${String(entry.n).padStart(4, '0')}-${type}.${ext}`;
    await fs.writeFile(path.join(OUT, file), body);
    entry.file = file;
    entry.size = body.length;
  } catch {
    // Redirects and aborted requests have no body; the log entry is enough.
  }
});

const page = await context.newPage();

async function snapshot(name) {
  await fs.writeFile(path.join(OUT, `${name}.html`), await page.content());
  const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  await fs.writeFile(path.join(OUT, `${name}.txt`), text);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }).catch((e) => {
    console.log(`screenshot ${name} failed: ${e.message}`);
  });
  const frames = page.frames().map((f) => f.url());
  await fs.writeFile(path.join(OUT, `${name}.frames.json`), JSON.stringify(frames, null, 2));
  for (const [i, frame] of page.frames().entries()) {
    if (frame === page.mainFrame()) continue;
    const el = await frame.frameElement().catch(() => null);
    if (!el) continue;
    await el.screenshot({ path: path.join(OUT, `${name}.frame${i}.png`) }).catch(() => {});
    const html = await frame.content().catch(() => '');
    if (html) await fs.writeFile(path.join(OUT, `${name}.frame${i}.html`), html);
  }
  console.log(`[${name}] ${page.url()} frames=${JSON.stringify(frames)}`);
}

async function settle() {
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(6_000);
}

try {
  for (const [name, url] of PAGES) {
    console.log(`\n=== ${name}: ${url}`);
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      console.log(`status ${res?.status()}`);
      await settle();
      // Lazy sections only load once scrolled into view.
      for (let y = 0; y < 12; y++) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(400);
      }
      await settle();
      await snapshot(name);

      const clickables = await page.$$eval('a,button,[role=button],[role=tab],label', (els) =>
        els
          .map((e) => ({
            tag: e.tagName,
            text: (e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 100),
            href: e.getAttribute('href'),
            cls: (e.getAttribute('class') || '').slice(0, 120),
          }))
          .filter((x) => x.text || x.href),
      );
      await fs.writeFile(path.join(OUT, `${name}.clickables.json`), JSON.stringify(clickables, null, 2));

      if (name !== 'fp') continue;
      // Try every control that looks like it opens a map or a unit list.
      const targets = clickables.filter((c) =>
        /map|site ?plan|view (all|units|available)|available (homes|units)|list/i.test(c.text),
      );
      console.log(`map/list controls: ${JSON.stringify(targets.map((t) => t.text))}`);
      let k = 0;
      for (const t of targets.slice(0, 6)) {
        k++;
        try {
          await page.getByText(t.text, { exact: true }).first().click({ timeout: 8_000 });
          await settle();
          await snapshot(`fp-click${k}`);
          console.log(`clicked "${t.text}"`);
        } catch (e) {
          console.log(`click "${t.text}" failed: ${e.message.split('\n')[0]}`);
        }
      }
    } catch (e) {
      console.log(`page ${name} failed: ${e.message}`);
    }
  }
} finally {
  await fs.writeFile(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
  console.log('\n=== XHR/fetch/doc requests');
  for (const e of log.filter((x) => ['xhr', 'fetch', 'document'].includes(x.type))) {
    console.log(`${e.status} ${e.method} ${e.type} ${e.url.slice(0, 300)} ${e.file || ''}`);
  }
  console.log('\n=== hosts');
  const hosts = {};
  for (const e of log) {
    try {
      const h = new URL(e.url).host;
      hosts[h] = (hosts[h] || 0) + 1;
    } catch {}
  }
  console.log(JSON.stringify(hosts, null, 1));
  await browser.close();
}

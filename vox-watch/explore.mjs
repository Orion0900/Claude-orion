// One-off reconnaissance of the Vox pages on essexapartmenthomes.com: saves
// the rendered HTML, every JSON/XHR response, frame URLs and screenshots
// (including any interactive map) so the real scraper can be written against
// what the site actually serves. The site sits behind Vercel's security
// checkpoint, so several browser setups are tried until one gets through.
import { chromium, firefox } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = process.argv[2] || 'out';
const BASE = 'https://www.essexapartmenthomes.com/apartments/seattle/vox';
const PAGES = [
  ['fp', `${BASE}/floor-plans-and-pricing`],
  ['home', BASE],
];
const STEALTH_ARGS = ['--disable-blink-features=AutomationControlled'];

const STRATEGIES = [
  {
    name: 'chrome-headful',
    launch: () =>
      chromium.launch({
        channel: 'chrome',
        headless: false,
        args: STEALTH_ARGS,
        ignoreDefaultArgs: ['--enable-automation'],
      }),
  },
  {
    name: 'chrome-headless',
    launch: () =>
      chromium.launch({
        channel: 'chrome',
        headless: true,
        args: STEALTH_ARGS,
        ignoreDefaultArgs: ['--enable-automation'],
      }),
    ua: (v) =>
      `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
  },
  { name: 'firefox-headful', launch: () => firefox.launch({ headless: false }) },
];

await fs.mkdir(path.join(OUT, 'responses'), { recursive: true });
const log = [];
let seq = 0;

function record(context) {
  context.on('response', async (res) => {
    const req = res.request();
    const type = req.resourceType();
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    const entry = { n: ++seq, type, status: res.status(), method: req.method(), url, ct };
    const post = req.postData();
    if (post) entry.post = post.slice(0, 4000);
    log.push(entry);
    if (/\.well-known\/vercel/.test(url)) return;
    const interesting =
      ['xhr', 'fetch', 'document'].includes(type) ||
      (type === 'script' && /sightmap|engrain|map|unit|avail|floor/i.test(url)) ||
      (/svg/.test(ct) && /map|floor|plate|site/i.test(url));
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
}

async function passCheckpoint(page, url) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  console.log(`  first status ${res?.status()}`);
  for (let i = 0; i < 45; i++) {
    const title = await page.title().catch(() => '');
    if (title && !/security checkpoint/i.test(title)) return true;
    await page.waitForTimeout(1_000);
  }
  return false;
}

async function snapshot(page, name) {
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

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(6_000);
}

async function explore(page) {
  for (const [name, url] of PAGES) {
    console.log(`\n=== ${name}: ${url}`);
    if (!(await passCheckpoint(page, url))) {
      console.log('  still on the checkpoint');
      await snapshot(page, `${name}-blocked`);
      continue;
    }
    await settle(page);
    // Lazy sections only load once scrolled into view.
    for (let y = 0; y < 14; y++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(400);
    }
    await settle(page);
    await snapshot(page, name);

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
      /map|site ?plan|view (all|units|available)|available (homes|units|apartments)|list|floor ?plate/i.test(
        c.text,
      ),
    );
    console.log(`map/list controls: ${JSON.stringify(targets.map((t) => t.text))}`);
    let k = 0;
    for (const t of targets.slice(0, 8)) {
      k++;
      try {
        await page.getByText(t.text, { exact: true }).first().click({ timeout: 8_000 });
        await settle(page);
        await snapshot(page, `fp-click${k}`);
        console.log(`clicked "${t.text}"`);
      } catch (e) {
        console.log(`click "${t.text}" failed: ${e.message.split('\n')[0]}`);
      }
    }
  }
}

let passed = null;
try {
  for (const s of STRATEGIES) {
    console.log(`\n##### strategy ${s.name}`);
    let browser;
    try {
      browser = await s.launch();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        ...(s.ua ? { userAgent: s.ua(browser.version()) } : {}),
      });
      record(context);
      const page = await context.newPage();
      console.log(`  browser ${browser.version()} ua ${await page.evaluate(() => navigator.userAgent)}`);
      if (await passCheckpoint(page, PAGES[0][1])) {
        console.log(`  PASSED checkpoint with ${s.name}`);
        passed = s.name;
        await explore(page);
        await context.storageState({ path: path.join(OUT, 'storage-state.json') });
        break;
      }
      const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      console.log(`  blocked: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
      await page.screenshot({ path: path.join(OUT, `blocked-${s.name}.png`) }).catch(() => {});
    } catch (e) {
      console.log(`  strategy ${s.name} errored: ${e.message.split('\n')[0]}`);
    } finally {
      await browser?.close().catch(() => {});
    }
  }
} finally {
  await fs.writeFile(path.join(OUT, 'log.json'), JSON.stringify(log, null, 2));
  await fs.writeFile(path.join(OUT, 'passed.txt'), String(passed));
  console.log(`\n=== passed: ${passed}`);
  console.log('=== XHR/fetch/doc requests');
  for (const e of log.filter((x) => ['xhr', 'fetch', 'document'].includes(x.type))) {
    console.log(`${e.status} ${e.method} ${e.type} ${e.url.slice(0, 300)} ${e.file || ''}`);
  }
  const hosts = {};
  for (const e of log) {
    try {
      const h = new URL(e.url).host;
      hosts[h] = (hosts[h] || 0) + 1;
    } catch {}
  }
  console.log(`=== hosts ${JSON.stringify(hosts)}`);
}

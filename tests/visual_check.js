/* Visual regression check: the same screens, byte for byte, before and after a refactor.
 *
 * Save a baseline from the current files:   NODE_PATH=$(npm root -g) node tests/visual_check.js save /tmp/base
 * Check later work against it:              NODE_PATH=$(npm root -g) node tests/visual_check.js check /tmp/base
 *
 * The clock is fixed, motion is reduced and the 3D canvas is masked, so two runs of the same code produce the
 * same pixels. A mismatch is saved next to the baseline as NAME.new.png so it can be looked at.
 */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MODE = process.argv[2], DIR = process.argv[3];
if (!['save', 'check'].includes(MODE) || !DIR) { console.log('usage: visual_check.js save|check DIR'); process.exit(2); }
fs.mkdirSync(DIR, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const VERSION = /DRY_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'version.js'), 'utf8'))[1];
const NOW = new Date(2026, 10, 23, 22, 0).getTime();
const PROFILE = { kg: 75, sex: 'm', beta: 0.015, limit: 0.05, island: false, theme: 'auto' };
const cor = { name: 'Corona Extra', abv: 4.5, ml: 355, share: 1 }, sil = { name: 'Heineken Silver', abv: 4, ml: 330, share: 1 };
const hein = (qty) => ({ name: 'Heineken', abv: 5, ml: 330, qty, share: 1 });
const hist = [21, 17, 12, 9, 6, 4, 2, 1].map((k, i) => {
  const start = NOW - k * 864e5 - 10 * 36e5, peak = [0.061, 0.042, 0.098, 0.031, 0.074, 0.052, 0.112, 0.045][i], count = [5, 3, 8, 2, 6, 4, 9, 3][i];
  return { start, clear: start + (6 + k % 3) * 36e5, G: count * 13, peak, count, fed: false };
});
const session = (rounds) => ({ v: 5, fed: false, driveAt: null, water: null, loggedAt: NOW - 60000, rounds });
const STATES = {
  empty: { profile: PROFILE, session: session([]), history: hist, stash: [], favs: [{ id: 'hein', ml: 330 }, { id: 'hsil', ml: 330 }] },
  impaired: { profile: PROFILE, history: hist, favs: [{ id: 'hein', ml: 330 }, { id: 'hsil', ml: 330 }],
    stash: [{ id: 'c', drink: cor, left: 1 }, { id: 's', drink: sil, left: 4 }],
    session: session([{ id: 'a', start: NOW - 30 * 60000, end: null, lastAt: NOW - 60000, drinks: [hein(1)], late: false }]) },
  over: { profile: PROFILE, history: hist, favs: [{ id: 'hein', ml: 330 }, { id: 'hsil', ml: 330 }], stash: [],
    session: session([{ id: 'a', start: NOW - 2 * 3600000, end: null, lastAt: NOW - 60000, drinks: [hein(5)], late: false }]) }
};

(async () => {
  const srv = await serve();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const taken = [];
  async function page(stateName, scheme, w, h) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addInitScript(([s, v]) => { try { localStorage.setItem('dryseason.v1', JSON.stringify(s)); localStorage.setItem('dryseason.app', JSON.stringify({ seenVersion: v, toured: true, helped: true })); } catch (e) {} }, [STATES[stateName], VERSION]);
    const p = await ctx.newPage();
    await p.clock.setFixedTime(NOW);
    const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(url);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1800);
    p.__errs = errs; p.__ctx = ctx;
    return p;
  }
  const tap = (p, sel) => p.evaluate((q) => document.querySelector(q).click(), sel);
  const tapText = (p, sel, text) => p.evaluate(([q, t]) => [...document.querySelectorAll(q)].find((e) => e.textContent.includes(t)).click(), [sel, text]);
  async function snap(p, name) {
    await p.waitForTimeout(350);
    if (!/^(sheet|dialog)/.test(name) && await p.evaluate(() => !!document.querySelector('dialog[open]'))) throw new Error('a dialog is open over ' + name);
    const buf = await p.screenshot({ mask: [p.locator('#scene3d')], maskColor: '#ff00ff' });
    taken.push([name, buf]);
  }
  for (const scheme of ['dark', 'light']) {
    for (const st of ['empty', 'impaired', 'over']) {
      const p = await page(st, scheme, 384, 820);
      await snap(p, `${st}-${scheme}-tonight`);
      if (st === 'impaired') {
        await p.evaluate(() => window.scrollTo(0, 700)); await snap(p, `${st}-${scheme}-tonight-scrolled`);
        for (const t of ['plan', 'history', 'you']) { await tap(p, `[data-go=${t}]`); await snap(p, `${st}-${scheme}-${t}`); }
      }
      if (p.__errs.length) console.log('page errors in', st, scheme, p.__errs);
      await p.__ctx.close();
    }
  }
  // sheets and dialogs
  {
    const p = await page('impaired', 'light', 384, 820);
    await tap(p, '#qaAdd'); await snap(p, 'sheet-picker');
    await tapText(p, '#pickList .cat', 'Regional'); await snap(p, 'sheet-picker-regional');
    await tapText(p, '#pickList .pick', 'Corona'); await snap(p, 'sheet-options');
    await p.keyboard.press('Escape');
    await tap(p, '[data-go=history]'); await tap(p, '#stashAdd'); await snap(p, 'sheet-stash-picker');
    await p.keyboard.press('Escape');
    await tap(p, '[data-go=tonight]'); await tap(p, '#settingsBtn'); await snap(p, 'dialog-settings');
    await p.keyboard.press('Escape'); await tap(p, '#settingsBtn'); await tap(p, '#setHelp'); await snap(p, 'dialog-help');
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    await tap(p, '#qaLate'); await snap(p, 'sheet-late');
    await p.__ctx.close();
  }
  { const p = await page('impaired', 'dark', 430, 932); await snap(p, 'wide-430-tonight'); await p.__ctx.close(); }
  await browser.close(); srv.close();

  let bad = 0;
  for (const [name, buf] of taken) {
    const f = path.join(DIR, name + '.png');
    if (MODE === 'save') { fs.writeFileSync(f, buf); continue; }
    if (!fs.existsSync(f)) { console.log('MISSING baseline', name); bad++; continue; }
    if (Buffer.compare(fs.readFileSync(f), buf) !== 0) { fs.writeFileSync(path.join(DIR, name + '.new.png'), buf); console.log('DIFF   ', name); bad++; }
  }
  console.log(MODE === 'save' ? 'saved ' + taken.length + ' screens to ' + DIR : bad ? 'visual_check: ' + bad + ' of ' + taken.length + ' differ' : 'visual_check: ok (' + taken.length + ' screens identical)');
  process.exitCode = bad ? 1 : 0;
})();

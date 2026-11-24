/* End-to-end check of the offline and update flow (Node version of offline_check.py).
 *
 * Run from the repo root:  NODE_PATH=$(npm root -g) node tests/offline_check.js
 * Needs Playwright for Node with Chromium.
 *
 * 1. Serves a copy of the site on localhost, opens it, logs a drink, so the service worker saves everything.
 * 2. Stops the server completely, goes offline, reloads, and confirms the app, fonts, tabs, the saved
 *    drink and the drink picker still work, and the Offline badge shows.
 * 3. Starts the server again with a bumped version, taps Check for updates, and confirms the update card
 *    appears and Update now reloads into the new version with the drink still saved.
 */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['.git', 'tests', 'docs', 'node_modules']);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

function copySite(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(ROOT)) {
    if (SKIP.has(f) || f.startsWith('.')) continue;
    fs.cpSync(path.join(ROOT, f), path.join(dest, f), { recursive: true });
  }
}
function serve(dir, port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(dir, p);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
const stop = (srv) => new Promise((r) => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => r()); });
const freePort = () => new Promise((r) => { const s = http.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

(async () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'dry-site-'));
  copySite(site);
  const port = await freePort();
  const url = 'http://127.0.0.1:' + port + '/index.html';
  let srv = await serve(site, port);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const results = [];
  const ok = (m) => { results.push(m); console.log('ok   ' + m); };

  try {
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('dry-season-')) && (await (await caches.open((await caches.keys())[0])).keys()).length >= 20, null, { timeout: 30000 });
    const version = await page.evaluate(() => self.DRY_VERSION);
    ok('service worker installed and the shell is cached (version ' + version + ')');

    await page.click('#qaAdd'); await page.click('.pick-add >> nth=0'); await page.waitForTimeout(600);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('dryseason.v1')).session.rounds.flatMap((r) => r.drinks).length);
    assert.equal(before, 1);

    // Offline: no server at all, and the browser says it is offline.
    await stop(srv);
    await ctx.setOffline(true);
    await page.reload(); await page.waitForTimeout(1500);
    assert.equal(await page.title(), 'Dry Season');
    assert.equal(await page.locator('#net').isVisible(), true, 'Offline badge shows');
    const drinks = await page.evaluate(() => JSON.parse(localStorage.getItem('dryseason.v1')).session.rounds.flatMap((r) => r.drinks).length);
    assert.equal(drinks, 1, 'the saved drink survives');
    assert.equal(await page.evaluate(() => document.fonts.check('16px "Schibsted Grotesk"') && document.fonts.check('16px "Alfa Slab One"')), true, 'fonts load offline');
    ok('app opens offline with its fonts, the Offline badge and the saved drink');
    for (const t of ['plan', 'history', 'you', 'tonight']) {
      await page.click('[data-go=' + t + ']');
      assert.equal(await page.evaluate(() => document.body.dataset.tab), t);
    }
    ok('all four tabs work offline');
    await page.click('#qaAdd'); await page.click('.pick-add >> nth=1'); await page.waitForTimeout(500);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('dryseason.v1')).session.rounds.flatMap((r) => r.drinks).length);
    assert.equal(after, 2);
    ok('logging a drink works offline');

    // Update: a new version appears on the server.
    const vfile = path.join(site, 'version.js');
    const next = version.replace(/(\d+)$/, (n) => String(+n + 1));
    fs.writeFileSync(vfile, fs.readFileSync(vfile, 'utf8').replace(version, next));
    srv = await serve(site, port);
    await ctx.setOffline(false);
    await page.waitForFunction(() => navigator.onLine);
    // Coming back online checks for an update by itself, and the card then covers the tab bar until it is answered.
    const auto = await page.waitForSelector('#coaster.show', { timeout: 8000 }).catch(() => null);
    if (!auto) { await page.click('[data-go=tonight]'); await page.click('#settingsBtn'); await page.click('#checkNow'); await page.waitForSelector('#coaster.show', { timeout: 20000 }); }
    ok('update card appears when a new version is published (' + next + ')');
    await page.click('#updNow');
    await page.waitForFunction((v) => document.getElementById('appVersion').textContent.includes(v), next, { timeout: 30000 });
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('dryseason.v1')).session.rounds.flatMap((r) => r.drinks).length);
    assert.equal(kept, 2, 'drinks kept across the update');
    ok('Update now reloads into ' + next + ' and keeps the saved drinks');
    assert.deepEqual(errors, [], 'no page errors');
    ok('no page errors');
    console.log('offline_check: ok');
  } catch (e) {
    console.log('FAIL ' + (e && e.message || e));
    console.log('errors so far: ' + JSON.stringify(errors));
    process.exitCode = 1;
  } finally {
    await browser.close(); await stop(srv);
    fs.rmSync(site, { recursive: true, force: true });
  }
})();

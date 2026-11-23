/* Browser check of late logging: rounds, the dial, the horizon and History.
 *
 * Run from the repo root:  node tests/late_check.js
 * Needs Playwright for Node with Chromium (preinstalled in the dev container).
 * The clock is fixed at 22:00 on 23 November 2026 so the numbers are stable.
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const local = (h, m = 0, d = 23) => new Date(2026, 10, d, h, m).getTime();
const hein = (qty) => ({ name: 'Heineken', abv: 5, ml: 330, qty, share: 1 });
const PROFILE = { kg: 75, sex: 'm', beta: 0.015, limit: 0.05, island: true };

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

async function open(browser, url, saved) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.setFixedTime(new Date(2026, 10, 23, 22, 0));
  await page.goto(url);
  await page.evaluate((s) => {
    localStorage.clear();
    if (s) localStorage.setItem('dryseason.v1', JSON.stringify(s));
    localStorage.setItem('dryseason.app', JSON.stringify({ seenVersion: self.DRY_VERSION }));
  }, saved);
  await page.goto(url);
  await page.waitForTimeout(400);
  return { page, errors };
}

const text = (page, sel) => page.locator(sel).first().textContent();
const EMPTY = { profile: PROFILE, session: { v: 5, rounds: [], fed: false, driveAt: null, water: null }, history: [], favs: [{ id: 'hein', ml: 330 }, { id: 'hsil', ml: 330 }] };

/** Open the dial sheet and set a round: a From chip plus 15 minute nudges, an Until chip, and Heinekens. */
async function logRound(page, o) {
  await page.getByRole('button', { name: 'Log earlier drinks' }).click();
  await page.waitForTimeout(300);
  await page.locator('#fromChips .chip', { hasText: o.from }).click();
  for (let i = 0; i < (o.fromUp || 0); i++) await page.click('#fromUp');
  await page.locator('#untilChips .chip', { hasText: o.until }).click();
  const have = Number((await text(page, '#lateFavs .fav-card:first-child .fc-count')).trim());
  for (let i = have; i < o.heineken; i++) await page.getByRole('button', { name: 'Add one Heineken 330 ml' }).click();
  await page.waitForTimeout(200);
}

const checks = [
  ['an old live session upgrades to one live round, and can be finished', async (browser, url) => {
    const { page, errors } = await open(browser, url, {
      profile: PROFILE,
      session: { start: local(20), end: local(22), still: true, fed: false, driveAt: null, water: null, drinks: [hein(2)] },
      history: [], favs: ['hsil', 'corona']
    });
    assert.equal(await page.locator('#rounds li').count(), 1);
    assert.match(await text(page, '#rounds li'), /20:00/);
    assert.match(await text(page, '#rounds li'), /still going/);
    await page.getByRole('button', { name: 'Finished drinking' }).click();
    assert.match(await text(page, '#rounds li'), /20:00 to 22:00/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['log a round you already had on the dial, then see it on the night', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY);
    await logRound(page, { from: 'Lunch', fromUp: 4, until: '4 h ago', heineken: 6 });
    assert.equal((await text(page, '#dlTime')).trim(), '01:16');
    assert.equal((await text(page, '#lateAdd')).trim(), 'Add round to tonight');
    await page.click('#lateAdd');
    await page.waitForTimeout(1200);
    assert.equal((await text(page, '#clearTime')).trim(), '01:16');
    assert.equal(await page.locator('#rounds li').count(), 1);
    assert.match(await text(page, '#rounds li'), /14:00 to 18:00/);
    await page.getByRole('button', { name: 'Log earlier drinks' }).click();
    await page.locator('#fromChips .chip', { hasText: 'Last night' }).click();
    assert.equal((await text(page, '#lateAdd')).trim(), 'Save to History');
    assert.deepEqual(errors, []);
    await page.close();
  }]
];

(async () => {
  const port = await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const [name, fn] of checks) {
      try { await fn(browser, `http://127.0.0.1:${port}/`); console.log('ok   ' + name); }
      catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').slice(0, 6).join('\n     ')); }
    }
  } finally {
    await browser.close();
    srv.kill();
  }
  console.log(failed ? `late_check: ${failed} failed` : 'late_check: ok');
  process.exit(failed ? 1 : 0);
})();

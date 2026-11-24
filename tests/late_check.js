/* Browser check of late logging: rounds, the dial, the horizon and History.
 *
 * Run from the repo root:  node tests/late_check.js   (ONLY=Appearance node tests/late_check.js for one)
 * Needs Playwright for Node with Chromium (preinstalled in the dev container).
 * The clock is fixed at 22:00 on 23 November 2026 so the numbers are stable.
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
const M = require('../model.js');

const ROOT = path.join(__dirname, '..');
const local = (h, m = 0, d = 23) => new Date(2026, 10, d, h, m).getTime();
const hein = (qty) => ({ name: 'Heineken', abv: 5, ml: 330, qty, share: 1 });
const PROFILE = { kg: 75, sex: 'm', beta: 0.015, limit: 0.05, island: true };

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

async function open(browser, url, saved, scheme) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme || 'dark' });
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
  for (let i = 0; i < (o.fromDown || 0); i++) await page.click('#fromDown');
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
  ,
  ['a second round continues the night, and overlapping times ask first', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY);
    await logRound(page, { from: 'Lunch', fromUp: 4, until: '4 h ago', heineken: 6 });
    await page.click('#lateAdd');
    await page.waitForTimeout(1200);
    await logRound(page, { from: '2 h ago', until: 'Just now', heineken: 3 });
    assert.equal((await text(page, '#lateAdd')).trim(), 'Add round · continues tonight');
    await page.click('#lateAdd');
    await page.waitForTimeout(1200);
    assert.match(await text(page, '#nightNote'), /At 20:00 you still had 0\.070%/);
    assert.equal((await text(page, '#clearTime')).trim(), '06:22');
    await logRound(page, { from: '4 h ago', fromDown: 4, until: '4 h ago', heineken: 2 });
    await page.click('#lateAdd');
    await page.waitForTimeout(300);
    assert.equal(await page.getByText('Same drinks, or extra ones?').isVisible(), true);
    await page.getByRole('button', { name: /Extra drinks/ }).click();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('#rounds li').count(), 3);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['edit a round, remove every round, and open a past night', async (browser, url) => {
    const past = { start: local(20, 0, 22), end: local(23, 0, 22), drinks: [hein(3)] };
    const sim = M.simulate(Object.assign({ rounds: [past] }, PROFILE, { fed: false }));
    const entry = { start: sim.start, clear: sim.clear, G: sim.G, peak: sim.peak, count: 3, rounds: [Object.assign({ id: 'h1', late: true }, past)] };
    const { page, errors } = await open(browser, url, Object.assign({}, EMPTY, { history: [entry] }));
    page.on('dialog', (d) => d.accept());
    await logRound(page, { from: 'Lunch', fromUp: 4, until: '4 h ago', heineken: 6 });
    await page.click('#lateAdd');
    await page.waitForTimeout(1200);
    await page.locator('#rounds li .rc-open').first().click();
    await page.waitForTimeout(300);
    assert.equal((await text(page, '#lateTitle')).trim(), 'Edit round');
    await page.click('#untilDown');
    await page.getByRole('button', { name: 'Save round' }).click();
    await page.waitForTimeout(1200);
    assert.match(await text(page, '#rounds li'), /14:00 to 17:45/);
    await page.locator('#rounds li .rc-open').first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Remove round' }).click();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('#rounds li').count(), 0);
    assert.equal((await text(page, '#clearTime')).trim(), 'Clear');
    const ridge = await page.locator('#horizon .hz-ridge').getAttribute('d');
    assert.ok(ridge.split('L').every((pt) => pt.trim().endsWith(' 142.0')), 'horizon is flat');
    await page.locator('#historyList li button').first().click();
    await page.waitForTimeout(400);
    const hm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    assert.equal((await text(page, '#pastClear')).trim(), hm(entry.clear));
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['editing a live round keeps it going, even if the edit takes a while', async (browser, url) => {
    const { page, errors } = await open(browser, url, Object.assign({}, EMPTY, {
      session: { v: 5, fed: false, driveAt: null, water: null, rounds: [{ id: 'l', start: local(20), end: null, drinks: [hein(2)], late: false, lastAt: local(21, 50) }] }
    }));
    await page.locator('#rounds li .rc-open').first().click();
    await page.waitForTimeout(300);
    assert.equal((await text(page, '#untilVal')).trim(), 'Now');
    await page.clock.setFixedTime(new Date(2026, 10, 23, 22, 2));
    await page.getByRole('button', { name: 'Add one Heineken 330 ml' }).click();
    assert.equal((await text(page, '#untilVal')).trim(), 'Now');
    await page.getByRole('button', { name: 'Save round' }).click();
    await page.waitForTimeout(1200);
    assert.match(await text(page, '#rounds li'), /still going/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['an old History entry opens, and saving to History sends no orb to tonight', async (browser, url) => {
    const old = { start: local(19, 0, 20), clear: local(2, 30, 21), G: 52, peak: 0.061, count: 4 };
    const live = { id: 'l', start: local(20), end: null, drinks: [hein(2)], late: false, lastAt: local(21, 50) };
    const { page, errors } = await open(browser, url, Object.assign({}, EMPTY, { history: [old],
      session: { v: 5, fed: false, driveAt: null, water: null, rounds: [live] } }));
    await page.locator('#historyList li button').first().click();
    await page.waitForTimeout(300);
    assert.equal((await text(page, '#pastClear')).trim(), '02:30');
    assert.equal(await page.locator('#pastNote').isVisible(), true);
    await page.click('#pastClose');
    await page.getByRole('button', { name: 'Log earlier drinks' }).click();
    await page.locator('#fromChips .chip', { hasText: 'Last night' }).click();
    await page.click('#lateAdd');
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.orb').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }],
  ['with Reduce Motion the round still lands, with a cross fade', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await logRound(page, { from: '2 h ago', until: 'Just now', heineken: 2 });
    await page.click('#lateAdd');
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => document.getAnimations().some((a) => a.effect && a.effect.target && a.effect.target.id === 'horizon')), true);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#rounds li').count(), 1);
    assert.equal(await page.locator('.orb').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['the 3D hero: a sealed bottle when empty, a pour for the first round, then the night', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY);
    page.on('dialog', (d) => d.accept());
    assert.equal(await page.locator('#hero.three').count(), 1, '3D hero is on');
    assert.equal(await page.locator('#scene3d').getAttribute('data-state'), 'empty');
    assert.equal((await text(page, '#clearTime')).trim(), 'Clear');
    assert.equal(await page.locator('#hero.empty').count(), 1);
    await logRound(page, { from: '2 h ago', until: 'Just now', heineken: 2 });
    await page.click('#lateAdd');
    await page.waitForFunction(() => document.querySelector('#scene3d').dataset.state === 'night', null, { timeout: 30000 });
    assert.equal(await page.locator('#hero.empty').count(), 0);
    await page.locator('#rounds li .rc-open').first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Remove round' }).click();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#scene3d').getAttribute('data-state'), 'empty');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['Appearance: choose Dark or Light for the whole app; the 3D hero stays at dusk', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY, 'light');
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const heroText = () => page.evaluate(() => getComputedStyle(document.getElementById('clearTime')).color);
    assert.equal(await bg(), 'rgb(245, 238, 225)', 'follows a light phone by default');
    assert.equal(await heroText(), 'rgb(246, 237, 218)', 'the 3D hero stays at dusk in light mode');
    await page.click('#settingsBtn');
    await page.click('#themeSeg [data-theme-choice="dark"]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await bg(), 'rgb(22, 18, 14)');
    await page.reload(); await page.waitForTimeout(400);
    assert.equal(await bg(), 'rgb(22, 18, 14)', 'the choice is remembered');
    assert.equal(await page.locator('#themeSeg [data-theme-choice="dark"]').getAttribute('aria-pressed'), 'true');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.click('#settingsBtn');
    await page.click('#themeSeg [data-theme-choice="light"]');
    assert.equal(await bg(), 'rgb(245, 238, 225)', 'Light wins over a dark phone');
    await page.click('#themeSeg [data-theme-choice="auto"]');
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-theme')), false);
    assert.equal(await bg(), 'rgb(22, 18, 14)', 'Automatic follows the phone again');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['start options, then a six pack as a stash you open one by one', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null,
      rounds: [{ id: 'a', start: local(20), end: local(21), drinks: [hein(1)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.click('#openPicker');
    await page.locator('#pickList .pick', { hasText: 'Heineken' }).first().click();
    assert.equal(await page.locator('#startWrap').isVisible(), true);
    assert.equal(await page.locator('#startChips .chip[aria-pressed="true"]').textContent(), 'Right after your last round (21:00)');
    await page.locator('#startChips .chip', { hasText: 'Just now' }).click();
    for (let i = 1; i < 6; i++) await page.click('#qtyPlus');
    await page.click('#cfgAdd');
    assert.equal(await page.locator('#cfgAsk').isVisible(), true);
    assert.match(await text(page, '#askTitle'), /All 6 right now/);
    await page.click('#askB');
    await page.waitForTimeout(300);
    assert.equal((await text(page, '#stashCount')).trim(), '1 of 6 Heineken opened');
    await page.click('#stashOpen');
    assert.equal((await text(page, '#stashCount')).trim(), '2 of 6 Heineken opened');
    assert.match(await text(page, '#rounds li:last-child'), /22:00 to now/);
    await page.getByRole('button', { name: 'Finished drinking' }).click();
    assert.equal(await page.locator('#stash').isVisible(), false, 'finishing puts the stash away');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['a start inside the last round asks, and picking up again reopens it', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null,
      rounds: [{ id: 'a', start: local(20), end: local(21, 45), drinks: [hein(2)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.click('#openPicker');
    await page.locator('#pickList .pick', { hasText: 'Heineken' }).first().click();
    await page.locator('#startChips .chip', { hasText: '30 min ago' }).click();
    await page.click('#cfgAdd');
    assert.match(await text(page, '#askTitle'), /during your last round/);
    await page.click('#askA');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#rounds li').count(), 1);
    assert.match(await text(page, '#rounds li'), /20:00 to now/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['catch up asks after a gap and spreads what you opened, counting the stash', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21),
      stash: { drink: { name: 'Heineken', abv: 5, ml: 330, share: 1 }, total: 6, opened: 1 },
      rounds: [{ id: 'a', start: local(21), end: null, lastAt: local(21), drinks: [hein(1)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#catchup').isVisible(), true);
    assert.match(await text(page, '#cuText'), /21:00/);
    await page.click('#cuPlus');
    await page.click('#cuLog');
    await page.waitForTimeout(300);
    assert.equal((await text(page, '#stashCount')).trim(), '3 of 6 Heineken opened');
    assert.match(await text(page, '#rounds li'), /3 × Heineken/);
    await page.reload(); await page.waitForTimeout(800);
    assert.equal(await page.locator('#catchup').isVisible(), false, 'quiet right after');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['the One more shortcut logs another of your last drink', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21, 50),
      rounds: [{ id: 'a', start: local(21), end: null, lastAt: local(21, 50), drinks: [hein(2)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.goto(url + '?action=one'); await page.waitForTimeout(800);
    assert.match(await text(page, '#rounds li'), /3 × Heineken/);
    assert.equal(await page.evaluate(() => location.search), '');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['adjust times nudges a round by 15 minutes', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null,
      rounds: [{ id: 'a', start: local(20), end: local(21), drinks: [hein(2)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.getByRole('button', { name: 'Adjust times' }).click();
    await page.getByRole('button', { name: 'Started 15 minutes earlier' }).click();
    await page.getByRole('button', { name: 'Finished 15 minutes later' }).click();
    assert.match(await text(page, '#rounds li'), /19:45 to 21:15/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['Help and Settings open from the top bar; Appearance lives in Settings', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY);
    await page.getByRole('button', { name: 'How Dry Season works' }).first().click();
    assert.equal(await page.locator('#help').isVisible(), true);
    assert.match(await text(page, '#help'), /Never use this to decide whether you can drive/);
    await page.click('#helpClose');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.equal(await page.locator('#settings').isVisible(), true);
    assert.equal((await text(page, '#settings .set-h')).trim(), 'Appearance', 'Appearance comes first');
    assert.equal(await page.locator('#bodyDetails').count(), 0);
    await page.click('#themeSeg [data-theme-choice="light"]');
    await page.click('#settingsClose');
    assert.match(await text(page, '#setSum'), /75 kg · Male · Light theme/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['a brand new visitor gets the walkthrough once, and can replay it from Help', async (browser, url) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date(2026, 10, 23, 22, 0));
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.goto(url); await page.waitForTimeout(1400);
    assert.equal(await page.locator('#tour').isVisible(), true);
    assert.equal((await text(page, '#tourStep')).trim(), '1 of 5');
    for (let i = 0; i < 4; i++) await page.click('#tourNext');
    assert.equal((await text(page, '#tourNext')).trim(), 'Got it');
    await page.click('#tourNext');
    assert.equal(await page.locator('#tour').isVisible(), false);
    await page.reload(); await page.waitForTimeout(1400);
    assert.equal(await page.locator('#tour').isVisible(), false, 'only once');
    await page.click('#helpBtn');
    await page.click('#helpTour');
    assert.equal(await page.locator('#tour').isVisible(), true);
    await page.click('#tourSkip');
    assert.equal(await page.locator('#tour').isVisible(), false);
    assert.deepEqual(errors, []);
    await page.close();
  }]
];

(async () => {
  const port = await freePort();
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  // Software WebGL, so the 3D hero runs in headless Chromium too
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;
  try {
    // ONLY=<words> runs just the scenarios whose name contains them
    for (const [name, fn] of checks.filter(([n]) => !process.env.ONLY || n.includes(process.env.ONLY))) {
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

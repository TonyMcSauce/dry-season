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
const stashRows = (page) => page.$$eval('#stashRows li', (rows) => rows.map((r) => r.querySelector('.sr-name').textContent + ':' + (/(\d+)/.exec(r.querySelector('.sr-left').textContent) || [0, '1'])[1]));
const stashEditRows = (page) => page.$$eval('#stashEdit li', (rows) => rows.map((r) => r.querySelector('.se-name').textContent + ':' + r.querySelector('.se-n').textContent));
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
    await page.click('[data-go=history]');
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
    await page.click('[data-go=history]');
    await page.locator('#historyList li button').first().click();
    await page.waitForTimeout(300);
    assert.equal((await text(page, '#pastClear')).trim(), '02:30');
    assert.equal(await page.locator('#pastNote').isVisible(), true);
    await page.click('#pastClose');
    await page.click('[data-go=tonight]');
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
    assert.equal(await bg(), 'rgb(246, 240, 228)', 'follows a light phone by default');
    assert.equal(await heroText(), 'rgb(246, 237, 218)', 'the 3D hero stays at dusk in light mode');
    await page.click('#settingsBtn');
    await page.click('#themeSeg [data-theme-choice="dark"]'); await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await bg(), 'rgb(14, 21, 34)');
    await page.reload(); await page.waitForTimeout(400);
    assert.equal(await bg(), 'rgb(14, 21, 34)', 'the choice is remembered');
    assert.equal(await page.locator('#themeSeg [data-theme-choice="dark"]').getAttribute('aria-pressed'), 'true');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.click('#settingsBtn');
    await page.click('#themeSeg [data-theme-choice="light"]'); await page.waitForTimeout(650);
    assert.equal(await bg(), 'rgb(246, 240, 228)', 'Light wins over a dark phone');
    await page.click('#themeSeg [data-theme-choice="auto"]'); await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-theme')), false);
    assert.equal(await bg(), 'rgb(14, 21, 34)', 'Automatic follows the phone again');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['while a round is going, logging several still asks, and a stash of the same drink adds up', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null,
      rounds: [{ id: 'a', start: local(20), end: null, drinks: [hein(1)], late: false, lastAt: Date.now() }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.click('#openPicker');
    await page.locator('#pickList .pick', { hasText: 'Heineken' }).first().click();
    assert.equal(await page.locator('#startWrap').isVisible(), false, 'no start question while a round is going');
    await page.click('#qtyPlus'); await page.click('#qtyPlus');
    await page.click('#cfgAdd');
    assert.equal(await page.locator('#cfgAsk').isVisible(), true, 'it asks even though the night has begun');
    assert.match(await text(page, '#askTitle'), /All 3 right now/);
    await page.click('#askB');
    await page.waitForTimeout(300);
    assert.deepEqual(await stashRows(page), ['Heineken:2']);
    await page.click('#openPicker');
    await page.locator('#pickList .pick', { hasText: 'Heineken' }).first().click();
    await page.click('#qtyPlus'); await page.click('#qtyPlus');
    await page.click('#cfgAdd');
    assert.match(await text(page, '#askBS'), /Adds to the 2 Heineken in your stash/);
    await page.click('#askB');
    await page.waitForTimeout(300);
    assert.deepEqual(await stashRows(page), ['Heineken:4'], 'the stash grew by the 2 saved for later');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['start options, then a six pack as a stash you open one by one, and finishing keeps the rest', async (browser, url) => {
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
    assert.deepEqual(await stashRows(page), ['Heineken:5']);
    await page.click('#stashRows .sr-open');
    assert.deepEqual(await stashRows(page), ['Heineken:4']);
    assert.match(await text(page, '#rounds li:last-child'), /22:00 to now/);
    await page.getByRole('button', { name: 'Finished drinking' }).click();
    assert.equal(await page.locator('#stash').isVisible(), true, 'finishing the night keeps what is left in the fridge');
    assert.deepEqual(await stashRows(page), ['Heineken:4']);
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
    assert.deepEqual(await stashRows(page), ['Heineken:3']);
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
  ,
  ['the "All right now?" question follows the count as you change it', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY);
    await page.click('#openPicker');
    await page.locator('#pickList .cat', { hasText: 'Regional' }).click();
    await page.locator('#pickList .pick', { hasText: 'Corona' }).first().click();
    await page.click('#qtyPlus'); await page.click('#qtyPlus');
    await page.click('#cfgAdd');
    assert.match(await text(page, '#askTitle'), /All 3 right now/);
    for (let i = 0; i < 3; i++) await page.click('#qtyPlus');
    assert.match(await text(page, '#askTitle'), /All 6 right now/);
    assert.match(await text(page, '#askA'), /Log all 6/);
    assert.match(await text(page, '#askB'), /Open 1, save 5 for later/);
    await page.click('#askB'); await page.waitForTimeout(300);
    assert.deepEqual(await stashRows(page), ['Corona Extra:5']);
    await page.click('#openPicker');
    await page.locator('#pickList .cat', { hasText: 'Regional' }).click();
    await page.locator('#pickList .pick', { hasText: 'Corona' }).first().click();
    await page.locator('#startChips .chip', { hasText: 'Just now' }).click().catch(() => {});
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['dropping the count back to 1 puts the question away', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY);
    await page.click('#openPicker');
    await page.locator('#pickList .cat', { hasText: 'Regional' }).click();
    await page.locator('#pickList .pick', { hasText: 'Corona' }).first().click();
    await page.click('#qtyPlus');
    await page.click('#cfgAdd');
    assert.equal(await page.locator('#cfgAsk').isVisible(), true);
    await page.click('#qtyMinus');
    assert.equal(await page.locator('#cfgAsk').isVisible(), false);
    assert.equal(await page.locator('#cfgAdd').isVisible(), true);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['right after logging six, the pill warns you are heading over the limit, never clear', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21, 59),
      rounds: [{ id: 'a', start: local(21, 59), end: null, lastAt: local(21, 59), drinks: [hein(6)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    assert.match(await text(page, '#pillText'), /Kicking in: over the limit by \d\d:\d\d/);
    assert.match(await text(page, '#pillNote'), /still reaching your blood/);
    assert.equal(await page.evaluate(() => document.getElementById('hero').dataset.state), 'over');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['one drink just logged reads impaired, not clear', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(22),
      rounds: [{ id: 'a', start: local(22), end: null, lastAt: local(22), drinks: [hein(1)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    assert.doesNotMatch(await text(page, '#pillText'), /Clear/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['one tap under the bottle adds another, and Undo takes it back', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21, 50),
      rounds: [{ id: 'a', start: local(21, 30), end: null, lastAt: local(21, 50), drinks: [hein(1)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    const btns = page.locator('#anotherBtns button');
    assert.equal(await btns.count(), 1);
    assert.match(await btns.first().textContent(), /\+ Another Heineken/);
    await btns.first().click(); await page.waitForTimeout(200);
    assert.match(await text(page, '#rounds li'), /2 × Heineken/);
    assert.equal(await page.locator('#toastUndo').isVisible(), true);
    await page.click('#toastUndo'); await page.waitForTimeout(200);
    assert.match(await text(page, '#rounds li'), /1 × Heineken/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['with two different drinks, both get a button, most recent first', async (browser, url) => {
    const cor = { name: 'Corona Extra', abv: 4.5, ml: 355, qty: 1, share: 1, at: local(21, 40) };
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21, 50),
      rounds: [{ id: 'a', start: local(21), end: null, lastAt: local(21, 40), drinks: [Object.assign(hein(1), { at: local(21) }), cor], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    const btns = page.locator('#anotherBtns button');
    assert.equal(await btns.count(), 2);
    assert.match(await btns.nth(0).textContent(), /Corona/);
    assert.match(await btns.nth(1).textContent(), /Heineken/);
    await btns.nth(1).click(); await page.waitForTimeout(200);
    assert.match(await btns.nth(0).textContent(), /Heineken/, 'the one just had moves first');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['several drinks in the stash: the newest opens first, and History edits the same numbers', async (browser, url) => {
    const cor = { name: 'Corona Extra', abv: 4.5, ml: 355, share: 1 }, sil = { name: 'Heineken Silver', abv: 4, ml: 330, share: 1 };
    const saved = Object.assign({}, EMPTY, { stash: [{ id: 'c', drink: cor, left: 2 }, { id: 's', drink: sil, left: 4 }],
      session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: Date.now(),
        rounds: [{ id: 'a', start: Date.now() - 3600000, end: null, lastAt: Date.now() - 60000, drinks: [hein(1)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    assert.deepEqual(await stashRows(page), ['Heineken Silver:4', 'Corona Extra:2'], 'most recently added first');
    assert.match(await text(page, '#stashTotal'), /6 on hand/);
    const btns = page.locator('#anotherBtns button');
    assert.match(await btns.nth(0).textContent(), /^Open Silver · 4$/);
    assert.match(await btns.nth(1).textContent(), /^Open Corona · 2$/);
    await btns.nth(0).click(); await page.waitForTimeout(250);
    assert.deepEqual(await stashRows(page), ['Heineken Silver:3', 'Corona Extra:2']);
    assert.match(await text(page, '#rounds li'), /Heineken Silver/);
    // History shows and edits the very same numbers
    await page.click('[data-go=history]');
    assert.deepEqual(await stashEditRows(page), ['Heineken Silver:3', 'Corona Extra:2']);
    await page.locator('#stashEdit li', { hasText: 'Corona' }).locator('.se-more').click();
    await page.locator('#stashEdit li', { hasText: 'Corona' }).locator('.se-more').click();
    assert.match(await text(page, '#stashEditTotal'), /7 on hand/);
    await page.click('[data-go=tonight]');
    assert.deepEqual(await stashRows(page), ['Heineken Silver:3', 'Corona Extra:4'], 'Tonight follows what History changed');
    assert.match(await text(page, '#stashTotal'), /7 on hand/);
    await page.click('[data-go=history]');
    await page.locator('#stashEdit li', { hasText: 'Silver' }).locator('.se-less').click();
    await page.locator('#stashEdit li', { hasText: 'Silver' }).locator('.se-less').click();
    await page.locator('#stashEdit li', { hasText: 'Silver' }).locator('.se-less').click();
    assert.deepEqual(await stashEditRows(page), ['Corona Extra:4'], 'down to zero takes a drink off');
    await page.reload(); await page.waitForTimeout(700);
    await page.click('[data-go=history]');
    assert.deepEqual(await stashEditRows(page), ['Corona Extra:4'], 'it is saved');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['buying beer: add to the stash from History, with no night going', async (browser, url) => {
    const { page, errors } = await open(browser, url, EMPTY);
    await page.click('[data-go=history]');
    assert.equal(await page.locator('#stashEditEmpty').isVisible(), true);
    await page.click('#stashAdd');
    assert.equal((await text(page, '#sheetTitle')).trim(), 'Add to your stash');
    await page.locator('#pickList .cat', { hasText: 'Regional' }).click();
    const corona = page.locator('#pickList .pick-row', { hasText: 'Corona' }).first();
    await corona.locator('.pick-add').click();
    await corona.locator('.pick-add').click();
    assert.match(await text(page, '#pickList .pick-row:has(.pick-stock:not([hidden])) .pick-stock'), /2 in stash/, 'the card shows how many you already have');
    const stock = await page.evaluate(() => [...document.querySelectorAll('#pickList .pick-row')].map((c) => {
      const st = c.querySelector('.pick-stock'); if (!st || st.hidden) return null;
      const pill = c.querySelector('.abv-pill').getBoundingClientRect(), n = st.getBoundingClientRect();
      return n.top >= pill.bottom - 0.5;
    }).filter((x) => x !== null));
    assert.ok(stock.length > 0 && stock.every(Boolean), 'the stock count sits under the strength pill, never on top of it');
    assert.equal(await page.evaluate(() => { const t = document.getElementById('toast'); return !t.showPopover || t.matches(':popover-open'); }), true, 'the message is in the top layer, above the sheet and its backdrop');
    await page.click('#sheetClose');
    assert.deepEqual(await stashEditRows(page), ['Corona Extra:2']);
    // the options screen adds several at once, and the question about start times never appears
    await page.click('#stashAdd');
    await page.locator('#pickList .cat', { hasText: 'Regional' }).click();
    await page.locator('#pickList .pick', { hasText: 'Silver' }).first().click();
    assert.equal(await page.locator('#startWrap').isVisible(), false, 'no start time for something you only bought');
    assert.equal(await page.locator('#shareBlock').isVisible(), false);
    for (let i = 1; i < 4; i++) await page.click('#qtyPlus');
    await page.click('#cfgAdd');
    assert.deepEqual(await stashEditRows(page), ['Heineken Silver:4', 'Corona Extra:2']);
    await page.click('[data-go=tonight]');
    assert.deepEqual(await stashRows(page), ['Heineken Silver:4', 'Corona Extra:2'], 'the same on Tonight');
    assert.equal(await page.locator('#nightNote:visible, #rounds li').count(), 0, 'nothing was logged as drunk');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['stash polish: running low is flagged, Restock and Buy more refill it, and Plan shows the same list', async (browser, url) => {
    const cor = { name: 'Corona Extra', abv: 4.5, ml: 355, share: 1 }, sil = { name: 'Heineken Silver', abv: 4, ml: 330, share: 1 };
    const saved = Object.assign({}, EMPTY, { stash: [{ id: 'c', drink: cor, left: 2 }, { id: 's', drink: sil, left: 4 }] });
    const { page, errors } = await open(browser, url, saved);
    const corRow = page.locator('#stashRows li', { hasText: 'Corona' }), silRow = page.locator('#stashRows li', { hasText: 'Silver' });
    assert.match(await text(corRow, '.sr-left'), /2 left · Running low/);
    assert.equal(await corRow.locator('.sr-restock').isVisible(), true);
    assert.equal(await silRow.locator('.sr-restock').isVisible(), false, 'a healthy stock has no nudge');
    // Plan shows the same list
    await page.click('[data-go=plan]');
    assert.deepEqual(await page.$$eval('#planStashList li', (r) => r.map((x) => x.textContent)), ['4Heineken Silver', '2Corona Extra · running low']);
    assert.match(await text(page, '#planStashTotal'), /6 drinks/);
    // Restock from Tonight opens the options for that very drink
    await page.click('[data-go=tonight]');
    await corRow.locator('.sr-restock').click();
    assert.equal((await text(page, '#sheetTitle')).trim(), 'Corona Extra');
    assert.equal((await text(page, '#cfgAdd')).trim(), 'Add to your stash');
    assert.equal(await page.inputValue('#cfgMl'), '355');
    for (let i = 0; i < 3; i++) await page.click('#qtyPlus');
    await page.click('#cfgAdd');
    assert.match(await text(corRow, '.sr-left'), /^6 left$/, 'refilled, so no longer low');
    assert.equal(await corRow.locator('.sr-restock').isVisible(), false);
    // Buy more from History
    await page.click('[data-go=history]');
    await page.locator('#stashEdit li', { hasText: 'Silver' }).locator('.se-buy').click();
    assert.equal((await text(page, '#sheetTitle')).trim(), 'Heineken Silver');
    await page.click('#cfgAdd');
    assert.deepEqual(await stashEditRows(page), ['Heineken Silver:5', 'Corona Extra:6']);
    assert.match(await text(page, '#stashEditTotal'), /11 on hand/);
    // Plan follows, and its button leads to the History editor
    await page.click('[data-go=plan]');
    assert.match(await text(page, '#planStashTotal'), /11 drinks/);
    await page.click('#planStashBtn');
    assert.equal(await page.evaluate(() => document.body.dataset.tab), 'history');
    // one left reads as the last one
    await page.locator('#stashEdit li', { hasText: 'Corona' }).locator('.se-n').waitFor();
    for (let i = 0; i < 5; i++) await page.locator('#stashEdit li', { hasText: 'Corona' }).locator('.se-less').click();
    await page.click('[data-go=tonight]');
    assert.match(await text(corRow, '.sr-left'), /^Last one$/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['a round with a long list of drinks wraps and never runs under the Adjust times button', async (browser, url) => {
    const sil = { name: 'Heineken Silver', abv: 4, ml: 330, qty: 4, share: 1 };
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null,
      rounds: [{ id: 'a', start: local(18, 0, 22), end: local(22, 25, 22), drinks: [sil, hein(3)], late: true }] } });
    const { page, errors } = await open(browser, url, saved);
    for (const w of [430, 390, 360, 320]) {
      await page.setViewportSize({ width: w, height: 844 });
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => {
        const what = document.querySelector('#rounds .rc-what').getBoundingClientRect();
        const btn = document.querySelector('#rounds .btn-mini').getBoundingClientRect();
        const card = document.querySelector('#rounds .round-card').getBoundingClientRect();
        return { whatRight: what.right, btnLeft: btn.left, btnRight: btn.right, cardRight: card.right };
      });
      assert.ok(m.whatRight <= m.btnLeft + 0.5, 'the drinks end before the button at ' + w + 'px (' + m.whatRight + ' vs ' + m.btnLeft + ')');
      assert.ok(m.btnRight <= m.cardRight, 'the button stays inside the card at ' + w + 'px');
    }
    assert.match(await text(page, '#rounds .rc-what'), /4 × Heineken Silver \+ 3 × Heineken/, 'the whole list is still there');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['History chart: the limit is named in the heading and never printed on a bar', async (browser, url) => {
    const mk = (k, peak, count) => { const start = local(12) - k * 864e5; return { start, clear: start + 7 * 36e5, G: count * 13, peak, count, fed: false }; };
    const saved = Object.assign({}, EMPTY, { history: [mk(11, 0.038, 8), mk(10, 0.027, 4), mk(9, 0.07, 9), mk(1, 0.088, 8)] });
    const { page, errors } = await open(browser, url, saved);
    await page.click('[data-go=history]');
    assert.equal((await text(page, '#hLimitKey')).trim(), 'Limit 0.05%');
    assert.equal(await page.$$eval('#hchart text', (t) => t.filter((x) => /Limit/.test(x.textContent)).length), 0, 'no label inside the plot to collide with a value');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['with a stash, the first button opens the next one', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21, 50),
      stash: { drink: { name: 'Heineken', abv: 5, ml: 330, share: 1 }, total: 6, opened: 1 },
      rounds: [{ id: 'a', start: local(21, 30), end: null, lastAt: local(21, 50), drinks: [hein(1)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    const first = page.locator('#anotherBtns button').first();
    assert.match(await first.textContent(), /Open Heineken · 5 left/);
    await first.click(); await page.waitForTimeout(200);
    assert.match(await first.textContent(), /Open Heineken · 4 left/);
    await page.click('#toastUndo'); await page.waitForTimeout(200);
    assert.match(await first.textContent(), /Open Heineken · 5 left/, 'Undo puts it back in the stash');
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['minus and plus on the round in progress; finished rounds keep only remove', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21, 50),
      rounds: [{ id: 'old', start: local(18), end: local(19), drinks: [hein(1)], late: false },
               { id: 'a', start: local(21, 30), end: null, lastAt: local(21, 50), drinks: [hein(2)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.getByRole('button', { name: 'One more Heineken' }).click(); await page.waitForTimeout(150);
    assert.match(await text(page, '#tabList li:last-child .li-name'), /3 × Heineken/);
    await page.getByRole('button', { name: 'One fewer Heineken' }).click(); await page.waitForTimeout(150);
    assert.match(await text(page, '#tabList li:last-child .li-name'), /2 × Heineken/);
    assert.equal(await page.getByRole('button', { name: 'One more Heineken' }).count(), 1, 'only the live round has plus');
    assert.equal(await page.getByRole('button', { name: 'Remove Heineken' }).count(), 1);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['drinking fast shows a pacing hint under the buttons', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21, 55),
      rounds: [{ id: 'a', start: local(21), end: null, lastAt: local(21, 55), drinks: [hein(5)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('#anotherHint').isVisible(), true);
    assert.match(await text(page, '#anotherHint'), /Wait about|Fast pace|Water first/);
    assert.deepEqual(errors, []);
    await page.close();
  }]
  ,
  ['once the Undo message fades, it never catches a tap meant for what is under it', async (browser, url) => {
    const saved = Object.assign({}, EMPTY, { session: { v: 5, fed: false, driveAt: null, water: null, loggedAt: local(21, 50),
      rounds: [{ id: 'a', start: local(21, 30), end: null, lastAt: local(21, 50), drinks: [hein(1)], late: false }] } });
    const { page, errors } = await open(browser, url, saved);
    await page.locator('#anotherBtns button').first().click();
    const box = await page.locator('#toast').boundingBox();
    await page.waitForTimeout(5800);
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#toast')); }, [box.x + box.width / 2, box.y + box.height / 2]);
    assert.equal(hit, false, 'the faded toast is out of the way');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('toast')).visibility), 'hidden');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('coaster')).visibility), 'hidden', 'a hidden update card is out of the way too');
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

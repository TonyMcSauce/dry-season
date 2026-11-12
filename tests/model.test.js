// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');

const H = 3600000, MIN = 60000;
const t0 = Date.UTC(2026, 10, 13, 17, 0);
const beer = (qty = 1, extra = {}) => Object.assign({ name: 'Castle Lager', abv: 5, ml: 340, qty, share: 1 }, extra);
const base = (drinks, over = {}) => Object.assign({ drinks, start: t0, end: t0 + 3 * H, kg: 80, sex: 'm', beta: 0.015, fed: false }, over);

test('grams of alcohol per drink', () => {
  assert.equal(M.gramsOf(beer()).toFixed(1), '13.4');
  assert.equal(M.gramsOf({ abv: 5.5, ml: 750, qty: 2, share: 0.5 }).toFixed(1), '32.5');
});

test('single dose peaks near the Widmark value and clears on schedule', () => {
  const o = base([beer(4)], { end: t0 });
  const sim = M.simulate(o);
  const G = M.gramsOf(beer(4));
  const widmark = G / (0.68 * 80 * 10);
  assert.ok(sim.peak < widmark && sim.peak > widmark - 0.025, `peak ${sim.peak} vs ${widmark}`);
  const hours = (sim.clear - t0) / H;
  const ideal = widmark / 0.015;
  // Elimination slows near zero, so clearing takes a little longer than the straight-line ideal.
  assert.ok(hours > ideal && hours < ideal + 1.0, `clears after ${hours} h, ideal ${ideal} h`);
});

test('food lowers the peak and a female body peaks higher', () => {
  const drinks = [beer(4)];
  const empty = M.simulate(base(drinks)).peak;
  const fed = M.simulate(base(drinks, { fed: true })).peak;
  const female = M.simulate(base(drinks, { sex: 'f' })).peak;
  assert.ok(fed < empty);
  assert.ok(female > empty);
});

test('under the legal limit comes before fully clear', () => {
  const sim = M.simulate(base([beer(8)]));
  const under = M.underLimitAt(sim, 0.05);
  assert.ok(sim.peak > 0.05);
  assert.ok(under > sim.peakAt && under < sim.clear);
  assert.ok(M.bacAt(sim, under + MIN) <= 0.05);
  assert.equal(M.underLimitAt(M.simulate(base([beer(1)])), 0.05), null);
});

test('status never reads clear while any alcohol remains', () => {
  assert.equal(M.status(0.06, 0.05), 'over');
  assert.equal(M.status(0.001, 0.05), 'impaired');
  assert.equal(M.status(0.0002, 0.05), 'clear');
  assert.equal(M.status(0, 0.05), 'clear');
});

test('drinks in the last hour follow the spread', () => {
  const o = base([beer(6)]);   // 6 beers over 3 h, 13.4 g each
  const perHour = M.stdLastHour(o, t0 + 3 * H);
  assert.equal(perHour.toFixed(2), (6 * 13.4196 / 3 / 10).toFixed(2));
  assert.equal(M.stdLastHour(o, t0 + 6 * H), 0);
});

test('blackout risk rises with peak, pace and an empty stomach', () => {
  assert.equal(M.blackoutRisk({ peak: 0.04, rise: 0.01, perHour: 1, fed: false }).level, 'low');
  assert.equal(M.blackoutRisk({ peak: 0.11, rise: 0.06, perHour: 2, fed: false }).level, 'raised');
  assert.equal(M.blackoutRisk({ peak: 0.16, rise: 0, perHour: 0, fed: true }).level, 'high');
  assert.equal(M.blackoutRisk({ peak: 0.12, rise: 0.11, perHour: 6, fed: true }).level, 'high');
});

test('pacing gap grows with drink size and keeps the peak under the ceiling', () => {
  const o = base([beer(7)], { end: t0 + 2 * H });
  const now = t0 + 2 * H;
  const small = M.pacingGap(o, now, M.gramsOf(beer()), 0.15);
  const big = M.pacingGap(o, now, M.gramsOf(beer(2)), 0.15);
  assert.ok(small !== null && big !== null && big >= small, `${small} vs ${big}`);
  const check = M.simulate(Object.assign({}, o, { extra: [{ t: now + big * MIN, g: M.gramsOf(beer(2)) }] }));
  assert.ok(check.peak < 0.15);
});

test('drive planner respects the margin and finds a sensible stop time', () => {
  const now = t0 + 2 * H;
  const o = base([beer(4)], { end: now });
  const tight = M.drivePlan(o, now, now + 2 * H, 60, true);
  assert.equal(tight.ok, false);
  const later = M.drivePlan(o, now, now + 12 * H, 60, true);
  assert.equal(later.ok, true);
  assert.ok(later.latestStop >= now && later.latestStop <= now + 12 * H);
  const pace = M.simulate(o).G / (now - t0);
  const grams = pace * (later.latestStop - t0);
  const sim = M.simulate(Object.assign({}, o, { drinks: [{ abv: 100, ml: grams / M.ETHANOL, qty: 1, share: 1 }], end: later.latestStop }));
  assert.ok(sim.clear + 60 * MIN <= now + 12 * H);
});

test('small amounts still register and clear soon after reading zero', () => {
  for (const fed of [false, true]) {
    const sim = M.simulate(base([beer(2, { abv: 4 })], { end: t0 + 2 * H, fed }));
    assert.ok(sim.peak > 0.005, `peak ${sim.peak} when fed=${fed}`);
    const lastShown = sim.points.reduce((a, b, i) => (b >= M.CLEAR ? i : a), 0);
    const tailMin = (sim.clear - t0) / MIN - (lastShown + 1);
    assert.ok(tailMin <= 2, `tail of ${tailMin} min when fed=${fed}`);
  }
});

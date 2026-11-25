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

// Rounds: several timed windows on one timeline.
const local = (h, m = 0, d = 23) => new Date(2026, 10, d, h, m).getTime();
const hein = (qty) => ({ name: 'Heineken', abv: 5, ml: 330, qty, share: 1 });
const body = { kg: 75, sex: 'm', beta: 0.015, fed: false };

test('legacy window and a single round give the same curve', () => {
  const legacy = M.simulate(Object.assign({ drinks: [hein(6)], start: local(14), end: local(18) }, body));
  const rounds = M.simulate(Object.assign({ rounds: [{ drinks: [hein(6)], start: local(14), end: local(18) }] }, body));
  assert.deepEqual(rounds, legacy);
});

test('six Heinekens from 2 PM to 6 PM clear at 01:16', () => {
  const sim = M.simulate(Object.assign({ rounds: [{ drinks: [hein(6)], start: local(14), end: local(18) }] }, body));
  assert.equal(sim.peak.toFixed(3), '0.089');
  assert.ok(Math.abs(sim.clear - local(1, 16, 24)) <= 2 * 60000);
});

test('a second round after a break carries the leftover alcohol', () => {
  const o = Object.assign({ rounds: [
    { drinks: [hein(3)], start: local(21), end: local(23) },
    { drinks: [hein(6)], start: local(14), end: local(18) }
  ] }, body);
  const sim = M.simulate(o);
  assert.equal(sim.start, local(14));
  assert.equal(M.bacAt(sim, local(21)).toFixed(3), '0.055');
  assert.equal(M.bacAt(sim, local(23)).toFixed(3), '0.088');
  assert.ok(Math.abs(sim.clear - local(6, 24, 24)) <= 2 * 60000);
});

test('stopAt clamps every round and pace counts only the live round', () => {
  const o = Object.assign({ rounds: [
    { drinks: [hein(6)], start: local(14), end: local(18) },
    { drinks: [hein(2)], start: local(21), end: local(23) }
  ] }, body);
  assert.deepEqual(M.roundsOf(M.stopAt(o, local(22))).map((r) => r.end), [local(18), local(22)]);
  assert.equal(M.stdLastHour(o, local(23)).toFixed(2), (M.gramsOf(hein(2)) / 2 / M.STD_G).toFixed(2));
});

test('an empty night reads zero at any time', () => {
  const sim = M.simulate(Object.assign({ rounds: [] }, body));
  assert.equal(sim.G, 0);
  assert.equal(M.bacAt(sim, local(22)), 0);
});

test('the planner extends the round marked live, even when another ends at the same moment', () => {
  const late = { drinks: [hein(8)], start: local(18), end: local(22) };
  const live = { drinks: [hein(1)], start: local(21), end: local(22) };
  const plan = (flagLate) => M.drivePlan(Object.assign({ rounds: [
    Object.assign({}, late, { live: flagLate }), Object.assign({}, live, { live: !flagLate })] }, body),
    local(22), local(16, 0, 24), 60, true);
  const slow = plan(false), fast = plan(true);
  assert.ok(slow.ok && fast.ok);
  assert.ok(slow.latestStop > fast.latestStop, `${slow.latestStop} vs ${fast.latestStop}`);
});

// Status counts alcohol still on its way into your blood
test('right after logging several drinks, you are heading over the limit, not clear', () => {
  const now = t0 + 2 * MIN;
  const sim = M.simulate(base([beer(6)], { start: t0, end: t0 }));
  const o = M.outlook(sim, now, 0.05);
  assert.ok(o.b < 0.05, 'blood level is still low this early');
  assert.equal(o.status, 'over');
  assert.equal(o.rising, true);
  assert.ok(o.overAt > now && o.overAt < sim.peakAt, 'crosses the limit before the peak');
});

test('one drink just logged reads impaired, never clear', () => {
  const sim = M.simulate(base([beer(1)], { start: t0, end: t0 }));
  assert.equal(M.outlook(sim, t0 + MIN, 0.05).status, 'impaired');
});

test('after the peak, the outlook is just where you are now', () => {
  const sim = M.simulate(base([beer(6)], { start: t0, end: t0 }));
  const later = sim.peakAt + 2 * H;
  const o = M.outlook(sim, later, 0.05);
  assert.equal(o.ahead, o.b);
  assert.equal(o.rising, false);
  assert.equal(M.outlook(sim, sim.clear + MIN, 0.05).status, 'clear');
});

test('a new round lifts you back over the limit even when an earlier round peaked higher', () => {
  const b8 = beer(8), b3 = beer(3);
  const r1 = M.simulate(base([b8], { end: t0 + H }));
  let now = r1.peakAt;
  while (M.bacAt(r1, now) > 0.045) now += MIN;
  const sim = M.simulate(base(null, { rounds: [{ start: t0, end: t0 + H, drinks: [b8] }, { start: now, end: now, drinks: [b3] }] }));
  const o = M.outlook(sim, now + MIN, 0.05);
  assert.ok(o.b < 0.05, `starts under, at ${o.b}`);
  assert.equal(o.status, 'over');
  assert.equal(o.rising, true);
  assert.ok(o.ahead > 0.09 && o.ahead < sim.peak, `heads to the second peak, ${o.ahead}`);
  assert.ok(o.overAt > now, 'says when it crosses');
});

// ---- The simulation never invents a clear time ----
// A heavy night for a small body: 20 beers, 45 kg, the slowest elimination setting. The old 96 hour cut-off
// stopped this one at 0.101% and called it clear.
const heavySmall = () => base([beer(20)], { kg: 45, sex: 'f', beta: 0.010 });
// Far beyond anything a living person could drink: 48 litres of 80% spirit. Even 30 days after the last drink
// the model cannot reach clear, so it must say it does not know.
const impossible = () => base([{ name: 'x', abv: 80, ml: 1000, qty: 48, share: 1 }]);

test('a normal night clears for real, at the end of its own curve', () => {
  const sim = M.simulate(base([beer(4)]));
  assert.equal(sim.complete, true);
  assert.equal(sim.limitReached, false);
  assert.ok(Number.isFinite(sim.clear));
  assert.equal(sim.clear, sim.start + sim.points.length * MIN, 'the clear time is the last simulated minute');
  assert.ok(sim.points[sim.points.length - 1] < M.CLEAR);
});

test('a night that takes longer than 96 hours is followed all the way to clear', () => {
  const sim = M.simulate(heavySmall());
  assert.equal(sim.complete, true);
  const hours = (sim.clear - t0) / H;
  assert.ok(hours > 96, `clears after ${hours.toFixed(1)} h, past the old cut-off`);
  assert.ok(M.bacAt(sim, t0 + 96 * H) > 0.09, 'still well over the limit at 96 hours');
  assert.equal(M.outlook(sim, t0 + 96 * H, 0.05).status, 'over');
});

test('a round spread over several days is followed past its last drink', () => {
  const sim = M.simulate(base([beer(30)], { start: t0 - 120 * H, end: t0 }));
  assert.equal(sim.complete, true);
  assert.ok(sim.clear > t0, 'never clear while the round is still going');
});

test('when the model cannot reach clear, it says so and never invents a time', () => {
  const sim = M.simulate(impossible());
  assert.equal(sim.complete, false);
  assert.equal(sim.limitReached, true);
  assert.equal(sim.clear, Infinity, 'clear is "not within reach", so every "is it past clear?" check says no');
  const last = sim.points[sim.points.length - 1];
  assert.ok(last > 1, 'the last known level is kept');
  const after = t0 + (sim.points.length + 100) * MIN;
  assert.equal(M.bacAt(sim, after), last, 'past the end of the data the level is the last one known, never zero');
  assert.equal(M.outlook(sim, after, 0.05).status, 'over');
  assert.equal(M.underLimitAt(sim, 0.05), Infinity, 'no made up time for getting back under the limit');
});

test('the drive planner never says yes without a real clear time', () => {
  const o = impossible();
  const plan = M.drivePlan(o, t0 + 4 * H, t0 + 400 * 24 * H, 60, false);
  assert.equal(plan.ok, false);
  assert.equal(plan.known, false);
  assert.equal(Number.isFinite(plan.clearAt), false);
  const live = M.drivePlan(o, t0 + 2 * H, t0 + 400 * 24 * H, 60, true);
  assert.equal(live.ok, false);
  assert.equal(live.latestStop, null);
  assert.equal(M.drivePlan(base([beer(2)]), t0 + 4 * H, t0 + 24 * H, 60, false).known, true);
});

test('an empty night is complete with nothing to clear', () => {
  const sim = M.simulate(base([]));
  assert.equal(sim.complete, true);
  assert.equal(sim.clear, null);
  assert.equal(M.bacAt(sim, t0 + H), 0);
});

test('the known end of the data is always a real time', () => {
  assert.equal(M.dataEnd(M.simulate(base([beer(4)]))), M.simulate(base([beer(4)])).clear);
  const sim = M.simulate(impossible());
  assert.equal(M.dataEnd(sim), sim.start + sim.points.length * MIN);
});

// ---- Food: it slows absorption, it does not make alcohol disappear ----
// Evidence (see the note on factors() in model.js): a meal delays absorption and lowers the peak, reliably.
// Any reduction in the total reaching the blood (first-pass metabolism) is small, varies a lot between
// people and meals, and is disputed, so the model does not count it. The two effects are tested apart.

test('food, absorption: with food the peak is lower and comes later', () => {
  const empty = M.simulate(base([beer(4)], { end: t0 + 2 * H }));
  const fed = M.simulate(base([beer(4)], { end: t0 + 2 * H, fed: true }));
  assert.ok(fed.peak < empty.peak, `fed peak ${fed.peak} under empty ${empty.peak}`);
  assert.ok(fed.peakAt > empty.peakAt, 'the peak comes later');
});

test('food, total alcohol: with food the same amount still reaches the blood', () => {
  // With almost no elimination, once everything has been absorbed the level is the total that got in.
  const slow = { beta: 0.0001 };
  const empty = M.simulate(base([beer(4)], Object.assign({ end: t0 + H }, slow)));
  const fed = M.simulate(base([beer(4)], Object.assign({ end: t0 + H, fed: true }, slow)));
  const at = (sim) => M.bacAt(sim, t0 + 8 * H);
  assert.ok(Math.abs(at(fed) - at(empty)) / at(empty) < 0.01, `fed ${at(fed)} vs empty ${at(empty)}: same total`);
});

test('food never brings the clear time earlier than on an empty stomach', () => {
  for (const [qty, hrs] of [[2, 1], [4, 2], [8, 4], [12, 5]]) {
    const empty = M.simulate(base([beer(qty)], { end: t0 + hrs * H }));
    const fed = M.simulate(base([beer(qty)], { end: t0 + hrs * H, fed: true }));
    assert.ok(fed.clear >= empty.clear, `${qty} beers: fed clears ${(empty.clear - fed.clear) / MIN} min earlier`);
  }
});

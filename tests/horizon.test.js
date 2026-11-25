// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const Hz = require('../horizon.js');

const local = (h, m = 0, d = 23) => new Date(2026, 10, d, h, m).getTime();
const hein = (qty) => ({ name: 'Heineken', abv: 5, ml: 330, qty, share: 1 });
const opts = { width: 400, height: 150, max: 0.11, limit: 0.05 };
const two = { rounds: [{ drinks: [hein(6)], start: local(14), end: local(18) }, { drinks: [hein(3)], start: local(21), end: local(23) }], kg: 75, sex: 'm', beta: 0.015, fed: false };

test('the ridge always has 64 points so it can morph', () => {
  const v = Hz.paths(M.simulate(two), M.roundsOf(two), local(23), opts);
  assert.equal(v.ridge.match(/[ML]/g).length, 64);
  assert.equal(v.bands.length, 2);
  assert.deepEqual(v.bands.map((b) => b.label), ['ROUND 1', 'ROUND 2']);
});

test('the ghost shows what is left from earlier rounds', () => {
  const first = Object.assign({}, two, { rounds: [two.rounds[0]] });
  const v = Hz.paths(M.simulate(two), M.roundsOf(two), local(23), Object.assign({ prevSim: M.simulate(first) }, opts));
  assert.ok(v.ghost && v.ghost.startsWith('M'));
});

test('an empty night is a flat horizon', () => {
  const v = Hz.paths(M.simulate({ rounds: [], kg: 75, sex: 'm', beta: 0.015 }), [], local(22), opts);
  assert.ok(v.ridge.split('L').every((p) => p.trim().endsWith(' ' + opts.height.toFixed(1))));
});

test('a night the model cannot clear still draws finite hills and no moon position from nowhere', () => {
  const o = { rounds: [{ drinks: [{ name: 'x', abv: 80, ml: 1000, qty: 48, share: 1 }], start: local(20), end: local(23) }], kg: 75, sex: 'm', beta: 0.015, fed: false };
  const sim = M.simulate(o);
  assert.equal(sim.complete, false);
  const g = Hz.paths(sim, o.rounds, local(23, 30), opts);
  assert.ok(!/NaN|Infinity/.test(g.ridge + g.area), 'the ridge is all real numbers');
  assert.ok(Number.isFinite(g.moonX) && Number.isFinite(g.to));
  assert.equal(g.moon, false, 'no moon: there is no sober time to mark');
  assert.equal(Hz.paths(M.simulate(two), two.rounds, local(23, 30), opts).moon, true);
});

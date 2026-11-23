// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const N = require('../night.js');

const local = (h, m = 0, d = 23) => new Date(2026, 10, d, h, m).getTime();
const hein = (qty) => ({ name: 'Heineken', abv: 5, ml: 330, qty, share: 1 });

test('an old live session becomes one live round with the same start', () => {
  const s = N.migrate({ start: 1000, end: 2000, still: true, fed: true, driveAt: null, water: null, drinks: [hein(2)] });
  assert.equal(s.v, 5);
  assert.equal(s.rounds.length, 1);
  assert.equal(s.rounds[0].start, 1000);
  assert.equal(s.rounds[0].end, null);
  assert.equal(s.fed, true);
  assert.equal(N.liveRound(s), s.rounds[0]);
});

test('an old finished session keeps its end, and an empty one has no rounds', () => {
  assert.equal(N.migrate({ start: 1, end: 9, still: false, drinks: [hein(1)] }).rounds[0].end, 9);
  assert.deepEqual(N.migrate({ start: 1, end: 9, still: true, drinks: [] }).rounds, []);
});

test('migrate leaves a v5 session alone', () => {
  const s = { v: 5, rounds: [], fed: false, driveAt: null, water: null };
  assert.equal(N.migrate(s), s);
});

test('simOpts ends the live round at now', () => {
  const s = N.migrate({ start: local(20), end: 0, still: true, drinks: [hein(2)] });
  const o = N.simOpts(s, { kg: 75, sex: 'm', beta: 0.015 }, local(22));
  assert.equal(o.rounds[0].end, local(22));
});

// Where a new round goes.
const P = { kg: 75, sex: 'm', beta: 0.015 };
const night = (...rounds) => ({ v: 5, fed: false, driveAt: null, water: null,
  rounds: rounds.map((r, i) => Object.assign({ id: 'r' + i, late: true }, r)) });

test('a round after a break continues while alcohol remains, and reports what was left', () => {
  const p = N.place(night({ start: local(14), end: local(18), drinks: [hein(6)] }), P,
    { start: local(21), end: local(23), drinks: [hein(3)] }, local(23));
  assert.equal(p.action, 'continue');
  assert.equal(p.carried.toFixed(3), '0.055');
  assert.equal(p.overlap, null);
});

test('a late round before tonight still continues when its alcohol reached tonight', () => {
  const p = N.place(night({ start: local(20), end: null, drinks: [hein(2)] }), P,
    { start: local(14), end: local(18), drinks: [hein(6)] }, local(22));
  assert.equal(p.action, 'continue');
});

test('overlapping drinking times are reported', () => {
  const p = N.place(night({ start: local(17), end: null, drinks: [hein(3)] }), P,
    { start: local(14), end: local(18), drinks: [hein(6)] }, local(22));
  assert.deepEqual(p.overlap, { roundId: 'r0', from: local(17), to: local(18) });
});

test('once tonight has cleared, a later round starts a fresh night', () => {
  const p = N.place(night({ start: local(12), end: local(13), drinks: [hein(1)] }), P,
    { start: local(20), end: local(21), drinks: [hein(2)] }, local(22));
  assert.equal(p.action, 'fresh');
});

test('yesterday goes to History, unless it is still in your system', () => {
  const empty = night();
  assert.equal(N.place(empty, P, { start: local(20, 0, 22), end: local(23, 0, 22), drinks: [hein(2)] }, local(22)).action, 'history');
  assert.equal(N.place(empty, P, { start: local(22, 0, 22), end: local(2), drinks: [hein(6)] }, local(3)).action, 'continue');
});

test('an earlier, separate session today goes to History', () => {
  const p = N.place(night({ start: local(20), end: local(21), drinks: [hein(2)] }), P,
    { start: local(11), end: local(12), drinks: [hein(1)] }, local(22));
  assert.equal(p.action, 'history');
});

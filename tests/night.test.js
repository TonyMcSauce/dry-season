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

// Adding, merging and archiving.
const silver = (qty) => ({ name: 'Heineken Silver', abv: 4, ml: 330, qty, share: 1 });
const st = (session) => ({ profile: P, session, history: [] });

test('same drinks merge into one round without losing a drink type', () => {
  const m = N.mergeRounds({ id: 'a', start: local(14), end: local(18), drinks: [hein(6)] },
                          { id: 'b', start: local(17), end: null, drinks: [hein(3), silver(2)] });
  assert.equal(m.start, local(14));
  assert.equal(m.end, null);
  assert.deepEqual(m.drinks.map((d) => d.name + ' ' + d.qty), ['Heineken 6', 'Heineken Silver 2']);
});

test('an overlapping round needs a choice, and extra keeps both', () => {
  const s = st(night({ start: local(17), end: null, drinks: [hein(3)] }));
  const cand = { start: local(14), end: local(18), drinks: [hein(6)] };
  assert.throws(() => N.addRound(s, cand, local(22)), /overlap choice needed/);
  assert.equal(N.addRound(s, cand, local(22), 'extra').state.session.rounds.length, 2);
  assert.equal(N.addRound(s, cand, local(22), 'same').state.session.rounds.length, 1);
});

test('a fresh night saves the old one to History', () => {
  const r = N.addRound(st(night({ start: local(12), end: local(13), drinks: [hein(1)] })),
    { start: local(20), end: local(21), drinks: [hein(2)] }, local(22));
  assert.equal(r.outcome.action, 'fresh');
  assert.equal(r.outcome.archived, true);
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.history[0].rounds.length, 1);
  assert.equal(r.state.session.rounds[0].start, local(20));
});

test('the first live drink starts two hours back, but never before the last round ended', () => {
  const a = N.addLiveDrink(st(night()), hein(1), local(22)).state.session.rounds[0];
  assert.equal(a.start, local(20));
  const b = N.addLiveDrink(st(night({ start: local(18), end: local(21), drinks: [hein(4)] })), hein(1), local(22));
  assert.equal(b.state.session.rounds[1].start, local(21));
  assert.equal(b.outcome.action, 'continue');
});

test('a live drink the morning after, once clear, starts a fresh night', () => {
  const r = N.addLiveDrink(st(night({ start: local(20, 0, 22), end: local(23, 0, 22), drinks: [hein(3)] })), hein(1), local(18));
  assert.equal(r.outcome.action, 'fresh');
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.session.rounds.length, 1);
});

test('a second tap on the same drink adds to its count', () => {
  const once = N.addLiveDrink(st(night()), hein(1), local(22)).state;
  const twice = N.addLiveDrink(once, hein(1), local(22, 5)).state;
  assert.equal(twice.session.rounds[0].drinks[0].qty, 2);
});

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

test('the first live drink starts when you say, by default just now', () => {
  const a = N.addLiveDrink(st(night()), hein(1), local(22)).state.session.rounds[0];
  assert.equal(a.start, local(22));
  const b = N.addLiveDrink(st(night()), hein(1), local(22), { startAt: local(21, 30) }).state.session.rounds[0];
  assert.equal(b.start, local(21, 30));
  const c = N.addLiveDrink(st(night()), hein(1), local(22), { startAt: local(23) }).state.session.rounds[0];
  assert.equal(c.start, local(22), 'never in the future');
});

test('a start inside the last round asks: same round reopens it, after starts when it ended', () => {
  const s = st(night({ start: local(18), end: local(21), drinks: [hein(4)] }));
  assert.throws(() => N.addLiveDrink(s, hein(1), local(22), { startAt: local(20) }), /start choice needed/);
  const same = N.addLiveDrink(s, hein(1), local(22), { startAt: local(20), choice: 'same' }).state.session.rounds;
  assert.equal(same.length, 1);
  assert.equal(same[0].end, null);
  assert.equal(same[0].drinks[0].qty, 5);
  const after = N.addLiveDrink(s, hein(1), local(22), { startAt: local(20), choice: 'after' });
  assert.equal(after.state.session.rounds[1].start, local(21));
  assert.equal(after.outcome.action, 'continue');
});

test('start choices offer right after your last round when it ended recently', () => {
  const recent = N.startChoices(night({ start: local(18), end: local(21), drinks: [hein(4)] }), local(22));
  assert.equal(recent.after, local(21));
  assert.equal(recent.start, local(21));
  const old = N.startChoices(night({ start: local(12), end: local(13), drinks: [hein(1)] }), local(22));
  assert.equal(old.after, null);
  assert.equal(old.start, local(22));
  assert.equal(N.startChoices(night(), local(22)).start, local(22));
  assert.equal(N.startChoices(night({ start: local(21), end: null, drinks: [hein(1)] }), local(22)).start, null, 'a live round needs no start');
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

test('a live round you never finished does not soak up the next day', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(20, 0, 22)).state;
  s = N.addLiveDrink(s, hein(1), local(20, 30, 22)).state;
  const r = N.addLiveDrink(s, hein(1), local(10));
  assert.equal(r.outcome.action, 'fresh');
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.history[0].rounds[0].end, local(20, 30, 22));
  assert.equal(r.state.session.rounds.length, 1);
  assert.equal(r.state.session.rounds[0].start, local(10));
});

test('settle ends a forgotten live round at the last drink once it has cleared', () => {
  const s = N.addLiveDrink(st(night()), hein(2), local(20, 0, 22)).state;
  assert.equal(N.settle(s, local(21, 0, 22)), s);
  const later = N.settle(s, local(9));
  assert.equal(later.session.rounds[0].end, local(20, 0, 22));
});

// Small fixes after 5.0
test('a History entry remembers whether you ate', () => {
  const s = Object.assign(night({ start: local(14), end: local(18), drinks: [hein(6)] }), { fed: true });
  assert.equal(N.summarize(s, P, local(22)).fed, true);
});

test('saving a night and later starting fresh keeps one History entry for it', () => {
  const s = st(night({ start: local(12), end: local(13), drinks: [hein(1)] }));
  const saved = Object.assign({}, s, { history: N.saveToHistory(s.history, N.summarize(s.session, P, local(14))) });
  const r = N.addRound(saved, { start: local(20), end: local(21), drinks: [hein(2)] }, local(22));
  assert.equal(r.outcome.action, 'fresh');
  assert.equal(r.state.history.length, 1);
});

test('an old save that stopped before it started becomes a sensible round', () => {
  const s = N.migrate({ start: local(20), end: local(19), still: false, drinks: [hein(1)] });
  assert.equal(s.rounds[0].end, local(20));
});

test('simOpts marks the round that is still going', () => {
  const s = night({ start: local(14), end: local(18), drinks: [hein(6)] }, { start: local(20), end: null, drinks: [hein(1)] });
  assert.deepEqual(N.simOpts(s, P, local(22)).rounds.map((r) => !!r.live), [false, true]);
});

// Real nights: start times, the stash, catch up and quick fixes
test('a break in the night: one beer, then five more right after, as two back to back rounds', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(9, 30)).state;
  s = N.finishLive(s, local(10));
  const ch = N.startChoices(N.settle(s, local(11, 30)).session, local(11, 30));
  assert.equal(ch.after, local(10));
  s = N.addLiveDrink(s, hein(5), local(11, 30), { startAt: ch.start }).state;
  s = N.finishLive(s, local(12));
  const rs = s.session.rounds;
  assert.equal(rs.length, 2);
  assert.deepEqual([rs[0].start, rs[0].end, rs[0].drinks[0].qty], [local(9, 30), local(10), 1]);
  assert.deepEqual([rs[1].start, rs[1].end, rs[1].drinks[0].qty], [local(10), local(12), 5]);
});

test('a six pack: open one, save five, open them one by one, and finishing puts the rest away', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(9, 30)).state;
  s = N.setStash(s, hein(1), 6, 1);
  assert.equal(N.stashLeft(s.session), 5);
  assert.equal(s.session.stash.drink.qty, undefined);
  s = N.openStash(s, local(10, 15)).state;
  assert.equal(N.stashLeft(s.session), 4);
  assert.equal(s.session.rounds.length, 1);
  assert.equal(s.session.rounds[0].drinks[0].qty, 2);
  s = N.finishLive(s, local(11));
  assert.equal(s.session.stash, null);
});

test('the stash goes away once the last one is opened', () => {
  let s = N.setStash(N.addLiveDrink(st(night()), hein(1), local(20)).state, hein(1), 2, 1);
  const r = N.openStash(s, local(20, 30));
  assert.equal(r.outcome.stashDone, true);
  assert.equal(r.state.session.stash, null);
  assert.equal(N.setStash(s, hein(1), 1, 1).session.stash, null, 'nothing left means no stash');
});

test('the stash carries over a break, even into a fresh night', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(9)).state;
  s = N.setStash(s, hein(1), 6, 1);
  const r = N.openStash(s, local(18));
  assert.equal(r.outcome.action, 'fresh');
  assert.equal(N.stashLeft(r.state.session), 4);
});

test('catch up: asks after half an hour, and spreads what you opened across the gap', () => {
  const s = N.addLiveDrink(st(night()), hein(1), local(9, 30)).state;
  assert.equal(N.catchUpDue(s.session, local(9, 50)), false);
  assert.equal(N.catchUpDue(s.session, local(10, 30)), true);
  const r = N.catchUp(s, 2, local(10, 30));
  const rs = r.state.session.rounds;
  assert.equal(rs.length, 1);
  assert.equal(rs[0].start, local(9, 30));
  assert.equal(rs[0].drinks[0].qty, 3);
  assert.equal(N.catchUpDue(r.state.session, local(10, 45)), false);
});

test('catch up with none stays quiet for another half hour', () => {
  const s = N.addLiveDrink(st(night()), hein(1), local(9, 30)).state;
  const q = N.catchUp(s, 0, local(10, 30)).state;
  assert.equal(q.session.rounds[0].drinks[0].qty, 1);
  assert.equal(N.catchUpDue(q.session, local(10, 45)), false);
  assert.equal(N.catchUpDue(q.session, local(11, 0)), true);
});

test('catch up counts against the stash, and starts right after a round that already ended', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(9, 30)).state;
  s = N.setStash(N.finishLive(s, local(10)), hein(1), 6, 1);
  assert.equal(N.catchUpDue(s.session, local(11, 30)), true);
  const r = N.catchUp(s, 3, local(11, 30));
  const rs = r.state.session.rounds;
  assert.equal(rs[1].start, local(10));
  assert.equal(rs[1].drinks[0].qty, 3);
  assert.equal(N.stashLeft(r.state.session), 2);
});

test('no catch up when nothing is going and nothing is saved', () => {
  const s = N.finishLive(N.addLiveDrink(st(night()), hein(1), local(9, 30)).state, local(10));
  assert.equal(N.catchUpDue(s.session, local(12)), false);
});

test('nudging a round keeps it in order and never past now', () => {
  const s = st(night({ id: 'a', start: local(18), end: local(19), drinks: [hein(1)] }, { id: 'b', start: local(20), end: local(21), drinks: [hein(1)] }));
  const at = (st2, id) => st2.session.rounds.find((r) => r.id === id);
  assert.equal(at(N.nudgeRound(s, 'b', 'start', -15 * 60000, local(22)), 'b').start, local(19, 45));
  assert.equal(at(N.nudgeRound(s, 'b', 'start', -90 * 60000, local(22)), 'b').start, local(19), 'stops at the round before');
  assert.equal(at(N.nudgeRound(s, 'a', 'end', 90 * 60000, local(22)), 'a').end, local(20), 'stops at the round after');
  assert.equal(at(N.nudgeRound(s, 'b', 'end', 90 * 60000, local(21, 30)), 'b').end, local(21, 30), 'never past now');
  assert.equal(at(N.nudgeRound(s, 'a', 'end', -90 * 60000, local(22)), 'a').end, local(18), 'never before its start');
});

test('catch up stays quiet for older saves that never recorded a log time', () => {
  const s = night({ start: local(20), end: null, drinks: [hein(2)] });
  assert.equal(N.catchUpDue(s, local(23)), false);
});

// One tap repeats
test('the same drink again in the current round counts on its row, never a second row', () => {
  const sav = { name: 'Savanna', abv: 6, ml: 330, qty: 1, share: 1 };
  let s = N.addLiveDrink(st(night()), hein(1), local(20)).state;
  s = N.addLiveDrink(s, sav, local(20, 20)).state;
  s = N.addLiveDrink(s, hein(1), local(20, 40)).state;
  const ds = s.session.rounds[0].drinks;
  assert.equal(ds.length, 2);
  assert.equal(ds[0].qty, 2);
  assert.equal(N.lastDrink(s.session).name, 'Heineken', 'the last one you had, not the last row');
});

test('recent drinks: the last two different ones, most recent first', () => {
  const sav = { name: 'Savanna', abv: 6, ml: 330, qty: 1, share: 1 };
  const cor = { name: 'Corona', abv: 4.5, ml: 355, qty: 1, share: 1 };
  let s = N.addLiveDrink(st(night()), cor, local(19)).state;
  s = N.addLiveDrink(s, hein(1), local(20)).state;
  s = N.addLiveDrink(s, sav, local(20, 20)).state;
  s = N.addLiveDrink(s, hein(1), local(20, 40)).state;
  const r = N.recentDrinks(s.session, 2);
  assert.deepEqual(r.map((d) => d.name), ['Heineken', 'Savanna']);
  assert.equal(r[0].qty, undefined);
  assert.deepEqual(N.recentDrinks(night(), 2), []);
});

test('recent drinks look back to a finished round when nothing is going', () => {
  const s = night({ start: local(18), end: local(19), drinks: [hein(2)] });
  assert.deepEqual(N.recentDrinks(s, 2).map((d) => d.name), ['Heineken']);
});

test('one fewer takes one off, then the row, then the round', () => {
  let s = st(night({ id: 'a', start: local(20), end: null, drinks: [hein(2)] }));
  const k = N.keyOf(hein(1));
  s = N.lessOf(s, 'a', k);
  assert.equal(s.session.rounds[0].drinks[0].qty, 1);
  s = N.lessOf(s, 'a', k);
  assert.equal(s.session.rounds.length, 0);
});

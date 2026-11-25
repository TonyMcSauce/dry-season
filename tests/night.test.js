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

const cor = (qty) => ({ name: 'Corona Extra', abv: 4.5, ml: 355, qty, share: 1 });

test('a six pack: open one, save five, open them one by one, and finishing keeps the rest', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(9, 30)).state;
  s = N.stashAdd(s, hein(1), 5);
  assert.equal(N.stashCount(s), 5);
  assert.equal(N.stashOf(s)[0].drink.qty, undefined);
  s = N.openStash(s, local(10, 15)).state;
  assert.equal(N.stashCount(s), 4);
  assert.equal(s.session.rounds.length, 1);
  assert.equal(s.session.rounds[0].drinks[0].qty, 2);
  s = N.finishLive(s, local(11));
  assert.equal(N.stashCount(s), 4, 'the rest is still in the fridge');
});

test('the row goes away once its last drink is opened', () => {
  const s = N.stashAdd(N.addLiveDrink(st(night()), hein(1), local(20)).state, hein(1), 1);
  const r = N.openStash(s, local(20, 30));
  assert.equal(r.outcome.stashDone, true);
  assert.deepEqual(N.stashOf(r.state), []);
  assert.equal(N.stashAdd(s, hein(1), 0), s, 'adding none changes nothing');
});

test('the stash holds several drinks, and the most recent one opens first', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(20)).state;
  s = N.stashAdd(s, cor(1), 2);
  s = N.stashAdd(s, hein(1), 4);
  assert.deepEqual(N.stashOf(s).map((r) => [r.drink.name, r.left]), [['Corona Extra', 2], ['Heineken', 4]]);
  assert.equal(N.latestStash(s).drink.name, 'Heineken');
  const r = N.openStash(s, local(20, 30));
  assert.equal(r.state.session.rounds[0].drinks.map((d) => d.name).join(),'Heineken', 'a Heineken joined the round');
  assert.deepEqual(N.stashOf(r.state).map((x) => [x.drink.name, x.left]), [['Corona Extra', 2], ['Heineken', 3]]);
  const other = N.openStash(r.state, local(20, 40), N.stashOf(r.state)[0].id);
  assert.deepEqual(N.stashOf(other.state).map((x) => [x.drink.name, x.left]), [['Corona Extra', 1], ['Heineken', 3]]);
});

test('buying more of a drink adds to its row and makes it the latest', () => {
  let s = N.stashAdd(N.stashAdd(st(night()), hein(1), 3), cor(1), 2);
  s = N.stashAdd(s, hein(1), 6);
  assert.deepEqual(N.stashOf(s).map((r) => [r.drink.name, r.left]), [['Corona Extra', 2], ['Heineken', 9]]);
  assert.equal(N.stashCount(s), 11);
});

test('editing the stash: set a count, remove a row, clear it all', () => {
  let s = N.stashAdd(N.stashAdd(st(night()), hein(1), 3), cor(1), 2);
  const [a, b] = N.stashOf(s);
  s = N.stashSet(s, a.id, 7);
  assert.equal(N.stashCount(s), 9);
  s = N.stashSet(s, b.id, 0);
  assert.deepEqual(N.stashOf(s).map((r) => r.drink.name), ['Heineken'], 'zero takes the row off');
  s = N.stashRemove(N.stashAdd(s, cor(1), 1), N.stashOf(s)[0].id);
  assert.deepEqual(N.stashOf(s).map((r) => r.drink.name), ['Corona Extra']);
  assert.equal(N.stashCount(N.clearStash(s)), 0);
});

test('the stash carries over a break, even into a fresh night', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(9)).state;
  s = N.stashAdd(s, hein(1), 5);
  const r = N.openStash(s, local(18));
  assert.equal(r.outcome.action, 'fresh');
  assert.equal(N.stashCount(r.state), 4);
});

test('old saves with one stash inside the night become a row in the list', () => {
  const rows = N.migrateStash(undefined, { drink: { name: 'Heineken', abv: 5, ml: 330, share: 1, qty: 9 }, total: 6, opened: 2 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].left, 4);
  assert.equal(rows[0].drink.qty, undefined);
  assert.deepEqual(N.migrateStash(undefined, { drink: hein(1), total: 2, opened: 2 }), [], 'nothing left, nothing kept');
  assert.deepEqual(N.migrateStash([{ drink: hein(1), left: 0 }, { drink: cor(1), left: 3.9 }], null).map((r) => r.left), [3]);
  assert.deepEqual(N.migrateStash(undefined, null), []);
});

test('catch up: asks after half an hour, and spreads what you opened across the gap', () => {
  const s = N.addLiveDrink(st(night()), hein(1), local(9, 30)).state;
  assert.equal(N.catchUpDue(s, local(9, 50)), false);
  assert.equal(N.catchUpDue(s, local(10, 30)), true);
  const r = N.catchUp(s, 2, local(10, 30));
  const rs = r.state.session.rounds;
  assert.equal(rs.length, 1);
  assert.equal(rs[0].start, local(9, 30));
  assert.equal(rs[0].drinks[0].qty, 3);
  assert.equal(N.catchUpDue(r.state, local(10, 45)), false);
});

test('catch up with none stays quiet for another half hour', () => {
  const s = N.addLiveDrink(st(night()), hein(1), local(9, 30)).state;
  const q = N.catchUp(s, 0, local(10, 30)).state;
  assert.equal(q.session.rounds[0].drinks[0].qty, 1);
  assert.equal(N.catchUpDue(q, local(10, 45)), false);
  assert.equal(N.catchUpDue(q, local(11, 0)), true);
});

test('catch up counts against the stash, and starts right after a round that settled on its own', () => {
  let s = N.stashAdd(N.addLiveDrink(st(night()), hein(1), local(9, 30)).state, hein(1), 5);
  s = N.settle(s, local(14));                           // nothing logged for hours: the round ended by itself
  assert.equal(N.liveRound(s.session), null);
  assert.equal(N.catchUpDue(s, local(14)), true);
  const r = N.catchUp(s, 3, local(14));
  const rs = r.state.session.rounds;
  assert.equal(rs[1].start, rs[0].end);
  assert.equal(rs[1].drinks[0].qty, 3);
  assert.equal(N.stashCount(r.state), 2);
});

test('catch up never counts more than the stash row holds', () => {
  const s = N.stashAdd(N.addLiveDrink(st(night()), hein(1), local(9, 30)).state, hein(1), 2);
  const r = N.catchUp(s, 5, local(11));
  assert.equal(r.state.session.rounds.reduce((a, x) => a + x.drinks.reduce((b, d) => b + d.qty, 0), 0), 3, '1 logged earlier + the 2 that were in the stash');
  assert.equal(N.stashCount(r.state), 0);
});

test('after Finished drinking the stash stays but nothing asks about it, until you log again', () => {
  let s = N.addLiveDrink(st(night()), hein(1), local(21)).state;
  s = Object.assign({}, s, { session: Object.assign({}, s.session, { loggedAt: local(21) }) });
  s = N.stashAdd(s, hein(1), 5);
  s = N.finishLive(s, local(22));
  assert.equal(N.stashCount(s), 5, 'still in the fridge');
  assert.equal(N.catchUpDue(s, local(23)), false, 'the night was ended on purpose');
  assert.equal(N.catchUpDue(N.stashAdd(s, hein(1), 6), local(23, 30)), false, 'buying more later changes nothing');
  const again = Object.assign({}, N.openStash(s, local(23, 45)).state);
  again.session = Object.assign({}, again.session, { loggedAt: local(23, 45) });
  assert.equal(N.catchUpDue(again, local(23, 50)), false);
  assert.equal(N.catchUpDue(again, local(24, 30, 23)), true, 'logging again starts a new night that can ask');
});

test('stock sitting in the fridge from another day does not trigger a catch up question', () => {
  let s = N.stashAdd(N.addLiveDrink(st(night()), hein(1), local(9, 30)).state, hein(1), 5);
  s = N.settle(s, local(14));
  assert.equal(N.catchUpDue(s, local(14)), true, 'same evening: it asks');
  assert.equal(N.catchUpDue(s, local(23, 30, 24)), false, 'a day later: it is stock, not tonight');
});

test('no catch up when nothing is going and nothing is saved', () => {
  const s = N.finishLive(N.addLiveDrink(st(night()), hein(1), local(9, 30)).state, local(10));
  assert.equal(N.catchUpDue(s, local(12)), false);
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
  assert.equal(N.catchUpDue(st(s), local(23)), false);
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

test('adding to the last round keeps one row per drink, so one fewer takes off exactly one', () => {
  const castle = (qty) => ({ name: 'Castle Lager', abv: 5, ml: 340, qty, share: 1 });
  const s0 = st(night({ id: 'a', start: local(20), end: local(21), drinks: [castle(2), hein(1)] }));
  const r = N.addLiveDrink(s0, castle(1), local(22), { startAt: local(20, 30), choice: 'same' });
  const live = N.liveRound(r.state.session);
  assert.deepEqual(live.drinks.map((d) => d.qty + ' ' + d.name), ['3 Castle Lager', '1 Heineken']);
  const s1 = N.lessOf(r.state, live.id, N.keyOf(castle(1)));
  assert.deepEqual(N.liveRound(s1.session).drinks.map((d) => d.qty + ' ' + d.name), ['2 Castle Lager', '1 Heineken']);
});

test('an edited round has room between its neighbours, never over them', () => {
  const s = night(
    { id: 'a', start: local(18), end: local(19), drinks: [hein(1)] },
    { id: 'b', start: local(20), end: local(21), drinks: [hein(1)] },
    { id: 'c', start: local(22), end: null, drinks: [hein(1)] });
  assert.deepEqual(N.editRoom(s, 'b', local(23)), { lo: local(19), hi: local(22) });
  assert.deepEqual(N.editRoom(s, 'a', local(23)), { lo: -Infinity, hi: local(20) });
  assert.deepEqual(N.editRoom(s, 'c', local(23)), { lo: local(21), hi: local(23) });
  // A finished round edited back over the one before is clamped to its edges.
  const e = N.fitEdit(s, 'b', { start: local(18, 30), end: local(22, 30) }, local(23));
  assert.deepEqual(e, { start: local(19), end: local(22) });
});

test('a round of extra drinks that overlaps on purpose can still be edited without being moved', () => {
  const s = night(
    { id: 'a', start: local(20), end: local(22), drinks: [hein(2)] },
    { id: 'x', start: local(21), end: local(21, 30), drinks: [hein(1)] });
  assert.deepEqual(N.fitEdit(s, 'x', { start: local(21), end: local(21, 30) }, local(23)), { start: local(21), end: local(21, 30) });
  assert.deepEqual(N.fitEdit(s, 'a', { start: local(20), end: local(22) }, local(23)), { start: local(20), end: local(22) });
});

// ---- Nights the model cannot see the end of stay unknown ----
const absurd = (qty) => ({ name: 'Spirit', abv: 80, ml: 1000, qty, share: 1 });

test('a night the model cannot clear is summarised as unknown, never as cleared', () => {
  const s = night({ id: 'a', start: local(20), end: local(23), drinks: [absurd(48)] });
  const sum = N.summarize(s, P, local(23, 30));
  assert.equal(sum.complete, false);
  assert.equal(Number.isFinite(sum.clear), false);
  const back = JSON.parse(JSON.stringify(sum));
  assert.equal(back.clear, null, 'saved as null, which History reads as unknown');
  assert.equal(back.complete, false);
});

test('settle never ends a live round the model cannot see the end of', () => {
  const s0 = st(night({ id: 'a', start: local(20), end: null, lastAt: local(20, 30), drinks: [absurd(48)] }));
  const later = local(20) + 40 * 24 * 3600000;
  assert.equal(N.settle(s0, later), s0);
});

test('a new round never treats an unknown clear time as cleared', () => {
  const s = night({ id: 'a', start: local(20), end: local(23), drinks: [absurd(48)] });
  const p = N.place(s, P, { start: local(20) + 10 * 24 * 3600000, end: local(21) + 10 * 24 * 3600000, drinks: [hein(1)] }, local(22) + 10 * 24 * 3600000);
  assert.equal(p.action, 'continue');
});

// ---- History saved by older versions is worked out again, once ----
const small = { kg: 45, sex: 'f', beta: 0.010 };
const heavyRound = () => ({ start: local(19, 0, 16), end: local(22, 0, 16), drinks: [hein(20)] });

test('a night saved with the old 96 hour cut-off gets its real clear time back', () => {
  const r = heavyRound();
  // What 6.1.6 and earlier saved: cleared at the 96 hour cut-off.
  const old = { start: r.start, clear: r.start + 96 * 3600000, G: 260, peak: 1.0, count: 20, rounds: [r], fed: false };
  const [fixed] = N.recheckHistory([old], small);
  assert.ok(fixed.clear > old.clear, 'clears later than the cut-off');
  assert.equal(fixed.complete, true);
  assert.equal(fixed.start, old.start);
  assert.equal(fixed.count, 20);
});

test('a night saved with food gets the clear time the current model gives it', () => {
  const r = { start: local(19, 0, 16), end: local(21, 0, 16), drinks: [hein(4)] };
  const now = N.summarize({ rounds: [r], fed: true }, P, local(12, 0, 17));
  const old = Object.assign({}, now, { clear: now.clear - 40 * 60000, peak: now.peak - 0.01 });   // as 6.1.7 and earlier saved it
  const [fixed] = N.recheckHistory([old], P);
  assert.equal(fixed.clear, now.clear);
  assert.equal(fixed.peak, now.peak);
  assert.equal(fixed.fed, true);
});

test('rechecking keeps nights it cannot recompute, keeps order, and changes nothing the second time', () => {
  const bare = { start: local(20, 0, 10), clear: local(23, 0, 10), G: 40, peak: 0.05, count: 3 };   // before 5.0: no rounds
  const r = { start: local(19, 0, 16), end: local(21, 0, 16), drinks: [hein(2)] };
  const ok = N.summarize({ rounds: [r], fed: false }, P, local(12, 0, 17));
  const once = N.recheckHistory([bare, ok], P);
  assert.deepEqual(once[0], bare);
  assert.deepEqual(once[1], ok);
  assert.deepEqual(N.recheckHistory(once, P), once);
  assert.deepEqual(N.recheckHistory(undefined, P), []);
});

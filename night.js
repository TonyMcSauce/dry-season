/* Dry Season night: the session as a list of rounds.
 * A round is some drinks with a start and an end. A live round has end null and
 * follows the clock. This file decides where a new round belongs, merges and
 * archives rounds, and hands the model what it needs. Pure functions throughout:
 * every change returns new objects. Works in the browser (window.DryNight) and
 * in Node (module.exports) so it can be tested.
 */
(function (root) {
  'use strict';

  const M = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.DryModel;

  let seq = 0;
  const newId = () => 'r' + Date.now().toString(36) + (seq++).toString(36);

  /** Old saves had one window { start, end, still, drinks }; v5 has rounds. */
  function migrate(s) {
    if (s && s.v === 5 && Array.isArray(s.rounds)) return s;
    const old = s || {};
    const drinks = Array.isArray(old.drinks) ? old.drinks : [];
    return {
      v: 5,
      rounds: drinks.length ? [{ id: newId(), start: old.start, end: old.still ? null : old.end, drinks, late: false }] : [],
      fed: !!old.fed,
      driveAt: old.driveAt || null,
      water: old.water || null
    };
  }

  const endOf = (r, now) => (r.end == null ? now : r.end);

  /** Options for M.simulate. The live round counts up to now. */
  function simOpts(session, profile, now) {
    return {
      rounds: session.rounds.map((r) => ({ start: r.start, end: Math.max(r.start, endOf(r, now)), drinks: r.drinks })),
      kg: profile.kg, sex: profile.sex, beta: profile.beta, fed: !!session.fed
    };
  }

  const liveRound = (session) => session.rounds.find((r) => r.end == null) || null;

  /** The drink to repeat: last of the live round, else of the round that ended last. */
  function lastDrink(session) {
    const r = liveRound(session) || session.rounds.reduce((a, x) => (!a || x.end >= a.end ? x : a), null);
    return r && r.drinks.length ? r.drinks[r.drinks.length - 1] : null;
  }

  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  /** Simulate some rounds with this session's food setting. */
  function simRounds(rounds, session, profile, now) {
    return M.simulate(simOpts({ rounds, fed: session.fed }, profile, now));
  }

  /** When these rounds are fully clear (or simply over, if they hold no alcohol). */
  const clearOf = (sim, rounds, now) => (sim.G > 0 ? sim.clear : rounds.reduce((a, r) => Math.max(a, endOf(r, now)), 0));

  /**
   * Where a new round belongs. cand = { start, end (null = live), drinks }.
   * Rules, in order (see the late logging design):
   * 1. its alcohol overlaps tonight's in time          -> continue
   * 2. it is still in your system now                  -> fresh (or continue on an empty night)
   * 3. it started on an earlier calendar day           -> history
   * 4. tonight is empty                                -> continue
   * 5. it started after tonight cleared                -> fresh
   * 6. an earlier, separate session today              -> history
   */
  function place(session, profile, cand, now) {
    const rounds = session.rounds;
    const cRounds = [{ start: cand.start, end: cand.end, drinks: cand.drinks }];
    const cClear = clearOf(simRounds(cRounds, session, profile, now), cRounds, now);
    const out = (action, carried, overlap) => ({ action, carried: carried || 0, overlap: overlap || null });

    if (rounds.length) {
      const nSim = simRounds(rounds, session, profile, now);
      const nStart = Math.min.apply(null, rounds.map((r) => r.start));
      const nClear = clearOf(nSim, rounds, now);
      if (nClear > cand.start && cClear > nStart) {
        const cEnd = endOf(cand, now);
        let overlap = null;
        for (const r of rounds) {
          const from = Math.max(r.start, cand.start), to = Math.min(endOf(r, now), cEnd);
          if (to > from) { overlap = { roundId: r.id, from, to }; break; }
        }
        return out('continue', M.bacAt(nSim, cand.start), overlap);
      }
      if (cClear > now) return out('fresh');
      if (dayStart(cand.start) < dayStart(now)) return out('history');
      return out(cand.start >= nClear ? 'fresh' : 'history');
    }
    if (cClear > now) return out('continue');
    if (dayStart(cand.start) < dayStart(now)) return out('history');
    return out('continue');
  }

  const HISTORY_MAX = 20;
  const keyOf = (d) => d.name + '|' + d.ml + '|' + d.abv + '|' + d.share;
  const byStart = (a, b) => a.start - b.start;
  const copyDrinks = (drinks) => drinks.map((d) => Object.assign({}, d));
  const withSession = (state, patch) => Object.assign({}, state, { session: Object.assign({}, state.session, patch) });

  /** One round covering both windows. Each drink keeps the larger count; none is dropped. */
  function mergeRounds(a, b) {
    const drinks = copyDrinks(a.drinks);
    for (const d of b.drinks) {
      const same = drinks.find((x) => keyOf(x) === keyOf(d));
      if (same) same.qty = Math.max(same.qty, d.qty);
      else drinks.push(Object.assign({}, d));
    }
    return {
      id: a.id, start: Math.min(a.start, b.start),
      end: a.end == null || b.end == null ? null : Math.max(a.end, b.end),
      drinks, late: !!(a.late && b.late)
    };
  }

  /** A History entry for these rounds: the old summary plus the rounds themselves. */
  function summarize(session, profile, now) {
    const rounds = session.rounds.map((r) => Object.assign({}, r, { end: endOf(r, now), drinks: copyDrinks(r.drinks) }));
    const sim = simRounds(rounds, session, profile, now);
    return {
      start: sim.start, clear: clearOf(sim, rounds, now), G: sim.G, peak: sim.peak,
      count: rounds.reduce((a, r) => a + r.drinks.reduce((b, d) => b + d.qty, 0), 0),
      rounds
    };
  }

  const pushHistory = (history, entry) => (history || []).concat([entry]).slice(-HISTORY_MAX);
  const emptyNight = (rounds) => ({ v: 5, rounds, fed: false, driveAt: null, water: null });

  /**
   * Add a round where it belongs. choice ('same' | 'extra') answers an overlap
   * with a round already on tonight's tab; without one an overlap throws.
   */
  function addRound(state, cand, now, choice) {
    const p = place(state.session, state.profile, cand, now);
    const round = { id: newId(), start: cand.start, end: cand.end == null ? null : cand.end,
      drinks: copyDrinks(cand.drinks), late: cand.late !== false };
    const outcome = { action: p.action, carried: p.carried, archived: false };

    if (p.action === 'history') {
      const entry = summarize({ rounds: [round], fed: state.session.fed }, state.profile, now);
      return { state: Object.assign({}, state, { history: pushHistory(state.history, entry) }), outcome };
    }
    if (p.action === 'fresh') {
      outcome.archived = state.session.rounds.length > 0;
      const history = outcome.archived ? pushHistory(state.history, summarize(state.session, state.profile, now)) : state.history;
      return { state: Object.assign({}, state, { session: emptyNight([round]), history }), outcome };
    }
    if (p.overlap && !choice) throw new Error('overlap choice needed');
    let rounds = state.session.rounds;
    if (p.overlap && choice === 'same') rounds = rounds.map((r) => (r.id === p.overlap.roundId ? mergeRounds(r, round) : r));
    else rounds = rounds.concat([round]);
    return { state: withSession(state, { rounds: rounds.slice().sort(byStart) }), outcome };
  }

  /**
   * A drink being had now. It joins the live round; with none, a new live round
   * starts two hours back, never before the last round ended, and is placed.
   */
  function addLiveDrink(state, drink, now) {
    const live = liveRound(state.session);
    const one = Object.assign({ qty: 1, share: 1 }, drink);
    if (live) {
      const drinks = copyDrinks(live.drinks), last = drinks[drinks.length - 1];
      if (last && keyOf(last) === keyOf(one)) last.qty += one.qty;
      else drinks.push(one);
      const rounds = state.session.rounds.map((r) => (r === live ? Object.assign({}, r, { drinks }) : r));
      return { state: withSession(state, { rounds }), outcome: { action: 'continue', carried: 0, archived: false } };
    }
    const lastEnd = state.session.rounds.reduce((a, r) => Math.max(a, endOf(r, now)), 0);
    const start = Math.max(Math.floor((now - 2 * 3600000) / 300000) * 300000, lastEnd);
    return addRound(state, { start, end: null, drinks: [one], late: false }, now, 'extra');
  }

  /** The live round stops now. */
  function finishLive(state, now) {
    return withSession(state, { rounds: state.session.rounds.map((r) => (r.end == null ? Object.assign({}, r, { end: now }) : r)) });
  }

  /** Change a round's times or drinks in place. */
  function editRound(state, id, patch) {
    const rounds = state.session.rounds.map((r) => (r.id === id ? Object.assign({}, r, patch) : r));
    return withSession(state, { rounds: rounds.sort(byStart) });
  }

  function removeRound(state, id) {
    return withSession(state, { rounds: state.session.rounds.filter((r) => r.id !== id) });
  }

  const api = { newId, migrate, simOpts, liveRound, lastDrink, endOf, place, mergeRounds, summarize,
    addRound, addLiveDrink, finishLive, editRound, removeRound, keyOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryNight = api;
})(typeof self !== 'undefined' ? self : this);

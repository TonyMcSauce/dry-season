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
      rounds: drinks.length ? [{ id: newId(), start: old.start, end: old.still ? null : Math.max(old.start, old.end), drinks, late: false }] : [],
      fed: !!old.fed,
      driveAt: old.driveAt || null,
      water: old.water || null
    };
  }

  const endOf = (r, now) => (r.end == null ? now : r.end);

  /** Options for M.simulate. The live round counts up to now. */
  function simOpts(session, profile, now) {
    return {
      rounds: session.rounds.map((r) => ({ start: r.start, end: Math.max(r.start, endOf(r, now)), drinks: r.drinks, live: r.end == null })),
      kg: profile.kg, sex: profile.sex, beta: profile.beta, fed: !!session.fed
    };
  }

  const liveRound = (session) => session.rounds.find((r) => r.end == null) || null;

  /** The drink to repeat: last of the live round, else of the round that ended last. */
  function lastDrink(session) {
    const r = liveRound(session) || session.rounds.reduce((a, x) => (!a || x.end >= a.end ? x : a), null);
    if (!r || !r.drinks.length) return null;
    return r.drinks.reduce((a, d, i) => ((d.at || 0) >= (a.at || 0) ? d : a), r.drinks[0]);
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
      rounds, fed: !!session.fed
    };
  }

  /** Add a night to History. A night already there (same start) is replaced, never listed twice. */
  const pushHistory = (history, entry) =>
    (history || []).filter((h) => h.start !== entry.start).concat([entry]).slice(-HISTORY_MAX);
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
      const session = Object.assign(emptyNight([round]), state.session.stash ? { stash: state.session.stash } : {});
      return { state: Object.assign({}, state, { session, history }), outcome };
    }
    if (p.overlap && !choice) throw new Error('overlap choice needed');
    let rounds = state.session.rounds;
    if (p.overlap && choice === 'same') rounds = rounds.map((r) => (r.id === p.overlap.roundId ? mergeRounds(r, round) : r));
    else rounds = rounds.concat([round]);
    return { state: withSession(state, { rounds: rounds.slice().sort(byStart) }), outcome };
  }

  const MIN = 60000, HOUR = 3600000;
  /** "Right after your last round" is offered when that round ended this recently. */
  const AFTER_WINDOW = 3 * HOUR;
  /** Catch up asks after this long without a log. */
  const CATCHUP_GAP = 30 * MIN;

  /** The finished round that ended last, or null. */
  function lastFinished(session) {
    return session.rounds.filter((r) => r.end != null).reduce((a, r) => (!a || r.end > a.end ? r : a), null);
  }

  /**
   * Start options for a drink that opens a new round. after is the time to offer as
   * "Right after your last round" (null when there is none recent enough); start is
   * the default choice.
   */
  function startChoices(session, now) {
    if (liveRound(session)) return { after: null, start: null };
    const last = lastFinished(session);
    const after = last && last.end <= now && now - last.end <= AFTER_WINDOW ? last.end : null;
    return { after, start: after != null ? after : now };
  }

  /** The finished round a new round starting at start would fall inside, or null. */
  function startClash(session, start, now) {
    if (liveRound(session)) return null;
    const last = lastFinished(session);
    return last && start < last.end && start <= now ? last : null;
  }

  const stamp = (state, now, patch) => withSession(state, Object.assign({ loggedAt: now }, patch || {}));

  /**
   * A drink being had now. It joins the live round; with none, a new live round
   * starts at opts.startAt (default now, never in the future) and is placed.
   * A start inside the last round needs opts.choice: 'same' reopens that round,
   * 'after' starts right after it.
   */
  function addLiveDrink(state, drink, now, opts) {
    opts = opts || {};
    state = settle(state, now);
    const live = liveRound(state.session);
    const one = Object.assign({ qty: 1, share: 1 }, drink);
    one.at = now;
    if (live) {
      // Same drink as one already in this round: count it there, never a second row.
      const drinks = copyDrinks(live.drinks), same = drinks.find((d) => keyOf(d) === keyOf(one));
      if (same) { same.qty += one.qty; same.at = now; } else drinks.push(one);
      const rounds = state.session.rounds.map((r) => (r === live ? Object.assign({}, r, { drinks, lastAt: now }) : r));
      return { state: stamp(state, now, { rounds }), outcome: { action: 'continue', carried: 0, archived: false } };
    }
    let start = Math.min(opts.startAt == null ? now : opts.startAt, now);
    const clash = startClash(state.session, start, now);
    if (clash) {
      if (!opts.choice) throw new Error('start choice needed');
      if (opts.choice === 'same') {
        const drinks = copyDrinks(clash.drinks), last = drinks[drinks.length - 1];
        if (last && keyOf(last) === keyOf(one)) last.qty += one.qty;
        else drinks.push(one);
        const rounds = state.session.rounds.map((r) => (r === clash
          ? Object.assign({}, r, { start: Math.min(r.start, start), end: null, drinks, lastAt: now }) : r)).sort(byStart);
        return { state: stamp(state, now, { rounds }), outcome: { action: 'continue', carried: 0, archived: false } };
      }
      start = clash.end;
    }
    const r = addRound(state, { start, end: null, drinks: [one], late: false }, now, 'extra');
    const rounds = r.state.session.rounds.map((x) => (x.end == null ? Object.assign({}, x, { lastAt: now }) : x));
    return { state: stamp(r.state, now, { rounds }), outcome: r.outcome };
  }

  /**
   * The last n different drinks you had, most recent first: the ones to offer
   * as one tap repeats. Each comes without a count.
   */
  function recentDrinks(session, n) {
    const rounds = session.rounds.slice().sort((a, b) => (b.end == null ? Infinity : b.end) - (a.end == null ? Infinity : a.end));
    const out = [], seen = new Set();
    for (const r of rounds) {
      const ds = r.drinks.map((d, i) => ({ d, i })).sort((a, b) => ((b.d.at || 0) - (a.d.at || 0)) || (b.i - a.i));
      for (const { d } of ds) {
        const k = keyOf(d);
        if (seen.has(k)) continue;
        seen.add(k);
        const c = Object.assign({}, d); delete c.qty; delete c.at;
        out.push(c);
        if (out.length >= n) return out;
      }
    }
    return out;
  }

  /** One fewer of a drink in a round; the row goes at zero, the round when it is empty. */
  function lessOf(state, roundId, key) {
    const r = state.session.rounds.find((x) => x.id === roundId);
    if (!r) return state;
    const drinks = copyDrinks(r.drinks).map((d) => (keyOf(d) === key ? Object.assign(d, { qty: d.qty - 1 }) : d)).filter((d) => d.qty > 0);
    return drinks.length ? editRound(state, roundId, { drinks }) : removeRound(state, roundId);
  }

  // Tonight's stash: drinks you have on hand but have not opened yet.

  const stashLeft = (session) => (session.stash ? session.stash.total - session.stash.opened : 0);

  /** Plan a stash of total drinks, opened of them already had. */
  function setStash(state, drink, total, opened) {
    const d = Object.assign({ share: 1 }, drink); delete d.qty;
    const stash = total > (opened || 0) ? { drink: d, total, opened: opened || 0 } : null;
    return withSession(state, { stash });
  }

  function clearStash(state) { return withSession(state, { stash: null }); }

  /** Count n more opened from the stash; it goes away once all are open. */
  function useStash(state, n) {
    const st = state.session.stash;
    if (!st) return { state, done: false };
    const opened = Math.min(st.total, st.opened + n);
    if (opened >= st.total) return { state: withSession(state, { stash: null }), done: true };
    return { state: withSession(state, { stash: Object.assign({}, st, { opened }) }), done: false };
  }

  /** Open the next drink from the stash, now. */
  function openStash(state, now) {
    const st = state.session.stash;
    if (!st) return { state, outcome: null };
    const r = addLiveDrink(state, Object.assign({ qty: 1 }, st.drink), now, { startAt: now, choice: 'after' });
    const u = useStash(r.state, 1);
    return { state: u.state, outcome: Object.assign({}, r.outcome, { stashDone: u.done }) };
  }

  // Catch up: one question when you come back after a while.

  function catchUpDue(session, now) {
    const live = liveRound(session);
    if (!live && stashLeft(session) <= 0) return false;
    // Only when we know when you last logged; older saves stay quiet.
    const last = Math.max(session.loggedAt || 0, session.askedAt || 0, live ? (live.lastAt || 0) : 0);
    return last > 0 && now - last >= CATCHUP_GAP;
  }

  /** The drink catch up counts: the stash drink, else the last one logged. */
  function catchUpDrink(session) {
    if (session.stash) return session.stash.drink;
    const d = lastDrink(session);
    if (!d) return null;
    const c = Object.assign({}, d); delete c.qty;
    return c;
  }

  /**
   * n drinks opened since the last log. They join the live round, or start a round
   * right after the last one, so they spread across the gap. n = 0 just records
   * that we asked.
   */
  function catchUp(state, n, now) {
    const drink = catchUpDrink(state.session);
    if (!(n > 0) || !drink) return { state: withSession(state, { askedAt: now }), outcome: null };
    const last = lastFinished(state.session);
    const startAt = last ? last.end : (state.session.loggedAt || now);
    const r = addLiveDrink(state, Object.assign({}, drink, { qty: n }), now, { startAt, choice: 'after' });
    const u = useStash(r.state, n);
    return { state: withSession(u.state, { askedAt: now }), outcome: Object.assign({}, r.outcome, { stashDone: u.done }) };
  }

  /**
   * Move a round's start or end by deltaMs. The start stays after the round
   * before and no later than its own end (or now); the end stays between its own
   * start and the next round's start, never past now.
   */
  function nudgeRound(state, id, edge, deltaMs, now) {
    const rounds = state.session.rounds.slice().sort(byStart);
    const i = rounds.findIndex((r) => r.id === id);
    if (i < 0) return state;
    const r = rounds[i], prev = rounds[i - 1], next = rounds[i + 1];
    let patch;
    if (edge === 'start') {
      const lo = prev ? endOf(prev, now) : -Infinity, hi = Math.min(endOf(r, now), now);
      patch = { start: Math.max(lo, Math.min(hi, r.start + deltaMs)) };
    } else {
      if (r.end == null) return state;
      const hi = Math.min(now, next ? next.start : now);
      patch = { end: Math.max(r.start, Math.min(hi, r.end + deltaMs)) };
    }
    return editRound(state, id, patch);
  }

  /**
   * A live round nobody finished: once everything drunk up to its last drink has
   * cleared, it is over, so end it at that last drink. Rounds without a known last
   * drink (older saves) are left running, the safe side.
   */
  function settle(state, now) {
    const live = liveRound(state.session);
    if (!live || live.lastAt == null || live.lastAt >= now) return state;
    const rounds = state.session.rounds.map((r) => (r === live ? Object.assign({}, r, { end: Math.max(r.start, live.lastAt) }) : r));
    const sim = simRounds(rounds, state.session, state.profile, now);
    if (clearOf(sim, rounds, now) > now) return state;
    return withSession(state, { rounds });
  }

  /** The live round stops now. Finishing also puts away the stash. */
  function finishLive(state, now) {
    return withSession(state, { stash: null, rounds: state.session.rounds.map((r) => (r.end == null ? Object.assign({}, r, { end: now }) : r)) });
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
    addRound, addLiveDrink, finishLive, editRound, removeRound, settle, keyOf, saveToHistory: pushHistory,
    startChoices, startClash, lastFinished, stashLeft, setStash, clearStash, openStash,
    catchUpDue, catchUpDrink, catchUp, nudgeRound, recentDrinks, lessOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryNight = api;
})(typeof self !== 'undefined' ? self : this);

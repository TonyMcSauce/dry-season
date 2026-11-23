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

  const api = { newId, migrate, simOpts, liveRound, lastDrink, endOf, place };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryNight = api;
})(typeof self !== 'undefined' ? self : this);

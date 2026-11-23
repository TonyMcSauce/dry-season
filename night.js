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

  const api = { newId, migrate, simOpts, liveRound, lastDrink, endOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryNight = api;
})(typeof self !== 'undefined' ? self : this);

/* Dry Season blood alcohol model.
 * Widmark distribution, first-order absorption, Michaelis-Menten elimination
 * (steady at normal levels, slowing near zero so small drinks still register),
 * stepped once per simulated minute. Works in the browser (window.DryModel)
 * and in Node (module.exports) so the maths can be tested.
 * Every number here is an estimate, never a measurement.
 */
(function (root) {
  'use strict';

  const ETHANOL = 0.789;          // grams of ethanol per ml
  const STD_G = 10;               // grams in one standard drink (WHO)
  const MIN = 60000;
  const HOUR = 3600000;

  const KM = 0.0025;              // % BAC at which elimination runs at half speed
  const CLEAR = 0.0005;           // below this the estimate reads 0.000%
  // A safety net, not a forecast horizon. The model follows every night minute by minute until it
  // is genuinely clear; it only gives up 30 days after the last drink. Needing longer would take a
  // level above 10%, far past anything a living person reaches, so in practice this never triggers.
  // If it does, the night is marked incomplete and its clear time is Infinity ("not within reach"),
  // never a made up time: every "is it past the clear time?" check then safely answers no.
  const MAX_AFTER_LAST_DRINK_MIN = 30 * 24 * 60;

  const THRESHOLDS = {
    // Under this, where you are heading, the app says a low level of alcohol is on board rather than
    // "impaired": the first measurable effects (judgement, doing two things at once) are usually put
    // around 0.02%. It is still never "clear" until the level reads 0.000%.
    low: 0.02,
    blackout: 0.15,               // research links blackouts to roughly 0.15% and above
    danger: 0.30,                 // risk of alcohol poisoning
    fastRise: 0.05,               // % per hour
    fastStdPerHour: 3,
    bingeStdPerHour: 5
  };

  const gramsOf = (d) => d.ml * (d.abv / 100) * ETHANOL * d.qty * d.share;

  /**
   * Food, and why it only slows absorption here.
   *
   * What the research shows:
   * - A meal holds alcohol in the stomach longer, so it absorbs more slowly and the peak is
   *   lower and later. This is consistent and large (Jones & Jönsson 1994; Kechagias, Jönsson &
   *   Jones: fasting peak about 9.5 mmol/L against 3.8 mmol/L an hour after food).
   * - Food also speeds up elimination (Ramchandani et al. 2001, J Clin Pharmacol 41:1345, about
   *   45% faster after a meal in an alcohol clamp study), and some of the dose may be removed on
   *   its first pass through the stomach and liver. How much is disputed (Levitt & Levitt 1994)
   *   and varies widely with the person, the meal and the timing.
   *
   * What the model does: food changes the absorption half-life only (15 min empty, 35 min fed).
   * Every gram logged reaches the blood, and elimination is the same with or without food.
   * Until 6.1.7 a fed night also counted only 90% of its alcohol, which brought the clear time
   * 30 minutes to 2 hours earlier and could turn a night that went over the limit into one that
   * never did. The real effect of food may well be that large, but it is uncertain and differs
   * from person to person, and this estimate is used to decide when you are clear. So it leans
   * to the safe side: it never makes you clear sooner for having eaten.
   */
  function factors(o) {
    return {
      r: o.sex === 'f' ? 0.55 : 0.68,
      halfLife: o.fed ? 35 : 15   // minutes for half of the waiting alcohol to absorb
    };
  }

  /**
   * The night as rounds, sorted by start. Each round's drinks are spread evenly
   * from its start to its end. o.rounds wins; otherwise the legacy single window
   * { drinks, start, end } is one round.
   */
  function roundsOf(o) {
    const src = o.rounds || [{ drinks: o.drinks || [], start: o.start, end: o.end }];
    return src
      .map((r) => ({ start: r.start, end: Math.max(r.end, r.start), drinks: r.drinks || [], live: !!r.live }))
      .sort((a, b) => a.start - b.start);
  }

  /** The same night with every round stopped by time t (nothing drunk after t). */
  function stopAt(o, t) {
    const rounds = roundsOf(o).map((r) => Object.assign({}, r, { end: Math.max(r.start, Math.min(r.end, t)) }));
    return Object.assign({}, o, { rounds });
  }

  const gramsIn = (drinks) => (drinks || []).reduce((a, d) => a + gramsOf(d), 0);

  /**
   * o: { rounds:[{start, end, drinks}] | drinks, start, end, kg, sex, beta, fed, extra:[{t, g}] }
   * Each round's drinks are spread evenly over that round. extra adds single doses at a time.
   *
   * Returns { G, start, points, peak, peakAt, clear, complete, limitReached }:
   * - nothing to clear (G is 0): clear null, complete true.
   * - cleared: clear is the minute BAC reached zero with nothing left to absorb, complete true.
   *   points run right up to it.
   * - incomplete (safety net reached): clear Infinity, complete false, limitReached true.
   *   points stop at the safety net and keep the last known level.
   */
  function simulate(o) {
    const { r, halfLife } = factors(o);
    const vd = r * o.kg * 10;
    const rs = roundsOf(o);
    const G = rs.reduce((a, x) => a + gramsIn(x.drinks), 0);
    const extra = (o.extra || []).filter((e) => e.g > 0);
    const start = rs.length ? rs[0].start : o.start;
    const out = { G, start, points: [], clear: null, peak: 0, peakAt: start, complete: true, limitReached: false };
    if (!(G > 0) && !extra.length) return out;
    out.complete = false;

    const plan = rs.map((x) => {
      const dur = Math.max(1, Math.round((x.end - x.start) / MIN));
      return { off: Math.round((x.start - start) / MIN), dur, rate: gramsIn(x.drinks) / dur };
    });
    const lastEnd = plan.reduce((a, p) => Math.max(a, p.off + p.dur), 0);
    const ka = 1 - Math.exp(-Math.LN2 / halfLife);
    const vmax = o.beta * (1 + KM / 0.08) / 60;   // so the rate matches beta at everyday levels
    const lastExtra = extra.reduce((a, e) => Math.max(a, Math.round((e.t - start) / MIN)), 0);
    let pool = 0, B = 0;

    const maxM = Math.max(lastEnd, lastExtra) + MAX_AFTER_LAST_DRINK_MIN;
    for (let m = 0; m < maxM; m++) {
      for (const p of plan) if (m >= p.off && m < p.off + p.dur) pool += p.rate;
      for (const e of extra) if (Math.round((e.t - start) / MIN) === m) pool += e.g;
      const abs = pool * ka;
      pool -= abs;
      B = B + abs / vd;
      B = Math.max(0, B - vmax * B / (KM + B));
      const t = start + (m + 1) * MIN;
      out.points.push(B);
      if (B > out.peak) { out.peak = B; out.peakAt = t; }
      // Clear once drinking is over, BAC reads zero and too little is left to absorb to lift it again.
      if (m >= lastEnd && m >= lastExtra && B < CLEAR && pool * ka / vd < vmax * CLEAR / (KM + CLEAR)) { out.clear = t; out.complete = true; return out; }
    }
    out.clear = Infinity;
    out.limitReached = true;
    return out;
  }

  /** The last moment the simulation has data for: the clear time, or where an incomplete night stops. */
  const dataEnd = (sim) => (Number.isFinite(sim.clear) ? sim.clear : sim.start + sim.points.length * MIN);

  /**
   * BAC at time t. Zero before the night starts and once it has genuinely cleared. Past the end of an
   * incomplete night's data it is the last level known: never zero just because the model stopped.
   */
  function bacAt(sim, t) {
    const i = Math.floor((t - sim.start) / MIN) - 1;
    if (!(i >= 0)) return 0;
    if (sim.clear != null && t >= sim.clear) return 0;
    if (i >= sim.points.length) return sim.complete !== false || !sim.points.length ? 0 : sim.points[sim.points.length - 1];
    return sim.points[i];
  }

  /**
   * First moment after the last time BAC sits above the limit. null if it never goes over.
   * Infinity when an incomplete night is still over the limit where its data ends.
   */
  function underLimitAt(sim, limit) {
    if (sim.complete === false && sim.points.length && sim.points[sim.points.length - 1] > limit) return Infinity;
    for (let i = sim.points.length - 1; i >= 0; i--) {
      if (sim.points[i] > limit) return sim.start + (i + 2) * MIN;
    }
    return null;
  }

  /** How fast BAC is climbing right now, in % per hour (negative when falling). */
  function riseRate(sim, now) {
    return (bacAt(sim, now) - bacAt(sim, now - 30 * MIN)) * 2;
  }

  /** Standard drinks logged over the last hour, given each round's drinks spread over that round. */
  function stdLastHour(o, now) {
    return roundsOf(o).reduce((sum, r) => {
      const G = gramsIn(r.drinks);
      if (r.end - r.start < MIN) return sum + ((r.start <= now && r.start > now - HOUR) ? G / STD_G : 0);
      const overlap = Math.max(0, Math.min(r.end, now) - Math.max(r.start, now - HOUR));
      return sum + (G * overlap / (r.end - r.start)) / STD_G;
    }, 0);
  }

  function status(bNow, limit) {
    if (bNow > limit) return 'over';
    if (bNow >= CLEAR) return 'impaired';
    return 'clear';
  }

  /**
   * Where you stand, counting alcohol already drunk but still reaching your blood.
   * Right after a drink the blood level is near zero while the peak is still to
   * come, so the status follows the higher of now and the highest level ahead.
   * That is the highest point from now on, not the night's peak: an earlier
   * round may have peaked higher, and a new one can still lift you back over.
   * overAt: when you will cross the limit, if you are under it now but heading over.
   * low: not clear, but neither now nor ahead reaches THRESHOLDS.low (alcohol on board, a low level).
   */
  function outlook(sim, now, limit) {
    const b = bacAt(sim, now);
    const from = Math.max(0, Math.floor((now - sim.start) / MIN) - 1);
    let ahead = b;
    if (sim.G > 0 && !(sim.clear && now >= sim.clear)) {
      for (let i = from; i < sim.points.length; i++) if (sim.points[i] > ahead) ahead = sim.points[i];
    }
    let overAt = null;
    if (b <= limit && ahead > limit) {
      for (let i = from; i < sim.points.length; i++) {
        if (sim.points[i] > limit) { overAt = sim.start + (i + 1) * MIN; break; }
      }
    }
    const st = status(ahead, limit);
    return { b, ahead, rising: ahead > b + CLEAR, status: st, overAt, low: st === 'impaired' && ahead < THRESHOLDS.low };
  }

  /** Blackout risk from peak, rise rate, pace and food. */
  function blackoutRisk({ peak, rise, perHour, fed }) {
    let score = 0;
    const reasons = [];
    if (peak >= THRESHOLDS.blackout) { score += 3; reasons.push({ key: 'peak', strong: true }); }
    else if (peak >= 0.10) { score += 1; reasons.push({ key: 'peak', strong: false }); }
    if (rise >= THRESHOLDS.fastRise * 2) { score += 2; reasons.push({ key: 'rise', strong: true }); }
    else if (rise >= THRESHOLDS.fastRise) { score += 1; reasons.push({ key: 'rise', strong: false }); }
    if (perHour > THRESHOLDS.bingeStdPerHour) { score += 2; reasons.push({ key: 'pace', strong: true }); }
    else if (perHour > THRESHOLDS.fastStdPerHour) { score += 1; reasons.push({ key: 'pace', strong: false }); }
    if (!fed && score > 0) { score += 1; reasons.push({ key: 'food', strong: false }); }
    const level = score >= 4 || peak >= THRESHOLDS.blackout ? 'high' : score >= 2 ? 'raised' : 'low';
    return { level, score, reasons };
  }

  /**
   * Shortest wait, in minutes (steps of 5, up to 3 h), before one more drink of
   * nextGrams keeps the peak under the ceiling. 0 means it already fits.
   * Returns null when no wait within 3 h keeps it under.
   */
  function pacingGap(o, now, nextGrams, ceiling) {
    const base = stopAt(o, now);
    for (let g = 0; g <= 180; g += 5) {
      const sim = simulate(Object.assign({}, base, { extra: [{ t: now + g * MIN, g: nextGrams }] }));
      if (sim.peak < ceiling) return g;
    }
    return null;
  }

  /**
   * Drive planner. Returns when the person is projected to be clear if they stop now,
   * whether that leaves the margin before driveAt, and (if still drinking at the same
   * pace) the latest stop time that would still leave the margin.
   * known is false when the model could not reach a clear time: then ok is always false.
   */
  function drivePlan(o, now, driveAt, marginMin, stillDrinking) {
    const margin = (marginMin || 60) * MIN;
    const stopNow = simulate(stillDrinking ? stopAt(o, now) : o);
    const clearAt = stopNow.G ? stopNow.clear : now;
    const known = Number.isFinite(clearAt);
    const ok = known && clearAt + margin <= driveAt;
    let latestStop = null;
    const rs = roundsOf(stillDrinking ? stopAt(o, now) : o);
    // Only the round still going is extended, at its own pace; earlier rounds stay as they were.
    // A round marked live wins; otherwise the one that ended last.
    const live = rs.find((r) => r.live) || rs.reduce((a, r) => (!a || r.end >= a.end ? r : a), null);
    if (stillDrinking && ok && live && now - live.start >= 10 * MIN && stopNow.G > 0) {
      const pace = gramsIn(live.drinks) / (now - live.start);   // grams per ms in this round
      const clearIfStopAt = (T) => {
        const grams = pace * (T - live.start);
        const dose = { name: 'pace', abv: 100, ml: grams / ETHANOL, qty: 1, share: 1 };
        const rounds = rs.map((r) => (r === live ? { start: live.start, end: T, drinks: [dose] } : r));
        const c = simulate(Object.assign({}, o, { rounds })).clear;
        return Number.isFinite(c) ? c : Infinity;
      };
      let lo = now, hi = driveAt;
      if (clearIfStopAt(hi) + margin <= driveAt) latestStop = hi;
      else {
        for (let i = 0; i < 16 && hi - lo > MIN; i++) {
          const mid = Math.round((lo + hi) / 2);
          if (clearIfStopAt(mid) + margin <= driveAt) lo = mid; else hi = mid;
        }
        latestStop = Math.floor(lo / (5 * MIN)) * 5 * MIN;
        if (latestStop < now) latestStop = now;
      }
    }
    return { clearAt, ok, known, latestStop, margin };
  }

  const api = {
    ETHANOL, STD_G, CLEAR, KM, THRESHOLDS, MAX_AFTER_LAST_DRINK_MIN, gramsOf, dataEnd, roundsOf, stopAt, simulate, bacAt, underLimitAt,
    riseRate, stdLastHour, status, outlook, blackoutRisk, pacingGap, drivePlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryModel = api;
})(typeof self !== 'undefined' ? self : this);

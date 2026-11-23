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

  const THRESHOLDS = {
    blackout: 0.15,               // research links blackouts to roughly 0.15% and above
    danger: 0.30,                 // risk of alcohol poisoning
    fastRise: 0.05,               // % per hour
    fastStdPerHour: 3,
    bingeStdPerHour: 5
  };

  const gramsOf = (d) => d.ml * (d.abv / 100) * ETHANOL * d.qty * d.share;

  function factors(o) {
    return {
      r: o.sex === 'f' ? 0.55 : 0.68,
      halfLife: o.fed ? 35 : 15,  // minutes for half of the waiting alcohol to absorb
      bio: o.fed ? 0.9 : 1        // food lowers how much reaches the blood
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
   */
  function simulate(o) {
    const { r, halfLife, bio } = factors(o);
    const vd = r * o.kg * 10;
    const rs = roundsOf(o);
    const G = rs.reduce((a, x) => a + gramsIn(x.drinks), 0);
    const extra = (o.extra || []).filter((e) => e.g > 0);
    const start = rs.length ? rs[0].start : o.start;
    const out = { G, start, points: [], clear: null, peak: 0, peakAt: start };
    if (!(G > 0) && !extra.length) return out;

    const plan = rs.map((x) => {
      const dur = Math.max(1, Math.round((x.end - x.start) / MIN));
      return { off: Math.round((x.start - start) / MIN), dur, rate: gramsIn(x.drinks) / dur };
    });
    const lastEnd = plan.reduce((a, p) => Math.max(a, p.off + p.dur), 0);
    const ka = 1 - Math.exp(-Math.LN2 / halfLife);
    const vmax = o.beta * (1 + KM / 0.08) / 60;   // so the rate matches beta at everyday levels
    const lastExtra = extra.reduce((a, e) => Math.max(a, Math.round((e.t - start) / MIN)), 0);
    let pool = 0, B = 0;

    for (let m = 0; m < 60 * 96; m++) {
      for (const p of plan) if (m >= p.off && m < p.off + p.dur) pool += p.rate * bio;
      for (const e of extra) if (Math.round((e.t - start) / MIN) === m) pool += e.g * bio;
      const abs = pool * ka;
      pool -= abs;
      B = B + abs / vd;
      B = Math.max(0, B - vmax * B / (KM + B));
      const t = start + (m + 1) * MIN;
      out.points.push(B);
      if (B > out.peak) { out.peak = B; out.peakAt = t; }
      // Clear once drinking is over, BAC reads zero and too little is left to absorb to lift it again.
      if (m >= lastEnd && m >= lastExtra && B < CLEAR && pool * ka / vd < vmax * CLEAR / (KM + CLEAR)) { out.clear = t; return out; }
    }
    out.clear = start + out.points.length * MIN;
    return out;
  }

  function bacAt(sim, t) {
    const i = Math.floor((t - sim.start) / MIN) - 1;
    if (!(i >= 0) || i >= sim.points.length || (sim.clear && t >= sim.clear)) return 0;
    return sim.points[i];
  }

  /** First moment after the last time BAC sits above the limit. null if it never goes over. */
  function underLimitAt(sim, limit) {
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
   */
  function drivePlan(o, now, driveAt, marginMin, stillDrinking) {
    const margin = (marginMin || 60) * MIN;
    const stopNow = simulate(stillDrinking ? stopAt(o, now) : o);
    const clearAt = stopNow.G ? stopNow.clear : now;
    const ok = clearAt + margin <= driveAt;
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
        return simulate(Object.assign({}, o, { rounds })).clear;
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
    return { clearAt, ok, latestStop, margin };
  }

  const api = {
    ETHANOL, STD_G, CLEAR, KM, THRESHOLDS, gramsOf, roundsOf, stopAt, simulate, bacAt, underLimitAt,
    riseRate, stdLastHour, status, blackoutRisk, pacingGap, drivePlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryModel = api;
})(typeof self !== 'undefined' ? self : this);

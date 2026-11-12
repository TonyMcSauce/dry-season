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
   * o: { drinks, start, end, kg, sex, beta, fed, extra:[{t, g}] }
   * Drinks are spread evenly from start to end. extra adds single doses at a time.
   */
  function simulate(o) {
    const { r, halfLife, bio } = factors(o);
    const vd = r * o.kg * 10;
    const G = (o.drinks || []).reduce((a, d) => a + gramsOf(d), 0);
    const extra = (o.extra || []).filter((e) => e.g > 0);
    const start = o.start;
    const end = Math.max(o.end, start);
    const out = { G, start, points: [], clear: null, peak: 0, peakAt: start };
    if (!(G > 0) && !extra.length) return out;

    const durMin = Math.max(1, Math.round((end - start) / MIN));
    const rate = G / durMin;
    const ka = 1 - Math.exp(-Math.LN2 / halfLife);
    const vmax = o.beta * (1 + KM / 0.08) / 60;   // so the rate matches beta at everyday levels
    const lastExtra = extra.reduce((a, e) => Math.max(a, Math.round((e.t - start) / MIN)), 0);
    let pool = 0, B = 0;

    for (let m = 0; m < 60 * 96; m++) {
      if (m < durMin) pool += rate * bio;
      for (const e of extra) if (Math.round((e.t - start) / MIN) === m) pool += e.g * bio;
      const abs = pool * ka;
      pool -= abs;
      B = B + abs / vd;
      B = Math.max(0, B - vmax * B / (KM + B));
      const t = start + (m + 1) * MIN;
      out.points.push(B);
      if (B > out.peak) { out.peak = B; out.peakAt = t; }
      // Clear once drinking is over, BAC reads zero and too little is left to absorb to lift it again.
      if (m >= durMin && m >= lastExtra && B < CLEAR && pool * ka / vd < vmax * CLEAR / (KM + CLEAR)) { out.clear = t; return out; }
    }
    out.clear = start + out.points.length * MIN;
    return out;
  }

  function bacAt(sim, t) {
    const i = Math.floor((t - sim.start) / MIN) - 1;
    if (i < 0 || i >= sim.points.length || (sim.clear && t >= sim.clear)) return 0;
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

  /** Standard drinks logged over the last hour, given drinks spread from start to end. */
  function stdLastHour(o, now) {
    const G = (o.drinks || []).reduce((a, d) => a + gramsOf(d), 0);
    const end = Math.max(o.end, o.start);
    if (end - o.start < MIN) return (o.start <= now && o.start > now - HOUR) ? G / STD_G : 0;
    const overlap = Math.max(0, Math.min(end, now) - Math.max(o.start, now - HOUR));
    return (G * overlap / (end - o.start)) / STD_G;
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
    const base = Object.assign({}, o, { end: Math.min(o.end, now) });
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
    const stopNow = simulate(Object.assign({}, o, { end: stillDrinking ? now : o.end }));
    const clearAt = stopNow.G ? stopNow.clear : now;
    const ok = clearAt + margin <= driveAt;
    let latestStop = null;
    if (stillDrinking && ok && now - o.start >= 10 * MIN && stopNow.G > 0) {
      const pace = stopNow.G / (now - o.start);         // grams per ms so far
      const clearIfStopAt = (T) => {
        const grams = pace * (T - o.start);
        const dose = { name: 'pace', abv: 100, ml: grams / ETHANOL, qty: 1, share: 1 };
        return simulate(Object.assign({}, o, { drinks: [dose], end: T })).clear;
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
    ETHANOL, STD_G, CLEAR, KM, THRESHOLDS, gramsOf, simulate, bacAt, underLimitAt,
    riseRate, stdLastHour, status, blackoutRisk, pacingGap, drivePlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryModel = api;
})(typeof self !== 'undefined' ? self : this);

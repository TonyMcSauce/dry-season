/* Dry Season horizon: the hero's landscape drawn from the night's blood alcohol.
 * paths() is pure geometry (tested in Node); render() updates an existing SVG in
 * place so CSS can morph the hills between states. Works in the browser
 * (window.DryHorizon) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const M = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.DryModel;
  const HOUR = 3600000;
  const SAMPLES = 64;            // fixed, so paths always have the same shape and can morph
  const f1 = (n) => n.toFixed(1);

  /**
   * sim: M.simulate output for the whole night. rounds: [{start, end}] with ends resolved.
   * o: { width, height, max, limit, prevSim } where prevSim simulates every round but the latest.
   */
  function paths(sim, rounds, now, o) {
    const W = o.width, H = o.height, max = o.max || 0.11;
    const has = sim.G > 0 && rounds.length > 0;
    const floorHour = (t) => { const d = new Date(t); d.setMinutes(0, 0, 0); return d.getTime(); };
    const from = has ? floorHour(Math.min.apply(null, rounds.map((r) => r.start))) - HOUR : floorHour(now) - HOUR;
    // An incomplete night has no clear time: the view runs to where its data ends, with no moon.
    const known = has && Number.isFinite(sim.clear);
    const clear = has ? M.dataEnd(sim) : now;
    const to = Math.max(clear + HOUR, now + 2 * HOUR, from + 20 * HOUR);
    const X = (t) => Math.max(0, Math.min(W, (t - from) / (to - from) * W));
    const Y = (b) => H - Math.min(1, b / max) * H;
    const bac = (t) => (has ? M.bacAt(sim, t) : 0);

    let ridge = '';
    for (let i = 0; i < SAMPLES; i++) {
      const t = from + i * (to - from) / (SAMPLES - 1);
      ridge += (i ? 'L' : 'M') + f1(X(t)) + ' ' + f1(Y(bac(t)));
    }

    let ghost = null;
    const ps = o.prevSim;
    if (has && ps && ps.G > 0 && rounds.length > 1) {
      const latest = rounds.reduce((a, r) => (r.start > a.start ? r : a), rounds[0]);
      const psEnd = M.dataEnd(ps);
      if (psEnd > latest.start) {
        ghost = '';
        for (let i = 0; i <= 24; i++) {
          const t = latest.start + i * (psEnd - latest.start) / 24;
          ghost += (i ? 'L' : 'M') + f1(X(t)) + ' ' + f1(Y(M.bacAt(ps, t)));
        }
      }
    }

    return {
      ridge, area: ridge + 'L' + W + ' ' + H + 'L0 ' + H + 'Z', ghost,
      bands: rounds.map((r, i) => ({ x: X(r.start), w: Math.max(3, X(r.end) - X(r.start)), label: 'ROUND ' + (i + 1) })),
      nowX: X(now), nowY: Y(bac(now)), moonX: X(clear), moon: known,
      peakX: has ? X(sim.peakAt) : X(now), peakY: has ? Y(sim.peak) : H,
      limitY: Y(o.limit || 0.05), from, to
    };
  }

  const NS = 'http://www.w3.org/2000/svg';
  function setPath(el, d) { el.setAttribute('d', d); el.style.d = 'path("' + d + '")'; }

  /**
   * Update an SVG built from the hero markup: .hz-bands, .hz-limit, .hz-ghost, .hz-hill,
   * .hz-ridge, .hz-labels, .hz-now, .hz-moon. view: { sim, rounds, now, limit, prevSim }.
   * Returns the geometry so the page can aim animations at it.
   */
  function render(svg, view) {
    const W = Math.max(200, Math.round(svg.clientWidth || svg.getBoundingClientRect().width || 400));
    const VH = 150, H = 142;           // the last 8 px are solid ground under the baseline
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + VH);
    // Leave headroom above the peak so the round labels stay readable.
    const max = Math.max(0.11, (view.sim.peak || 0) * 1.25);
    const g = paths(view.sim, view.rounds, view.now, { width: W, height: H, max, limit: view.limit, prevSim: view.prevSim });
    const q = (s) => svg.querySelector(s);
    setPath(q('.hz-hill'), g.area);
    setPath(q('.hz-ridge'), g.ridge);
    const ghost = q('.hz-ghost');
    ghost.style.display = g.ghost ? '' : 'none';
    if (g.ghost) ghost.setAttribute('d', g.ghost);
    const lim = q('.hz-limit');
    lim.setAttribute('x2', W); lim.setAttribute('y1', f1(g.limitY)); lim.setAttribute('y2', f1(g.limitY));
    lim.style.display = view.rounds.length ? '' : 'none';
    q('.hz-ground').setAttribute('width', W);

    const bands = q('.hz-bands'), labels = q('.hz-labels');
    while (bands.children.length > g.bands.length) { bands.lastChild.remove(); labels.lastChild.remove(); }
    g.bands.forEach((b, i) => {
      let rect = bands.children[i], text = labels.children[i];
      if (!rect) { rect = document.createElementNS(NS, 'rect'); text = document.createElementNS(NS, 'text'); bands.appendChild(rect); labels.appendChild(text); }
      rect.setAttribute('y', 0); rect.setAttribute('height', H);
      rect.setAttribute('x', f1(b.x)); rect.setAttribute('width', f1(b.w));
      rect.style.x = f1(b.x) + 'px'; rect.style.width = f1(b.w) + 'px';
      text.setAttribute('y', 14); text.setAttribute('x', f1(b.x + 5));
      text.textContent = b.label;
    });

    const live = view.rounds.length > 0;
    const now = q('.hz-now'), moon = q('.hz-moon');
    now.style.display = live ? '' : 'none';
    now.setAttribute('cx', f1(g.nowX)); now.setAttribute('cy', f1(g.nowY));
    now.style.cx = f1(g.nowX) + 'px'; now.style.cy = f1(g.nowY) + 'px';
    moon.style.display = live && g.moon && view.sim.clear > view.now ? '' : 'none';
    moon.setAttribute('cx', f1(g.moonX)); moon.setAttribute('cy', H - 7);
    moon.style.cx = f1(g.moonX) + 'px';
    return g;
  }

  const api = { paths, render, SAMPLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryHorizon = api;
})(typeof self !== 'undefined' ? self : this);

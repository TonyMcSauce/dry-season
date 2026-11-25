(() => {
  'use strict';
  const KEY = 'dryseason.v1';
  const APP_KEY = 'dryseason.app';
  const VERSION = self.DRY_VERSION || '0';
  const hadData = (() => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } })();
  const M = window.DryModel;
  const { STD_G } = M;
  const MIN = 60000;
  const SCALE_MAX = 0.35;
  const LIMIT_PRESETS = [['Botswana 0.05', 0.05], ['0.08', 0.08], ['0.02', 0.02]];

  const D = window.DryDrinks;
  const N = window.DryNight;
  const DRINKS = D.GROUPS;
  const SIZES = D.SIZES;
  const SHARES = [[1, 'All mine'], [0.5, 'Half'], [1/3, 'A third'], [0.25, 'A quarter']];

  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtBac = (b) => b.toFixed(3) + '%';
  // A clear time can be Infinity when the model could not reach one: it prints as --:--, never as a made up time.
  const fmtTime = (ms) => { if (!Number.isFinite(ms)) return '--:--'; const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const known = (t) => Number.isFinite(t);
  const round5 = (ms) => Math.floor(ms / 300000) * 300000;

  function newSession() {
    return { v: 5, rounds: [], fed: false, driveAt: null, water: null };
  }
  function defaults() {
    return { profile: { kg: 75, sex: 'm', beta: 0.015, limit: 0.05, island: true, theme: 'auto' }, session: newSession(), history: [], historyRev: N.HISTORY_REV, stash: [], favs: D.DEFAULT_FAVS.map((f) => Object.assign({}, f)) };
  }
  let historyRechecked = false;   // set when load() recomputed History with a newer model: save it once
  function load() {
    const d = defaults();
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.profile && s.session && (Array.isArray(s.session.drinks) || Array.isArray(s.session.rounds))) {
        // Older saves kept one stash inside the night; it moves to the list on the state.
        const session = N.migrate(Object.assign({ fed: false, driveAt: null, water: null }, s.session));
        const oldStash = session.stash;
        if (oldStash !== undefined) delete session.stash;
        const profile = Object.assign(d.profile, s.profile);
        // History saved by an older model is worked out again, once (see N.HISTORY_REV).
        let history = Array.isArray(s.history) ? s.history : [];
        if (s.historyRev !== N.HISTORY_REV) { history = N.recheckHistory(history, profile); historyRechecked = true; }
        return {
          profile,
          session,
          stash: N.migrateStash(s.stash, oldStash),
          history,
          historyRev: N.HISTORY_REV,
          favs: D.normalizeFavs(Array.isArray(s.favs) ? s.favs : D.DEFAULT_FAVS)
        };
      }
    } catch (e) {}
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  let state = N.settle(load(), Date.now());
  if (historyRechecked) save();

  const gramsOf = M.gramsOf;
  const isLive = () => !!N.liveRound(state.session);
  const allDrinks = () => state.session.rounds.reduce((a, r) => a.concat(r.drinks), []);
  function opts(extra) {
    return Object.assign(N.simOpts(state.session, state.profile, Date.now()), extra || {});
  }
  const simulate = () => M.simulate(opts());
  const bacAt = M.bacAt;
  const fmtLimit = (l) => l.toFixed(2) + '%';

  function dayLabel(ms) {
    if (!known(ms)) return 'Not known';
    const d = new Date(ms), n = new Date();
    const strip = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((strip(d) - strip(n)) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  function dayIn(ms) {
    const l = dayLabel(ms);
    return ['Today', 'Tomorrow', 'Yesterday'].includes(l) ? l.toLowerCase() : 'on ' + l;
  }
  function dur(ms) {
    const t = known(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return { h, m, s };
  }

  // Hero
  const els = {
    kicker: $('#kicker'), time: $('#clearTime'), day: $('#clearDay'),
    nowBac: $('#nowBac'), peakBac: $('#peakBac'), liquid: $('#liquid')
  };
  let lastSim = null;
  let lastHorizon = null;
  // The 3D hero. Without WebGL (or three.js) this stays null and the flat glass and SVG horizon remain.
  const cssToken = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  // The 3D hero is always at dusk, whatever the theme, so it uses the dark palette.
  const sceneTokens = () => ({ skyTop: '#17212F', skyMid: '#2D2926', skyLow: '#7A3F1F', horizon: '#C8742E',
    ground: '#16120E', amber: cssToken('--amber'), ink: cssToken('--ink'), stars: '1' });
  setTimeout(() => document.documentElement.classList.remove('intro'), 2800);
  (function seedTwinkle() {
    const box = $('#twinkle'); if (!box) return;
    let r = 7;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('i');
      el.style.setProperty('--x', (4 + rnd() * 92).toFixed(1) + '%');
      el.style.setProperty('--y', (3 + rnd() * 90).toFixed(1) + '%');
      el.style.setProperty('--s', (1.6 + rnd() * 1.8).toFixed(1) + 'px');
      el.style.setProperty('--t', (3.2 + rnd() * 4).toFixed(1) + 's');
      el.style.setProperty('--d', (-rnd() * 7).toFixed(1) + 's');
      box.appendChild(el);
    }
  })();
  let scene = null, sceneStarted = false;
  try {
    scene = window.DryScene ? DryScene.create($('#scene3d'), $('#hero'), { tokens: sceneTokens, intro: () => document.documentElement.classList.contains('intro'), reduceMotion: () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches }) : null;
  } catch (e) { scene = null; }
  if (scene) {
    $('#hero').classList.add('three');
  }
  function layoutScene() {
    const hero = $('#hero'), sp = $('#stageSpace');
    const an = $('#another'), anH = an.hidden ? 0 : an.offsetHeight;
    scene.setLayout({ top: sp.offsetTop + 8, base: hero.clientHeight - 30 - anH });
  }
  // Keep the drinks standing in their strip whenever the hero changes height (status shows, buttons appear, rotation).
  if (scene && window.ResizeObserver) new ResizeObserver(() => layoutScene()).observe($('#hero'));
  function renderHorizon(sim, now) {
    const o = opts(), rounds = o.rounds;
    let prevSim = null;
    if (rounds.length > 1) {
      const latest = rounds.reduce((a, r) => (r.start > a.start ? r : a), rounds[0]);
      prevSim = M.simulate(Object.assign({}, o, { rounds: rounds.filter((r) => r !== latest) }));
    }
    lastHorizon = window.DryHorizon.render($('#horizon'), { sim, rounds, now, limit: state.profile.limit, prevSim });
    if (scene) {
      const has = rounds.length > 0 && sim.G > 0;
      const view = { has, level: has ? DryScene.glassLevel(sim.start, sim.clear, now) : 0, sim, rounds, now, limit: state.profile.limit, prevSim };
      layoutScene();
      if (!sceneStarted) { sceneStarted = true; scene.setNight(view); } else scene.update(view);
    }
  }
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  // Number motion: BAC values glide to their new value; other readouts flip in when they change.
  const tweens = new WeakMap();
  function tweenText(el, to, fmt, ms) {
    const key = to.toFixed(3);
    if (el.dataset.to === key) return;
    el.dataset.to = key;
    const from = parseFloat(el.dataset.v || '0'), old = tweens.get(el);
    if (old) cancelAnimationFrame(old);
    if (reduceMotionPref() || document.hidden || Math.abs(to - from) < 0.0005) { el.textContent = fmt(to); el.dataset.v = String(to); return; }
    const t0 = performance.now();
    (function step(now) {
      const k = Math.max(0, Math.min(1, (now - t0) / ms)), e = 1 - Math.pow(1 - k, 3), v = Math.max(0, from + (to - from) * e);
      el.textContent = fmt(v); el.dataset.v = String(v);
      if (k < 1) tweens.set(el, requestAnimationFrame(step)); else { el.dataset.v = String(to); tweens.delete(el); }
    })(t0);
  }
  function flip(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
  }
  // BAC gauge: a half ring from 0 to SCALE_MAX, with a tick at the legal limit.
  let gaugeReady = false;
  function renderGauge(b, sim, now) {
    const f = Math.max(0, Math.min(1, b / SCALE_MAX)), shown = b > 0 ? Math.max(f, 0.015) : 0;
    const paint = () => {
      $('#gFill').style.strokeDasharray = (shown * 100).toFixed(1) + ' 100';
      $('#gDot').style.transform = 'rotate(' + (shown * 180).toFixed(1) + 'deg)';
    };
    if (gaugeReady) paint();
    else if (gaugeReady === false) { gaugeReady = null; requestAnimationFrame(() => requestAnimationFrame(() => { gaugeReady = true; paint(); })); }
    const lf = Math.min(1, state.profile.limit / SCALE_MAX), a = Math.PI * (1 - lf);
    $('#gZone').style.strokeDasharray = '0 ' + (lf * 100).toFixed(1) + ' ' + ((1 - lf) * 100).toFixed(1) + ' 100';
    const cx = 100, cy = 100, tick = $('#gLimit');
    tick.setAttribute('x1', (cx + 78 * Math.cos(a)).toFixed(1)); tick.setAttribute('y1', (cy - 78 * Math.sin(a)).toFixed(1));
    tick.setAttribute('x2', (cx + 95 * Math.cos(a)).toFixed(1)); tick.setAttribute('y2', (cy - 95 * Math.sin(a)).toFixed(1));
    $('#gauge').setAttribute('aria-label', 'Estimated blood alcohol ' + fmtBac(b) + ', legal limit ' + fmtLimit(state.profile.limit));
    $('#gSub').textContent = 'Limit ' + fmtLimit(state.profile.limit);
    let sess = '--';
    if (sim.G) {
      if (now < sim.start) sess = 'From ' + fmtTime(sim.start);
      else if (now >= sim.clear) sess = 'Ended';
      else { const d = dur(now - sim.start); sess = d.h ? d.h + ' h ' + pad(d.m) + ' m' : d.m + ' min'; }
    }
    flip($('#sessLen'), sess);
  }
  function renderHero(sim, light) {
    const now = Date.now();
    if (!light) renderHorizon(sim, now);
    $('#hero').classList.toggle('empty', !sim.G);
    const bNow = bacAt(sim, now);
    let frac = 0;
    if (!sim.G) {
      setText(els.kicker, 'Tonight');
      flip(els.time, 'Clear');
      els.day.textContent = 'Nothing on the tab yet. Your first pour starts the clock.';
    } else if (now < sim.start) {
      els.kicker.textContent = 'Clear by';
      flip(els.time, fmtTime(sim.clear));
      els.day.textContent = dayLabel(sim.clear) + '. Your start time is still ahead.';
    } else if (sim.complete === false) {
      // The model could not follow this night to the end. Never a guessed time, never Clear.
      els.kicker.textContent = "Can't estimate";
      flip(els.time, '--:--');
      els.day.textContent = 'This is more than the model can follow. Treat yourself as over the limit: don\'t drive.';
      frac = 1;
    } else if (now >= sim.clear) {
      els.kicker.textContent = "You're";
      flip(els.time, 'Clear');
      els.day.textContent = 'Clear since ' + fmtTime(sim.clear) + ' ' + dayIn(sim.clear) + '. Still worth a glass of water.';
    } else {
      const { h, m, s } = dur(sim.clear - now);
      els.kicker.textContent = 'Clear by';
      flip(els.time, fmtTime(sim.clear));
      els.day.textContent = dayLabel(sim.clear) + ' · ' + h + ' h ' + pad(m) + ' m ' + pad(s) + ' s to go';
      frac = sim.peak > 0 ? Math.min(1, bNow / sim.peak) : 0;
      if (bNow === 0 && now < sim.clear) frac = 0.04;
    }
    tweenText(els.nowBac, bNow, fmtBac, 1100);
    tweenText(els.peakBac, sim.peak, fmtBac, 1100);
    renderGauge(bNow, sim, now);
    const y = 198 - frac * 182;               // 198 = empty, 16 = brim
    els.liquid.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
  }

  // Zones shared by the chart and the risk scale
  function zones() {
    const l = state.profile.limit;
    return [
      { to: l, c: 'var(--z1)', name: 'Impaired', op: .10 },
      { to: Math.max(l, 0.08), c: 'var(--z2)', name: 'Over the limit', op: .16 },
      { to: 0.15, c: 'var(--z3)', name: 'Very high', op: .20 },
      { to: 0.30, c: 'var(--z4)', name: 'Blackout risk', op: .26 },
      { to: Infinity, c: 'var(--z5)', name: 'Danger', op: .36 }
    ];
  }

  // Chart
  function renderChart(sim) {
    const box = $('#chartBox');
    if (!sim.G) { box.innerHTML = '<div class="chart-empty">Your curve appears once there is something on the tab.</div>'; return; }
    const W = 340, H = 200, pl = 6, pr = 10, pt = 26, pb = 26;
    const limit = state.profile.limit;
    const t0 = sim.start, t1 = M.dataEnd(sim), span = Math.max(t1 - t0, 60000), done = sim.complete !== false;
    const maxB = Math.max(sim.peak * 1.15, limit * 1.8, 0.02);
    const x = (t) => pl + (t - t0) / span * (W - pl - pr);
    const y = (b) => pt + (1 - Math.min(b, maxB) / maxB) * (H - pt - pb);
    const n = sim.points.length, step = Math.max(1, Math.floor(n / 180));
    let d = 'M' + x(t0).toFixed(1) + ' ' + y(0).toFixed(1);
    for (let i = 0; i < n; i += step) d += ' L' + x(t0 + (i + 1) * 60000).toFixed(1) + ' ' + y(sim.points[i]).toFixed(1);
    // A night that clears comes back down to zero; an incomplete one just stops where its data ends.
    const area = d + ' L' + x(t1).toFixed(1) + ' ' + y(0).toFixed(1) + ' Z';
    if (done) d += ' L' + x(t1).toFixed(1) + ' ' + y(0).toFixed(1);

    let bands = '', from = 0;
    zones().forEach((z, i) => {
      const lo = from, hi = Math.min(z.to, maxB);
      from = z.to;
      if (hi <= lo) return;
      const y1 = y(hi), y2 = y(lo);
      bands += '<rect x="' + pl + '" y="' + y1.toFixed(1) + '" width="' + (W - pl - pr) + '" height="' + (y2 - y1).toFixed(1) + '" style="fill:' + z.c + ';opacity:' + z.op + '"/>';
      if (i > 0 && y2 - y1 >= 15) bands += '<text x="' + (W - pr - 6) + '" y="' + (y1 + 12).toFixed(1) + '" text-anchor="end" class="zone-label">' + z.name + '</text>';
    });
    let limitLine = '';
    if (limit > 0 && limit < maxB) {
      const ly = y(limit).toFixed(1);
      limitLine = '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + ly + '" y2="' + ly + '" style="stroke:var(--text);opacity:.55" stroke-dasharray="5 4"/>'
                + '<text x="' + (pl + 6) + '" y="' + (ly - 5) + '" class="zone-label">Legal limit ' + fmtLimit(limit) + '</text>';
    }

    const hrs = span / 3600e3;
    const stepH = hrs <= 6 ? 1 : hrs <= 14 ? 2 : hrs <= 30 ? 4 : 8;
    const first = new Date(t0); first.setMinutes(0, 0, 0);
    let ticks = '';
    for (let t = first.getTime() + 3600e3; t < t1; t += 3600e3) {
      const hr = new Date(t).getHours();
      if (hr % stepH !== 0) continue;
      const xx = x(t);
      if (xx < 40 || xx > W - 44) continue;
      ticks += '<line x1="' + xx + '" x2="' + xx + '" y1="' + pt + '" y2="' + (H - pb) + '" style="stroke:var(--line)" stroke-dasharray="2 4"/>'
             + '<text x="' + xx + '" y="' + (H - 8) + '" text-anchor="middle">' + pad(hr) + ':00</text>';
    }
    const now = Date.now();
    let nowMark = '';
    if (now > t0 && now < t1) {
      const nx = x(now), ny = y(bacAt(sim, now));
      nowMark = '<line x1="' + nx + '" x2="' + nx + '" y1="' + (pt - 8) + '" y2="' + (H - pb) + '" style="stroke:var(--text)" stroke-width="1.5"/>'
              + '<circle cx="' + nx + '" cy="' + ny + '" r="5" style="fill:var(--text)"/>'
              + '<text x="' + nx + '" y="' + (pt - 12) + '" text-anchor="middle" class="peak-label">Now</text>';
    }
    const px = x(sim.peakAt), py = y(sim.peak);
    const anchor = px > W * 0.72 ? 'end' : px < W * 0.2 ? 'start' : 'middle';
    box.innerHTML =
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Blood alcohol peaks at ' + fmtBac(sim.peak) + ' around ' + fmtTime(sim.peakAt) + (done ? ' and reaches zero at ' + fmtTime(t1) : ', and the estimate cannot see when it reaches zero') + '">'
      + '<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2A93B" stop-opacity=".5"/><stop offset="1" stop-color="#F2A93B" stop-opacity="0"/></linearGradient></defs>'
      + bands + ticks + limitLine
      + '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(0) + '" y2="' + y(0) + '" style="stroke:var(--line)"/>'
      + '<path d="' + area + '" fill="url(#ag)"/>'
      + '<path d="' + d + '" fill="none" stroke="#F2A93B" stroke-width="2.5" stroke-linejoin="round"/>'
      + '<circle cx="' + px + '" cy="' + py + '" r="4" fill="#F2A93B"/>'
      + (nowMark ? '' : '<text x="' + px + '" y="' + (py - 10) + '" text-anchor="' + anchor + '" class="peak-label">Peak ' + fmtBac(sim.peak) + '</text>')
      + nowMark
      + '<text x="' + pl + '" y="' + (H - 8) + '">' + fmtTime(t0) + '</text>'
      + '<text x="' + (W - pr) + '" y="' + (H - 8) + '" text-anchor="end">' + fmtTime(t1) + '</text>'
      + '</svg>';
  }

  // Tab
  function shareLabel(v) { const f = SHARES.find((s) => Math.abs(s[0] - v) < 1e-6); return f ? f[1].toLowerCase() : Math.round(v * 100) + '%'; }
  function roundWhen(r) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const pre = r.start < today.getTime() ? dayLabel(r.start) + ' ' : '';
    return pre + fmtTime(r.start) + ' to ' + (r.end == null ? 'now' : fmtTime(Math.max(r.start, r.end)));
  }
  function roundWhat(r) { return r.drinks.map((d) => d.qty + ' × ' + d.name).join(' + '); }
  function renderTab() {
    const list = $('#tabList');
    const rounds = state.session.rounds;
    list.innerHTML = '';
    rounds.forEach((r, ri) => {
      if (rounds.length > 1) {
        const h = document.createElement('li'); h.className = 'round-h';
        h.textContent = 'Round ' + (ri + 1) + ' · ' + roundWhen(r);
        list.appendChild(h);
      }
      r.drinks.forEach((d, i) => {
        const li = document.createElement('li');
        const share = d.share < 1 ? ', ' + shareLabel(d.share) + ' each' : '';
        if (r.end == null) {
          li.innerHTML = '<div><div class="li-name"></div><div class="li-meta"></div></div><span class="li-g"></span><span class="li-step"><button type="button" class="less">&#8722;</button><button type="button" class="more">+</button></span>';
          li.querySelector('.li-name').textContent = d.qty + ' × ' + d.name;
          li.querySelector('.li-meta').textContent = d.ml + ' ml at ' + d.abv + '%' + share;
          li.querySelector('.li-g').textContent = gramsOf(d).toFixed(1) + ' g';
          const less = li.querySelector('.less'), more = li.querySelector('.more');
          less.setAttribute('aria-label', 'One fewer ' + d.name);
          more.setAttribute('aria-label', 'One more ' + d.name);
          less.addEventListener('click', () => { nightNote = null; withUndo(() => { state = N.lessOf(state, r.id, N.keyOf(d)); }, 'One fewer ' + d.name); });
          more.addEventListener('click', () => quickAdd(d));
          list.appendChild(li);
          return;
        }
        li.innerHTML = '<div><div class="li-name"></div><div class="li-meta"></div></div><span class="li-g"></span><button class="rm" type="button">&#215;</button>';
        li.querySelector('.li-name').textContent = d.qty + ' × ' + d.name;
        li.querySelector('.li-meta').textContent = d.ml + ' ml at ' + d.abv + '%' + share;
        li.querySelector('.li-g').textContent = gramsOf(d).toFixed(1) + ' g';
        const rm = li.querySelector('.rm');
        rm.setAttribute('aria-label', 'Remove ' + d.name);
        rm.addEventListener('click', () => {
          const drinks = r.drinks.filter((_, j) => j !== i);
          nightNote = null;
          state = drinks.length ? N.editRound(state, r.id, { drinks }) : N.removeRound(state, r.id);
          save(); renderAll(); toast('Removed from the tab');
        });
        list.appendChild(li);
      });
    });
    const drinks = allDrinks();
    const G = drinks.reduce((a, d) => a + gramsOf(d), 0);
    $('#tabEmpty').hidden = drinks.length > 0;
    $('#tabTotal').hidden = drinks.length === 0;
    $('#tabTotalVal').textContent = G.toFixed(1) + ' g, about ' + (G / STD_G).toFixed(1) + ' standard drinks';
  }

  function toLocalInput(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fromLocalInput(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
  }

  // The night: one card per round
  function renderNight() {
    const ul = $('#rounds'), rounds = state.session.rounds;
    ul.innerHTML = '';
    rounds.forEach((r) => {
      const li = document.createElement('li'); li.className = 'round-card'; li.dataset.id = r.id;
      li.innerHTML = '<button type="button" class="rc-open rc-body"><span class="rc-when"></span><span class="rc-what"></span><span class="rc-meta"></span></button>';
      li.querySelector('.rc-open').setAttribute('aria-label', 'Edit round ' + roundWhen(r) + ', ' + roundWhat(r));
      li.querySelector('.rc-open').addEventListener('click', () => openLate(r));
      li.querySelector('.rc-when').textContent = roundWhen(r);
      li.querySelector('.rc-what').textContent = roundWhat(r);
      li.querySelector('.rc-meta').textContent = r.end == null ? 'still going' : r.late ? 'logged late' : 'logged as you went';
      const acts = document.createElement('div'); acts.className = 'rc-actions' + (r.end == null ? ' wide' : '');
      if (r.end == null) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-mini'; b.textContent = 'Finished drinking';
        b.addEventListener('click', () => { nightNote = null; state = N.finishLive(state, Date.now()); save(); renderAll(); });
        acts.appendChild(b);
      }
      li.appendChild(acts);
      const adj = document.createElement('button'); adj.type = 'button'; adj.className = 'btn-mini'; adj.textContent = adjusting === r.id ? 'Done' : 'Adjust times';
      adj.setAttribute('aria-expanded', String(adjusting === r.id));
      adj.addEventListener('click', () => { adjusting = adjusting === r.id ? null : r.id; renderNight(); });
      acts.appendChild(adj);
      if (adjusting === r.id) li.appendChild(adjustRow(r));
      ul.appendChild(li);
    });
    $('#roundsEmpty').hidden = rounds.length > 0 || !!nightNote;
    renderNote();
    $('#fed').checked = !!state.session.fed;
  }
  // Adjust times: quick 15 minute nudges on a round's start and end
  let adjusting = null;
  function adjustRow(r) {
    const box = document.createElement('div'); box.className = 'rc-adjust';
    const row = (edge, label, at) => {
      const d = document.createElement('div'); d.className = 'rc-row';
      d.innerHTML = '<span></span><button type="button">&#8722;15</button><button type="button">+15</button>';
      d.querySelector('span').innerHTML = label + ' <b>' + fmtTime(at) + '</b>';
      const [minus, plus] = d.querySelectorAll('button');
      minus.setAttribute('aria-label', label + ' 15 minutes earlier');
      plus.setAttribute('aria-label', label + ' 15 minutes later');
      const go = (delta) => { nightNote = null; state = N.nudgeRound(state, r.id, edge, delta, Date.now()); save(); renderAll(); };
      minus.addEventListener('click', () => go(-15 * 60000));
      plus.addEventListener('click', () => go(15 * 60000));
      return d;
    };
    box.appendChild(row('start', 'Started', r.start));
    if (r.end != null) box.appendChild(row('end', 'Finished', r.end));
    return box;
  }
  // The note under the rounds after a late round: what happened and why.
  let nightNote = null;
  function renderNote() {
    const box = $('#nightNote');
    box.hidden = !nightNote;
    if (nightNote) { $('#nnTitle').textContent = nightNote[0]; $('#nnText').textContent = nightNote[1]; }
  }
  /** Toast for what happened to the night when a drink or round was added. */
  function announce(outcome) {
    nightNote = null;
    if (outcome.action === 'fresh' && outcome.archived) { toast('New night started. The last one is saved in History.'); return true; }
    return false;
  }

  // Settings, Help and the first run walkthrough
  const settingsDlg = $('#settings'), helpDlg = $('#help');
  function renderSetSum() {
    const t = { auto: 'Automatic', light: 'Light', dark: 'Dark' }[state.profile.theme || 'auto'];
    $('#setSum').textContent = state.profile.kg + ' kg · ' + (state.profile.sex === 'f' ? 'Female' : 'Male') + ' · ' + t + ' theme';
  }
  function openSettings() { if (helpDlg.open) helpDlg.close(); renderBody(); settingsDlg.showModal(); settingsDlg.scrollTop = 0; }
  function openHelp() { if (settingsDlg.open) settingsDlg.close(); helpDlg.showModal(); helpDlg.scrollTop = 0; }
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#openSettings').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', () => settingsDlg.close());
  $('#helpBtn').addEventListener('click', openHelp);
  $('#setHelp').addEventListener('click', openHelp);
  $('#helpClose').addEventListener('click', () => helpDlg.close());
  [settingsDlg, helpDlg].forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  settingsDlg.addEventListener('close', () => { renderSetSum(); });

  const TOUR = [
    ['.readout', 'Your clear time', 'This is when your body should be free of alcohol. It counts down live as your night goes on.'],
    ['#qaAdd', 'Log a drink', 'Tap here when you open one and say when you started. Got a few on hand? Save them as a stash and tap Open next as you go.'],
    ['#nightSection', 'Your night', 'Each round of drinks shows up here. Tap Adjust times to fix when you started or finished, or Log earlier drinks for ones you had before.'],
    ['#driveSection', 'Driving soon?', 'Set when you need to drive and get a straight answer on whether you\'re likely to be clear in time.'],
    ['.top-btns', 'Help and settings', 'Tap ? any time for the full guide, and the gear for your body details and Light or Dark mode.']
  ];
  let tourAt = -1;
  const tourEl = $('#tour');
  function placeTour() {
    const step = TOUR[tourAt], el = document.querySelector(step[0]);
    const panel = el && el.closest('[data-panel]');
    if (panel && document.body.dataset.tab !== panel.dataset.panel) setTab(panel.dataset.panel, false);
    $('#tourStep').textContent = (tourAt + 1) + ' of ' + TOUR.length;
    $('#tourTitle').textContent = step[1];
    $('#tourText').textContent = step[2];
    $('#tourNext').textContent = tourAt === TOUR.length - 1 ? 'Got it' : 'Next';
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect(), pad = 8, ring = $('#tourRing');
      const top = Math.max(4, r.top - pad), h = Math.min(window.innerHeight - 8, r.height + pad * 2);
      Object.assign(ring.style, { left: (r.left - pad) + 'px', top: top + 'px', width: (r.width + pad * 2) + 'px', height: h + 'px' });
      $('#tourCard').classList.toggle('top', r.top + r.height / 2 > window.innerHeight * 0.55);
    });
  }
  function startTour() {
    if (helpDlg.open) helpDlg.close();
    if (settingsDlg.open) settingsDlg.close();
    setMeta({ toured: true });
    setTab('tonight', false);
    tourAt = 0; tourEl.hidden = false; placeTour();
    $('#tourNext').focus();
  }
  function endTour() { tourEl.hidden = true; tourAt = -1; setTab('tonight'); }
  $('#tourNext').addEventListener('click', () => { if (tourAt >= TOUR.length - 1) endTour(); else { tourAt++; placeTour(); } });
  $('#tourSkip').addEventListener('click', endTour);
  $('#helpTour').addEventListener('click', startTour);
  $('#setTour').addEventListener('click', startTour);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tourAt >= 0) endTour(); });
  window.addEventListener('resize', () => { if (tourAt >= 0) placeTour(); });

  // Appearance: Automatic follows the phone; Light or Dark is fixed for the whole app
  function applyTheme() {
    const t = state.profile.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  document.querySelectorAll('#themeSeg [data-theme-choice]').forEach((b) => b.addEventListener('click', () => {
    const root = document.documentElement;
    if (!reduceMotionPref()) { root.classList.add('theming'); setTimeout(() => root.classList.remove('theming'), 500); }
    state.profile.theme = b.dataset.themeChoice; save(); applyTheme(); renderBody();
  }));
  applyTheme();

  // Body settings
  function renderBody() {
    if (typeof renderSetSum === 'function') renderSetSum();
    document.querySelectorAll('#themeSeg [data-theme-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === (state.profile.theme || 'auto'))));
    $('#kg').value = state.profile.kg;
    document.querySelectorAll('[data-sex]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sex === state.profile.sex)));
    $('#beta').value = state.profile.beta;
    $('#betaVal').textContent = state.profile.beta.toFixed(3) + '% per hour';
    $('#islandOn').checked = state.profile.island !== false;
    if (document.activeElement !== $('#limit')) $('#limit').value = state.profile.limit;
    const lc = $('#limitChips'); lc.innerHTML = '';
    LIMIT_PRESETS.forEach(([label, v]) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = label;
      c.setAttribute('aria-pressed', String(Math.abs(state.profile.limit - v) < 1e-9));
      c.addEventListener('click', () => { state.profile.limit = v; save(); renderBody(); buildScale(); renderLive(); });
      lc.appendChild(c);
    });
  }
  $('#kg').addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (v >= 35 && v <= 250) { state.profile.kg = v; save(); renderLive(); } });
  document.querySelectorAll('[data-sex]').forEach((b) => b.addEventListener('click', () => { state.profile.sex = b.dataset.sex; save(); renderBody(); renderLive(); }));
  $('#beta').addEventListener('input', (e) => { state.profile.beta = parseFloat(e.target.value); save(); renderBody(); renderLive(); });
  $('#limit').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (v >= 0 && v <= 0.2) { state.profile.limit = v; save(); renderBody(); buildScale(); renderLive(); }
  });
  $('#fed').addEventListener('change', (e) => { state.session.fed = e.target.checked; save(); renderLive(); });

  // History
  function renderHistory() {
    const h = state.history || [], limit = state.profile.limit;
    // Tonight, kept apart from the past
    // The card says what is true of the current night. A night that has cleared and is already saved is over: it
    // belongs to Past nights, so the card goes away. One that has cleared but was never saved asks to be saved.
    const nowMs = Date.now(), cur = N.summarize(state.session, state.profile, nowMs);
    const live = !!N.liveRound(state.session), cleared = cur.G > 0 && known(cur.clear) && cur.clear <= nowMs;
    const saved = h.some((n) => n.start === cur.start && Math.abs(n.G - cur.G) < 0.05);
    $('#histNow').hidden = !cur.G || (cleared && saved);
    if (cur.G) {
      const drinks = cur.count + (cur.count === 1 ? ' drink' : ' drinks');
      $('#histNowTitle').textContent = live ? 'Tonight, in progress' : !cleared ? 'Tonight, still clearing' : 'Tonight is not saved yet';
      $('#histNowSub').textContent = live ? drinks + ', peak ' + fmtBac(cur.peak)
        : !cleared ? drinks + (known(cur.clear) ? ', clear by ' + fmtTime(cur.clear) : ', clear time not known')
        : drinks + ', peak ' + fmtBac(cur.peak) + '. Tap to open it and save.';
    }
    // Totals
    $('#hstats').hidden = !h.length;
    if (h.length) {
      const peaks = h.map((n) => n.peak), over = peaks.filter((v) => v > limit).length;
      const dn = h.reduce((a, n) => a + n.count, 0);
      $('#hsNights').textContent = $('#hsNights').dataset.to = String(h.length);
      $('#hsDrinks').textContent = $('#hsDrinks').dataset.to = String(dn);
      $('#hsAvg').textContent = fmtBac(peaks.reduce((a, v) => a + v, 0) / h.length);
      $('#hsMax').textContent = fmtBac(Math.max.apply(null, peaks));
      $('#hsOver').textContent = over === 0 ? 'None of these nights peaked over ' + fmtLimit(limit) + '.'
        : over + ' of ' + h.length + (h.length === 1 ? ' night' : ' nights') + ' peaked over ' + fmtLimit(limit) + '.';
    }
    renderHistChart(h, limit);
    // The list, newest first, under a heading for each month
    const ul = $('#historyList'); ul.innerHTML = '';
    let month = '';
    h.slice().reverse().forEach((n) => {
      const d = new Date(n.start);
      const m = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (m !== month) {
        month = m;
        const mh = document.createElement('li'); mh.className = 'h-month'; mh.textContent = m; ul.appendChild(mh);
      }
      const li = document.createElement('li');
      // n.clear is null for a night the model could not follow to the end (saved from Infinity).
      const { h: hh, m: mm } = dur(n.clear - n.start), span = known(n.clear) ? fmtTime(n.start) + ' to ' + fmtTime(n.clear) + ', ' + hh + ' h ' + pad(mm) + ' m' : 'From ' + fmtTime(n.start) + ', clear time not known';
      const wrap = document.createElement('button'); wrap.type = 'button'; wrap.className = 'h-open';
      wrap.innerHTML = '<span class="h-tile"><b></b><i></i></span><span class="h-main"><span class="h-date"></span><span class="h-meta"></span></span><span class="h-peak"><b></b><i></i></span>';
      wrap.querySelector('.h-tile b').textContent = String(d.getDate());
      wrap.querySelector('.h-tile i').textContent = d.toLocaleDateString(undefined, { month: 'short' });
      wrap.querySelector('.h-date').textContent = d.toLocaleDateString(undefined, { weekday: 'long' });
      wrap.querySelector('.h-meta').textContent = n.count + (n.count === 1 ? ' drink' : ' drinks') + ', ' + n.G.toFixed(0) + ' g\n' + span;
      wrap.querySelector('.h-peak b').textContent = fmtBac(n.peak);
      wrap.querySelector('.h-peak i').textContent = 'peak';
      wrap.dataset.tone = n.peak > limit ? 'over' : 'under';
      wrap.addEventListener('click', () => openPast(n));
      li.appendChild(wrap);
      ul.appendChild(li);
    });
  }
  // Peak per night for up to the last ten nights, against the legal limit, drawn to one scale.
  function renderHistChart(h, limit) {
    const box = $('#hchartBox'), svg = $('#hchart');
    box.hidden = h.length < 2;
    if (h.length < 2) return;
    const list = h.slice(-10), n = list.length;
    const W = 360, left = 8, right = 8, top = 22, base = 112;
    const max = Math.max(0.1, limit * 1.4, Math.max.apply(null, list.map((x) => x.peak)) * 1.15);
    const y = (v) => base - (v / max) * (base - top);
    const slot = (W - left - right) / n, bw = Math.min(26, slot * 0.58);
    let out = '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + base + '" y2="' + base + '" stroke="var(--line)"/>';
    out += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(limit).toFixed(1) + '" y2="' + y(limit).toFixed(1) + '" stroke="var(--text)" stroke-opacity=".4" stroke-dasharray="3 4"/>';
    const hi = list.reduce((a, x, k) => (x.peak > list[a].peak ? k : a), 0);
    list.forEach((x, k) => {
      const cx = left + slot * (k + 0.5), top0 = y(x.peak), ht = Math.max(2, base - top0);
      const d = new Date(x.start);
      out += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (base - ht).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + ht.toFixed(1) + '" rx="5" fill="' + (x.peak > limit ? 'var(--over)' : 'var(--amber)') + '"/>';
      if (k === hi || n <= 6) out += '<text class="peak-label" x="' + cx.toFixed(1) + '" y="' + (base - ht - 6).toFixed(1) + '" text-anchor="middle">' + x.peak.toFixed(3) + '</text>';
      out += '<text x="' + cx.toFixed(1) + '" y="' + (base + 16) + '" text-anchor="middle">' + d.toLocaleDateString(undefined, { weekday: 'short' }) + '</text>';
      out += '<text x="' + cx.toFixed(1) + '" y="' + (base + 29) + '" text-anchor="middle">' + d.getDate() + '</text>';
    });
    $('#hLimitKey').textContent = 'Limit ' + fmtLimit(limit);
    svg.innerHTML = out;
  }
  $('#histNow').addEventListener('click', () => setTab('tonight'));
  const past = $('#past');
  function openPast(n) {
    $('#pastTitle').textContent = new Date(n.start).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    $('#pastPeak').textContent = fmtBac(n.peak);
    $('#pastClear').textContent = fmtTime(n.clear);
    $('#pastCount').textContent = String(n.count);
    const rounds = Array.isArray(n.rounds) ? n.rounds : [];
    $('.past-sky').hidden = !rounds.length;
    $('#pastNote').hidden = rounds.length > 0;
    const ul = $('#pastRounds'); ul.innerHTML = '';
    rounds.forEach((r) => {
      const li = document.createElement('li'); li.className = 'round-card';
      li.innerHTML = '<span class="rc-body"><span class="rc-when"></span><span class="rc-what"></span></span>';
      li.querySelector('.rc-when').textContent = fmtTime(r.start) + ' to ' + fmtTime(r.end);
      li.querySelector('.rc-what').textContent = roundWhat(r);
      ul.appendChild(li);
    });
    past.showModal();
    if (!rounds.length) return;
    // Seen from the moment it cleared, so no "now" marker sits on the hills.
    const seen = known(n.clear) ? n.clear : Date.now();
    const o = N.simOpts({ rounds, fed: !!n.fed }, state.profile, seen);
    const sim = M.simulate(o);
    window.DryHorizon.render($('#pastHorizon'), { sim, rounds: o.rounds, now: seen, limit: state.profile.limit, prevSim: null });
    $('#pastHorizon .hz-now').style.display = 'none';
  }
  $('#pastClose').addEventListener('click', () => past.close());
  past.addEventListener('click', (e) => { if (e.target === past) past.close(); });
  $('#saveNight').addEventListener('click', () => {
    const entry = N.summarize(state.session, state.profile, Date.now());
    if (!entry.G) { toast('Add a drink before saving'); return; }
    state.history = N.saveToHistory(state.history, entry);
    save(); renderHistory(); toast('Night saved');
  });
  $('#newNight').addEventListener('click', () => {
    if (state.session.rounds.length && !confirm('Clear the tab and start a new night?')) return;
    state.session = newSession(); save(); renderAll(); toast('Fresh tab, fresh night');
  });

  // Share
  $('#shareBtn').addEventListener('click', async () => {
    const sim = simulate();
    let text = 'Tracking my night with Dry Season.';
    if (sim.G && known(sim.clear) && Date.now() < sim.clear) text = "I'll be clear of alcohol by " + fmtTime(sim.clear) + ' ' + dayIn(sim.clear) + '. Tracked with Dry Season.';
    else if (sim.G && known(sim.clear)) text = 'Officially clear. Tracked with Dry Season.';
    try {
      if (navigator.share) { await navigator.share({ title: 'Dry Season', text, url: location.href }); return; }
      await copyText(text + ' ' + location.href);
    } catch (e) { if (e && e.name !== 'AbortError') copyText(text + ' ' + location.href); }
  });
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('Copied, ready to paste'); }
    catch (e) { toast("Couldn't copy. Try the share button again."); }
  }

  // Drink picker
  const sheet = $('#sheet');
  let pick = null;
  let pickFor = 'tab';                 // 'late' when the picker was opened from the dial sheet
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8z"/></svg>';
  // A favourite is a drink in a size, so the same beer can be a favourite as a 330 ml and a 440 ml.
  const isFav = (id, ml) => (state.favs || []).some((f) => f.id === id && f.ml === ml);
  const favKey = (it) => it.id + '|' + it.ml;
  let pickCat = null;
  const CAT_NAMES = { 'Favourites': 'Favourites', 'Brewed in Botswana': 'Botswana', 'From across the border': 'Regional', 'Anything else': 'Other' };
  const stockOf = (it) => { const k = N.keyOf({ qty: 1, share: 1, name: it.name, abv: it.abv, ml: it.ml }); const r = N.stashOf(state).find((x) => N.keyOf(Object.assign({ qty: 1, share: 1 }, x.drink)) === k); return r ? r.left : 0; };
  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  function buildList(popId, popGroup) {
    const box = $('#pickList'), y = sheet.scrollTop; box.innerHTML = '';
    const favItems = (state.favs || []).map(D.favOf).filter(Boolean);
    const groups = (favItems.length ? [{ group: 'Favourites', items: favItems, favs: true }] : []).concat(DRINKS);
    if (!pickCat || !groups.some((g) => g.group === pickCat)) pickCat = groups[0].group;
    const cats = document.createElement('div'); cats.className = 'cats'; cats.setAttribute('role', 'group'); cats.setAttribute('aria-label', 'Drink categories');
    groups.forEach((g) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'cat';
      c.textContent = CAT_NAMES[g.group] || g.group;
      c.setAttribute('aria-pressed', String(g.group === pickCat));
      c.addEventListener('click', () => { pickCat = g.group; buildList(); sheet.scrollTop = 0; enterList(); });
      cats.appendChild(c);
    });
    box.appendChild(cats);
    const g = groups.find((x) => x.group === pickCat);
    const wrap = document.createElement('div'); wrap.className = 'pick-group' + (g.favs ? ' favs' : '');
    const grid = document.createElement('div'); grid.className = 'pick-grid';
    g.items.forEach((it) => {
      const row = document.createElement('div'); row.className = 'pick-row' + (it.custom ? ' custom' : '');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pick';
      b.innerHTML = '<span class="pick-name"></span><span class="pick-meta"></span><span class="abv-pill"></span><span class="pick-stock" hidden></span>';
      b.querySelector('.pick-name').textContent = it.custom ? 'Something else' : it.name;
      b.querySelector('.pick-meta').textContent = it.custom ? 'Wine, spirits, ciders, anything' : it.ml + ' ml' + (it.serve ? ' ' + it.serve : '');
      b.querySelector('.abv-pill').textContent = it.custom ? 'Set your own' : it.abv + '%';
      if (pickFor === 'stash' && !it.custom && stockOf(it) > 0) { const sk = b.querySelector('.pick-stock'); sk.hidden = false; sk.textContent = stockOf(it) + ' in stash'; }
      b.addEventListener('click', () => choose(it));
      row.appendChild(b);
      if (!it.custom) {
        const st = document.createElement('button'); st.type = 'button'; st.className = 'star';
        st.innerHTML = STAR;
        const on = isFav(it.id, it.ml);
        st.dataset.id = favKey(it); st.dataset.group = g.group;
        st.setAttribute('aria-pressed', String(on));
        st.setAttribute('aria-label', (on ? 'Remove ' : 'Add ') + it.name + ' ' + it.ml + ' ml' + (on ? ' from favourites' : ' to favourites'));
        st.addEventListener('click', () => toggleFav(it, g.group));
        row.appendChild(st);
        const add = document.createElement('button'); add.type = 'button'; add.className = 'pick-add';
        add.innerHTML = PLUS;
        add.setAttribute('aria-label', (pickFor === 'late' ? 'Add one ' : pickFor === 'stash' ? 'Add one to your stash: ' : 'Log one ') + it.name + ', ' + it.ml + ' ml');
        add.addEventListener('click', () => quickPick(it));
        row.appendChild(add);
      }
      grid.appendChild(row);
    });
    wrap.appendChild(grid);
    box.appendChild(wrap);
    sheet.scrollTop = y;
    if (popId) {
      const el = box.querySelector('.star[data-id="' + popId + '"][data-group="' + popGroup + '"]');
      if (el) { el.classList.add('pop'); el.focus({ preventScroll: true }); }
    }
  }
  function setFav(id, ml, on) {
    const favs = (state.favs || []).filter((f) => !(f.id === id && f.ml === ml));
    state.favs = on ? favs.concat([{ id, ml }]) : favs;
    save();
    renderFavs();
  }
  // Favourites: the pinned drinks, with a one-tap log and a remove button
  function renderFavs() {
    const items = (state.favs || []).map(D.favOf).filter(Boolean);
    const ul = $('#favList'); ul.innerHTML = '';
    $('#favEmpty').hidden = items.length > 0;
    items.forEach((it) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="st-main"><span class="st-name"></span><span class="st-meta"></span></span><button type="button" class="st-log"></button><button type="button" class="st-rm">&#215;</button>';
      li.querySelector('.st-name').textContent = it.name;
      li.querySelector('.st-meta').textContent = it.ml + ' ml' + (it.serve ? ' ' + it.serve : '') + ', ' + it.abv + '%';
      const log = li.querySelector('.st-log'); log.textContent = 'Log one';
      log.setAttribute('aria-label', 'Log one ' + it.name + ', ' + it.ml + ' ml');
      log.addEventListener('click', () => { pickFor = 'tab'; quickPick(it); });
      const rm = li.querySelector('.st-rm');
      rm.setAttribute('aria-label', 'Remove ' + it.name + ' ' + it.ml + ' ml from favourites');
      rm.addEventListener('click', () => { setFav(it.id, it.ml, false); toast(it.name + ' ' + it.ml + ' ml removed from favourites'); });
      ul.appendChild(li);
    });
  }
  $('#favBrowse').addEventListener('click', () => { pickFor = 'tab'; buildList(); showList(); sheet.showModal(); });
  function toggleFav(it, group) {
    const on = !isFav(it.id, it.ml);
    setFav(it.id, it.ml, on);
    buildList(favKey(it), group === 'Favourites' && !on ? null : group);
    toast(on ? it.name + ' ' + it.ml + ' ml pinned to Favourites' : it.name + ' ' + it.ml + ' ml unpinned');
  }
  function enterList() { const l = $('#pickList'); l.classList.remove('enter'); void l.offsetWidth; l.classList.add('enter'); }
  function showList() {
    enterList();
    $('#pickList').hidden = false; $('#pickCfg').hidden = true; $('#sheetBack').hidden = true;
    $('#sheetTitle').textContent = pickFor === 'stash' ? 'Add to your stash' : 'Pick a drink';
  }
  function choose(it) {
    pick = { id: it.custom ? null : it.id, name: it.custom ? '' : it.name, abv: it.abv, ml: it.ml, qty: 1, share: 1, custom: !!it.custom, sizes: it.sizes || null };
    $('#pickList').hidden = true; $('#pickCfg').hidden = false; $('#sheetBack').hidden = false;
    $('#sheetTitle').textContent = it.custom ? 'Your own drink' : it.name;
    $('#cfgAdd').textContent = pickFor === 'late' ? 'Add to this round' : pickFor === 'stash' ? 'Add to your stash' : 'Add to the tab';
    $('#shareBlock').hidden = pickFor === 'stash';
    $('#nameField').hidden = !it.custom;
    $('#cfgName').value = pick.name;
    $('#cfgNote').hidden = !it.note; $('#cfgNote').textContent = it.note || '';
    $('#cfgAbv').value = pick.abv; $('#cfgMl').value = pick.ml;
    resetStart();
    renderCfg();
    sheet.scrollTop = 0;
  }
  function renderCfg() {
    const fb = $('#cfgFav'), favOn = !!pick.id && isFav(pick.id, pick.ml);
    fb.hidden = !pick.id;
    fb.setAttribute('aria-pressed', String(favOn));
    $('#cfgFavText').textContent = favOn ? pick.ml + ' ml is a favourite' : 'Save ' + pick.ml + ' ml as a favourite';
    const sc = $('#sizeChips'); sc.innerHTML = '';
    SIZES.forEach((ml) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip';
      c.textContent = ml === 750 ? '750 quart' : ml === 1000 ? '1 litre' : ml + ' ml';
      if (pick.sizes && pick.sizes.includes(ml)) c.dataset.fits = '1';
      c.setAttribute('aria-pressed', String(pick.ml === ml));
      c.addEventListener('click', () => { pick.ml = ml; $('#cfgMl').value = ml; renderCfg(); });
      sc.appendChild(c);
    });
    const sh = $('#shareChips'); sh.innerHTML = '';
    SHARES.forEach(([v, label]) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = label;
      c.setAttribute('aria-pressed', String(Math.abs(pick.share - v) < 1e-6));
      c.addEventListener('click', () => { pick.share = v; renderCfg(); });
      sh.appendChild(c);
    });
    $('#qty').textContent = pick.qty;
    const valid = pick.abv >= 0 && pick.ml > 0;
    $('#cfgGrams').textContent = valid ? gramsOf(pick).toFixed(1) + ' g' : 'Check the numbers';
    refreshAsk();
  }
  $('#cfgFav').addEventListener('click', () => {
    if (!pick.id) return;
    const on = !isFav(pick.id, pick.ml);
    setFav(pick.id, pick.ml, on);
    renderCfg();
    toast(on ? pick.name + ' ' + pick.ml + ' ml pinned to Favourites' : pick.name + ' ' + pick.ml + ' ml unpinned');
  });
  $('#cfgAbv').addEventListener('input', (e) => { pick.abv = parseFloat(e.target.value) || 0; renderCfg(); });
  $('#cfgMl').addEventListener('input', (e) => { pick.ml = parseFloat(e.target.value) || 0; renderCfg(); });
  $('#cfgName').addEventListener('input', (e) => { pick.name = e.target.value; });
  $('#qtyMinus').addEventListener('click', () => { pick.qty = Math.max(1, pick.qty - 1); renderCfg(); });
  $('#qtyPlus').addEventListener('click', () => { pick.qty = Math.min(48, pick.qty + 1); renderCfg(); });
  /** Put drinks on hand, from the picker's stash mode (buying beer). */
  function addToStash(p) {
    if (!(p.ml > 0) || !(p.abv >= 0) || p.abv > 80) { toast('Check the strength and size'); return; }
    const name = (p.name || '').trim() || 'Custom drink';
    state = N.stashAdd(state, { name, abv: p.abv, ml: p.ml, share: 1 }, p.qty);
    save(); sheet.close(); renderAll();
    toast(p.qty + ' × ' + name + ' added to your stash');
  }
  /** Add one drink to the round being built in the late sheet. */
  function addToLate(p) {
    if (!(p.ml > 0) || !(p.abv >= 0) || p.abv > 80) { toast('Check the strength and size'); return; }
    const name = (p.name || '').trim() || 'Custom drink';
    pickFor = 'tab';
    sheet.close();
    changeDrink({ name, abv: p.abv, ml: p.ml, qty: 0, share: p.share }, p.qty);
  }
  $('#cfgAdd').addEventListener('click', () => {
    if (!(pick.ml > 0) || !(pick.abv >= 0) || pick.abv > 80) { toast('Check the strength and size'); return; }
    const name = (pick.name || '').trim() || 'Custom drink';
    if (pickFor === 'late') { addToLate(pick); return; }
    if (pickFor === 'stash') { addToStash(pick); return; }
    askAnswers = {};
    commitTab(name);
  });

  // When did you start? Only asked when the drink opens a new round.
  let startKey = 'now', askAnswers = {}, askKind = null;
  const AGO = [[15, '15 min ago'], [30, '30 min ago'], [60, '1 hr ago'], [120, '2 hrs ago']];
  function startOpts(now) {
    const ch = N.startChoices(N.settle(state, now).session, now);
    const out = [];
    if (ch.after != null) out.push(['after', 'Right after your last round (' + fmtTime(ch.after) + ')', ch.after]);
    out.push(['now', 'Just now', now]);
    AGO.forEach(([m, l]) => out.push(['m' + m, l, now - m * 60000]));
    out.push(['custom', 'Custom', null]);
    return { out, def: ch.after != null ? 'after' : 'now' };
  }
  const needsStart = () => pickFor === 'tab' && !N.liveRound(N.settle(state, Date.now()).session);
  function resetStart() {
    const now = Date.now();
    startKey = startOpts(now).def;
    $('#startCustom').value = fmtTime(round5(now - 30 * 60000));
    hideAsk();
    renderStart();
  }
  function renderStart() {
    const show = needsStart();
    $('#startWrap').hidden = !show;
    if (!show) return;
    const box = $('#startChips'); box.innerHTML = '';
    startOpts(Date.now()).out.forEach(([k, label]) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = label;
      c.setAttribute('aria-pressed', String(startKey === k));
      c.addEventListener('click', () => { startKey = k; hideAsk(); renderStart(); });
      box.appendChild(c);
    });
    $('#startCustomField').hidden = startKey !== 'custom';
  }
  /** The chosen start: a custom time later than now means last night. */
  function startAtValue(now) {
    if (startKey === 'custom') {
      const m = /^(\d{1,2}):(\d{2})/.exec($('#startCustom').value || '');
      if (!m) return now;
      const d = new Date(now); d.setHours(+m[1], +m[2], 0, 0);
      return d.getTime() > now ? d.getTime() - 24 * 3600e3 : d.getTime();
    }
    const hit = startOpts(now).out.find((o) => o[0] === startKey);
    return hit && hit[2] != null ? hit[2] : now;
  }
  /** "All 6 right now?" for n drinks. */
  const stashRowFor = (d) => { const k = N.keyOf(Object.assign({ qty: 1, share: 1 }, d)); return N.stashOf(state).find((r) => N.keyOf(Object.assign({ qty: 1, share: 1 }, r.drink)) === k) || null; };
  const manyAsk = (n) => {
    const live = !!N.liveRound(N.settle(state, Date.now()).session);
    const row = stashRowFor({ name: pick.name, abv: pick.abv, ml: pick.ml, share: pick.share });
    return { kind: 'many', title: 'All ' + n + ' right now?',
      text: (live ? 'Or are you having one now and keeping the other ' + (n - 1) + ' for later? ' : 'Or is this the first of ' + n + ' for the night? ') + 'Logging all ' + n + ' at once counts them as drunk already.',
      a: ['Log all ' + n, 'Already had them, or having them at once', { many: 'all' }],
      b: ['Open 1, save ' + (n - 1) + ' for later', row ? 'Adds to the ' + row.left + ' ' + shortName(row.drink.name) + ' in your stash' : 'Tap Open next as you go', { many: 'stash' }] };
  };
  function hideAsk() { askKind = null; askAnswers = {}; $('#cfgAsk').hidden = true; $('#cfgAdd').hidden = false; }
  /** The question follows the count: new numbers as it changes, gone when it is back to 1. */
  function refreshAsk() {
    if (askKind !== 'many' || $('#cfgAsk').hidden) return;
    if (pick.qty > 1) ask(manyAsk(pick.qty), true); else hideAsk();
  }
  function ask(o, quiet) {
    askKind = o.kind || null;
    $('#askTitle').textContent = o.title; $('#askText').textContent = o.text;
    $('#askAT').textContent = o.a[0]; $('#askAS').textContent = o.a[1];
    $('#askBT').textContent = o.b[0]; $('#askBS').textContent = o.b[1];
    $('#askA').onclick = () => { Object.assign(askAnswers, o.a[2]); commitTab(); };
    $('#askB').onclick = () => { Object.assign(askAnswers, o.b[2]); commitTab(); };
    $('#cfgAdd').hidden = true; $('#cfgAsk').hidden = false;
    if (!quiet) $('#cfgAsk').scrollIntoView({ block: 'nearest', behavior: reduceMotionPref() ? 'auto' : 'smooth' });
  }
  /** Add the picked drink to tonight, asking first when the answer changes the numbers. */
  function commitTab(nameIn) {
    const now = Date.now();
    const name = nameIn || (pick.name || '').trim() || 'Custom drink';
    state = N.settle(state, now);
    const drink = { name, abv: pick.abv, ml: pick.ml, qty: pick.qty, share: pick.share };
    const live = N.liveRound(state.session);
    const startAt = live ? null : startAtValue(now);
    // More than one at a time always asks, at the start of the night and while one is going.
    if (pick.qty > 1 && (live || startKey === 'now') && !askAnswers.many) {
      return ask(manyAsk(pick.qty));
    }
    if (!live && !askAnswers.clash) {
      const c = N.startClash(state.session, startAt, now);
      if (c) return ask({ title: 'That was during your last round', text: 'Your last round ran from ' + fmtTime(c.start) + ' to ' + fmtTime(c.end) + '.',
        a: ['Add to that round', 'It picks up again and keeps going', { clash: 'same' }],
        b: ['Start right after it (' + fmtTime(c.end) + ')', 'A new round from ' + fmtTime(c.end), { clash: 'after' }] });
    }
    const stash = askAnswers.many === 'stash';
    const r = N.addLiveDrink(state, Object.assign({}, drink, { qty: stash ? 1 : drink.qty }), now, { startAt, choice: askAnswers.clash });
    state = r.state;
    if (stash) state = N.stashAdd(state, drink, drink.qty - 1);   // the same drink adds to its row
    askAnswers = {};
    save(); sheet.close(); renderAll();
    if (!announce(r.outcome)) toast(stash ? '1 ' + name + ' opened, ' + (drink.qty - 1) + ' saved for later' : drink.qty + ' × ' + name + ' added');
    if (island) island.celebrate('pour', { label: '+' + (stash ? 1 : drink.qty) + ' ' + shortName(name) });
  }
  $('#startCustom').addEventListener('input', hideAsk);

  /** The + on a drink card: one tap while a round is going; otherwise the options open, since a new round needs a start time. */
  function quickPick(it) {
    const d = { id: it.id, name: it.name, abv: it.abv, ml: it.ml, share: 1 };
    if (pickFor === 'stash') {
      state = N.stashAdd(state, d, 1); save(); renderAll(); buildList();
      toast(it.name + ' · ' + stockOf(it) + ' in your stash');
      return;
    }
    if (pickFor === 'late') { addToLate(Object.assign({ qty: 1 }, d)); return; }
    if (N.liveRound(N.settle(state, Date.now()).session)) { sheet.close(); quickAdd(d); return; }
    choose(it);
  }
  // One tap repeats under the bottle: the stash first, else your last two different drinks
  let paceHint = '';
  function quickAdd(d) {
    withUndo(() => {
      const r = N.addLiveDrink(state, Object.assign({}, d, { qty: 1 }), Date.now(), { startAt: Date.now(), choice: 'after' });
      state = r.state; return r.outcome;
    }, d.name + ' added');
    if (island) island.celebrate('pour', { label: '+1 ' + shortName(d.name) });
  }
  function renderAnother() {
    const box = $('#another'), btns = $('#anotherBtns'), rows = N.stashOf(state).slice().reverse();
    const recent = N.recentDrinks(state.session, 2);
    const items = [];
    if (rows.length) {
      rows.slice(0, 2).forEach((row) => items.push({ label: 'Open ' + shortName(row.drink.name) + ' · ' + row.left + (rows.length > 1 ? '' : ' left'), aria: 'Open the next ' + row.drink.name + ' from your stash, ' + row.left + ' left', go: () => openNext(row.id) }));
      if (rows.length < 2) {
        const other = recent.find((d) => N.keyOf(Object.assign({ qty: 1 }, d)) !== N.keyOf(Object.assign({ qty: 1 }, rows[0].drink)));
        if (other) items.push({ label: '+ ' + shortName(other.name), aria: 'Add another ' + other.name, go: () => quickAdd(other) });
      }
    } else {
      recent.forEach((d) => items.push({ label: '+ ' + (recent.length > 1 ? shortName(d.name) : 'Another ' + shortName(d.name)), aria: 'Add another ' + d.name + ', ' + d.ml + ' ml', go: () => quickAdd(d) }));
    }
    const show = items.length > 0;
    const was = !box.hidden;
    box.hidden = !show;
    $('#hero').classList.toggle('has-another', show);
    btns.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button'); b.type = 'button';
      if (i > 0) b.className = 'second';
      b.textContent = it.label; b.setAttribute('aria-label', it.aria);
      b.addEventListener('click', it.go);
      btns.appendChild(b);
    });
    renderPaceHint();
    if (scene && was !== show) layoutScene();
  }
  function renderPaceHint() {
    const h = $('#anotherHint');
    const show = !!paceHint && !$('#another').hidden;
    h.hidden = !show;
    if (show && h.textContent !== paceHint) h.textContent = paceHint;
  }

  // Tonight's stash
  const LOW_STASH = 2;   // at or below this a drink is running low
  const stockNote = (left) => (left === 1 ? 'Last one' : left <= LOW_STASH ? left + ' left · Running low' : left + ' left');
  /** Open the options for a drink that is already in the stash, ready to add more of it. */
  function buyMore(row) {
    const base = D.byName(row.drink.name);
    const it = base ? Object.assign({}, base, { abv: row.drink.abv, ml: row.drink.ml }) : { custom: true, name: row.drink.name, abv: row.drink.abv, ml: row.drink.ml };
    pickFor = 'stash'; buildList(); sheet.showModal(); choose(it);
    if (it.custom) { pick.name = row.drink.name; $('#cfgName').value = row.drink.name; }
  }
  function renderStash() {
    const rows = N.stashOf(state).slice().reverse(), box = $('#stash');   // most recent first
    box.hidden = rows.length === 0;
    $('#stashTotal').textContent = rows.length ? '· ' + N.stashCount(state) + ' on hand' : '';
    const ul = $('#stashRows'); ul.innerHTML = '';
    rows.forEach((row, i) => {
      const li = document.createElement('li'); li.className = 'stash-row'; li.dataset.id = row.id;
      li.innerHTML = '<div class="sr-main"><span class="sr-name"></span><span class="sr-left"></span><div class="sr-dots" aria-hidden="true"></div><button type="button" class="sr-restock" hidden>Restock</button></div><button type="button" class="btn sr-open">Open next</button>';
      li.querySelector('.sr-name').textContent = row.drink.name;
      const low = row.left <= LOW_STASH, leftEl = li.querySelector('.sr-left');
      leftEl.textContent = stockNote(row.left); leftEl.classList.toggle('low', low);
      const rs = li.querySelector('.sr-restock');
      rs.hidden = !low; rs.setAttribute('aria-label', 'Restock ' + row.drink.name); rs.addEventListener('click', () => buyMore(row));
      const dots = li.querySelector('.sr-dots');
      for (let k = 0; k < Math.min(row.left, 12); k++) dots.appendChild(document.createElement('i'));
      const b = li.querySelector('.sr-open');
      if (i > 0) b.classList.add('quiet');
      b.setAttribute('aria-label', 'Open the next ' + row.drink.name + ', ' + row.left + ' left');
      b.addEventListener('click', () => openNext(row.id));
      ul.appendChild(li);
    });
  }
  /** Open one from the stash (the most recent row unless one is named). */
  function openNext(id) {
    const row = id ? N.stashOf(state).find((r) => r.id === id) : N.latestStash(state);
    if (!row) return false;
    const name = row.drink.name, last = row.left === 1;
    withUndo(() => { const r = N.openStash(state, Date.now(), row.id); state = r.state; return r.outcome; },
      last ? 'Last ' + name + ' opened. That one is done.' : 'Opened another ' + name + ', ' + (row.left - 1) + ' left');
    if (island) island.celebrate('pour', { label: '+1 ' + shortName(name) });
    return true;
  }
  // The same stash, editable from History: change a count, take a drink off, or add what you just bought.
  function renderStashEdit() {
    const rows = N.stashOf(state).slice().reverse(), ul = $('#stashEdit');
    ul.innerHTML = '';
    $('#stashEditEmpty').hidden = rows.length > 0;
    $('#stashEditTotal').textContent = rows.length ? '· ' + N.stashCount(state) + ' on hand' : '';
    rows.forEach((row) => {
      const li = document.createElement('li'); li.dataset.id = row.id;
      li.innerHTML = '<span class="se-main"><span class="se-name"></span><span class="se-meta"></span><button type="button" class="se-buy">Buy more</button></span><span class="se-step"><button type="button" class="se-less">&#8722;</button><output class="se-n"></output><button type="button" class="se-more">+</button></span>';
      li.querySelector('.se-name').textContent = row.drink.name;
      li.querySelector('.se-meta').textContent = row.drink.ml + ' ml, ' + row.drink.abv + '%' + (row.left <= LOW_STASH ? ' · Running low' : '');
      li.classList.toggle('low', row.left <= LOW_STASH);
      li.querySelector('.se-buy').setAttribute('aria-label', 'Buy more ' + row.drink.name);
      li.querySelector('.se-buy').addEventListener('click', () => buyMore(row));
      li.querySelector('.se-n').textContent = row.left;
      li.querySelector('.se-less').setAttribute('aria-label', 'One fewer ' + row.drink.name);
      li.querySelector('.se-more').setAttribute('aria-label', 'One more ' + row.drink.name);
      li.querySelector('.se-less').addEventListener('click', () => {
        if (row.left > 1) { state = N.stashSet(state, row.id, row.left - 1); save(); renderAll(); return; }
        withUndo(() => { state = N.stashRemove(state, row.id); return null; }, row.drink.name + ' taken off your stash');
      });
      li.querySelector('.se-more').addEventListener('click', () => { state = N.stashSet(state, row.id, row.left + 1); save(); renderAll(); });
      ul.appendChild(li);
    });
  }
  $('#stashAdd').addEventListener('click', () => { pickFor = 'stash'; buildList(); showList(); sheet.showModal(); });
  // What is on hand, shown on Plan too: the same list, read-only, with a way to change it.
  function renderPlanStash() {
    const rows = N.stashOf(state).slice().reverse(), ul = $('#planStashList');
    ul.innerHTML = '';
    $('#planStashEmpty').hidden = rows.length > 0;
    $('#planStashTotal').textContent = rows.length ? '· ' + N.stashCount(state) + ' drinks' : '';
    rows.forEach((row) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="ps-n"></span><span class="ps-name"></span>';
      li.querySelector('.ps-n').textContent = row.left;
      li.querySelector('.ps-name').textContent = row.drink.name + (row.left <= LOW_STASH ? ' · running low' : '');
      li.classList.toggle('low', row.left <= LOW_STASH);
      ul.appendChild(li);
    });
    $('#planStashBtn').textContent = rows.length ? 'Edit in History' : 'Add beer to your stash';
  }
  $('#planStashBtn').addEventListener('click', () => {
    if (!N.stashOf(state).length) { pickFor = 'stash'; buildList(); showList(); sheet.showModal(); return; }
    setTab('history');
    requestAnimationFrame(() => $('#stashManage').scrollIntoView({ behavior: reduceMotionPref() ? 'auto' : 'smooth', block: 'start' }));
  });

  // Catch up: one question when you come back after a while
  const cu = $('#catchup');
  let cuN = 1;
  function cuMax() { const src = N.catchUpSource(state); return src ? src.max : 24; }
  function renderCu() {
    $('#cuN').textContent = cuN;
    $('#cuLog').textContent = 'Log ' + cuN;
  }
  function maybeCatchUp() {
    const now = Date.now();
    if (document.querySelector('dialog[open]')) return;
    const settled = N.settle(state, now);
    if (settled !== state) { state = settled; save(); renderAll(); }
    if (!N.catchUpDue(state, now)) return;
    const src = N.catchUpSource(state), d = src && src.drink;
    if (!d) return;
    const last = Math.max(state.session.loggedAt || 0, (N.liveRound(state.session) || {}).lastAt || 0);
    $('#cuText').textContent = (last ? 'You last logged at ' + fmtTime(last) + '. ' : '') + 'How many ' + d.name + ' have you opened since?'
      + (src.id ? ' (' + src.max + ' left in your stash)' : '');
    cuN = 1; renderCu();
    cu.showModal();
  }
  $('#cuMinus').addEventListener('click', () => { cuN = Math.max(1, cuN - 1); renderCu(); });
  $('#cuPlus').addEventListener('click', () => { cuN = Math.min(cuMax(), cuN + 1); renderCu(); });
  $('#cuLog').addEventListener('click', () => {
    const d = N.catchUpDrink(state);
    const r = N.catchUp(state, cuN, Date.now());
    state = r.state; save(); cu.close(); renderAll();
    if (!r.outcome || !announce(r.outcome)) toast(cuN + ' × ' + (d ? d.name : 'drink') + ' added, spread since your last log');
  });
  $('#cuNone').addEventListener('click', () => { state = N.catchUp(state, 0, Date.now()).state; save(); cu.close(); });
  cu.addEventListener('cancel', () => { state = N.catchUp(state, 0, Date.now()).state; save(); });
  sheet.addEventListener('close', () => { if (!late.open) pickFor = 'tab'; });
  $('#openPicker').addEventListener('click', () => { pickFor = 'tab'; buildList(); showList(); sheet.showModal(); });
  $('#sheetClose').addEventListener('click', () => sheet.close());
  $('#sheetBack').addEventListener('click', showList);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

  // Late logging: set a round you already had on the dial
  const late = $('#late');
  const HOUR = 3600e3;
  let draft = null;
  function newDraft() {
    const now = Date.now();
    const f = (state.favs || []).map(D.favOf).filter(Boolean)[0];
    const first = f ? { name: f.name, abv: f.abv, ml: f.ml, qty: 1, share: 1 } : { name: 'Heineken', abv: 5, ml: 330, qty: 1, share: 1 };
    return { start: round5(now - 2 * HOUR), end: now, drinks: [first] };
  }
  const atToday = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };
  const atYesterday = (h) => atToday(h) - 24 * HOUR;
  function fromChips(now) {
    const out = [['2 h ago', round5(now - 2 * HOUR)], ['4 h ago', round5(now - 4 * HOUR)]];
    if (atToday(13) < now - 15 * MIN) out.push(['Lunch', atToday(13)]);
    out.push(['Last night', atYesterday(20), atYesterday(23)]);
    return out;
  }
  const untilChips = (now) => [['Just now', now], ['1 h ago', round5(now - HOUR)], ['2 h ago', round5(now - 2 * HOUR)], ['4 h ago', round5(now - 4 * HOUR)]];
  function setDraft(patch) {
    const now = Date.now();
    draft = Object.assign({}, draft, patch);
    if ('end' in patch && !('live' in patch)) draft.live = false;   // a chosen end time stops a live round
    draft.end = draft.live ? now : Math.min(draft.end, now);
    if (draft.end - draft.start < 15 * MIN) {
      if (patch.start != null) draft.end = Math.min(now, draft.start + HOUR);
      if (draft.end - draft.start < 15 * MIN) draft.start = draft.end - 15 * MIN;
    }
    // An edited round stays between its neighbours, so no drink is counted twice.
    if (editing) {
      const f = N.fitEdit(state.session, editing.id, draft, now);
      const room = N.editRoom(state.session, editing.id, now);
      if (f.start !== draft.start || (!draft.live && f.end !== draft.end)) {
        toast(f.start !== draft.start && room.lo > -Infinity ? 'This round starts after the one before, at ' + fmtTime(room.lo)
          : 'This round ends before the next one, at ' + fmtTime(room.hi));
      }
      draft.start = f.start;
      if (!draft.live) draft.end = f.end;
    }
    renderLate();
  }
  /** Where the draft would go, and the night it would make: what the preview and the button show. */
  function lateView() {
    const now = Date.now();
    const cand = { start: draft.start, end: draft.end, drinks: draft.drinks };
    if (editing) {
      const rounds = state.session.rounds.map((r) => (r.id === editing.id ? cand : r));
      const sim = M.simulate(N.simOpts({ rounds, fed: state.session.fed }, state.profile, now));
      return { p: { action: 'continue', carried: 0, overlap: null }, sim, now, soberAt: sim.G > 0 ? sim.clear : draft.end };
    }
    const p = N.place(state.session, state.profile, cand, now);
    const rounds = p.action === 'continue' ? state.session.rounds.concat([cand]) : [cand];
    const sim = M.simulate(N.simOpts({ rounds, fed: state.session.fed }, state.profile, now));
    return { p, sim, now, soberAt: sim.G > 0 ? sim.clear : draft.end };
  }
  function chipRow(box, list, key) {
    box.innerHTML = '';
    list.forEach(([label, v, end]) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.textContent = label;
      c.setAttribute('aria-pressed', String(draft[key] === v && (end == null || draft.end === end)));
      // "Just now" on a round that is still going keeps it going
      const keepLive = key === 'end' && label === 'Just now' && editing && editing.end == null;
      c.addEventListener('click', () => setDraft(end != null ? { start: v, end } : keepLive ? { end: v, live: true } : { [key]: v }));
      box.appendChild(c);
    });
  }
  const dkey = (d) => d.name + '|' + d.ml + '|' + d.abv + '|' + d.share;
  function changeDrink(d, by) {
    const drinks = draft.drinks.map((x) => Object.assign({}, x));
    const i = drinks.findIndex((x) => dkey(x) === dkey(d));
    if (i < 0 && by > 0) drinks.push(Object.assign({}, d, { qty: by }));
    else if (i >= 0) drinks[i].qty = Math.min(48, drinks[i].qty + by);
    const kept = drinks.filter((x) => x.qty > 0);
    if (!kept.length) return;                     // a round always has at least one drink
    setDraft({ drinks: kept });
  }
  function renderLateDrinks() {
    const favs = (state.favs || []).map(D.favOf).filter(Boolean).slice(0, 4);
    const favKeys = favs.map((f) => dkey({ name: f.name, ml: f.ml, abv: f.abv, share: 1 }));
    const box = $('#lateFavs'); box.innerHTML = '';
    favs.forEach((f) => {
      const d = { name: f.name, abv: f.abv, ml: f.ml, qty: 1, share: 1 };
      const have = draft.drinks.find((x) => dkey(x) === dkey(d));
      const q = have ? have.qty : 0;
      const card = document.createElement('div'); card.className = 'fav-card' + (q ? ' on' : '');
      card.innerHTML = '<button type="button" class="fc-less">&#8722;</button><button type="button" class="fc-more"><span class="fc-name"></span><span class="fc-meta"></span></button><span class="fc-count" aria-live="polite"></span>';
      const label = f.name + ' ' + f.ml + ' ml';
      card.querySelector('.fc-less').setAttribute('aria-label', 'Remove one ' + label);
      card.querySelector('.fc-more').setAttribute('aria-label', 'Add one ' + label);
      card.querySelector('.fc-name').textContent = f.name;
      card.querySelector('.fc-meta').textContent = f.ml + ' ml · ' + f.abv + '%';
      card.querySelector('.fc-count').textContent = q;
      card.querySelector('.fc-less').addEventListener('click', () => changeDrink(d, -1));
      card.querySelector('.fc-more').addEventListener('click', () => changeDrink(d, 1));
      box.appendChild(card);
    });
    const ex = $('#lateExtra'); ex.innerHTML = '';
    draft.drinks.filter((x) => !favKeys.includes(dkey(x))).forEach((x) => {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><button type="button">&#215;</button>';
      li.firstChild.textContent = x.qty + ' × ' + x.name;
      li.lastChild.setAttribute('aria-label', 'Remove ' + x.name + ' from this round');
      li.lastChild.addEventListener('click', () => changeDrink(x, -x.qty));
      ex.appendChild(li);
    });
  }
  function renderLate() {
    if (draft.live) draft.end = Date.now();          // a live round's end follows the clock
    const v = lateView(), now = v.now, hist = v.p.action === 'history';
    late.classList.toggle('history', hist);
    chipRow($('#fromChips'), fromChips(now), 'start');
    chipRow($('#untilChips'), untilChips(now), 'end');
    $('#fromVal').textContent = (draft.start < atToday(0) ? dayLabel(draft.start) + ' ' : '') + fmtTime(draft.start);
    $('#untilVal').textContent = draft.live || draft.end >= now ? 'Now' : (draft.end < atToday(0) ? dayLabel(draft.end) + ' ' : '') + fmtTime(draft.end);
    renderLateDrinks();
    const others = v.p.action === 'continue' ? state.session.rounds.filter((r) => !editing || r.id !== editing.id).map((r) => ({ start: r.start, end: N.endOf(r, now) })) : [];
    DryDial.render($('#dial'), { round: { start: draft.start, end: draft.end }, others, soberAt: v.soberAt, now, tone: hist ? 'history' : 'amber' });
    const clear = v.soberAt <= now, unknown = !known(v.soberAt);
    $('#dlKicker').textContent = unknown ? "Can't estimate" : hist ? 'That night, sober at' : clear ? 'Sober since' : 'Fully sober at';
    $('#dlTime').textContent = fmtTime(v.soberAt);
    const { h, m } = dur(v.soberAt - now);
    $('#dlTag').textContent = unknown ? 'More than the model can follow' : hist ? dayLabel(draft.start) + ' · History' : clear ? 'Already clear' : dayLabel(v.soberAt) + ' · ' + h + ' h ' + pad(m) + ' m';
    $('#lateAdd').textContent = editing ? 'Save round' : hist ? 'Save to History'
      : v.p.action === 'continue' && state.session.rounds.length ? 'Add round · continues tonight' : 'Add round to tonight';
  }
  function showLateMain() {
    $('#lateMain').hidden = false; $('#lateOverlap').hidden = true; $('#lateBack').hidden = true;
    $('#lateTitle').textContent = editing ? 'Edit round' : 'Log earlier drinks';
    $('#lateRemove').hidden = !editing;
  }
  let editing = null;                   // the round being edited, or null when logging a new one
  function openLate(round) {
    editing = round && round.id ? round : null;
    draft = editing
      ? { start: editing.start, end: editing.end == null ? Date.now() : editing.end, live: editing.end == null, drinks: editing.drinks.map((d) => Object.assign({}, d)) }
      : newDraft();
    late.classList.remove('leaving');
    showLateMain();
    renderLate();
    late.showModal();
  }
  function saveEdit() {
    const now = Date.now();
    nightNote = null;
    const f = N.fitEdit(state.session, editing.id, { start: draft.start, end: draft.live ? now : Math.min(draft.end, now) }, now);
    state = N.editRound(state, editing.id, { start: f.start, end: draft.live ? null : f.end, drinks: draft.drinks });
    save();
    handOff(true);
  }
  function showOverlap(ov) {
    const r = state.session.rounds.find((x) => x.id === ov.roundId);
    const end = r.end == null ? 'now' : fmtTime(Math.max(r.end, draft.end));
    $('#ovText').textContent = 'Your new round (' + fmtTime(draft.start) + ' to ' + fmtTime(draft.end) + ') overlaps a round already on tonight\'s tab, from '
      + fmtTime(ov.from) + ' to ' + fmtTime(ov.to) + '. We don\'t want to count anything twice.';
    $('#ovSameSub').textContent = 'Merge them into one round, ' + fmtTime(Math.min(r.start, draft.start)) + ' to ' + end;
    $('#lateMain').hidden = true; $('#lateOverlap').hidden = false; $('#lateBack').hidden = false;
    $('#lateTitle').textContent = 'Check the times';
    late.scrollTop = 0;
  }
  /** Add the draft. choice answers an overlap with a round already on the tab. */
  function commitLate(choice) {
    const now = Date.now();
    const cand = { start: draft.start, end: draft.end, drinks: draft.drinks, late: true };
    const p = N.place(state.session, state.profile, cand, now);
    if (p.overlap && !choice) { showOverlap(p.overlap); return; }
    const hadRounds = state.session.rounds.length > 0;
    const r = N.addRound(state, cand, now, choice);
    state = r.state;
    if (r.outcome.action !== 'history') state.session = Object.assign({}, state.session, { loggedAt: now });
    save();
    const o = r.outcome;
    nightNote = o.action === 'history' ? ['Saved to History.', 'That night does not change tonight\'s numbers.']
      : o.action === 'fresh' && o.archived ? ['A fresh night.', 'Your earlier drinks had cleared, so that night is saved in History.']
      : o.action === 'continue' && hadRounds && o.carried >= M.CLEAR ? ['This round continues tonight.', 'At ' + fmtTime(cand.start) + ' you still had ' + fmtBac(o.carried) + ' from earlier, so it counts on top.']
      : null;
    handOff(o.action !== 'history');
  }
  /**
   * The sheet glides away, an orb carries the round to its peak on the horizon, and the hills
   * reshape. No orb when the round went to History: tonight did not change. With Reduce Motion,
   * a short cross fade instead (Web Animations, which the global no-motion CSS leaves alone).
   */
  function handOff(withOrb) {
    if (reduceMotionPref()) {
      const fade = late.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' });
      fade.onfinish = () => { late.close(); renderAll(); };
      $('#horizon').animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
      return;
    }
    const box = $('#dial').getBoundingClientRect();
    const from = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    window.scrollTo(0, 0);
    late.classList.add('leaving');
    setTimeout(() => {
      late.close();
      late.classList.remove('leaving');
      renderAll();
      if (!withOrb || !lastHorizon || !state.session.rounds.length) return;
      const hz = $('#horizon').getBoundingClientRect();
      const to = (scene && scene.peakScreen()) || { x: hz.left + lastHorizon.peakX, y: hz.top + lastHorizon.peakY * hz.height / 150 };
      const orb = document.createElement('div'); orb.className = 'orb';
      orb.style.left = from.x + 'px'; orb.style.top = from.y + 'px'; orb.style.transform = 'scale(.5)';
      document.body.appendChild(orb);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        orb.style.left = to.x + 'px'; orb.style.top = to.y + 'px'; orb.style.transform = 'scale(1.3)';
      }));
      setTimeout(() => { orb.style.opacity = '0'; orb.style.transform = 'scale(3)'; }, 800);
      setTimeout(() => orb.remove(), 1300);
    }, 420);
  }
  $('#openLate').addEventListener('click', () => openLate());
  $('#lateClose').addEventListener('click', () => late.close());
  late.addEventListener('click', (e) => { if (e.target === late) late.close(); });
  $('#fromDown').addEventListener('click', () => setDraft({ start: draft.start - 15 * MIN }));
  $('#fromUp').addEventListener('click', () => setDraft({ start: Math.min(draft.start + 15 * MIN, draft.end - 15 * MIN) }));
  $('#untilDown').addEventListener('click', () => setDraft({ end: Math.max(draft.end - 15 * MIN, draft.start + 15 * MIN) }));
  $('#untilUp').addEventListener('click', () => setDraft({ end: draft.end + 15 * MIN }));
  $('#lateAdd').addEventListener('click', () => (editing ? saveEdit() : commitLate()));
  $('#lateRemove').addEventListener('click', () => {
    if (!editing || !confirm('Remove this round?')) return;
    nightNote = null;
    state = N.removeRound(state, editing.id);
    save(); late.close(); renderAll(); toast('Round removed');
  });
  $('#lateBack').addEventListener('click', showLateMain);
  $('#ovSame').addEventListener('click', () => commitLate('same'));
  $('#ovExtra').addEventListener('click', () => commitLate('extra'));
  $('#lateAll').addEventListener('click', () => { pickFor = 'late'; buildList(); showList(); sheet.showModal(); });

  // Toast
  let toastT;
  let undoFn = null;
  /** A short message. With undo, it stays 5 seconds and offers Undo. */
  function toast(msg, undo) {
    const t = $('#toast');
    $('#toastMsg').textContent = msg;
    undoFn = undo || null;
    $('#toastUndo').hidden = !undo;
    t.classList.toggle('has-undo', !!undo);
    try { if (t.showPopover && !t.matches(':popover-open')) t.showPopover(); } catch (e) {}   // above any open sheet
    t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(() => {
      t.classList.remove('show'); undoFn = null;
      setTimeout(() => { if (!t.classList.contains('show')) { t.classList.remove('has-undo'); try { if (t.hidePopover) t.hidePopover(); } catch (e) {} } }, 350);
    }, undo ? 5000 : 2200);
  }
  $('#toastUndo').addEventListener('click', () => {
    const f = undoFn; undoFn = null;
    $('#toast').classList.remove('show', 'has-undo');
    if (f) f();
  });
  /** Run a one tap change with an Undo that puts everything back exactly as it was. */
  function withUndo(change, msg) {
    const before = state;
    const outcome = change();
    const after = state;
    save(); renderAll();
    if (outcome && announce(outcome)) return;
    toast(msg, () => {
      if (state !== after) { toast('Too late to undo that one'); return; }
      state = before; save(); renderAll(); toast('Undone');
    });
  }

  // Status pill and hero stats
  const hero = $('#hero');
  let noteOpen = false;
  function renderStatus(sim) {
    const now = Date.now(), limit = state.profile.limit;
    $('#limitLabel').textContent = 'Under ' + fmtLimit(limit);
    if (!sim.G) {
      hero.dataset.state = 'none'; $('#statusBlock').hidden = true; $('#underAt').textContent = '--';
      return;
    }
    // Alcohol you have drunk keeps reaching your blood for a while, so the status
    // follows where you are heading, not only the number right now.
    const o = M.outlook(sim, now, limit), b = o.b, st = o.status;
    hero.dataset.state = st;
    $('#statusBlock').hidden = false;
    $('#pillNote').hidden = st === 'clear';
    $('#pillText').textContent = st === 'over'
      ? (o.overAt ? 'Kicking in: over the limit by ' + fmtTime(o.overAt) : 'Over the legal limit')
      : st === 'impaired' ? (o.low ? 'Low level: alcohol on board'
        : o.rising && b < limit && b < 0.01 ? 'Kicking in: you\'re impaired' : 'Under the limit, still impaired')
      : 'Clear, by this estimate';
    $('#pillNoteText').textContent = o.rising
      ? 'What you\'ve drunk is still reaching your blood, so your level will keep climbing to about ' + fmtBac(o.ahead) + '. Get a lift, take a cab, or wait until you\'re clear.'
      : 'Any alcohol slows your reactions. Get a lift, take a cab, or wait until you\'re clear.';
    // One line you can open. When you are over the limit it stays open: that is the part to read.
    const note = $('#pillNote'), locked = st === 'over', open = locked || noteOpen;
    note.classList.toggle('open', open); note.classList.toggle('locked', locked);
    note.setAttribute('aria-expanded', String(open)); note.disabled = locked;
    $('#pnMore').textContent = open ? 'Less' : 'More';
    const u = M.underLimitAt(sim, limit);
    flip($('#underAt'), u === null ? 'Never over' : !known(u) ? 'Not known' : (u <= now ? 'Since ' + fmtTime(u) : 'At ' + fmtTime(u)));
  }

  $('#pillNote').addEventListener('click', () => { noteOpen = !noteOpen; renderStatus(lastSim); });

  // Risk scale
  const pct = (v) => Math.max(0, Math.min(100, v / SCALE_MAX * 100));
  function buildScale() {
    const z = zones();
    let from = 0;
    const parts = [], legend = [];
    z.forEach((zz) => {
      const to = Math.min(zz.to, SCALE_MAX);
      if (to > from) { parts.push(zz.c + ' ' + pct(from).toFixed(2) + '% ' + pct(to).toFixed(2) + '%'); legend.push(zz); }
      from = Math.max(from, to);
    });
    $('#scaleBar').style.background = 'linear-gradient(90deg,' + parts.join(',') + ')';
    const ticks = [state.profile.limit, 0.08, 0.15, 0.30].filter((v, i, a) => v > 0 && v < SCALE_MAX && a.indexOf(v) === i);
    $('#scaleTicks').innerHTML = ticks.map((v) => '<span style="left:' + pct(v) + '%">' + v.toFixed(2) + '</span>').join('');
    $('#scaleLegend').innerHTML = legend.map((zz) => '<li><i style="background:' + zz.c + '"></i>' + zz.name + '</li>').join('');
  }
  function renderScale(bNow, sim) {
    const p = pct(bNow);
    $('#pinStem').style.left = p + '%';
    $('#pinLabel').style.left = Math.min(86, Math.max(14, p)) + '%';
    $('#pinLabel').textContent = 'Now ' + fmtBac(bNow);
    $('#pinPeak').style.left = pct(sim.peak) + '%';
    $('#scalePeak').textContent = 'Peak ' + fmtBac(sim.peak) + ' around ' + fmtTime(sim.peakAt);
  }

  // Blackout risk and pacing
  let gapMemo = { key: '', at: 0, val: null };
  function cachedGap(o, now, grams) {
    // Every drink and its count: one more of the same drink changes the answer straight away.
    const drinks = o.rounds.map((r) => r.drinks.map((d) => N.keyOf(d) + 'x' + d.qty).join(','));
    const key = JSON.stringify([drinks, o.rounds.map((r) => r.start), o.fed, o.kg, o.sex, o.beta, grams.toFixed(2)]);
    if (gapMemo.key === key && now - gapMemo.at < 30000) return gapMemo.val;
    gapMemo = { key, at: now, val: M.pacingGap(o, now, grams, M.THRESHOLDS.blackout) };
    return gapMemo.val;
  }
  function fmtGap(min) {
    if (min < 60) return min + ' minutes';
    const h = Math.floor(min / 60), m = min % 60;
    return h + (h === 1 ? ' hour' : ' hours') + (m ? ' ' + m + ' minutes' : '');
  }
  function renderRisk(sim) {
    const sec = $('#riskSection');
    const has = sim.G > 0;
    const now = Date.now(), o = opts();
    const bNow = has ? bacAt(sim, now) : 0;
    const perHour = has ? M.stdLastHour(o, now) : 0;
    const T = M.THRESHOLDS;
    $('#danger').hidden = !(has && (bNow >= T.danger || sim.peak >= T.danger || perHour > T.bingeStdPerHour));
    dangerNow = !$('#danger').hidden;
    sec.hidden = !has;
    $('#riskChip').hidden = !has;
    if (!has) { riskNow = 'low'; return; }
    const rise = M.riseRate(sim, now);
    const risk = M.blackoutRisk({ peak: sim.peak, rise, perHour, fed: !!state.session.fed });
    sec.dataset.level = risk.level;
    riskNow = risk.level;
    $('#riskChip').dataset.level = risk.level;
    $('#riskChipText').textContent = risk.level.charAt(0).toUpperCase() + risk.level.slice(1);
    $('#riskLevel').textContent = { low: 'Low', raised: 'Raised', high: 'High' }[risk.level];
    renderScale(bNow, sim);

    const ul = $('#reasons'); ul.innerHTML = '';
    const add = (txt, strong) => { const li = document.createElement('li'); li.textContent = txt; if (strong) li.className = 'strong'; ul.appendChild(li); };
    risk.reasons.forEach((r) => {
      if (r.key === 'peak') add(r.strong ? 'Peak ' + fmtBac(sim.peak) + ', in the blackout zone' : 'Peak around ' + fmtBac(sim.peak), r.strong);
      if (r.key === 'rise') add('Rising ' + rise.toFixed(3) + '% an hour', r.strong);
      if (r.key === 'pace') add(perHour.toFixed(1) + ' drinks in the last hour', r.strong);
      if (r.key === 'food') add('Empty stomach', false);
    });
    if (!risk.reasons.length) add(state.session.fed ? 'Steady pace, with food' : 'Steady pace so far', false);

    let msg = '';
    paceHint = '';
    if (risk.level !== 'low' && bNow > 0) {
      const last = N.lastDrink(state.session);
      const name = last ? last.name : 'drink';
      const live = N.liveRound(state.session);
      if (!live) {
        msg = risk.level === 'high'
          ? 'Tonight peaked in the blackout zone. Stay with people you trust, drink water, and call it a night.'
          : 'Water and something to eat will help. Stay with people you trust.';
      } else if (sim.peak >= T.blackout) {
        msg = 'Switch to water for now. Another ' + name + ' would take you deeper into the blackout zone.';
        paceHint = 'Water first: you\'re in the blackout zone';
      } else {
        const unitG = M.gramsOf(Object.assign({}, last, { qty: 1 }));
        const peakGap = cachedGap(o, now, unitG);
        // Wait long enough that the last hour, including the next drink, holds at most 3 standard drinks.
        const perMinG = live.drinks.reduce((a, d) => a + gramsOf(d), 0) / Math.max(1, (now - live.start) / MIN);
        const paceGap = Math.min(60, Math.max(0, Math.ceil((60 - (T.fastStdPerHour * STD_G - unitG) / perMinG) / 5) * 5));
        const gap = peakGap === null ? null : Math.max(peakGap, paceGap);
        if (gap === null) msg = 'Switch to water for now. Another ' + name + ' would push you into the blackout zone.';
        else if (gap === 0) msg = "You're drinking fast. If you have another " + name + ', sip it slowly with water alongside.';
        else msg = "You're drinking fast. Wait about " + fmtGap(gap) + ' before your next ' + name + ', and have some water in between.';
        paceHint = gap === null ? 'Water first: another would push you into the blackout zone'
          : gap === 0 ? 'Fast pace: sip slowly, with water alongside'
          : 'Wait about ' + fmtGap(gap) + ' for a safer pace';
      }
    }
    $('#nudge').hidden = !msg;
    $('#nudgeText').textContent = msg;
    renderPaceHint();
  }

  $('#textFriend').addEventListener('click', async () => {
    const sim = lastSim || simulate(), now = Date.now();
    const o = M.outlook(sim, now, state.profile.limit), b = o.b, st = o.status;
    const text = (!sim.G || st === 'clear')
      ? "Checking in: my Dry Season estimate says I'm clear."
      : 'Checking in from Dry Season. My estimate is ' + fmtBac(b) + (o.rising ? ' and still climbing to about ' + fmtBac(o.ahead) : '')
        + (st === 'over' ? (o.overAt ? ', heading over the legal limit' : ', over the legal limit') : ', under the limit but still impaired')
        + ", so I'm not driving." + (known(sim.clear) ? ' I should be fully clear around ' + fmtTime(sim.clear) + ' ' + dayIn(sim.clear) + '.' : '');
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      location.href = 'sms:?&body=' + encodeURIComponent(text);
    } catch (e) { /* share dismissed */ }
  });

  // Drive planner
  function renderPlanner() {
    const s = state.session, t = $('#ticket');
    if (document.activeElement !== $('#driveAt')) $('#driveAt').value = s.driveAt ? toLocalInput(s.driveAt) : '';
    $('#driveClear').hidden = !s.driveAt;
    const set = (ok, verdict, detail) => { t.dataset.ok = ok; $('#tkVerdict').textContent = verdict; $('#tkDetail').textContent = detail; };
    if (!s.driveAt) {
      $('#tkTime').textContent = '--:--'; $('#tkDay').textContent = 'Not set';
      set('', 'Add a time above', "You'll get a straight answer on whether you're likely to be clear by then.");
      return;
    }
    $('#tkTime').textContent = fmtTime(s.driveAt);
    $('#tkDay').textContent = dayLabel(s.driveAt);
    const now = Date.now();
    if (s.driveAt <= now) { set('', 'That time has passed', 'Pick a time later than now.'); return; }
    if (!s.rounds.length) { set('yes', 'Nothing to clear', 'The tab is empty. Make sure you sleep well before a long drive.'); return; }
    const plan = M.drivePlan(opts(), now, s.driveAt, 60, isLive());
    if (!plan.known) { set('no', 'Not clear in time', "This is more than the model can follow, so it can't give you a clear time. Arrange a lift."); return; }
    const clearTxt = fmtTime(plan.clearAt) + ' ' + dayIn(plan.clearAt);
    if (plan.ok) {
      let d = 'Fully clear around ' + clearTxt + ', with at least an hour to spare.';
      if (isLive() && plan.latestStop) d += ' At your current pace, stop drinking by ' + fmtTime(plan.latestStop) + ' to keep it that way.';
      set('yes', 'Likely clear in time', d);
    } else {
      let d = plan.clearAt > s.driveAt
        ? "You'd still have alcohol in your blood until about " + clearTxt + '. Arrange a lift or move the drive.'
        : 'Clear around ' + clearTxt + ', less than an hour before you drive. Too close to call, so arrange a lift or give it more time.';
      if (isLive()) d += ' Stopping now gives you the best chance.';
      set('no', 'Not clear in time', d);
    }
  }
  $('#driveAt').addEventListener('change', (e) => { state.session.driveAt = fromLocalInput(e.target.value); save(); renderPlanner(); });
  $('#driveClear').addEventListener('click', () => { state.session.driveAt = null; save(); renderPlanner(); });

  // ---------- Live Island ----------
  let island = null, riskNow = 'low', dangerNow = false;
  const keyOf = (d) => d.name + '|' + d.ml + '|' + d.abv;
  function shortName(name) {
    const p = D.byName(name);
    if (p && p.short) return p.short;
    return name.length > 12 ? name.slice(0, 11).trim() + '\u2026' : name;
  }
  function islandSnap(sim) {
    const now = Date.now(), limit = state.profile.limit, has = sim.G > 0;
    const b = has ? bacAt(sim, now) : 0;
    const ol = has ? M.outlook(sim, now, limit) : null, st = ol ? ol.status : 'clear';
    const u = has ? M.underLimitAt(sim, limit) : null;
    const L = N.lastDrink(state.session);
    const clearAt = sim.clear || now;          // Infinity when not known: it prints as --:--
    const { h, m } = dur(clearAt - now);
    return {
      has, status: st, low: !!(ol && ol.low), bac: b, peak: sim.peak, start: sim.start, clearAt, underAt: u,
      risk: riskNow, danger: dangerNow,
      last: L ? { key: keyOf(L), name: L.name, short: shortName(L.name), ml: L.ml, abv: L.abv, share: L.share } : null,
      favs: (state.favs || []).map(D.favOf).filter(Boolean).map((x) => ({ key: keyOf(x), name: x.name, short: x.short || x.name, ml: x.ml, abv: x.abv, share: 1 })),
      water: state.session.water,
      fmt: {
        bac: fmtBac(b), clear: fmtTime(clearAt), clearedAt: fmtTime(clearAt), clearDay: dayLabel(clearAt),
        left: !known(clearAt) ? '--' : h ? h + ' h ' + pad(m) + ' m' : m + ' min', start: fmtTime(sim.start),
        underAt: u ? fmtTime(u) : '--', limit: fmtLimit(limit)
      }
    };
  }
  function addFromIsland(d) {
    const share = d.share || 1;
    const r = N.addLiveDrink(state, { name: d.name, abv: d.abv, ml: d.ml, qty: 1, share }, Date.now());
    state = r.state;
    save(); renderAll();
    const g = M.gramsOf({ abv: d.abv, ml: d.ml, qty: 1, share });
    if (!announce(r.outcome) && (d.toast || !island || island.view === 'gone')) toast('+1 ' + d.name + ', ' + g.toFixed(1) + ' g');
    if (island) island.celebrate('pour', { label: '+1 ' + shortName(d.name) });
  }
  function toggleWater() {
    const now = Date.now();
    const w = state.session.water || { until: null, count: 0 };
    if (w.until && w.until > now) {
      state.session.water = { until: null, count: w.count };
      save(); renderLive();
      if (island) island.celebrate('waterOff', { label: 'Break over' }); else toast('Water break ended');
      return;
    }
    let min = 20;
    const L = N.lastDrink(state.session);
    if (L && riskNow !== 'low') {
      const gap = M.pacingGap(opts(), now, M.gramsOf(Object.assign({}, L, { qty: 1 })), M.THRESHOLDS.blackout);
      if (gap) min = Math.max(10, Math.min(45, gap));
    }
    state.session.water = { until: now + min * 60000, dur: min * 60000, count: (w.count || 0) + 1 };
    save(); renderLive();
    if (island) island.celebrate('waterOn', { label: 'Water, ' + min + ' min' }); else toast('Water break, ' + min + ' min');
  }

  // Quick actions under the hero
  function renderQuick() {
    const L = N.lastDrink(state.session), now = Date.now();
    const w = state.session.water, on = !!(w && w.until && w.until > now);
    $('#qaWaterT').textContent = on ? 'End break' : 'Water break';
    $('#qaWaterSub').textContent = on ? Math.max(1, Math.ceil((w.until - now) / 60000)) + ' min left' : 'Slows the night';
    $('#qaWater').setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  $('#qaAdd').addEventListener('click', () => { pickFor = 'tab'; buildList(); showList(); sheet.showModal(); });
  $('#qaWater').addEventListener('click', toggleWater);
  $('#qaLate').addEventListener('click', () => openLate());

  // Render loop
  function renderLive() {
    lastSim = simulate();
    renderHero(lastSim); renderStatus(lastSim); renderRisk(lastSim); renderChart(lastSim); renderPlanner(); renderQuick();
    if (island) island.update(islandSnap(lastSim));
  }
  function renderAll() { renderNight(); renderStash(); renderStashEdit(); renderPlanStash(); renderAnother(); renderTab(); renderBody(); renderSetSum(); renderHistory(); renderFavs(); buildScale(); renderLive(); }
  buildList();
  renderAll();
  let ticks = 0;
  setInterval(() => {
    ticks++;
    if (isLive() && ticks % 60 === 0) {
      const settled = N.settle(state, Date.now());
      if (settled !== state) { state = settled; save(); renderAll(); }
    }
    // Per second: only the countdown and gauge. The heavier parts follow the minute-scale pace of the estimate.
    if (isLive() && ticks % 15 === 0) lastSim = simulate();
    renderHero(lastSim, ticks % 10 !== 0);
    if (ticks % 5 === 0) renderStatus(lastSim);
    if (ticks % 10 === 0) renderRisk(lastSim);
    if ((isLive() && ticks % 30 === 0) || ticks % 60 === 0) renderChart(lastSim);
    if (ticks % 15 === 0) renderPlanner();
    if (ticks % 10 === 0) renderQuick();
    if (island) island.update(islandSnap(lastSim));
  }, 1000);

  if (window.DryIsland) {
    island = DryIsland.create({
      onAddLast: () => {
        const L = N.lastDrink(state.session);
        if (L) addFromIsland(L); else { buildList(); showList(); sheet.showModal(); }
      },
      onAdd: addFromIsland,
      onWater: toggleWater,
      onWaterDone: () => { const w = state.session.water; state.session.water = { until: null, count: w ? w.count : 0 }; save(); },
      onText: () => { island.celebrate('cheers'); setTimeout(() => $('#textFriend').click(), 500); },
      onPicker: () => { buildList(); showList(); sheet.showModal(); },
      onDanger: () => { setTab('tonight', false); $('#danger').scrollIntoView({ behavior: reduceMotionPref() ? 'auto' : 'smooth', block: 'start' }); }
    });
    island.setEnabled(state.profile.island !== false);
    island.update(islandSnap(lastSim));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => es.forEach((e) => island.setHeroVisible(e.intersectionRatio > 0.25)), { threshold: [0, 0.25, 0.5, 1] }).observe($('.readout'));
    }
  }
  function reduceMotionPref() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  $('#islandOn').addEventListener('change', (e) => { state.profile.island = e.target.checked; save(); if (island) island.setEnabled(e.target.checked); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderAll(); maybeCatchUp(); } });


  // ---------- Offline and updates ----------
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function appMeta() { try { return JSON.parse(localStorage.getItem(APP_KEY)) || {}; } catch (e) { return {}; } }
  function setMeta(p) { try { localStorage.setItem(APP_KEY, JSON.stringify(Object.assign(appMeta(), p))); } catch (e) {} }
  const raceTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

  let reg = null, checkState = 'idle', pouring = false, waitingVersion = null;

  function renderNet() { $('#net').hidden = navigator.onLine; renderAppInfo(); }
  window.addEventListener('online', () => { renderNet(); checkForUpdate(false); });
  window.addEventListener('offline', renderNet);

  function renderAppInfo() {
    $('#appVersion').textContent = 'Version ' + VERSION;
    const m = appMeta();
    $('#lastChecked').textContent = m.checkedAt ? 'Last checked ' + fmtTime(m.checkedAt) + ' ' + dayIn(m.checkedAt) : 'Not checked yet';
    const waiting = reg && reg.waiting;
    let st = 'current', txt = 'Up to date';
    if (checkState === 'checking') { st = 'checking'; txt = 'Checking'; }
    else if (waiting) { st = 'found'; txt = 'Update ready'; }
    else if (checkState === 'error') { st = 'error'; txt = "Couldn't reach it"; }
    else if (!navigator.onLine) { st = 'offline'; txt = 'Offline'; }
    else if (!reg) { st = 'offline'; txt = 'Saved copy off'; }
    const el = $('#updState'); el.dataset.state = st; el.textContent = txt;
    $('#checkNow').textContent = waiting ? 'Update now' : 'Check for updates';
  }

  async function checkForUpdate(manual) {
    if (!reg) { if (manual) toast('Updates work once the app is on the web'); return; }
    if (!navigator.onLine) { if (manual) toast("You're offline. The saved copy works fine."); renderAppInfo(); return; }
    checkState = 'checking'; renderAppInfo();
    try {
      await raceTimeout(reg.update(), manual ? 8000 : 3000);
      setMeta({ checkedAt: Date.now() });
      checkState = 'idle';
      if (reg.waiting) showCoaster();
      else if (manual && !reg.installing) toast("You're on the latest version");
      else if (manual) toast('Found an update, getting it ready');
    } catch (e) {
      checkState = manual ? 'error' : 'idle';
      if (manual) toast("Couldn't check. Try again with better signal.");
    }
    renderAppInfo();
  }

  function askVersion(worker) {
    return new Promise((res) => {
      try {
        const ch = new MessageChannel();
        const t = setTimeout(() => res(null), 1500);
        ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data && e.data.version); };
        worker.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
      } catch (e) { res(null); }
    });
  }
  let coasterDismissed = false;
  async function showCoaster() {
    if (!reg || !reg.waiting || coasterDismissed || pouring) return;
    const c = $('#coaster');
    if ($('#settings').open) $('#settings').close();
    waitingVersion = await askVersion(reg.waiting);
    const v = waitingVersion ? (waitingVersion.endsWith('.0') ? waitingVersion.slice(0, -2) : waitingVersion) : 'New';
    $('#stamp').textContent = v;
    $('#stamp').classList.toggle('long', v.length > 3);
    if (!c.hidden) return;
    c.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('show')));
    renderAppInfo();
  }
  function hideCoaster() {
    const c = $('#coaster');
    c.classList.remove('show');
    setTimeout(() => { if (!c.classList.contains('show')) c.hidden = true; }, reduceMotion() ? 0 : 450);
  }
  function pourIn() {
    return new Promise((res) => {
      const p = $('#pour');
      if (reduceMotion()) { p.classList.add('full'); return res(); }
      p.classList.add('fill');
      setTimeout(res, 850);
    });
  }
  async function applyUpdate() {
    const w = reg && reg.waiting;
    if (!w) { hideCoaster(); return checkForUpdate(true); }
    pouring = true;
    hideCoaster();
    try { sessionStorage.setItem('dry-poured', '1'); } catch (e) {}
    await pourIn();
    w.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => location.reload(), 4000);
  }
  $('#updNow').addEventListener('click', applyUpdate);
  $('#updLater').addEventListener('click', () => { coasterDismissed = true; hideCoaster(); toast("No rush. It'll be waiting in Your body."); });
  $('#checkNow').addEventListener('click', () => (reg && reg.waiting) ? applyUpdate() : checkForUpdate(true));

  // Drain the pour after an update, then show what's new
  function drainPour() {
    const p = $('#pour');
    let poured = false;
    try { poured = !!sessionStorage.getItem('dry-poured'); sessionStorage.removeItem('dry-poured'); } catch (e) {}
    if (!poured && !p.classList.contains('full')) return 0;
    requestAnimationFrame(() => requestAnimationFrame(() => { p.classList.remove('full', 'fill'); p.classList.add('drain'); }));
    return reduceMotion() ? 0 : 900;
  }
  function showWhatsNew() {
    const parts = VERSION.split('.');
    $('#newsVer').textContent = parts.slice(0, 2).join('.');
    $('#newsSub').textContent = 'Version ' + VERSION;
    const ul = $('#newsList'); ul.innerHTML = '';
    (self.DRY_CHANGES || []).forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    $('#news').showModal();
  }
  $('#newsOk').addEventListener('click', () => { $('#news').close(); setTimeout(maybeCatchUp, 300); });
  $('#news').addEventListener('click', (e) => { if (e.target === $('#news')) $('#news').close(); });

  const wait = drainPour();
  const seen = appMeta().seenVersion;
  if (seen !== VERSION) {
    if (seen || hadData) setTimeout(showWhatsNew, wait + 150);
    setMeta({ seenVersion: VERSION });
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => {
      reg = r;
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) { checkState = 'idle'; renderAppInfo(); showCoaster(); }
        });
      });
      if (r.waiting && navigator.serviceWorker.controller) showCoaster();
      renderAppInfo();
      checkForUpdate(false);
    }).catch(() => renderAppInfo());
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (pouring) location.reload(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      const m = appMeta();
      if (!m.checkedAt || Date.now() - m.checkedAt > 60000) checkForUpdate(false);
    });
  }
  renderNet();


  // Tabs: the bar swaps which screen is shown. Everything stays in the one page, so state and timers carry on.
  const TABS = ['tonight', 'plan', 'history', 'you'];
  const tabbar = $('#tabbar');
  function setTab(t, scroll) {
    if (TABS.indexOf(t) < 0) t = 'tonight';
    document.body.dataset.tab = t;
    tabbar.style.setProperty('--i', TABS.indexOf(t));
    tabbar.querySelectorAll('[data-go]').forEach((b) => {
      if (b.dataset.go === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    try { sessionStorage.setItem('dry-tab', t); } catch (e) {}
    if (scroll !== false) window.scrollTo(0, 0);
    if (scroll !== false && !reduceMotionPref()) {
      document.body.classList.remove('tab-anim'); void document.body.offsetWidth; document.body.classList.add('tab-anim');
      if (t === 'history') ['hsNights', 'hsDrinks'].forEach((id) => countUp($('#' + id)));
    }
  }
  // A short count-up for whole-number stats
  function countUp(el) {
    const to = parseInt(el.dataset.to || el.textContent, 10);
    if (!(to > 0) || el.parentNode.parentNode.parentNode.hidden) return;
    const t0 = performance.now(), D = 600;
    (function step(t) {
      const k = Math.min(1, (t - t0) / D);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step); else el.textContent = String(to);
    })(t0);
  }
  tabbar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    if (document.body.dataset.tab === b.dataset.go) window.scrollTo({ top: 0, behavior: reduceMotionPref() ? 'auto' : 'smooth' });
    else setTab(b.dataset.go);
  });
  try { setTab(sessionStorage.getItem('dry-tab') || 'tonight', false); } catch (e) {}

  // Home screen shortcuts: Add a drink, and One more
  const action = new URLSearchParams(location.search).get('action');
  if (action) history.replaceState(null, '', location.pathname);
  if (action === 'add') {
    setTimeout(() => { buildList(); showList(); sheet.showModal(); }, wait);
  } else if (action === 'one') {
    setTimeout(() => {
      if (openNext()) return;
      const L = N.lastDrink(state.session);
      if (L) addFromIsland(Object.assign({}, L, { toast: true }));
      else { buildList(); showList(); sheet.showModal(); }
    }, wait);
  } else if (!hadData && !appMeta().toured) {
    setTimeout(() => { if (!document.querySelector('dialog[open]')) startTour(); }, wait + 600);
  } else {
    setTimeout(maybeCatchUp, wait + 400);
  }
})();

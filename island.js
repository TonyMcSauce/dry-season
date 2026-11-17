/* Dry Season Live Island.
 * A Dynamic Island style status pill that lives inside the app.
 * - On an iPhone with a Dynamic Island, opened from the home screen, it sits flush
 *   against the real island so the hardware appears to grow.
 * - Everywhere else it floats at the top once the big countdown scrolls away.
 * Pure helpers (geometry, alertFor, splitLeft) are exported for the node tests.
 */
(function (root) {
  'use strict';

  const CAM_W = 126;          // the hardware island, in CSS px
  const CAM_H = 37;
  const SIDE = 46;            // compact content either side of the camera
  const ALERT_MS = 4200;

  /** Where and how to draw. sat = safe-area-inset-top in px. */
  function geometry(o) {
    const sat = Math.max(0, +o.sat || 0);
    const vw = +o.vw || 390;
    if (o.standalone && sat >= 54 && vw >= 360) {
      return { mode: 'fused', top: Math.max(9, Math.round(sat - 48)), camW: CAM_W, camH: CAM_H, vw };
    }
    return { mode: 'floating', top: Math.round(sat) + 8, camW: CAM_W, camH: 36, vw };
  }

  /** Which alert, if any, a change in state deserves. */
  function alertFor(prev, next) {
    if (!prev || !next || !prev.has || !next.has) return null;
    if (!prev.danger && next.danger) return 'danger';
    if (prev.status !== next.status) {
      if (next.status === 'over') return 'over';
      if (prev.status === 'over' && next.status === 'impaired') return 'under';
      if (next.status === 'clear') return 'clear';
    }
    if (prev.risk !== 'high' && next.risk === 'high') return 'risk';
    return null;
  }

  /** Time left as h:mm (or m:ss under a minute's worth of hours for timers). */
  function splitLeft(ms, withSeconds) {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (n) => String(n).padStart(2, '0');
    if (withSeconds) return (h ? h + ':' + p(m) : m) + ':' + p(s);
    return h + ':' + p(m);
  }

  // ---------------------------------------------------------------------------
  // Browser only below
  if (typeof document === 'undefined') {
    const api = { geometry, alertFor, splitLeft, CAM_W, CAM_H, SIDE };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return;
  }

  const SVG = {
    over: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.3"/><path d="M4.2 10.6c2.6-.7 5.2-1 7.8-1s5.2.3 7.8 1M12 14.3v5.6"/><path d="M4.5 19.5 19.5 4.5"/></svg>',
    under: '<svg viewBox="0 0 24 24"><path d="M12 4.5v13.5M6.5 12.8 12 18.3l5.5-5.5"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="m5.5 12.6 4.2 4.1 8.8-9.4"/></svg>',
    risk: '<svg viewBox="0 0 24 24"><path d="M12 4.2 20.6 19H3.4z"/><path d="M12 10v4.2M12 16.8v.1"/></svg>',
    danger: '<svg viewBox="0 0 24 24"><path d="M12 3.5 21 19.5H3z"/><path d="M12 9.5v5M12 17.2v.1"/></svg>',
    water: '<svg viewBox="0 0 24 24"><path d="M12 3.8c3.6 4.4 5.9 7.6 5.9 10.6a5.9 5.9 0 0 1-11.8 0c0-3 2.3-6.2 5.9-10.6z"/><path d="M9.4 15a2.7 2.7 0 0 0 2.6 2.4"/></svg>',
    added: '<svg viewBox="0 0 24 24"><path d="M6.5 4.5h11l-1.3 15h-8.4z"/><path d="M12 9.2v6M9 12.2h6"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6.2l-4.3 3.4v-3.4h-.5a2 2 0 0 1-2-2z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="6.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="17.5" cy="12" r="1.2"/></svg>'
  };

  const TONE = { over: 'over', under: 'impaired', clear: 'clear', risk: 'over', danger: 'danger', added: 'amber', 'water-start': 'water', 'water-done': 'water', 'water-end': 'water' };

  // Rolling digits: each character slides up and away while the new one slides in.
  function Roller(el) {
    let current = '';
    this.set = (str) => {
      str = String(str);
      if (str === current) return;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const shape = (x) => x.replace(/[0-9]/g, '9');
      if (!current || shape(str) !== shape(current) || reduce) {
        el.innerHTML = '';
        for (const ch of str) el.appendChild(slot(ch));
      } else {
        [...str].forEach((ch, i) => {
          if (ch === current[i]) return;
          const s = el.children[i];
          const old = s.lastElementChild;
          const fresh = document.createElement('span');
          fresh.textContent = ch;
          fresh.className = 'r-in';
          s.appendChild(fresh);
          requestAnimationFrame(() => requestAnimationFrame(() => { fresh.className = ''; if (old) old.className = 'r-out'; }));
          setTimeout(() => { if (old && old.parentNode) old.remove(); }, 600);
        });
      }
      current = str;
      el.setAttribute('aria-label', str);
    };
    function slot(ch) {
      const s = document.createElement('span');
      s.className = /[0-9]/.test(ch) ? 'r-slot' : 'r-ch';
      const i = document.createElement('span');
      i.textContent = ch;
      s.appendChild(i);
      s.setAttribute('aria-hidden', 'true');
      return s;
    }
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function create(opts) {
    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rootEl = el('div', 'island-root');
    rootEl.id = 'islandRoot';
    rootEl.hidden = true;
    const island = el('div', 'island');
    island.dataset.view = 'gone';
    rootEl.appendChild(island);
    const live = el('p', 'sr');
    live.setAttribute('aria-live', 'polite');
    rootEl.appendChild(live);

    // ---- Compact
    const vC = el('div', 'iv iv-compact');
    vC.innerHTML =
      '<button class="ic-hit" type="button" aria-label="Open live status" aria-expanded="false"></button>' +
      '<span class="ic-lead" aria-hidden="true">' +
        '<svg class="mini-glass" viewBox="0 0 16 22"><defs><clipPath id="mgc"><path d="M2 2h12l-1.5 17.2a1.6 1.6 0 0 1-1.6 1.4H5.1a1.6 1.6 0 0 1-1.6-1.4z"/></clipPath></defs>' +
        '<g clip-path="url(#mgc)"><rect class="mg-liquid" x="0" y="0" width="16" height="22"/><rect class="mg-foam" x="0" y="0" width="16" height="3.2"/></g>' +
        '<path class="mg-outline" d="M2 2h12l-1.5 17.2a1.6 1.6 0 0 1-1.6 1.4H5.1a1.6 1.6 0 0 1-1.6-1.4z"/></svg>' +
        '<span class="ic-drop">' + SVG.water + '</span>' +
      '</span>' +
      '<span class="ic-mid"></span>' +
      '<span class="ic-trail"><span class="roll" data-roll="trail"></span></span>';
    island.appendChild(vC);

    // ---- Alert
    const vA = el('div', 'iv iv-alert');
    vA.innerHTML =
      '<span class="ia-icon"><svg class="ia-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20"/></svg><span class="ia-glyph" aria-hidden="true"></span></span>' +
      '<span class="ia-text"><span class="ia-title"></span><span class="ia-sub"></span></span>' +
      '<span class="ia-timer" aria-hidden="true"></span>';
    island.appendChild(vA);

    // ---- Expanded
    const vE = el('div', 'iv iv-expanded');
    vE.innerHTML =
      '<div class="ix-top">' +
        '<button class="ix-status" type="button" aria-label="Close live status"><i class="ix-dot"></i><span class="ix-status-t"></span></button>' +
        '<span class="ix-bac"><span class="roll" data-roll="bac"></span></span>' +
      '</div>' +
      '<div class="ix-main">' +
        '<svg class="ix-glass" viewBox="0 0 48 66" aria-hidden="true"><defs><clipPath id="xgc"><path d="M5 4h38l-4.2 55.4a3.4 3.4 0 0 1-3.4 3.1H12.6a3.4 3.4 0 0 1-3.4-3.1z"/></clipPath>' +
          '<linearGradient id="xgl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B94A"/><stop offset=".6" stop-color="#E8962C"/><stop offset="1" stop-color="#B8651A"/></linearGradient></defs>' +
          '<g clip-path="url(#xgc)"><g class="xg-level"><path class="xg-wave" fill="url(#xgl)" d="M-48 6 Q-36 1 -24 6 T0 6 T24 6 T48 6 T72 6 T96 6 V80 H-48Z"/>' +
          '<path class="xg-foam" d="M-48 6 Q-36 1 -24 6 T0 6 T24 6 T48 6 T72 6 T96 6 V10 Q84 13 72 10 T48 10 T24 10 T0 10 T-24 10 T-48 10Z"/></g>' +
          '<circle class="xg-b" cx="18" cy="56" r="1.3"/><circle class="xg-b" cx="30" cy="58" r="1"/><circle class="xg-b" cx="24" cy="60" r="1.5"/></g>' +
          '<path class="xg-outline" d="M5 4h38l-4.2 55.4a3.4 3.4 0 0 1-3.4 3.1H12.6a3.4 3.4 0 0 1-3.4-3.1z"/></svg>' +
        '<div class="ix-read"><p class="ix-k">Clear by</p><p class="ix-time"><span class="roll" data-roll="clear"></span></p><p class="ix-sub"></p></div>' +
      '</div>' +
      '<div class="ix-line" aria-hidden="true">' +
        '<div class="ix-track"><div class="ix-past"></div><i class="ix-tick"></i><i class="ix-now"></i></div>' +
        '<div class="ix-labels"><span class="ix-l0"></span><span class="ix-lmid"></span><span class="ix-l1"></span></div>' +
      '</div>' +
      '<p class="ix-water" hidden></p>' +
      '<div class="ix-actions">' +
        '<button type="button" data-act="add"><span class="ix-ic">' + SVG.plus + '</span><span class="ix-al"></span></button>' +
        '<button type="button" data-act="water"><span class="ix-ic">' + SVG.water + '</span><span class="ix-al">Water break</span></button>' +
        '<button type="button" data-act="text"><span class="ix-ic">' + SVG.text + '</span><span class="ix-al">Text a friend</span></button>' +
      '</div>';
    island.appendChild(vE);

    // ---- Quick add
    const vQ = el('div', 'iv iv-quick');
    vQ.innerHTML =
      '<div class="iq-head"><p class="iq-title">Quick add</p><button class="iq-close" type="button" aria-label="Close quick add">' + SVG.plus + '</button></div>' +
      '<div class="iq-tiles"></div>';
    island.appendChild(vQ);

    document.body.appendChild(rootEl);

    const rollers = {};
    island.querySelectorAll('[data-roll]').forEach((r) => { rollers[r.dataset.roll] = new Roller(r); });
    const views = { compact: vC, alert: vA, expanded: vE, quick: vQ };

    // ---- State
    let geo = null, view = 'gone', snap = null, prevSnap = null, enabled = true;
    let heroVisible = true, alertQ = [], alertTimer = null, alertKind = null, alertStart = 0, alertPaused = 0;
    let waterFiredFor = null;

    function measureGeo() {
      const probe = el('div', 'island-probe');
      document.body.appendChild(probe);
      let sat = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      const force = new URLSearchParams(location.search).get('island');
      if (force) { const [m, s] = force.split(':'); return geometry({ sat: s != null ? +s : sat, vw: innerWidth, standalone: m === 'fused' }); }
      return geometry({ sat, vw: innerWidth, standalone });
    }
    function layoutGeo() {
      geo = measureGeo();
      rootEl.dataset.mode = geo.mode;
      rootEl.style.setProperty('--itop', geo.top + 'px');
      rootEl.style.setProperty('--camw', geo.camW + 'px');
      rootEl.style.setProperty('--camh', geo.camH + 'px');
      const wide = Math.min(geo.vw - 16, 404);
      rootEl.style.setProperty('--wide', wide + 'px');
      rootEl.style.setProperty('--alertw', Math.min(geo.vw - 16, 384) + 'px');
      if (view !== 'gone') size(view, true);
    }

    function compactWidth() {
      if (geo.mode === 'fused') return geo.camW + SIDE * 2;
      const mid = vC.querySelector('.ic-mid');
      return Math.ceil(30 + 14 + mid.scrollWidth + 14 + vC.querySelector('.ic-trail').scrollWidth + 16);
    }
    function size(v, instant) {
      let w, h, r;
      const wide = parseFloat(rootEl.style.getPropertyValue('--wide'));
      if (v === 'gone') {
        if (geo.mode === 'fused') { w = geo.camW; h = geo.camH; r = geo.camH / 2; }
        else { w = 40; h = 12; r = 6; }
      } else if (v === 'compact') {
        w = compactWidth(); h = geo.camH; r = geo.camH / 2;
        vC.style.width = w + 'px';
      } else {
        const vEl = views[v];
        w = v === 'alert' ? parseFloat(rootEl.style.getPropertyValue('--alertw')) : wide;
        vEl.style.width = w + 'px';
        h = Math.ceil(vEl.scrollHeight);
        r = v === 'alert' ? Math.min(34, h / 2) : 40;
      }
      if (instant) island.classList.add('no-anim');
      island.style.width = w + 'px';
      island.style.height = h + 'px';
      island.style.borderRadius = r + 'px';
      if (instant) { void island.offsetWidth; island.classList.remove('no-anim'); }
    }

    function show(v) {
      if (v === view) { if (v !== 'gone') size(v); return; }
      const from = view;
      view = v;
      island.dataset.view = v;
      rootEl.dataset.view = v;
      vC.querySelector('.ic-hit').setAttribute('aria-expanded', String(v === 'expanded' || v === 'quick'));
      if (v !== 'gone') rootEl.hidden = false;
      if ((v === 'compact' || v === 'gone') && snap) renderCompact();
      if (from === 'gone' && v !== 'gone') {
        // Start from the camera (or a dot) so it grows out of the hardware.
        size('gone', true);
        island.classList.add('arriving');
        requestAnimationFrame(() => requestAnimationFrame(() => { island.classList.remove('arriving'); size(v); }));
      } else {
        size(v);
      }
      if (v === 'gone') {
        setTimeout(() => { if (view === 'gone') rootEl.hidden = true; }, reduce() ? 0 : 520);
      }
      const hadFocus = island.contains(document.activeElement);
      Object.keys(views).forEach((k) => { views[k].inert = k !== v; });
      if ((v === 'expanded' || v === 'quick') && kbd) {
        setTimeout(() => { const b = views[v].querySelector('button'); if (b) b.focus({ preventScroll: true }); }, 60);
      } else if (v === 'compact' && hadFocus) {
        vC.querySelector('.ic-hit').focus({ preventScroll: true });
      }
    }

    function restingView() {
      if (!enabled || !snap) return 'gone';
      const water = snap.water && snap.water.until && snap.water.until > Date.now();
      if (!snap.has && !water) return 'gone';
      if (geo.mode === 'floating' && heroVisible) return 'gone';
      return 'compact';
    }

    // ---- Rendering
    function setTone(t, fromCompact) { if (fromCompact && view !== 'compact' && view !== 'gone') return; island.dataset.tone = t; }
    function renderCompact() {
      const now = Date.now();
      const water = snap.water && snap.water.until && snap.water.until > now;
      vC.classList.toggle('is-water', !!water);
      const mid = vC.querySelector('.ic-mid');
      if (water) {
        setTone('water', true);
        rollers.trail.set(splitLeft(snap.water.until - now, true));
        mid.textContent = geo.mode === 'floating' ? 'Water break' : '';
        return;
      }
      setTone(snap.status === 'over' ? 'over' : snap.status === 'impaired' ? 'impaired' : 'clear', true);
      const lvl = snap.peak > 0 ? Math.max(0, Math.min(1, snap.bac / snap.peak)) : 0;
      vC.querySelector('.mg-liquid').style.transform = 'translateY(' + (3 + (1 - lvl) * 17).toFixed(2) + 'px)';
      vC.querySelector('.mg-foam').style.transform = 'translateY(' + (1.4 + (1 - lvl) * 17).toFixed(2) + 'px)';
      rollers.trail.set(snap.status === 'clear' ? 'Clear' : splitLeft(snap.clearAt - now));
      mid.textContent = geo.mode === 'floating' ? (snap.status === 'clear' ? 'All clear' : 'Clear by ' + snap.fmt.clear) : '';
    }
    function renderExpanded() {
      const now = Date.now();
      const st = snap.status;
      vE.querySelector('.ix-status-t').textContent = st === 'over' ? 'Over the legal limit' : st === 'impaired' ? 'Under the limit, still impaired' : 'Clear, by this estimate';
      rollers.bac.set(snap.fmt.bac);
      rollers.clear.set(st === 'clear' ? snap.fmt.clearedAt : snap.fmt.clear);
      vE.querySelector('.ix-k').textContent = st === 'clear' ? 'Clear since' : 'Clear by';
      vE.querySelector('.ix-sub').textContent = st === 'clear' ? 'Have a glass of water anyway.' : snap.fmt.clearDay + ', ' + snap.fmt.left + ' to go';
      const lvl = snap.peak > 0 ? Math.max(0, Math.min(1, snap.bac / snap.peak)) : 0;
      vE.querySelector('.xg-level').style.transform = 'translateY(' + (6 + (1 - lvl) * 50).toFixed(1) + 'px)';
      // Timeline of the night
      const span = Math.max(1, snap.clearAt - snap.start);
      const pct = (t) => Math.max(0, Math.min(100, (t - snap.start) / span * 100));
      const pNow = pct(now);
      vE.querySelector('.ix-past').style.width = pNow + '%';
      vE.querySelector('.ix-now').style.left = pNow + '%';
      const tick = vE.querySelector('.ix-tick');
      const mid = vE.querySelector('.ix-lmid');
      if (snap.underAt && snap.underAt > snap.start && snap.underAt < snap.clearAt) {
        const pu = pct(snap.underAt);
        tick.hidden = false; tick.style.left = pu + '%';
        mid.hidden = pu < 22 || pu > 78;
        mid.style.left = pu + '%';
        mid.textContent = 'Under ' + snap.fmt.limit + ' ' + snap.fmt.underAt;
      } else { tick.hidden = true; mid.hidden = true; }
      vE.querySelector('.ix-l0').textContent = snap.fmt.start;
      vE.querySelector('.ix-l1').textContent = snap.fmt.clear;
      // Water row and actions
      const water = snap.water && snap.water.until && snap.water.until > now;
      const wr = vE.querySelector('.ix-water');
      wr.hidden = !water;
      if (water) wr.textContent = 'Water break, ' + splitLeft(snap.water.until - now, true) + ' left';
      const addL = vE.querySelector('[data-act="add"] .ix-al');
      addL.textContent = snap.last ? '+1 ' + snap.last.short : 'Add a drink';
      vE.querySelector('[data-act="water"] .ix-al').textContent = water ? 'End break' : 'Water break';
      setTone(st === 'over' ? 'over' : st === 'impaired' ? 'impaired' : 'clear');
    }
    function renderQuick() {
      const box = vQ.querySelector('.iq-tiles');
      box.innerHTML = '';
      const seen = new Set();
      const list = [];
      if (snap.last) { list.push(snap.last); seen.add(snap.last.key); }
      (snap.favs || []).forEach((f) => { if (!seen.has(f.key) && list.length < 3) { list.push(f); seen.add(f.key); } });
      list.forEach((d, i) => {
        const b = el('button', 'iq-tile');
        b.type = 'button';
        b.style.setProperty('--i', i);
        b.innerHTML = '<span class="iq-n"></span><span class="iq-m"></span>';
        b.querySelector('.iq-n').textContent = d.name;
        b.querySelector('.iq-m').textContent = d.ml + ' ml, ' + d.abv + '%';
        b.addEventListener('click', (e) => { e.stopPropagation(); collapse(); opts.onAdd(d); });
        box.appendChild(b);
      });
      const more = el('button', 'iq-tile iq-more', '<span class="iq-ic">' + SVG.more + '</span><span class="iq-n">More drinks</span>');
      more.type = 'button';
      more.style.setProperty('--i', list.length);
      more.addEventListener('click', (e) => { e.stopPropagation(); collapse(); opts.onPicker(); });
      box.appendChild(more);
    }

    function copyFor(kind, s) {
      const f = s.fmt;
      switch (kind) {
        case 'over': return ['Over the legal limit', 'Under ' + f.limit + ' around ' + f.underAt + '. Leave the car.'];
        case 'under': return ['Back under the legal limit', 'Still impaired. Fully clear by ' + f.clear + '.'];
        case 'clear': return ["You're clear", 'By this estimate. Have a good one.'];
        case 'risk': return ['Blackout risk is high', 'Switch to water for a while.'];
        case 'danger': return ['Watch for alcohol poisoning', 'Tap for the signs and emergency numbers.'];
        case 'water-done': return ['Water break done', 'Nice pacing. Enjoy the next one.'];
        default: return ['', ''];
      }
    }

    // ---- Alerts
    function alert(kind, title, sub) {
      if (!enabled) return;
      if (!title) { const c = copyFor(kind, snap); title = c[0]; sub = c[1]; }
      alertQ = alertQ.filter((a) => a.kind !== kind);
      alertQ.push({ kind, title, sub });
      if (alertQ.length > 3) alertQ.shift();
      if (view === 'expanded' || view === 'quick') { live.textContent = title + '. ' + (sub || ''); alertQ.pop(); return; }
      if (view !== 'alert') nextAlert();
    }
    function nextAlert() {
      const a = alertQ.shift();
      if (!a) { alertKind = null; show(restingView()); return; }
      alertKind = a.kind;
      setTone(TONE[a.kind] || 'amber');
      vA.querySelector('.ia-glyph').innerHTML = SVG[a.kind.startsWith('water') ? 'water' : a.kind] || SVG.added;
      vA.querySelector('.ia-title').textContent = a.title;
      vA.querySelector('.ia-sub').textContent = a.sub || '';
      vA.classList.remove('play'); void vA.offsetWidth; vA.classList.add('play');
      live.textContent = a.title + '. ' + (a.sub || '');
      if (view === 'alert') size('alert'); else show('alert');
      island.classList.remove('breath'); void island.offsetWidth; island.classList.add('breath');
      alertStart = Date.now(); alertPaused = 0;
      clearTimeout(alertTimer);
      alertTimer = setTimeout(endAlert, ALERT_MS);
    }
    function endAlert() { clearTimeout(alertTimer); nextAlert(); }

    // ---- Expand and collapse
    let kbd = false;
    function expand(which) {
      clearTimeout(alertTimer); alertQ = []; alertKind = null;
      if (which === 'quick') renderQuick(); else renderExpanded();
      show(which || 'expanded');
    }
    function collapse() {
      if (view !== 'expanded' && view !== 'quick' && view !== 'alert') return;
      clearTimeout(alertTimer); alertQ = []; alertKind = null;
      island.style.transform = '';
      renderCompact();
      show(restingView());
    }

    // ---- Gestures
    let press = null;
    island.addEventListener('pointerdown', (e) => {
      if (view === 'gone') return;
      kbd = false;
      press = { y: e.clientY, x: e.clientX, t: Date.now(), long: false, dy: 0, btn: !!e.target.closest('button:not(.ic-hit)') };
      island.classList.add('pressed');
      if (view === 'compact' || view === 'alert') {
        press.timer = setTimeout(() => { press.long = true; island.classList.remove('pressed'); expand('quick'); }, 450);
      }
      if (view === 'alert') alertPaused = Date.now();
    });
    island.addEventListener('pointermove', (e) => {
      if (!press) return;
      const dy = e.clientY - press.y, dx = e.clientX - press.x;
      press.dy = dy;
      if (Math.abs(dy) > 6 || Math.abs(dx) > 6) clearTimeout(press.timer);
      if (press.long || press.btn) return;
      const open = view === 'expanded' || view === 'quick';
      if (open && dy < 0) island.style.transform = 'translateY(' + (dy * 0.32).toFixed(1) + 'px) scaleY(' + (1 + dy * 0.0009).toFixed(3) + ')';
      else if (!open && dy > 0) island.style.transform = 'translateY(' + Math.min(dy * 0.3, 14).toFixed(1) + 'px) scale(' + (1 + Math.min(dy, 50) * 0.0016).toFixed(3) + ')';
    });
    function release(e) {
      if (!press) return;
      clearTimeout(press.timer);
      island.classList.remove('pressed');
      island.style.transform = '';
      const p = press; press = null;
      if (alertPaused && view === 'alert') {
        const left = ALERT_MS - (alertPaused - alertStart);
        alertStart = Date.now() - (ALERT_MS - left);
        alertPaused = 0;
        clearTimeout(alertTimer); alertTimer = setTimeout(endAlert, Math.max(800, left));
      }
      if (p.long || p.btn || (e && e.type === 'pointercancel')) return;
      const open = view === 'expanded' || view === 'quick';
      if (open && p.dy < -28) return collapse();
      if (!open && p.dy > 22) return expand();
      if (Math.abs(p.dy) < 8) {
        if (view === 'alert' && alertKind === 'danger') { collapse(); opts.onDanger(); return; }
        if (view === 'compact' || view === 'alert') return expand();
        if (open && !e.target.closest('button')) return collapse();
      }
    }
    island.addEventListener('pointerup', release);
    island.addEventListener('pointercancel', release);
    vC.querySelector('.ic-hit').addEventListener('click', (e) => { if (e.detail === 0) { kbd = true; expand(); } });
    vE.querySelector('.ix-status').addEventListener('click', (e) => { if (e.detail === 0) collapse(); });
    vQ.querySelector('.iq-close').addEventListener('click', (e) => { e.stopPropagation(); collapse(); });
    vE.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = b.dataset.act;
      if (act === 'add') { collapse(); opts.onAddLast(); }
      if (act === 'water') { collapse(); opts.onWater(); }
      if (act === 'text') { opts.onText(); }
    }));
    document.addEventListener('pointerdown', (e) => {
      if ((view === 'expanded' || view === 'quick') && !island.contains(e.target)) collapse();
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && view !== 'compact' && view !== 'gone') { kbd = true; collapse(); } });
    addEventListener('resize', layoutGeo);
    addEventListener('orientationchange', () => setTimeout(layoutGeo, 300));

    Object.keys(views).forEach((k) => { views[k].inert = true; });
    layoutGeo();

    // ---- Public
    const ctrl = {
      update(s) {
        prevSnap = snap; snap = s;
        const now = Date.now();
        if (s.water && s.water.until && now >= s.water.until && waterFiredFor !== s.water.until) {
          waterFiredFor = s.water.until;
          opts.onWaterDone();
          alert('water-done');
        }
        const kind = alertFor(prevSnap, snap);
        if (kind) alert(kind);
        if (view === 'compact' || view === 'gone' || view === 'alert') renderCompact();
        if (view === 'expanded') renderExpanded();
        if (view === 'compact' || view === 'gone') {
          const want = restingView();
          if (want !== view) show(want); else if (view === 'compact') size('compact');
        }
      },
      alert,
      expand, collapse,
      setHeroVisible(v) {
        heroVisible = v;
        if (view === 'compact' || view === 'gone') show(restingView());
      },
      setEnabled(v) {
        enabled = v;
        if (!v) { clearTimeout(alertTimer); alertQ = []; show('gone'); } else if (snap) { renderCompact(); show(restingView()); }
      },
      get view() { return view; },
      get mode() { return geo.mode; },
      relayout: layoutGeo
    };
    root.DryIsland.current = ctrl;
    return ctrl;
  }

  root.DryIsland = { geometry, alertFor, splitLeft, create };
})(typeof self !== 'undefined' ? self : this);

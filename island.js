/* Dry Season Live Island.
 * A Live Activity style pill that lives inside the app, built to Apple's
 * Human Interface Guidelines for the Dynamic Island:
 * - Compact: content either side of the camera, 52.33 pt each side (62.33 on
 *   430 pt wide phones), 36.67 pt tall, snug against the camera.
 * - Expanded: screen width minus 22 pt, 84 to 160 pt tall, sized to its content.
 * - Motion: spring physics in Apple's response and bounce model, interruptible,
 *   velocity preserving, no looping decoration, every animation under 2 s.
 * On an iPhone with a Dynamic Island, opened from the home screen, it sits flush
 * against the real island. Everywhere else it floats at the top once the big
 * countdown scrolls away.
 * Pure helpers (geometry, alertFor, splitLeft, primaryAction, springStep) are
 * exported for the node tests.
 */
(function (root) {
  'use strict';

  const CAM_W = 126;           // hardware island width, CSS px
  const CAM_H = 36.67;         // Apple: compact and minimal height
  const ALERT_MS = 4200;
  const SPRING = {             // Apple's model: response (s) and bounce (0 to 1)
    morph: { response: 0.5, bounce: 0.2 },
    content: { response: 0.34, bounce: 0 },
    press: { response: 0.24, bounce: 0 },
    follow: { response: 0.12, bounce: 0 }
  };

  /** Where and how big. sat = safe-area-inset-top in px. */
  function geometry(o) {
    const sat = Math.max(0, +o.sat || 0);
    const vw = +o.vw || 390;
    const ear = vw >= 420 ? 62.33 : 52.33;
    const expW = Math.min(vw - 22, 408);
    // Installed app: hang just below the status bar. iOS frosts that strip in home screen
    // web apps (WebKit bug 301994), so nothing is drawn inside it. On island iPhones the
    // pill drips down from the real island when it first appears.
    if (o.standalone) {
      return { mode: 'hang', top: Math.round(sat) + (sat >= 20 ? 6 : 8), drip: sat >= 54 && vw >= 360, camW: CAM_W, camH: CAM_H, ear, expW, vw, sat };
    }
    return { mode: 'floating', top: Math.round(sat) + 11, drip: false, camW: CAM_W, camH: CAM_H, ear, expW, vw, sat };
  }
  const compactWidth = (g) => g.camW + g.ear * 2;

  /** Essential moments only, per Apple: alert for what needs attention. */
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

  /** One main action that fits the moment. */
  function primaryAction(s, now) {
    const water = s.water && s.water.until && s.water.until > now;
    if (water) return { act: 'water', label: 'End break', icon: 'water' };
    if (!s.has || !s.last) return { act: 'picker', label: 'Add a drink', icon: 'plus' };
    if ((s.risk === 'raised' || s.risk === 'high') && s.status !== 'clear') return { act: 'water', label: 'Water break', icon: 'water' };
    return { act: 'add', label: '+1 ' + s.last.short, icon: 'glass' };
  }

  function splitLeft(ms, withSeconds) {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (n) => String(n).padStart(2, '0');
    if (withSeconds) return (h ? h + ':' + p(m) : m) + ':' + p(s);
    return h + ':' + p(m);
  }

  /** One step of a damped spring. Apple: stiffness (2π/response)², damping 4π(1 − bounce)/response. */
  function springStep(sp, p, dt) {
    const k = Math.pow(2 * Math.PI / p.response, 2);
    const c = 4 * Math.PI * (1 - p.bounce) / p.response;
    const a = -k * (sp.x - sp.t) - c * sp.v;
    sp.v += a * dt;
    sp.x += sp.v * dt;
  }

  if (typeof document === 'undefined') {
    const api = { geometry, compactWidth, alertFor, primaryAction, splitLeft, springStep, SPRING, CAM_W, CAM_H };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return;
  }

  // ---------------------------------------------------------------------------
  const ICON = {
    over: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.3"/><path d="M4.2 10.6c2.6-.7 5.2-1 7.8-1s5.2.3 7.8 1M12 14.3v5.6"/><path d="M4.5 19.5 19.5 4.5"/></svg>',
    under: '<svg viewBox="0 0 24 24"><path d="M12 4.5v13.5M6.5 12.8 12 18.3l5.5-5.5"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="m5.5 12.6 4.2 4.1 8.8-9.4"/></svg>',
    risk: '<svg viewBox="0 0 24 24"><path d="M12 4.2 20.6 19H3.4z"/><path d="M12 10v4.2M12 16.8v.1"/></svg>',
    danger: '<svg viewBox="0 0 24 24"><path d="M12 3.5 21 19.5H3z"/><path d="M12 9.5v5M12 17.2v.1"/></svg>',
    water: '<svg viewBox="0 0 24 24"><path d="M12 3.8c3.6 4.4 5.9 7.6 5.9 10.6a5.9 5.9 0 0 1-11.8 0c0-3 2.3-6.2 5.9-10.6z"/><path d="M9.4 15a2.7 2.7 0 0 0 2.6 2.4"/></svg>',
    glass: '<svg viewBox="0 0 24 24"><path d="M6.5 4.5h11l-1.3 15h-8.4z"/><path d="M12 9.2v6M9 12.2h6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6.2l-4.3 3.4v-3.4h-.5a2 2 0 0 1-2-2z"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 7h11M8 12h11M8 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></svg>'
  };
  const TONE_HEX = { over: '#FF6B53', impaired: '#F7B24A', clear: '#BACB8D', water: '#8ED0E6', danger: '#FF5A47' };
  const TONE = { over: 'over', under: 'impaired', clear: 'clear', risk: 'over', danger: 'danger', 'water-done': 'water' };

  // Numeric content transition: changed digits roll, nothing else moves.
  function Roller(el) {
    let current = '';
    const shape = (x) => x.replace(/[0-9]/g, '9');
    this.set = (str, reduce) => {
      str = String(str);
      if (str === current) return false;
      const rebuild = !current || shape(str) !== shape(current) || reduce;
      if (rebuild) {
        el.textContent = '';
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
          setTimeout(() => { if (old && old.parentNode) old.remove(); }, 650);
        });
      }
      current = str;
      el.setAttribute('aria-label', str);
      return rebuild;
    };
    function slot(ch) {
      const s = document.createElement('span');
      s.className = /[0-9]/.test(ch) ? 'r-slot' : 'r-ch';
      s.setAttribute('aria-hidden', 'true');
      const i = document.createElement('span');
      i.textContent = ch;
      s.appendChild(i);
      return s;
    }
  }

  // A tiny spring animator: named values with position, velocity and target.
  function Animator(apply) {
    const vals = {};
    let raf = 0, last = 0, instant = false;
    function tick(t) {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60);
      last = t;
      let busy = false;
      const steps = Math.max(1, Math.round(dt / (1 / 240)));
      for (const key in vals) {
        const sp = vals[key];
        if (sp.done) continue;
        for (let i = 0; i < steps; i++) springStep(sp, sp.p, dt / steps);
        if (Math.abs(sp.x - sp.t) < sp.eps && Math.abs(sp.v) < sp.eps * 8) { sp.x = sp.t; sp.v = 0; sp.done = true; }
        else busy = true;
      }
      apply(vals);
      if (busy) raf = requestAnimationFrame(tick); else { raf = 0; last = 0; }
    }
    return {
      set(key, target, p, opts) {
        opts = opts || {};
        let sp = vals[key];
        if (!sp) sp = vals[key] = { x: opts.from != null ? opts.from : target, v: 0, t: target, p, eps: opts.eps || 0.05, done: true };
        if (opts.from != null) sp.x = opts.from;
        if (opts.velocity != null) sp.v = opts.velocity;
        sp.t = target; sp.p = p || sp.p;
        if (instant || opts.instant) { sp.x = target; sp.v = 0; sp.done = true; apply(vals); return; }
        sp.done = false;
        if (!raf) raf = requestAnimationFrame(tick);
      },
      get(key) { return vals[key] ? vals[key].x : 0; },
      vel(key) { return vals[key] ? vals[key].v : 0; },
      settled() { for (const k in vals) if (!vals[k].done) return false; return true; },
      setInstant(v) { instant = v; },
      flush() { apply(vals); }
    };
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function create(opts) {
    const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => mqReduce.matches;

    const rootEl = el('div', 'island-root');
    rootEl.id = 'islandRoot';
    rootEl.hidden = true;
    const island = el('div', 'island');
    island.dataset.view = 'gone';
    rootEl.appendChild(island);
    const live = el('p', 'sr');
    live.setAttribute('aria-live', 'polite');
    rootEl.appendChild(live);

    // Shared elements travel between compact and expanded instead of fading.
    const glass = el('div', 'ish ish-glass');
    glass.setAttribute('aria-hidden', 'true');
    const mugCanvas = document.createElement('canvas');
    glass.appendChild(mugCanvas);
    const mug = root.DryMug ? root.DryMug.Mug(mugCanvas) : null;
    const MW = root.DryMug ? root.DryMug.W : 40, MHEAD = root.DryMug ? root.DryMug.HEAD : 12;
    const trail = el('div', 'ish ish-trail');
    trail.innerHTML = '<span class="roll"></span>';
    island.appendChild(glass);
    island.appendChild(trail);

    // ---- Compact: only a hit target, the shared elements carry the content
    const vC = el('div', 'iv iv-compact', '<span class="ic-mid" aria-hidden="true"></span><button class="ic-hit" type="button" aria-label="Open live status" aria-expanded="false"></button>');
    const midEl = vC.querySelector('.ic-mid');
    island.appendChild(vC);

    // ---- Expanded
    const vE = el('div', 'iv iv-expanded');
    vE.innerHTML =
      '<div class="ix-row1">' +
        '<span class="ix-slot-glass"></span>' +
        '<div class="ix-clear"><p class="ix-k ix-k-clear">Clear by</p><p class="ix-time"><span class="roll" data-roll="clear"></span></p></div>' +
        '<div class="ix-left"><span class="ix-slot-trail"></span><p class="ix-k ix-k-left">to go</p></div>' +
      '</div>' +
      '<div class="ix-row2">' +
        '<p class="ix-status"><i class="ix-dot" aria-hidden="true"></i><span class="ix-status-t"></span></p>' +
        '<button class="ix-act" type="button"><span class="ix-ic" aria-hidden="true"></span><span class="ix-al"></span></button>' +
        '<button class="ix-more" type="button" aria-label="More actions">' + ICON.more + '</button>' +
      '</div>';
    island.appendChild(vE);

    // ---- Quick actions
    const vQ = el('div', 'iv iv-quick', '<div class="iq-row" role="group" aria-label="Quick actions"></div>');
    island.appendChild(vQ);

    // ---- Alert (an expanded presentation with a message)
    const vA = el('div', 'iv iv-alert');
    vA.innerHTML =
      '<span class="ia-icon"><svg class="ia-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20"/></svg><span class="ia-glyph" aria-hidden="true"></span></span>' +
      '<span class="ia-text"><span class="ia-title"></span><span class="ia-sub"></span></span>' +
      '<span class="ia-timer" aria-hidden="true"></span>';
    island.appendChild(vA);

    document.body.appendChild(rootEl);

    const views = { compact: vC, expanded: vE, quick: vQ, alert: vA };
    const rollTrail = new Roller(trail.querySelector('.roll'));
    const rollClear = new Roller(vE.querySelector('[data-roll="clear"]'));

    // ---- State
    let geo = null, view = 'gone', snap = null, prevSnap = null, enabled = true;
    let heroVisible = true, heroTimer = null;
    let alertQ = [], alertTimer = null, alertKind = null, alertStart = 0;
    let waterFiredFor = null, kbd = false, hideTimer = null;

    // ---- Spring-driven layout
    const anim = Animator((v) => {
      const w = v.w ? v.w.x : 0, h = v.h ? v.h.x : 0;
      island.style.width = w.toFixed(2) + 'px';
      island.style.height = Math.max(0, h).toFixed(2) + 'px';
      island.style.borderRadius = Math.max(0, Math.min(v.r ? v.r.x : 0, h / 2, w / 2)).toFixed(2) + 'px';
      island.style.transform = 'translate3d(0,' + (v.y ? v.y.x : 0).toFixed(2) + 'px,0) scale(' + (v.s ? v.s.x : 1).toFixed(4) + ')';
      island.style.opacity = Math.max(0, Math.min(1, v.o ? v.o.x : 1)).toFixed(3);
      const gs = v.gs ? v.gs.x : 1, gx = v.gx ? v.gx.x : 0, gy = v.gy ? v.gy.x : 0;
      glass.style.transform = 'translate3d(' + gx.toFixed(2) + 'px,' + (gy - MHEAD * gs).toFixed(2) + 'px,0)';
      if (mug) {
        mug.setScale(gs);
        // The liquid feels the island move: its on-screen position drives the slosh.
        const sc = v.s ? v.s.x : 1;
        mug.feed((gx - w / 2) * sc, gy * sc + (v.y ? v.y.x : 0), performance.now());
      }
      glass.style.opacity = Math.max(0, Math.min(1, v.go ? v.go.x : 0)).toFixed(3);
      trail.style.transform = 'translate3d(' + (v.tx ? v.tx.x : 0).toFixed(2) + 'px,' + (v.ty ? v.ty.x : 0).toFixed(2) + 'px,0) scale(' + (v.ts ? v.ts.x : 1).toFixed(4) + ')';
      trail.style.opacity = Math.max(0, Math.min(1, v.to ? v.to.x : 0)).toFixed(3);
    });
    const M = SPRING.morph, C = SPRING.content;
    const syncReduce = () => { anim.setInstant(reduce()); if (mug) mug.setReduce(reduce()); };
    syncReduce();
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', syncReduce);

    function measureGeo() {
      const probe = el('div', 'island-probe');
      document.body.appendChild(probe);
      const sat = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      const force = new URLSearchParams(location.search).get('island');
      if (force) { const [m, s] = force.split(':'); return geometry({ sat: s != null ? +s : sat, vw: innerWidth, standalone: m === 'hang' || m === 'fused' }); }
      return geometry({ sat, vw: innerWidth, standalone });
    }
    function layoutGeo() {
      const g = measureGeo();
      const changed = !geo || g.mode !== geo.mode || g.vw !== geo.vw || g.top !== geo.top;
      geo = g;
      rootEl.dataset.mode = geo.mode;
      rootEl.style.setProperty('--itop', geo.top + 'px');
      rootEl.style.setProperty('--camw', geo.camW + 'px');
      rootEl.style.setProperty('--camh', geo.camH + 'px');
      rootEl.style.setProperty('--ear', geo.ear + 'px');
      rootEl.style.setProperty('--expw', geo.expW + 'px');
      vE.style.width = vQ.style.width = vA.style.width = geo.expW + 'px';
      vC.style.width = compactWidth(geo) + 'px';
      if (changed && view !== 'gone') target(view, true);
    }

    // Target sizes and shared element positions for each view.
    const GS_COMPACT = 0.58;     // shared mug: 40x48 body drawn, 23x28 in compact
    const GS_EXPANDED = 1.12;    // and 45x54 in expanded
    const TS_COMPACT = 0.62;     // shared time: 24 px type, 15 px in compact
    function contentHeight(v) {
      const vEl = views[v];
      const h = Math.ceil(vEl.scrollHeight);
      return Math.max(84, Math.min(160, h));
    }
    function target(v, instant, force) {
      // While the drop is falling, nothing else may grow the pill early.
      if (v !== 'gone' && !force && performance.now() < dripUntil) return;
      const o = instant ? { instant: true } : null;
      const cw = compactWidth(geo);
      const th = trail.offsetHeight || 29;
      if (v === 'gone') {
        anim.set('w', geo.camH, M, o); anim.set('h', geo.camH, M, o); anim.set('r', geo.camH / 2, M, o); anim.set('s', 0.6, M, o);
        anim.set('y', 0, M, o); anim.set('o', 0, C, Object.assign({ eps: 0.005 }, o));
        anim.set('go', 0, C, Object.assign({ eps: 0.005 }, o)); anim.set('to', 0, C, Object.assign({ eps: 0.005 }, o));
        return;
      }
      anim.set('o', 1, C, Object.assign({ eps: 0.005 }, o));
      anim.set('y', 0, M, o); anim.set('s', 1, M, o);
      if (v === 'compact') {
        anim.set('w', cw, M, o); anim.set('h', geo.camH, M, o); anim.set('r', geo.camH / 2, M, o);
        // Apple's compact proportions: the mug in the leading region, time to go in the trailing one.
        anim.set('gx', geo.ear - 3 - MW * GS_COMPACT, M, o);
        anim.set('gy', (geo.camH - 48 * GS_COMPACT) / 2 + 0.5, M, o);
        anim.set('gs', GS_COMPACT, M, o); anim.set('go', 1, C, Object.assign({ eps: 0.005 }, o));
        anim.set('tx', geo.ear + geo.camW + 7, M, o);
        anim.set('ty', (geo.camH - th * TS_COMPACT) / 2, M, o);
        anim.set('ts', TS_COMPACT, M, o); anim.set('to', 1, C, Object.assign({ eps: 0.005 }, o));
        return;
      }
      const h = contentHeight(v);
      anim.set('w', geo.expW, M, o); anim.set('h', h, M, o); anim.set('r', 44, M, o);
      if (v === 'expanded') {
        const sg = vE.querySelector('.ix-slot-glass'), st = vE.querySelector('.ix-slot-trail');
        anim.set('gx', sg.offsetLeft, M, o); anim.set('gy', sg.offsetTop, M, o); anim.set('gs', GS_EXPANDED, M, o); anim.set('go', 1, C, Object.assign({ eps: 0.005 }, o));
        anim.set('tx', st.offsetLeft, M, o); anim.set('ty', st.offsetTop, M, o); anim.set('ts', 1, M, o); anim.set('to', 1, C, Object.assign({ eps: 0.005 }, o));
      } else {
        anim.set('go', 0, C, Object.assign({ eps: 0.005 }, o)); anim.set('to', 0, C, Object.assign({ eps: 0.005 }, o));
      }
    }

    function show(v) {
      if (v === view) { if (v !== 'gone') target(v); return; }
      const from = view;
      view = v;
      island.dataset.view = v;
      rootEl.dataset.view = v;
      vC.querySelector('.ic-hit').setAttribute('aria-expanded', String(v === 'expanded' || v === 'quick'));
      const hadFocus = island.contains(document.activeElement);
      Object.keys(views).forEach((k) => { views[k].inert = k !== v; });
      clearTimeout(hideTimer);
      if (v !== 'gone') rootEl.hidden = false;
      if (snap) { renderShared(); if (v === 'expanded') renderExpanded(); }
      if (mug && v === 'expanded' && (from === 'compact' || from === 'alert' || from === 'gone')) mug.swivel();
      document.documentElement.classList.toggle('island-hang', geo.mode === 'hang' && v !== 'gone');
      if (from === 'gone' && v !== 'gone') {
        // Grow out of a small circle, never from a thin line. On island iPhones a drop
        // falls from the real island first and becomes the pill.
        target('gone', true);
        if (geo.drip && !reduce()) {
          playDrip();
          anim.set('o', 0, C, { instant: true });
          clearTimeout(dripTimer);
          dripUntil = performance.now() + 340;
          dripTimer = setTimeout(() => { dripUntil = 0; if (view !== 'gone') { island.classList.add('arriving'); setTimeout(() => island.classList.remove('arriving'), 200); anim.set('o', 1, C, { from: 0.9, eps: 0.005 }); target(view, false, true); } }, 330);
          return;
        }
        anim.set('o', 1, C, { from: 0, eps: 0.005 });
      }
      target(v);
      if (v === 'gone') hideTimer = setTimeout(() => { if (view === 'gone' && anim.settled()) rootEl.hidden = true; else if (view === 'gone') hideTimer = setTimeout(() => { if (view === 'gone') rootEl.hidden = true; }, 600); }, reduce() ? 0 : 650);
      if ((v === 'expanded' || v === 'quick') && kbd) {
        setTimeout(() => { const b = views[v].querySelector('button'); if (b) b.focus({ preventScroll: true }); }, 60);
      } else if (v === 'compact' && hadFocus) {
        vC.querySelector('.ic-hit').focus({ preventScroll: true });
      }
    }

    let dripTimer = null, dripUntil = 0;
    const dripEl = el('span', 'idrip');
    dripEl.setAttribute('aria-hidden', 'true');
    rootEl.insertBefore(dripEl, island);   // the pill covers the drop as it lands
    function playDrip() {
      // From the bottom edge of the hardware island down to the top of our pill.
      const from = (geo.sat - 11.3) - geo.top;
      if (!dripEl.animate) return;
      dripEl.animate([
        { transform: 'translate(-50%,' + (from - 2) + 'px) scale(.9,.25)', opacity: 1, offset: 0 },
        { transform: 'translate(-50%,' + (from + 1) + 'px) scale(.75,1.35)', opacity: 1, offset: 0.38 },
        { transform: 'translate(-50%,' + (from * 0.35) + 'px) scale(.8,1.25)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,2px) scale(1.15,.8)', opacity: 1, offset: 0.92 },
        { transform: 'translate(-50%,4px) scale(1.4,.7)', opacity: 0, offset: 1 }
      ], { duration: 380, easing: 'cubic-bezier(.5,0,.75,.4)' });
    }

    function restingView() {
      if (!enabled || !snap) return 'gone';
      const water = snap.water && snap.water.until && snap.water.until > Date.now();
      if (!snap.has && !water) return 'gone';
      if (geo.mode === 'floating' && heroVisible) return 'gone';
      return 'compact';
    }

    // ---- Rendering
    function toneFor() {
      const now = Date.now();
      if (snap.water && snap.water.until && snap.water.until > now) return 'water';
      return snap.status === 'over' ? 'over' : snap.status === 'impaired' ? 'impaired' : 'clear';
    }
    function renderShared() {
      const now = Date.now();
      const water = snap.water && snap.water.until && snap.water.until > now;
      if (view !== 'alert') island.dataset.tone = toneFor();
      if (mug) {
        mug.setTone(TONE_HEX[toneFor()] || TONE_HEX.impaired);
        mug.setWater(!!water);
        mug.setLevel(root.DryMug.mugLevel(snap, now));
      }
      const txt = water ? splitLeft(snap.water.until - now, true) : (snap.status === 'clear' ? '0:00' : splitLeft(snap.clearAt - now));
      midEl.textContent = water ? 'Water break' : snap.status === 'clear' ? 'All clear' : 'Clear by ' + snap.fmt.clear;
      const rebuilt = rollTrail.set(txt, reduce());
      vE.style.setProperty('--tw', (trail.offsetWidth || 40) + 'px');
      if (rebuilt && (view === 'compact' || view === 'expanded')) target(view);
    }
    function renderExpanded() {
      const now = Date.now();
      const water = snap.water && snap.water.until && snap.water.until > now;
      const st = snap.status;
      vE.querySelector('.ix-k-clear').textContent = st === 'clear' ? 'Clear since' : 'Clear by';
      rollClear.set(snap.fmt.clear, reduce());
      vE.querySelector('.ix-k-left').textContent = water ? 'water break' : st === 'clear' ? 'all done' : 'to go';
      let status;
      if (water) status = 'Have a glass of water';
      else if (st === 'over') status = snap.fmt.bac + ', over the limit until ' + snap.fmt.underAt;
      else if (st === 'impaired') status = snap.fmt.bac + ', under the limit but impaired';
      else status = 'Clear, by this estimate';
      vE.querySelector('.ix-status-t').textContent = status;
      const a = primaryAction(snap, now);
      const b = vE.querySelector('.ix-act');
      b.dataset.act = a.act;
      b.querySelector('.ix-ic').innerHTML = ICON[a.icon];
      b.querySelector('.ix-al').textContent = a.label;
    }
    function renderQuick() {
      const row = vQ.querySelector('.iq-row');
      row.textContent = '';
      const seen = new Set(), list = [];
      if (snap.last) { list.push(snap.last); seen.add(snap.last.key); }
      (snap.favs || []).forEach((f) => { if (!seen.has(f.key) && list.length < 3) { list.push(f); seen.add(f.key); } });
      const now = Date.now();
      const water = snap.water && snap.water.until && snap.water.until > now;
      const tiles = list.map((d) => ({ kind: 'drink', d, n: d.short || d.name, m: d.ml + ' ml, ' + d.abv + '%', icon: 'glass' }));
      tiles.push({ kind: 'water', n: water ? 'End break' : 'Water break', m: water ? splitLeft(snap.water.until - now, true) + ' left' : 'Starts a timer', icon: 'water' });
      tiles.push({ kind: 'text', n: 'Text a friend', m: 'Share your status', icon: 'text' });
      tiles.push({ kind: 'picker', n: 'All drinks', m: 'Open the list', icon: 'list' });
      tiles.forEach((t, i) => {
        const b = el('button', 'iq-tile iq-' + t.kind);
        b.type = 'button';
        b.style.setProperty('--i', i);
        b.innerHTML = '<span class="iq-ic" aria-hidden="true">' + ICON[t.icon] + '</span><span class="iq-n"></span><span class="iq-m"></span>';
        b.querySelector('.iq-n').textContent = t.n;
        b.querySelector('.iq-m').textContent = t.m;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (t.kind === 'drink') { show('expanded'); opts.onAdd(t.d); }
          if (t.kind === 'water') { show('expanded'); opts.onWater(); }
          if (t.kind === 'text') { show('expanded'); opts.onText(); }
          if (t.kind === 'picker') { collapse(); opts.onPicker(); }
        });
        row.appendChild(b);
      });
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

    // ---- Alerts: essential moments only
    function alert(kind, title, sub) {
      if (!enabled || !snap) return;
      if (!title) { const c = copyFor(kind, snap); title = c[0]; sub = c[1]; }
      live.textContent = title + '. ' + (sub || '');
      if (view === 'expanded' || view === 'quick') return;
      alertQ = alertQ.filter((a) => a.kind !== kind);
      alertQ.push({ kind, title, sub });
      if (alertQ.length > 3) alertQ.shift();
      if (view !== 'alert') nextAlert();
    }
    function nextAlert() {
      const a = alertQ.shift();
      if (!a) { alertKind = null; show(restingView()); return; }
      alertKind = a.kind;
      island.dataset.tone = TONE[a.kind] || 'impaired';
      vA.querySelector('.ia-glyph').innerHTML = ICON[a.kind === 'water-done' ? 'water' : a.kind] || ICON.glass;
      vA.querySelector('.ia-title').textContent = a.title;
      vA.querySelector('.ia-sub').textContent = a.sub || '';
      vA.classList.remove('play'); void vA.offsetWidth; vA.classList.add('play');
      if (view === 'alert') target('alert'); else show('alert');
      alertStart = Date.now();
      clearTimeout(alertTimer);
      alertTimer = setTimeout(endAlert, ALERT_MS);
    }
    function endAlert() { clearTimeout(alertTimer); nextAlert(); }

    function expand(which) {
      clearTimeout(alertTimer); alertQ = []; alertKind = null;
      if (which === 'quick') renderQuick();
      show(which || 'expanded');
    }
    function collapse() {
      if (view !== 'expanded' && view !== 'quick' && view !== 'alert') return;
      clearTimeout(alertTimer); alertQ = []; alertKind = null;
      show(restingView());
    }

    // ---- Gestures: follow the finger, hand the speed back on release
    let press = null;
    function track(e) {
      const t = performance.now();
      press.hist.push([t, e.clientY]);
      while (press.hist.length > 2 && t - press.hist[0][0] > 90) press.hist.shift();
    }
    function velocityY(p) {
      const h = p.hist;
      if (h.length < 2) return 0;
      const a = h[0], b = h[h.length - 1];
      return (b[1] - a[1]) / Math.max(1, b[0] - a[0]) * 1000; // px per second
    }
    island.addEventListener('pointerdown', (e) => {
      if (view === 'gone') return;
      kbd = false;
      const onButton = !!e.target.closest('button:not(.ic-hit)');
      const inRow = !!e.target.closest('.iq-row');
      press = { y: e.clientY, x: e.clientX, t: performance.now(), held: false, dy: 0, btn: onButton, row: inRow, hist: [[performance.now(), e.clientY]], h0: anim.get('h') };
      if (!onButton && !inRow) { anim.set('s', 0.965, SPRING.press); if (mug) mug.wobble(); }
      if (view === 'compact' || view === 'alert') {
        press.timer = setTimeout(() => { if (!press) return; press.held = true; anim.set('s', 1, M); expand(); }, 380);
      }
      if (onButton && e.target.closest('.ix-act')) {
        press.timer = setTimeout(() => { if (!press) return; press.held = true; expand('quick'); }, 420);
      }
    });
    island.addEventListener('pointermove', (e) => {
      if (!press) return;
      track(e);
      const dy = e.clientY - press.y, dx = e.clientX - press.x;
      press.dy = dy;
      if ((Math.abs(dy) > 7 || Math.abs(dx) > 7) && !press.moved) { press.moved = true; clearTimeout(press.timer); anim.set('s', 1, SPRING.press); }
      if (press.held || press.btn || press.row) return;
      const open = view === 'expanded' || view === 'quick';
      if (open && dy < 0) {
        anim.set('y', dy * 0.32, SPRING.follow);
        anim.set('h', Math.max(geo.camH, press.h0 + dy * 0.22), SPRING.follow);
      } else if (!open && dy > 0) {
        const pull = Math.min(dy, 70);
        anim.set('y', pull * 0.28, SPRING.follow);
        anim.set('s', 1 + pull * 0.0012, SPRING.follow);
      }
    });
    function release(e) {
      if (!press) return;
      clearTimeout(press.timer);
      const p = press; press = null;
      const vy = velocityY(p);
      const open = view === 'expanded' || view === 'quick';
      if (p.held) return;
      if (e.type === 'pointercancel') { if (view !== 'gone') target(view); return; }
      if (open && !p.btn && !p.row && (p.dy < -36 || vy < -500)) { collapse(); anim.set('y', 0, M, { velocity: vy * 0.3 }); return; }
      if (!open && !p.btn && (p.dy > 24 || vy > 500)) { expand(); return; }
      if (Math.abs(p.dy) < 8 && !p.btn && !p.row) {
        if (view === 'alert' && alertKind === 'danger') { collapse(); opts.onDanger(); return; }
        if (view === 'compact' || view === 'alert') { expand(); return; }
        if (open && !e.target.closest('button')) { collapse(); return; }
      }
      if (view !== 'gone') target(view);
    }
    island.addEventListener('pointerup', release);
    island.addEventListener('pointercancel', release);
    vC.querySelector('.ic-hit').addEventListener('click', (e) => { if (e.detail === 0) { kbd = true; expand(); } });
    vE.querySelector('.ix-act').addEventListener('click', (e) => {
      e.stopPropagation();
      const act = e.currentTarget.dataset.act;
      if (act === 'add') opts.onAddLast();
      if (act === 'water') opts.onWater();
      if (act === 'picker') { collapse(); opts.onPicker(); }
    });
    vE.querySelector('.ix-more').addEventListener('click', (e) => { e.stopPropagation(); kbd = e.detail === 0; expand('quick'); });
    document.addEventListener('pointerdown', (e) => {
      if ((view === 'expanded' || view === 'quick') && !island.contains(e.target)) collapse();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (view === 'quick') { kbd = true; show('expanded'); }
      else if (view === 'expanded' || view === 'alert') { kbd = true; collapse(); }
    });
    addEventListener('resize', layoutGeo);
    addEventListener('orientationchange', () => setTimeout(layoutGeo, 300));

    Object.keys(views).forEach((k) => { views[k].inert = true; });
    layoutGeo();
    target('gone', true);

    // ---- Moments: little animations when something happens
    const chip = el('span', 'ichip');
    chip.setAttribute('aria-hidden', 'true');
    rootEl.appendChild(chip);
    function popChip(text, kind) {
      // Only in compact, where space is scarce; expanded already rolls the new numbers in.
      if (view !== 'compact') return;
      const r = island.getBoundingClientRect();
      const gx = anim.get('gx'), gs = anim.get('gs');
      chip.textContent = text;
      chip.dataset.kind = kind;
      const cx = r.left + gx + MW * gs * 0.42;
      const top = view === 'compact' ? r.bottom + 6 : r.top + anim.get('gy') - 4;
      chip.style.left = cx + 'px';
      chip.style.top = (top - geo.top) + 'px';
      chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop');
    }
    function celebrate(kind, data) {
      data = data || {};
      if (!mug || !enabled || view === 'gone' || view === 'alert') return;
      const calm = root.DryMug.isCalm(snap);
      if (snap) mug.setLevel(root.DryMug.mugLevel(snap, Date.now()));
      mug.moment(kind, calm);
      if (reduce()) { if (data.label) popChip(data.label, kind); return; }
      if (kind === 'pour' && !calm) {
        setTimeout(() => { anim.set('s', 1, M, { velocity: 1.1 }); }, 520);
        if (data.label) setTimeout(() => popChip(data.label, kind), 380);
      }
      if (kind === 'waterOn') {
        setTimeout(() => { anim.set('s', 1, M, { velocity: 0.9 }); }, 900);
        if (data.label) setTimeout(() => popChip(data.label, kind), 700);
      }
      if (kind === 'waterOff' && data.label) setTimeout(() => popChip(data.label, kind), 400);
      if (kind === 'cheers') setTimeout(() => { anim.set('s', 1, M, { velocity: 0.7 }); popChip('Cheers', kind); }, 260);
    }

    const ctrl = {
      update(s) {
        const first = !snap;
        prevSnap = snap; snap = s;
        const now = Date.now();
        if (first && mug) mug.restoreWater(!!(s.water && s.water.until && s.water.until > now));
        if (s.water && s.water.until && now >= s.water.until && waterFiredFor !== s.water.until) {
          waterFiredFor = s.water.until;
          opts.onWaterDone();
          if (mug) mug.moment('waterOff', true);
          alert('water-done');
        }
        const kind = alertFor(prevSnap, snap);
        if (kind) alert(kind);
        renderShared();
        if (view === 'expanded') { renderExpanded(); target('expanded'); }
        if (view === 'quick') renderQuickLive();
        if (view === 'compact' || view === 'gone') {
          const want = restingView();
          if (want !== view) show(want);
        }
      },
      alert,
      celebrate,
      expand, collapse,
      setHeroVisible(v) {
        // A short buffer so scrolling past the countdown never makes it flicker.
        clearTimeout(heroTimer);
        heroTimer = setTimeout(() => {
          heroVisible = v;
          if (view === 'compact' || view === 'gone') show(restingView());
        }, v ? 120 : 180);
      },
      setEnabled(v) {
        enabled = v;
        if (!v) document.documentElement.classList.remove('island-hang');
        if (!v) { clearTimeout(alertTimer); alertQ = []; show('gone'); } else if (snap) show(restingView());
      },
      get view() { return view; },
      get mode() { return geo.mode; },
      relayout: layoutGeo
    };
    function renderQuickLive() {
      const w = vQ.querySelector('.iq-water .iq-m');
      if (w && snap.water && snap.water.until && snap.water.until > Date.now()) w.textContent = splitLeft(snap.water.until - Date.now(), true) + ' left';
    }
    root.DryIsland.current = ctrl;
    return ctrl;
  }

  root.DryIsland = { geometry, compactWidth, alertFor, primaryAction, splitLeft, springStep, SPRING, create };
})(typeof self !== 'undefined' ? self : this);

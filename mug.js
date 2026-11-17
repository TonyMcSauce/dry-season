/* Dry Season mug.
 * A small 2.5D beer mug drawn live on canvas: shaded glass with an oval rim, a
 * handle that swivels round the body, liquid with a tilting surface and foam head.
 * The liquid sloshes with pendulum physics driven by how the mug actually moves.
 * Moments (pour, water on, water off, cheers) each finish in under 2 seconds and
 * the render loop stops completely when nothing is moving.
 * Pure helpers (mugLevel, isCalm, MOMENT_MS) are exported for the node tests.
 */
(function (root) {
  'use strict';

  const MOMENT_MS = { pour: 1500, waterOn: 1800, waterOff: 1300, cheers: 1100, wobble: 900 };
  const FULL_MS = 10 * 3600e3;          // a full mug is 10 hours or more left to clear

  /** Fill level, 0 to 1: alcohol left to clear, or water break time left. */
  function mugLevel(s, now) {
    if (!s) return 0;
    if (s.water && s.water.until && s.water.until > now) {
      const dur = s.water.dur || 20 * 60000;
      return Math.max(0.12, Math.min(1, (s.water.until - now) / dur));
    }
    if (!s.has || s.status === 'clear') return 0;
    return Math.max(0.06, Math.min(1, (s.clearAt - now) / FULL_MS));
  }
  /** No celebrating when it isn't a good moment to drink more. */
  function isCalm(s) { return !!s && (s.status === 'over' || s.risk === 'raised' || s.risk === 'high'); }

  if (typeof document === 'undefined') {
    const api = { mugLevel, isCalm, MOMENT_MS, FULL_MS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return;
  }

  // ---------------------------------------------------------------------------
  const W = 40, H = 60, HEAD = 12;      // logical canvas; the mug body starts HEAD below the top
  const CX = 17, TOP = 15, BOT = 57, RXT = 12.6, RXB = 11, RY = 2.7;
  const AMBER_T = [255, 199, 90], AMBER_B = [196, 104, 28];
  const WATER_T = [190, 232, 246], WATER_B = [120, 196, 224];
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t, a) => 'rgba(' + Math.round(lerp(c1[0], c2[0], t)) + ',' + Math.round(lerp(c1[1], c2[1], t)) + ',' + Math.round(lerp(c1[2], c2[2], t)) + ',' + (a == null ? 1 : a) + ')';
  const rnd = (a, b) => a + Math.random() * (b - a);

  function spring(x, response, bounce) { return { x, v: 0, t: x, r: response, b: bounce }; }
  function stepS(s, dt) {
    const k = Math.pow(2 * Math.PI / s.r, 2), c = 4 * Math.PI * (1 - s.b) / s.r;
    s.v += (-k * (s.x - s.t) - c * s.v) * dt;
    s.x += s.v * dt;
  }
  const still = (s, e) => Math.abs(s.x - s.t) < e && Math.abs(s.v) < e * 6;

  function Mug(canvas) {
    const ctx = canvas.getContext('2d');
    let scale = 1, dpr = Math.min(3, window.devicePixelRatio || 1);
    let raf = 0, last = 0, reduce = false, tone = '#F7B24A';
    const S = {
      level: spring(0, 0.7, 0.12),
      water: spring(0, 0.6, 0),
      foam: spring(0.35, 0.5, 0.25),
      phi: spring(Math.PI / 2, 0.75, 0.32),     // handle angle round the body; π/2 = side profile
      squash: spring(1, 0.36, 0.45),
      tilt: spring(0, 0.42, 0.3),
      slosh: { x: 0, v: 0 }                      // pendulum, radians
    };
    const parts = [];          // bubbles, drops, sparkles
    const ice = [];
    let stream = null, ring = null, drop = null, levelHold = 0;
    const motion = { x: null, y: null, vx: 0, vy: 0, t: 0 };

    function resize(s) {
      const want = Math.max(0.2, s);
      const pw = Math.round(W * want * dpr), ph = Math.round(H * want * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw; canvas.height = ph;
        canvas.style.width = (W * want) + 'px'; canvas.style.height = (H * want) + 'px';
      }
      scale = want;
      draw();
    }

    function wake() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }
    function busy() {
      if (parts.length || stream || ring || drop || levelHold) return true;
      if (Math.abs(S.slosh.x) > 0.002 || Math.abs(S.slosh.v) > 0.01) return true;
      if (ice.some((c) => !c.rest)) return true;
      return !(still(S.level, 0.002) && still(S.water, 0.002) && still(S.foam, 0.003) && still(S.phi, 0.002) && still(S.squash, 0.002) && still(S.tilt, 0.002));
    }
    function loop(t) {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60);
      last = t;
      const n = Math.max(1, Math.round(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n; i++) {
        for (const k of ['level', 'water', 'foam', 'phi', 'squash', 'tilt']) stepS(S[k], h);
        // Slosh: a lightly damped pendulum, ~0.6 s per rock
        const w = 2 * Math.PI / 0.62, z = 0.22;   // settles in about 1.5 s
        S.slosh.v += (-w * w * S.slosh.x - 2 * z * w * S.slosh.v) * h;
        S.slosh.x += S.slosh.v * h;
        S.slosh.x = Math.max(-0.5, Math.min(0.5, S.slosh.x));
      }
      if (levelHold && t > levelHold) levelHold = 0;
      stepParticles(dt);
      draw();
      if (busy()) raf = requestAnimationFrame(loop); else { raf = 0; last = 0; }
    }

    // ---- Physics helpers
    const surfaceY = () => lerp(BOT - 6, TOP + 6, Math.max(0, Math.min(1, S.level.x)));
    const halfAt = (y) => lerp(RXT - 1.6, RXB - 1.6, (y - TOP) / (BOT - TOP));
    function liquidY(x) { return surfaceY() + Math.tan(S.slosh.x) * (x - CX); }

    function stepParticles(dt) {
      const sy = surfaceY();
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.kind === 'bubble') {
          p.y -= p.sp * dt; p.x += Math.sin(p.age * 9 + p.ph) * 0.12;
          if (p.y < liquidY(p.x) + 1 || p.age > p.life) parts.splice(i, 1);
        } else if (p.kind === 'drop') {
          p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.age > p.life || p.y > H + 4) parts.splice(i, 1);
        } else if (p.kind === 'spark') {
          if (p.age > p.life) parts.splice(i, 1);
        }
      }
      if (stream) {
        stream.t += dt;
        if (stream.t > stream.dur) stream = null;
        else if (stream.t > 0.12 && stream.t < stream.dur - 0.12 && Math.random() < 0.6) {
          parts.push({ kind: 'drop', x: CX - 1 + rnd(-2, 2), y: sy - 1, vx: rnd(-26, 26), vy: rnd(-70, -30), age: 0, life: 0.45, r: rnd(0.6, 1.1), c: 'beer' });
          parts.push({ kind: 'bubble', x: CX + rnd(-6, 6), y: BOT - 5, sp: rnd(22, 36), age: 0, life: 1.4, ph: rnd(0, 6), r: rnd(0.5, 1.1) });
        }
      }
      if (ring) { ring.t += dt; if (ring.t > ring.dur) ring = null; }
      if (drop) {
        drop.vy += 300 * dt; drop.y += drop.vy * dt;
        if (drop.y >= sy - 1) {
          ring = { t: 0, dur: 0.7, y: sy };
          for (let k = 0; k < 7; k++) parts.push({ kind: 'drop', x: CX + rnd(-1, 1), y: sy - 1, vx: rnd(-34, 34), vy: rnd(-95, -50), age: 0, life: 0.5, r: rnd(0.6, 1), c: 'water' });
          S.slosh.v += rnd(-1.2, 1.2);
          drop = null;
        }
      }
      for (const c of ice) {
        if (c.rest) continue;
        c.age += dt;
        if (c.age < c.delay) continue;
        if (!c.inWater) {
          c.vy += 320 * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
          if (c.y >= liquidY(c.x) - 2) {
            c.inWater = true; c.vy *= 0.25;
            ring = { t: 0, dur: 0.6, y: surfaceY() };
            for (let k = 0; k < 5; k++) parts.push({ kind: 'drop', x: c.x, y: c.y, vx: rnd(-30, 30), vy: rnd(-80, -40), age: 0, life: 0.45, r: rnd(0.5, 0.9), c: 'water' });
            S.slosh.v += (c.x < CX ? -1 : 1) * 1.4;
          }
        } else {
          const target = liquidY(c.x) - 1.5;
          c.vy += (-(c.y - target) * 120 - c.vy * 9) * dt;
          c.y += c.vy * dt; c.rot += (c.rest0 - c.rot) * Math.min(1, dt * 4);
          if (c.melt) { c.size -= dt * 9; if (c.size <= 0) c.gone = true; }
          if (Math.abs(c.vy) < 0.3 && Math.abs(c.y - target) < 0.2 && !c.melt) c.rest = true;
        }
      }
      for (let i = ice.length - 1; i >= 0; i--) if (ice[i].gone) ice.splice(i, 1);
    }

    // ---- Drawing
    function bodyPath(inset) {
      const d = inset || 0;
      ctx.beginPath();
      ctx.moveTo(CX - RXT + d, TOP);
      ctx.lineTo(CX - RXB + d, BOT - 3);
      ctx.ellipse(CX, BOT - 3, RXB - d, RY - d * 0.4, 0, Math.PI, 0, true);
      ctx.lineTo(CX + RXT - d, TOP);
      ctx.ellipse(CX, TOP, RXT - d, RY - d * 0.3, 0, 0, Math.PI, true);
      ctx.closePath();
    }
    function handle(front) {
      const phi = S.phi.x, sn = Math.sin(phi), cs = Math.cos(phi);
      if ((cs >= -0.08) !== front) return;
      const ax = CX + (RXT - 0.6) * sn, reach = 10.5 * sn;
      ctx.save();
      ctx.globalAlpha = front ? 1 : 0.45;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax - sn * 0.6, TOP + 8);
      ctx.bezierCurveTo(ax + reach, TOP + 6, ax + reach, BOT - 15, ax - sn * 1.2, BOT - 12);
      ctx.strokeStyle = 'rgba(246,237,218,.58)';
      ctx.lineWidth = 4.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax + reach * 0.35, TOP + 8.5);
      ctx.bezierCurveTo(ax + reach * 0.85, TOP + 9, ax + reach * 0.9, TOP + 15, ax + reach * 0.85, TOP + 18);
      ctx.stroke();
      ctx.restore();
    }
    function star(x, y, r, a, col) {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill(); ctx.restore();
    }
    function draw() {
      const k = dpr * scale;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const lw = (base) => base / Math.max(scale, 0.45) * (scale < 0.8 ? 0.8 : 1);
      const m = Math.max(0, Math.min(1, S.water.x));
      // Squash and stretch, and the cheers tilt, around the base of the mug
      ctx.translate(CX, BOT);
      ctx.rotate(S.tilt.x);
      const sq = S.squash.x;
      ctx.scale(1 / Math.sqrt(Math.max(0.6, sq)), sq);
      ctx.translate(-CX, -BOT);

      // Stream falls in from above (drawn first so it disappears into the liquid)
      const sy = surfaceY();
      if (stream) {
        const p = stream.t / stream.dur;
        const head = Math.min(1, stream.t / 0.14), tail = Math.max(0, (stream.t - (stream.dur - 0.16)) / 0.16);
        const y0 = lerp(-2, sy, tail), y1 = lerp(-2, sy, head);
        const g = ctx.createLinearGradient(CX - 3, 0, CX + 1, 0);
        g.addColorStop(0, '#C7701F'); g.addColorStop(0.5, '#FFC75A'); g.addColorStop(1, '#E8962C');
        ctx.fillStyle = g;
        const wv = 3.6 + Math.sin(p * 40) * 0.3;
        ctx.beginPath();
        ctx.moveTo(CX - 1 - wv / 2, y0); ctx.lineTo(CX - 1 + wv / 2, y0);
        ctx.lineTo(CX - 1 + wv * 0.42, y1); ctx.lineTo(CX - 1 - wv * 0.42, y1);
        ctx.closePath(); ctx.fill();
      }
      if (drop) {
        ctx.fillStyle = 'rgba(190,232,246,.95)';
        ctx.beginPath();
        ctx.moveTo(CX, drop.y - 4.2);
        ctx.quadraticCurveTo(CX + 2.4, drop.y - 0.6, CX, drop.y + 1.4);
        ctx.quadraticCurveTo(CX - 2.4, drop.y - 0.6, CX, drop.y - 4.2);
        ctx.fill();
      }

      handle(false);

      // Glass body behind the liquid
      bodyPath(0);
      const gb = ctx.createLinearGradient(CX - RXT, 0, CX + RXT, 0);
      gb.addColorStop(0, 'rgba(255,255,255,.16)'); gb.addColorStop(0.35, 'rgba(255,255,255,.05)'); gb.addColorStop(1, 'rgba(255,255,255,.12)');
      ctx.fillStyle = gb; ctx.fill();

      // Liquid
      ctx.save();
      bodyPath(1.5);
      ctx.clip();
      const yl = liquidY(0), yr = liquidY(W);
      ctx.beginPath(); ctx.moveTo(0, yl); ctx.lineTo(W, yr); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      const gl = ctx.createLinearGradient(0, sy, 0, BOT);
      gl.addColorStop(0, mix(AMBER_T, WATER_T, m, lerp(1, 0.75, m)));
      gl.addColorStop(1, mix(AMBER_B, WATER_B, m, lerp(1, 0.82, m)));
      ctx.fillStyle = gl; ctx.fill();
      // Cylinder shading: darker at the edges
      const gs = ctx.createLinearGradient(CX - RXT, 0, CX + RXT, 0);
      gs.addColorStop(0, 'rgba(60,20,0,.32)'); gs.addColorStop(0.3, 'rgba(0,0,0,0)'); gs.addColorStop(0.75, 'rgba(0,0,0,0)'); gs.addColorStop(1, 'rgba(60,20,0,.28)');
      ctx.fillStyle = gs; ctx.fillRect(0, 0, W, H);
      // Bubbles
      for (const p of parts) if (p.kind === 'bubble') {
        ctx.fillStyle = m > 0.5 ? 'rgba(255,255,255,.75)' : 'rgba(255,236,190,.85)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      // Ice
      for (const c of ice) {
        if (c.age < c.delay) continue;
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
        const sz = Math.max(0, c.size);
        ctx.fillStyle = 'rgba(240,252,255,.72)';
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = lw(0.7);
        ctx.beginPath(); ctx.roundRect(-sz / 2, -sz / 2, sz, sz, 1.6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(-sz / 2 + 1.2, -sz / 2 + 1.2, sz * 0.28, sz * 0.18);
        ctx.restore();
      }
      // Surface and foam, tilted with the slosh
      const hw = halfAt(sy);
      ctx.save();
      ctx.translate(CX, sy); ctx.rotate(S.slosh.x);
      ctx.fillStyle = mix([255, 214, 128], [225, 247, 255], m, 0.95);
      ctx.beginPath(); ctx.ellipse(0, 0, hw, 2.1, 0, 0, Math.PI * 2); ctx.fill();
      const f = Math.max(0, S.foam.x) * (1 - m);
      if (f > 0.02 && S.level.x > 0.02) {
        const th = 1.2 + f * 3.4, bump = 1.7 + f * 1.3;
        ctx.fillStyle = 'rgba(250,244,230,.98)';
        ctx.beginPath();
        ctx.rect(-hw - 2, -th, hw * 2 + 4, th + 1.2);
        ctx.fill();
        for (let x = -hw + bump * 0.6; x <= hw; x += bump * 1.25) {
          ctx.beginPath(); ctx.arc(x, -th, bump, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(220,200,165,.55)';
        for (let x = -hw + 3; x < hw - 1; x += 4.3) { ctx.beginPath(); ctx.arc(x, -th * 0.35, 0.55, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
      // Ripple ring
      if (ring) {
        const p = ring.t / ring.dur;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - p)).toFixed(3) + ')';
        ctx.lineWidth = lw(0.9);
        ctx.beginPath(); ctx.ellipse(CX, sy, 1.5 + hw * p, 0.6 + 1.8 * p, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();

      // Foam spilling over the rim when it swells
      const over = Math.max(0, S.foam.x - 0.92) * (1 - m);
      if (over > 0 && sy < TOP + 9) {
        ctx.fillStyle = 'rgba(250,244,230,.98)';
        for (let i = 0; i < 4; i++) {
          const x = CX - RXT + 3 + i * 6.5;
          ctx.beginPath(); ctx.arc(x, TOP - 1.2 - over * 6, 2.2 + over * 6, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Glass details on top: base, rim, highlights, outline in the status colour
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.beginPath(); ctx.ellipse(CX, BOT - 3, RXB - 1, RY - 0.6, 0, 0, Math.PI * 2); ctx.fill();
      const shift = -Math.cos(S.phi.x) * 2.2;
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.roundRect(CX - RXT + 3.2 + shift, TOP + 5, 2.1, BOT - TOP - 13, 1.2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.roundRect(CX + RXT - 4.6 + shift * 0.5, TOP + 7, 1.3, BOT - TOP - 20, 0.8); ctx.fill();
      bodyPath(0);
      ctx.strokeStyle = tone; ctx.lineWidth = lw(1.6); ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = lw(0.8);
      ctx.beginPath(); ctx.ellipse(CX, TOP, RXT, RY, 0, 0, Math.PI); ctx.stroke();

      handle(true);

      // Droplets and sparkles fly free of the glass
      for (const p of parts) {
        if (p.kind === 'drop') {
          const a = Math.max(0, 1 - p.age / p.life);
          ctx.fillStyle = p.c === 'water' ? 'rgba(200,238,250,' + a + ')' : 'rgba(255,214,140,' + a + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        } else if (p.kind === 'spark') {
          const u = p.age / p.life, a = Math.sin(Math.PI * Math.min(1, u));
          star(p.x, p.y, p.r * (0.4 + 0.6 * a), a, p.col);
        }
      }
    }

    function sparkle(n, col, spread) {
      for (let i = 0; i < n; i++) {
        const ang = rnd(-Math.PI, 0.2), d = rnd(spread * 0.7, spread);
        parts.push({ kind: 'spark', x: CX + Math.cos(ang) * d, y: TOP + 10 + Math.sin(ang) * d * 0.8, r: rnd(2.2, 3.6), age: -i * 0.06, life: 0.75, col });
      }
    }

    return {
      canvas,
      setScale(s) { if (Math.abs(s - scale) > 0.002) resize(s); },
      setTone(hex) { if (hex !== tone) { tone = hex; if (!raf) draw(); } },
      setReduce(v) { reduce = v; },
      setLevel(l) {
        if (levelHold) { S.level.pending = l; return; }
        if (Math.abs(S.level.t - l) < 0.0005) return;
        S.level.t = l;
        if (reduce) { S.level.x = l; S.level.v = 0; draw(); return; }
        wake();
      },
      setWater(on) {
        const t = on ? 1 : 0;
        if (S.water.t === t) return;
        S.water.t = t;
        if (reduce) { S.water.x = t; draw(); return; }
        wake();
      },
      /** Movement of the mug on screen, in px; drives the slosh. */
      feed(x, y, now) {
        if (reduce) return;
        if (motion.x != null) {
          const dt = Math.max(0.008, (now - motion.t) / 1000);
          const vx = (x - motion.x) / dt, vy = (y - motion.y) / dt;
          const ax = (vx - motion.vx) / dt;
          if (Math.abs(ax) > 40) { S.slosh.v -= ax * 0.0003 * dt * 60; wake(); }
          motion.vx = vx; motion.vy = vy;
        }
        motion.x = x; motion.y = y; motion.t = now;
      },
      swivel() {
        if (reduce) return;
        S.phi.x = Math.PI * 0.86; S.phi.v = 0; S.phi.t = Math.PI / 2;
        wake();
      },
      wobble() {
        if (reduce) return;
        S.slosh.v += rnd(-1, 1) > 0 ? 1.6 : -1.6;
        S.squash.v -= 1.4;
        wake();
      },
      moment(kind, calm) {
        if (reduce) { draw(); return; }
        const now = performance.now();
        if (kind === 'pour') {
          stream = { t: 0, dur: 0.85 };
          levelHold = now + 140;
          setTimeout(() => { levelHold = 0; if (S.level.pending != null) { S.level.t = S.level.pending; S.level.pending = null; } S.level.v += 0.25; wake(); }, 140);
          S.foam.t = 0.35; S.foam.v += calm ? 1.4 : 3.6;
          S.slosh.v += rnd(-0.8, 0.8);
          for (let i = 0; i < (calm ? 4 : 9); i++) parts.push({ kind: 'bubble', x: CX + rnd(-7, 7), y: BOT - 5 - rnd(0, 8), sp: rnd(20, 40), age: -i * 0.07, life: 1.5, ph: rnd(0, 6), r: rnd(0.5, 1.2) });
          if (!calm) setTimeout(() => { S.squash.v -= 2.6; S.tilt.v += rnd(-1, 1) * 0.8; wake(); }, 520);
        } else if (kind === 'waterOn') {
          drop = { y: -4, vy: 40 };
          setTimeout(() => { S.water.t = 1; S.foam.t = 0; wake(); }, 260);
          ice.length = 0;
          ice.push({ x: CX - 4.5, y: -8, vy: 0, vr: 3, rot: 0.3, rest0: 0.2, size: 6.2, age: 0, delay: 0.55, inWater: false, rest: false });
          ice.push({ x: CX + 4.5, y: -8, vy: 0, vr: -2.4, rot: -0.4, rest0: -0.25, size: 5.4, age: 0, delay: 0.82, inWater: false, rest: false });
          setTimeout(() => { sparkle(4, '#DFF6FF', 15); wake(); }, 1050);
        } else if (kind === 'waterOff') {
          for (const c of ice) { c.melt = true; c.rest = false; }
          setTimeout(() => { S.water.t = 0; S.foam.t = 0.35; wake(); }, 350);
          setTimeout(() => { sparkle(3, '#FFE7B0', 14); wake(); }, 700);
        } else if (kind === 'cheers') {
          S.tilt.v -= 3.2; S.slosh.v += 2.4;
          setTimeout(() => {
            S.tilt.v += 2.2;
            for (let i = 0; i < 7; i++) parts.push({ kind: 'drop', x: CX + RXT - 2, y: TOP + 1, vx: rnd(10, 60), vy: rnd(-110, -55), age: 0, life: 0.55, r: rnd(0.7, 1.2), c: 'beer' });
            sparkle(3, '#FFE7B0', 16);
            wake();
          }, 260);
        }
        wake();
      },
      /** Keep ice floating if water is already on when the page opens. */
      restoreWater(on) {
        if (on && !ice.length) {
          ice.push({ x: CX - 4.5, y: 30, vy: 0, vr: 0, rot: 0.2, rest0: 0.2, size: 6.2, age: 1, delay: 0, inWater: true, rest: false });
          ice.push({ x: CX + 4.5, y: 30, vy: 0, vr: 0, rot: -0.25, rest0: -0.25, size: 5.4, age: 1, delay: 0, inWater: true, rest: false });
          S.water.x = S.water.t = 1; S.foam.x = S.foam.t = 0;
          wake();
        }
      },
      draw,
      get busy() { return !!raf; }
    };
  }

  root.DryMug = { Mug, mugLevel, isCalm, MOMENT_MS, W, H, HEAD };
})(typeof self !== 'undefined' ? self : this);

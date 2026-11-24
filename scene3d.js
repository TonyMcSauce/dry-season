/* Dry Season 3D hero: a cold bottle, a refracting glass and your night as the
 * landscape behind them, drawn with three.js (vendor/three.min.js).
 * Pure helpers (glassLevel, palette, frame) work in Node for tests; create()
 * needs a browser with WebGL and returns null without one, so the page keeps
 * its flat glass. The scene draws only while something moves.
 * Browser: window.DryScene. Node: module.exports.
 */
(function (root) {
  'use strict';

  const FULL = 0.86;                  // a full glass leaves room for the foam

  /** How full the glass is: nearly full as the night starts, empty once you are clear. */
  function glassLevel(start, clear, now) {
    if (!(clear > start) || now >= clear) return 0;
    return FULL * Math.max(0, Math.min(1, (clear - now) / (clear - start)));
  }

  const hex = (h) => { const s = String(h).trim().replace('#', ''); const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0); };
  const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };

  /** Scene colours from the app's CSS tokens, so the 3D hero matches both themes. */
  function palette(t) {
    const norm = (h) => toHex(hex(h));
    return {
      sky: [t.skyTop, t.skyMid, t.skyLow, t.horizon].map(norm),
      ground: norm(t.ground),
      hills: [mix(t.horizon, t.ink, 0.25), mix(t.horizon, t.ink, 0.5), mix(t.horizon, t.ink, 0.75)],
      acacia: mix(t.ink, t.ground, 0.08),
      bacHill: mix(t.horizon, t.ink, 0.62),
      ridge: norm(t.amber),
      stars: String(t.stars).trim() === '1'
    };
  }

  /**
   * Camera distance and aim so objects from the ground (y = 0) up to objectTop
   * fill the strip from `top` to `base` pixels of a view `height` pixels tall.
   */
  function frame(o) {
    const t = Math.tan((o.fov || 34) * Math.PI / 360);
    const span = Math.max(40, o.base - o.top);
    const dist = o.objectTop * o.height / (2 * t * span);
    const lookY = (o.base / o.height - 0.5) * 2 * dist * t;
    return { dist, lookY };
  }

  // ------------------------------------------------------------------ the scene
  function create(canvas, host, opts) {
    const THREE = root.THREE;
    if (!THREE || !canvas) return null;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: (root.devicePixelRatio || 1) < 2, alpha: false, powerPreference: 'low-power' }); }
    catch (e) { return null; }
    if (!renderer.getContext()) return null;
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const reduce = () => !!(opts.reduceMotion && opts.reduceMotion());
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    const LOOK = new THREE.Vector3(0.5, 1.2, 0);
    let pal = palette(opts.tokens());
    let dirty = true;

    function canvasTex(w, h, draw) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      if (draw) draw(c.getContext('2d'), w, h);
      const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding; tx.anisotropy = 4;
      return tx;
    }
    function radial(stops) {
      return canvasTex(256, 256, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      });
    }

    // Backdrop: sky, sun, stars, three ranges of hills, an acacia, the ground
    const skyTex = canvasTex(8, 512);
    function paintSky() {
      const g = skyTex.image.getContext('2d'), h = skyTex.image.height;
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, mix(pal.sky[0], '#000000', 0.25)); gr.addColorStop(0.35, pal.sky[0]); gr.addColorStop(0.62, pal.sky[1]);
      gr.addColorStop(0.82, pal.sky[2]); gr.addColorStop(1, pal.sky[3]);
      g.fillStyle = gr; g.fillRect(0, 0, 8, h); skyTex.needsUpdate = true;
    }
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), new THREE.MeshBasicMaterial({ map: skyTex, depthWrite: false, toneMapped: false }));
    sky.position.set(0, 18, -50); scene.add(sky);

    const sunMat = new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,236,190,1)'], [0.18, 'rgba(255,200,120,.95)'], [0.45, 'rgba(242,140,60,.35)'], [1, 'rgba(242,120,40,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sun = new THREE.Sprite(sunMat); sun.position.set(3.2, -0.4, -36); sun.scale.set(11, 11, 1); scene.add(sun);

    const sp = [];
    for (let i = 0; i < 260; i++) sp.push((Math.random() - 0.5) * 130, 14 + Math.random() * 34, -48);
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.75, depthWrite: false }));
    scene.add(stars);

    const hillMats = [];
    function hills(z, amp, base, seed, width) {
      const s = new THREE.Shape(); const W = width;
      s.moveTo(-W, -6);
      for (let i = 0; i <= 60; i++) {
        const x = -W + (2 * W) * i / 60;
        s.lineTo(x, base + amp * (0.55 * Math.sin(x * 0.18 + seed) + 0.3 * Math.sin(x * 0.47 + seed * 2.1) + 0.15 * Math.sin(x * 1.1 + seed * 3)));
      }
      s.lineTo(W, -6); s.lineTo(-W, -6);
      const mat = new THREE.MeshBasicMaterial({ toneMapped: false }); hillMats.push(mat);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat); m.position.z = z; scene.add(m);
    }
    hills(-34, 1.6, 0.6, 1.3, 75); hills(-22, 1.2, 0.2, 4.1, 55); hills(-12, 0.7, -0.15, 7.7, 34);

    const acaciaMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const acacia = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.5, 6), acaciaMat); trunk.position.y = 0.75; acacia.add(trunk);
    [-0.35, 0.3].forEach((x) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.8, 5), acaciaMat); b.position.set(x / 2, 1.1, 0); b.rotation.z = -x * 1.6; acacia.add(b); });
    [[0, 1.62, 1.5, 0.22], [-0.7, 1.5, 0.9, 0.18], [0.7, 1.55, 0.95, 0.18], [0.1, 1.78, 0.9, 0.15]].forEach(([x, y, rx, ry]) => {
      const c = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8), acaciaMat); c.scale.set(rx, ry, 0.3); c.position.set(x, y, 0); acacia.add(c);
    });
    acacia.position.set(-3.6, -0.25, -9); acacia.scale.setScalar(1.2); scene.add(acacia);

    // The ground is exactly the page ground up close, so the hero meets the page without a seam,
    // and warms toward the horizon like land in the last light.
    const groundTex = canvasTex(4, 256);
    // A plain vertical gradient: no mipmaps or anisotropy, which sample it badly at this grazing angle
    groundTex.anisotropy = 1; groundTex.generateMipmaps = false; groundTex.minFilter = THREE.LinearFilter;
    const groundMat = new THREE.MeshBasicMaterial({ map: groundTex, toneMapped: false });
    function paintGround() {
      // Canvas top is the far edge. Exact page ground up close, warming toward the horizon.
      const g = groundTex.image.getContext('2d'), h = groundTex.image.height;
      const gr = g.createLinearGradient(0, 0, 0, h);
      // The visible ground runs from about 0.2 (behind the far hill) to 0.55 (the hero's bottom edge).
      gr.addColorStop(0, mix(pal.sky[3], pal.ground, 0.15)); gr.addColorStop(0.2, mix(pal.sky[3], pal.ground, 0.3));
      gr.addColorStop(0.32, mix(pal.sky[2], pal.ground, 0.25)); gr.addColorStop(0.42, mix(pal.sky[2], pal.ground, 0.5));
      gr.addColorStop(0.5, mix(pal.sky[2], pal.ground, 0.8)); gr.addColorStop(0.55, pal.ground); gr.addColorStop(1, pal.ground);
      g.fillStyle = gr; g.fillRect(0, 0, 4, h); groundTex.needsUpdate = true;
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.z = 0; scene.add(ground);

    // Your night as the nearest range of hills
    const bacTex = canvasTex(1024, 320);
    const bacPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bacTex, transparent: true, depthWrite: false, toneMapped: false }));
    const BAC_PAD = Math.round((1024 - 1024 / 1.35) / 2);   // the plane is wider than the view so it can slide; draw the night in the visible middle
    // Hidden until there is a night to draw: an unpainted texture renders as solid black
    bacPlane.position.z = -5; bacPlane.visible = false; scene.add(bacPlane);
    let bacKey = '', bacGeom = null;

    // Lights and the sunset as the environment the glass reflects
    scene.add(new THREE.HemisphereLight(0xffc98a, 0x1a120c, 0.55));
    const rim = new THREE.DirectionalLight(0xffb066, 2.2); rim.position.set(3, 2.2, -6); scene.add(rim);
    const key = new THREE.DirectionalLight(0xfff1dc, 0.9); key.position.set(-3, 4, 5); scene.add(key);
    const fillLight = new THREE.PointLight(0xff9a3c, 0.8, 8); fillLight.position.set(1.5, 0.8, 1.5); scene.add(fillLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    function buildEnv() {
      const env = new THREE.Scene();
      env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); s.position.set(6, 0.5, -7); env.add(s);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.5), new THREE.MeshBasicMaterial({ color: 0xfff4e4, side: THREE.DoubleSide })); win.position.set(-6, 4, 4); win.lookAt(0, 0, 0); env.add(win);
      if (scene.environment) scene.environment.dispose();
      scene.environment = pmrem.fromScene(env, 0.02).texture;
    }

    // The glass: one profile spun round, outer wall up, over the lip, inner wall down
    const GX = 1.05, GZ = 0.25, GH = 1.7, RB = 0.34, RT = 0.47, WALL = 0.03, BASE = 0.12;
    const rIn = (y) => RB - WALL + (RT - RB) * (y / GH);
    const glassPts = [[0, 0], [RB - 0.02, 0], [RB, 0.03], [RT, GH], [RT - 0.012, GH + 0.012], [RT - WALL, GH], [rIn(BASE), BASE], [0, BASE]].map(([x, y]) => new THREE.Vector2(x, y));
    const glassGroup = new THREE.Group(); glassGroup.position.set(GX, 0, GZ); scene.add(glassGroup);
    glassGroup.add(new THREE.Mesh(new THREE.LatheGeometry(glassPts, 72), new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.03, transmission: 1, thickness: 0.18, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.05
    })));
    const beerMat = new THREE.MeshStandardMaterial({ color: 0xf0a12e, emissive: 0x9a4a08, emissiveIntensity: 0.55, roughness: 0.25 });
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xfff6e6, roughness: 0.9, emissive: 0x6a5a44, emissiveIntensity: 0.25 });
    let beer = null, foam = null, level = 0, shownLevel = -1;
    function setLevel(f) {
      level = Math.max(0, Math.min(1, f));
      if (Math.abs(level - shownLevel) < 0.002) return;
      shownLevel = level;
      [beer, foam].forEach((m) => { if (m) { glassGroup.remove(m); m.geometry.dispose(); } });
      beer = foam = null;
      if (level > 0.002) {
        const top = BASE + (GH - BASE - 0.12) * level;
        beer = new THREE.Mesh(new THREE.CylinderGeometry(rIn(top) - 0.004, rIn(BASE) - 0.004, top - BASE, 56), beerMat);
        beer.position.y = BASE + (top - BASE) / 2; glassGroup.add(beer);
        const fh = 0.03 + 0.11 * Math.min(1, level * 1.4);
        foam = new THREE.Mesh(new THREE.CylinderGeometry(rIn(top + fh) - 0.004, rIn(top) - 0.004, fh, 56), foamMat);
        foam.position.y = top + fh / 2; glassGroup.add(foam);
      }
      dirty = true;
    }

    const BUB = 40, dummy = new THREE.Object3D();
    const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd28a, emissiveIntensity: 0.6, roughness: 0.2 }), BUB);
    const bub = Array.from({ length: BUB }, () => ({ a: Math.random() * 6.28, r: Math.random(), y: Math.random(), v: 0.15 + Math.random() * 0.25 }));
    bubbles.visible = false; glassGroup.add(bubbles);
    function stepBubbles(dt) {
      const top = BASE + (GH - BASE - 0.12) * level;
      bub.forEach((b, i) => {
        b.y += b.v * dt / Math.max(0.3, top - BASE);
        if (b.y > 1) { b.y = 0; b.a = Math.random() * 6.28; b.r = Math.random(); }
        const y = BASE + 0.02 + b.y * (top - BASE - 0.04), rr = (rIn(y) - 0.05) * Math.sqrt(b.r);
        dummy.position.set(Math.cos(b.a) * rr, y, Math.sin(b.a) * rr); dummy.scale.setScalar(0.6 + b.y * 0.8);
        dummy.updateMatrix(); bubbles.setMatrixAt(i, dummy.matrix);
      });
      bubbles.instanceMatrix.needsUpdate = true;
    }

    // Lime wedges: one on the rim once poured, one waiting on the ground
    const limeMat = new THREE.MeshStandardMaterial({ color: 0x6fae2e, roughness: 0.45, emissive: 0x1d3a06, emissiveIntensity: 0.4, side: THREE.DoubleSide });
    const pulpMat = new THREE.MeshStandardMaterial({ color: 0xd6ec8a, roughness: 0.6, emissive: 0x5a6a10, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    function makeLime() {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI, 0, Math.PI / 2), limeMat);
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24, 0, Math.PI), pulpMat); p.rotation.x = -Math.PI / 2; l.add(p);
      return l;
    }
    const rimLime = new THREE.Group(); const rl = makeLime(); rl.rotation.set(0.2, 0.4, -0.9); rimLime.add(rl);
    rimLime.position.set(RT - 0.06, GH + 0.02, 0.1); rimLime.scale.setScalar(0.001); glassGroup.add(rimLime);
    const groundLime = makeLime(); groundLime.rotation.set(-0.3, 0.9, 0.1); groundLime.position.set(-0.62, 0.05, 0.55); scene.add(groundLime);

    // The bottle: clear glass, golden lager, a painted Dry Season label, a cap, condensation
    const BX = -0.05, BZ = -0.25;
    const prof = [[0, 0], [0.28, 0], [0.31, 0.03], [0.32, 0.12], [0.32, 1.2], [0.30, 1.34], [0.22, 1.52], [0.14, 1.68], [0.12, 1.8], [0.12, 2.12], [0.135, 2.16], [0.135, 2.24], [0.11, 2.27], [0, 2.27]];
    const bottle = new THREE.Group();
    bottle.add(new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 72), new THREE.MeshPhysicalMaterial({
      color: 0xfffbea, roughness: 0.04, transmission: 1, thickness: 0.35, ior: 1.52, specularIntensity: 1, envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.08
    })));
    const inner = prof.filter(([, y]) => y <= 1.95 && y > 0.05).map(([x, y]) => new THREE.Vector2(Math.max(0, x - 0.025), y));
    inner.unshift(new THREE.Vector2(0, 0.05)); inner.push(new THREE.Vector2(0, 1.95));
    const bottleBeer = new THREE.Mesh(new THREE.LatheGeometry(inner, 48), beerMat); bottle.add(bottleBeer);
    function drawLabel(g, w, h) {
      g.fillStyle = '#F6EDDA'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#B8651A'; g.lineWidth = 6; g.strokeRect(18, 18, w - 36, h - 36); g.lineWidth = 2; g.strokeRect(34, 34, w - 68, h - 68);
      g.fillStyle = '#E8962C'; g.beginPath(); g.arc(w / 2, 200, 70, Math.PI, 0); g.fill();
      g.fillStyle = '#F6EDDA'; for (let i = 0; i < 4; i++) g.fillRect(w / 2 - 80, 186 - i * 16, 160, 5);
      g.fillStyle = '#2A1A0F'; g.textAlign = 'center';
      g.font = '400 84px "Alfa Slab One", Georgia, serif'; g.fillText('DRY SEASON', w / 2, 310);
      g.font = '700 34px "Schibsted Grotesk", sans-serif'; g.fillText('GOLDEN LAGER', w / 2, 370);
      g.font = '600 28px "Schibsted Grotesk", sans-serif'; g.fillStyle = '#7A3F1F'; g.fillText('355 ml  ·  4.5%', w / 2, 420);
    }
    const labelTex = canvasTex(1024, 512, drawLabel);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.323, 0.323, 0.52, 64, 1, true, -1.25, 2.5), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.55 }));
    label.position.y = 0.62; bottle.add(label);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawLabel(labelTex.image.getContext('2d'), 1024, 512); labelTex.needsUpdate = true; dirty = true; });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.85, roughness: 0.3, transparent: true });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.15, 0.07, 21), capMat); cap.position.y = 2.3; bottle.add(cap);
    const DROPS = 170;
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, transmission: 0.6, transparent: true, opacity: 0.85, envMapIntensity: 2, clearcoat: 1 }), DROPS);
    for (let i = 0; i < DROPS; i++) {
      const a = (Math.random() - 0.5) * 3.4, y = 0.08 + Math.random() * 1.15, r = 0.326;
      dummy.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
      const s = 0.006 + Math.pow(Math.random(), 3) * 0.018; dummy.scale.set(s, s * (1.2 + Math.random() * 0.5), s * 0.6);
      dummy.lookAt(0, y, 0); dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    }
    bottle.add(drops);
    const bottlePivot = new THREE.Group(); bottlePivot.add(bottle); scene.add(bottlePivot);

    const shadowTex = radial([[0, 'rgba(0,0,0,.7)'], [1, 'rgba(0,0,0,0)']]);
    function contact(x, z, s) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.003, z); scene.add(m); return m;
    }
    contact(GX, GZ, 1.4);
    const bottleShadow = contact(BX, BZ, 1.3);
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 1, 12), beerMat); stream.visible = false; scene.add(stream);

    function setBottleBeer(f) { bottleBeer.scale.y = Math.max(0.02, f); bottleBeer.visible = f > 0.03; }
    const mouthAt = (rz) => ({ x: -Math.sin(rz) * 2.27, y: Math.cos(rz) * 2.27 });
    const REST = { x: BX, y: 0, z: BZ, rz: 0 };
    const TIP = (() => { const rz = -2.05, m = mouthAt(rz); return { x: GX - 0.12 - m.x, y: GH + 0.38 - m.y, z: GZ, rz }; })();
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    function setPose(a, b, t) {
      bottlePivot.position.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
      bottlePivot.rotation.z = lerp(a.rz, b.rz, t);
      bottleShadow.position.x = bottlePivot.position.x;
      bottleShadow.material.opacity = 1 - Math.min(1, bottlePivot.position.y / 1.2);
    }

    // ---- states: 'empty' (sealed bottle, empty glass), 'pouring', 'night'
    let state = 'empty', anim = null, target = 0;
    function setState(s) { state = s; canvas.dataset.state = s; dirty = true; }
    function showEmpty() {
      anim = null; cap.visible = true; cap.position.set(0, 2.3, 0); cap.rotation.z = 0; capMat.opacity = 1;
      setPose(REST, REST, 0); setBottleBeer(1); setLevel(0); stream.visible = false;
      rimLime.scale.setScalar(0.001); groundLime.visible = true; groundLime.scale.setScalar(1); bubbles.visible = false;
      setState('empty');
    }
    function showNight() {
      anim = null; cap.visible = false; setPose(REST, REST, 0); setBottleBeer(0.12); stream.visible = false;
      rimLime.scale.setScalar(1); groundLime.visible = false; setState('night');
    }
    function pour(to) {
      target = to;
      if (reduce()) { showNight(); setLevel(to); return; }
      anim = { t: 0 }; setState('pouring');
    }
    function stepPour(dt) {
      anim.t += dt; const t = anim.t;
      const c = Math.min(1, t / 0.4);
      cap.position.set(lerp(0, 0.35, c), 2.3 + Math.sin(c * Math.PI) * 0.5 + c * 0.2, 0); cap.rotation.z = c * 4; capMat.opacity = 1 - c; cap.visible = c < 1;
      const lift = Math.max(0, Math.min(1, (t - 0.3) / 0.7));
      if (t < 2.4) setPose(REST, TIP, ease(lift));
      groundLime.scale.setScalar(Math.max(0.001, 1 - Math.min(1, Math.max(0, (t - 0.3) / 0.4))));
      const p = Math.max(0, Math.min(1, (t - 0.9) / 1.4));
      stream.visible = p > 0 && p < 1;
      if (stream.visible) {
        const m = mouthAt(bottlePivot.rotation.z), mx = bottlePivot.position.x + m.x, my = bottlePivot.position.y + m.y;
        const len = Math.max(0.05, my - (BASE + (GH - BASE - 0.12) * level));
        stream.scale.set(1 - Math.abs(p - 0.5) * 0.8, len, 1 - Math.abs(p - 0.5) * 0.8); stream.position.set(mx + 0.02, my - len / 2, GZ);
      }
      setLevel(ease(p) * target); setBottleBeer(1 - p * 0.88);
      if (t >= 2.4) setPose(TIP, REST, ease(Math.min(1, (t - 2.4) / 0.7)));
      rimLime.scale.setScalar(Math.max(0.001, ease(Math.min(1, Math.max(0, (t - 2.4) / 0.5)))));
      if (t >= 3.1) showNight();
      dirty = true;
    }

    // ---- your night on the hills texture (geometry from DryHorizon.paths)
    function paintNight(view) {
      const H = root.DryHorizon;
      const has = view.rounds && view.rounds.length && view.sim && view.sim.G > 0;
      bacPlane.visible = !!has;
      if (!has || !H) { bacGeom = null; return; }
      const max = Math.max(0.11, view.sim.peak * 1.25);
      const g = H.paths(view.sim, view.rounds, view.now, { width: 1024 - 2 * BAC_PAD, height: 300, max, limit: view.limit, prevSim: view.prevSim });
      const keyNow = g.ridge + '|' + (g.ghost || '') + '|' + g.nowX.toFixed(0) + '|' + g.moonX.toFixed(0) + '|' + pal.bacHill;
      bacGeom = g;
      if (keyNow === bacKey) return;
      bacKey = keyNow;
      const c = bacTex.image, x = c.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, c.width, c.height);
      x.translate(BAC_PAD, 0);
      const fillGr = x.createLinearGradient(0, 40, 0, 300);
      fillGr.addColorStop(0, pal.bacHill); fillGr.addColorStop(1, mix(pal.bacHill, pal.ground, 0.6));
      x.fillStyle = fillGr; x.fill(new Path2D(g.area));
      x.save(); x.setLineDash([10, 14]); x.strokeStyle = 'rgba(246,237,218,.35)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(-BAC_PAD, g.limitY); x.lineTo(1024, g.limitY); x.stroke(); x.restore();
      if (g.ghost) { x.save(); x.setLineDash([4, 8]); x.strokeStyle = 'rgba(246,237,218,.6)'; x.lineWidth = 3; x.stroke(new Path2D(g.ghost)); x.restore(); }
      x.save(); x.shadowColor = 'rgba(242,169,59,.8)'; x.shadowBlur = 18; x.strokeStyle = pal.ridge; x.lineWidth = 6; x.lineJoin = 'round';
      x.stroke(new Path2D(g.ridge)); x.restore();
      x.font = '700 22px "Schibsted Grotesk", sans-serif'; x.fillStyle = 'rgba(246,237,218,.8)';
      if (g.bands.length > 1) g.bands.forEach((b) => x.fillText(b.label, Math.max(6, b.x + 6), Math.max(30, g.limitY - 14)));
      if (view.sim.clear > view.now) { x.save(); x.shadowColor = 'rgba(246,237,218,.9)'; x.shadowBlur = 16; x.fillStyle = '#F6EDDA'; x.beginPath(); x.arc(g.moonX, 288, 9, 0, 7); x.fill(); x.restore(); }
      x.fillStyle = '#E46F48'; x.strokeStyle = pal.ground; x.lineWidth = 4; x.beginPath(); x.arc(g.nowX, g.nowY, 11, 0, 7); x.fill(); x.stroke();
      bacTex.needsUpdate = true; dirty = true;
    }

    // ---- theme
    function applyPalette() {
      paintSky(); paintGround();
      hillMats.forEach((m, i) => m.color.set(pal.hills[i]));
      acaciaMat.color.set(pal.acacia);
      groundMat.color.set(pal.ground);
      stars.visible = pal.stars; sunMat.opacity = pal.stars ? 1 : 0.6;
      buildEnv(); bacKey = ''; dirty = true;
    }
    applyPalette();

    // ---- camera, layout and tilt
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    let layout = { top: 0, base: 0 }, dist = 9, W = 1, Hh = 1;
    function resize() {
      W = Math.max(1, host.clientWidth); Hh = Math.max(1, host.clientHeight);
      renderer.setSize(W, Hh, false);
      camera.aspect = W / Hh; camera.updateProjectionMatrix();
      const f = frame({ height: Hh, top: layout.top || Hh * 0.55, base: layout.base || Hh * 0.92, objectTop: 2.4, fov: 34 });
      dist = f.dist; LOOK.y = f.lookY;
      // The night's hills span the view at their depth, with room to slide when tilting
      const vw = 2 * (dist + 5) * Math.tan(17 * Math.PI / 180) * camera.aspect * 1.35;
      bacPlane.scale.set(vw, vw * 320 / 1024, 1);
      bacPlane.position.set(LOOK.x, bacPlane.scale.y * (300 / 320 - 0.5), -5);
      dirty = true;
    }
    let drag = null;
    host.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, a, input')) return;
      drag = { x: e.clientX, tx: tilt.tx };
      const D = root.DeviceOrientationEvent;
      if (D && typeof D.requestPermission === 'function' && !create.asked) { create.asked = true; D.requestPermission().catch(() => {}); }
    });
    root.addEventListener('pointermove', (e) => { if (drag && !reduce()) tilt.tx = Math.max(-1, Math.min(1, drag.tx + (e.clientX - drag.x) / 200)); });
    root.addEventListener('pointerup', () => { drag = null; });
    root.addEventListener('pointercancel', () => { drag = null; });
    root.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || reduce()) return;
      tilt.tx = Math.max(-1, Math.min(1, e.gamma / 25)); tilt.ty = Math.max(-1, Math.min(1, (e.beta - 50) / 35));
    });

    // ---- loop: draw only while something moves, and only while the hero is on screen
    // Opening sequence: the bottle and glass are set down gently, a beat apart (only when the page asks for it).
    let introAt = (opts && opts.intro && opts.intro() && !reduce()) ? performance.now() : null;
    const settle = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
    let visible = true, last = 0, bubClock = 0, groundFresh = false;
    if (root.IntersectionObserver) new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) dirty = true; }).observe(host);
    function loop(now) {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
      if (visible && !document.hidden) {
        const k = reduce() ? 1 : 1 - Math.pow(0.002, dt);
        const nx = tilt.x + (tilt.tx - tilt.x) * k, ny = tilt.y + (tilt.ty - tilt.y) * k;
        if (Math.abs(nx - tilt.x) > 1e-4 || Math.abs(ny - tilt.y) > 1e-4) dirty = true;
        tilt.x = nx; tilt.y = ny;
        if (anim) stepPour(dt);
        else if (state === 'night' && Math.abs(level - target) > 0.002) setLevel(level + (target - level) * Math.min(1, dt * 2.5));
        const bubbling = level > 0.05 && !reduce();
        bubbles.visible = level > 0.05;
        bubClock += dt;
        if (bubbling && bubClock > 0.07) { stepBubbles(bubClock); bubClock = 0; dirty = true; }
        let offB = 0, offG = 0;
        if (introAt != null) {
          const t = (now - introAt) / 1000;
          if (t > 1.6) introAt = null;
          else { offB = (1 - settle((t - 0.2) / 0.9)) * 0.7; offG = (1 - settle((t - 0.38) / 0.9)) * 0.7; dirty = true; }
        }
        if (dirty) {
          bottlePivot.position.y += offB; glassGroup.position.y += offG; groundLime.position.y += offG;
          camera.position.set(LOOK.x + tilt.x * 0.9, LOOK.y + 0.25 - tilt.y * 0.5, dist);
          camera.lookAt(LOOK);
          renderer.render(scene, camera);
          bottlePivot.position.y -= offB; glassGroup.position.y -= offG; groundLime.position.y -= offG;
          dirty = false;
          // three.js r149 can keep a stale shader for a textured material compiled in the very first
          // frame, which renders the ground nearly black. A fresh material after that frame is right.
          if (!groundFresh) { groundFresh = true; ground.material = new THREE.MeshBasicMaterial({ map: groundTex, toneMapped: false }); dirty = true; }
        }
      }
      root.requestAnimationFrame(loop);
    }

    const api = {
      /** layout: the strip of the hero, in pixels from its top, where the drinks stand. */
      setLayout(l) { if (Math.abs(l.top - layout.top) > 1 || Math.abs(l.base - layout.base) > 1) { layout = l; resize(); } },
      /** view: { has, level, sim, rounds, now, limit, prevSim }. Pours once when the night begins. */
      update(view) {
        paintNight(view);
        if (!view.has) { if (state !== 'empty') showEmpty(); return; }
        if (state === 'empty') { pour(Math.max(view.level, 0.5)); return; }
        target = view.level;
      },
      setNight(view) { paintNight(view); if (view.has) { showNight(); target = view.level; setLevel(view.level); } else showEmpty(); },
      setTheme(tokens) { pal = palette(tokens); applyPalette(); },
      /** Where the night's peak sits on screen, for the hand off orb. */
      peakScreen() {
        if (!bacGeom || !bacPlane.visible) return null;
        const p = new THREE.Vector3((bacGeom.peakX + BAC_PAD) / 1024 - 0.5, 0.5 - bacGeom.peakY / 320, 0).applyMatrix4(bacPlane.matrixWorld).project(camera);
        const r = host.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
      },
      get state() { return state; },
      resize
    };
    new (root.ResizeObserver || function () { return { observe() {} }; })(() => resize()).observe(host);
    resize(); showEmpty();
    root.requestAnimationFrame(loop);
    return api;
  }

  const api = { glassLevel, palette, frame, create, mix };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DryScene = api;
})(typeof self !== 'undefined' ? self : this);

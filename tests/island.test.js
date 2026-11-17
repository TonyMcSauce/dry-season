// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../island.js');

test("compact matches Apple's sizes: 52.33 pt each side of the camera, 62.33 on 430 pt phones", () => {
  const g393 = I.geometry({ sat: 59, vw: 393, standalone: true });
  const g430 = I.geometry({ sat: 59, vw: 430, standalone: true });
  assert.equal(g393.ear, 52.33);
  assert.equal(g430.ear, 62.33);
  assert.equal(g393.camH, 36.67);
  assert.equal(I.compactWidth(g393), 126 + 2 * 52.33);
});

test("expanded is the screen width minus 22 pt: 371 and 408", () => {
  assert.equal(I.geometry({ sat: 59, vw: 393, standalone: true }).expW, 371);
  assert.equal(I.geometry({ sat: 59, vw: 430, standalone: true }).expW, 408);
  assert.equal(I.geometry({ sat: 0, vw: 1280 }).expW, 408);
});

test('compact width never depends on content, so it cannot creep wider', () => {
  const g = I.geometry({ sat: 0, vw: 390 });
  const widths = new Set();
  for (let i = 0; i < 50; i++) widths.add(I.compactWidth(g));
  assert.equal(widths.size, 1);
});

test('installed app: hangs just below the status bar, never inside the frosted strip', () => {
  const g = I.geometry({ sat: 59, vw: 430, standalone: true });  // iPhone 14 Pro Max
  assert.equal(g.mode, 'hang');
  assert.ok(g.top >= 59 + 4, `top ${g.top} is inside the status bar`);
  assert.equal(g.drip, true, 'island iPhones get the drop from the real island');
  assert.equal(I.geometry({ sat: 47, vw: 390, standalone: true }).drip, false, 'notch iPhones hang without the drip');
  assert.ok(I.geometry({ sat: 47, vw: 390, standalone: true }).top >= 51);
  assert.equal(I.geometry({ sat: 0, vw: 412, standalone: true }).top, 8, 'Android or iOS reporting no safe area');
});

test('in a browser tab it floats at the top once the countdown scrolls away', () => {
  assert.equal(I.geometry({ sat: 59, vw: 393, standalone: false }).mode, 'floating');
  assert.equal(I.geometry({ sat: 0, vw: 1280 }).top, 11);
});

test("springs follow Apple's model: no overshoot at bounce 0, a small one at bounce 0.2, settled well inside 2 s", () => {
  const run = (p) => {
    const sp = { x: 0, v: 0, t: 1 };
    let max = 0, settled = null;
    for (let t = 0; t < 2; t += 1 / 240) {
      I.springStep(sp, p, 1 / 240);
      max = Math.max(max, sp.x);
      if (settled === null && Math.abs(sp.x - 1) < 0.002 && Math.abs(sp.v) < 0.02) settled = t;
    }
    return { max, settled };
  };
  const smooth = run(I.SPRING.content);
  assert.ok(smooth.max <= 1.0005, `overshoot ${smooth.max}`);
  const morph = run(I.SPRING.morph);
  assert.ok(morph.max > 1.01 && morph.max < 1.08, `morph overshoot ${morph.max}`);
  assert.ok(morph.settled !== null && morph.settled < 1.2, `settles at ${morph.settled}s`);
});

test('a spring keeps its speed when redirected mid-move', () => {
  const sp = { x: 0, v: 0, t: 100 };
  for (let i = 0; i < 30; i++) I.springStep(sp, I.SPRING.morph, 1 / 240);
  const v = sp.v;
  sp.t = 20;
  I.springStep(sp, I.SPRING.morph, 1 / 240);
  assert.ok(v > 0 && sp.v > v * 0.8, 'velocity carried through the change of target');
});

const snap = (o) => Object.assign({ has: true, status: 'impaired', risk: 'low', danger: false, last: { short: 'Corona' }, water: null }, o);

test('alerts fire only for essential moments', () => {
  assert.equal(I.alertFor(snap(), snap({ status: 'over' })), 'over');
  assert.equal(I.alertFor(snap({ status: 'over' }), snap({ status: 'impaired' })), 'under');
  assert.equal(I.alertFor(snap(), snap({ status: 'clear' })), 'clear');
  assert.equal(I.alertFor(snap({ risk: 'raised' }), snap({ risk: 'high' })), 'risk');
  assert.equal(I.alertFor(snap({ status: 'over' }), snap({ status: 'over', danger: true })), 'danger');
  assert.equal(I.alertFor(snap({ status: 'over' }), snap({ status: 'over' })), null);
  assert.equal(I.alertFor(null, snap({ status: 'over' })), null);
  assert.equal(I.alertFor(snap({ has: false, status: 'clear' }), snap()), null);
});

test('the main action fits the moment', () => {
  const now = Date.now();
  assert.equal(I.primaryAction(snap(), now).label, '+1 Corona');
  assert.equal(I.primaryAction(snap({ risk: 'raised' }), now).label, 'Water break');
  assert.equal(I.primaryAction(snap({ water: { until: now + 60000 } }), now).label, 'End break');
  assert.equal(I.primaryAction(snap({ has: false, last: null }), now).act, 'picker');
  assert.equal(I.primaryAction(snap({ risk: 'high', status: 'clear' }), now).label, '+1 Corona');
});

test('time left reads like a clock', () => {
  assert.equal(I.splitLeft((8 * 60 + 34) * 60000), '8:34');
  assert.equal(I.splitLeft((18 * 60 + 42) * 1000, true), '18:42');
  assert.equal(I.splitLeft(-500), '0:00');
});

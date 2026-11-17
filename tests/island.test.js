// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../island.js');

test('fuses with the hardware island only on island iPhones opened from the home screen', () => {
  const pro = I.geometry({ sat: 59, vw: 393, standalone: true });
  assert.equal(pro.mode, 'fused');
  assert.equal(pro.top, 11);
  assert.equal(I.geometry({ sat: 62, vw: 402, standalone: true }).top, 14);
  assert.equal(I.geometry({ sat: 47, vw: 390, standalone: true }).mode, 'floating');  // notch iPhone
  assert.equal(I.geometry({ sat: 59, vw: 393, standalone: false }).mode, 'floating'); // Safari tab
  assert.equal(I.geometry({ sat: 0, vw: 1280, standalone: false }).top, 8);           // desktop
});

test('compact width keeps clear of the status bar on the narrowest island iPhone', () => {
  const w = I.CAM_W + I.SIDE * 2;
  const left = (393 - w) / 2;
  assert.ok(left >= 85, `left edge at ${left}px would sit on the clock`);
});

const snap = (o) => Object.assign({ has: true, status: 'impaired', risk: 'low', danger: false }, o);

test('alerts fire on the moments that matter, once', () => {
  assert.equal(I.alertFor(snap(), snap({ status: 'over' })), 'over');
  assert.equal(I.alertFor(snap({ status: 'over' }), snap({ status: 'impaired' })), 'under');
  assert.equal(I.alertFor(snap(), snap({ status: 'clear' })), 'clear');
  assert.equal(I.alertFor(snap({ risk: 'raised' }), snap({ risk: 'high' })), 'risk');
  assert.equal(I.alertFor(snap({ status: 'over' }), snap({ status: 'over', danger: true })), 'danger');
  assert.equal(I.alertFor(snap({ status: 'over' }), snap({ status: 'over' })), null);
  assert.equal(I.alertFor(snap({ risk: 'high' }), snap({ risk: 'high' })), null);
});

test('no alerts on the first drink or with an empty tab', () => {
  assert.equal(I.alertFor(null, snap({ status: 'over' })), null);
  assert.equal(I.alertFor(snap({ has: false, status: 'clear' }), snap({ status: 'impaired' })), null);
  assert.equal(I.alertFor(snap(), snap({ has: false, status: 'clear' })), null);
});

test('time left reads like a clock', () => {
  assert.equal(I.splitLeft((8 * 60 + 34) * 60000), '8:34');
  assert.equal(I.splitLeft(5 * 60000), '0:05');
  assert.equal(I.splitLeft((18 * 60 + 42) * 1000, true), '18:42');
  assert.equal(I.splitLeft((61 * 60 + 5) * 1000, true), '1:01:05');
  assert.equal(I.splitLeft(-500), '0:00');
});

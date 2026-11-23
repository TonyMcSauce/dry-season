// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../scene3d.js');

const H = 3600000;

test('the glass is nearly full when the night starts and empty when you are clear', () => {
  const start = 0, clear = 4 * H;
  assert.equal(S.glassLevel(start, clear, start).toFixed(2), '0.86');
  assert.equal(S.glassLevel(start, clear, 2 * H).toFixed(2), '0.43');
  assert.equal(S.glassLevel(start, clear, clear), 0);
  assert.equal(S.glassLevel(start, clear, clear + H), 0);
  assert.equal(S.glassLevel(null, null, 0), 0);
});

test('scene colours come from the app tokens, with the ground exactly the page ground', () => {
  const p = S.palette({ skyTop: '#17212F', skyMid: '#2D2926', skyLow: '#7A3F1F', horizon: '#C8742E', ground: '#16120E', amber: '#F2A93B', ink: '#2A1A0F', stars: '1' });
  assert.deepEqual(p.sky, ['#17212F', '#2D2926', '#7A3F1F', '#C8742E']);
  assert.equal(p.ground, '#16120E');
  assert.equal(p.ridge, '#F2A93B');
  assert.equal(p.hills.length, 3);
  assert.equal(p.stars, true);
  const light = S.palette({ skyTop: '#E9D9BB', skyMid: '#EFD3A2', skyLow: '#E2A563', horizon: '#C9763A', ground: '#F5EEE1', amber: '#F2A93B', ink: '#2A1A0F', stars: '0' });
  assert.equal(light.ground, '#F5EEE1');
  assert.equal(light.stars, false);
});

test('framing puts the drinks between the readout and the bottom of the hero', () => {
  const tan = Math.tan(17 * Math.PI / 180);
  const f = S.frame({ height: 820, top: 460, base: 770, objectTop: 2.35, fov: 34 });
  const screenY = (y) => 820 / 2 - (y - f.lookY) / (2 * f.dist * tan) * 820;
  assert.ok(Math.abs(screenY(2.35) - 460) < 1, 'bottle top at the top of the stage');
  assert.ok(Math.abs(screenY(0) - 770) < 1, 'ground at the base of the stage');
});

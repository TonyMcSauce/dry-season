// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../mug.js');

const now = Date.UTC(2026, 10, 17, 20, 0);
const H = 3600e3;
const snap = (o) => Object.assign({ has: true, status: 'impaired', risk: 'low', clearAt: now + 5 * H, water: null }, o);

test('the mug shows alcohol left to clear, full at 10 hours or more', () => {
  assert.equal(G.mugLevel(snap(), now), 0.5);
  assert.equal(G.mugLevel(snap({ clearAt: now + 14 * H }), now), 1);
  assert.equal(G.mugLevel(snap({ status: 'clear' }), now), 0);
  assert.equal(G.mugLevel(snap({ has: false }), now), 0);
  assert.ok(G.mugLevel(snap({ clearAt: now + 60000 }), now) > 0, 'a sip left still shows a little');
});

test('adding a drink raises the level, time drains it', () => {
  const before = G.mugLevel(snap(), now);
  assert.ok(G.mugLevel(snap({ clearAt: now + 6 * H }), now) > before);
  assert.ok(G.mugLevel(snap(), now + H) < before);
});

test('during a water break the mug shows the time left on the break', () => {
  const w = { until: now + 10 * 60000, dur: 20 * 60000 };
  assert.equal(G.mugLevel(snap({ water: w }), now), 0.5);
  assert.equal(G.mugLevel(snap({ water: { until: now - 1 } }), now), 0.5, 'a finished break falls back to the night');
});

test('no celebrating when it is not a good time to drink more', () => {
  assert.equal(G.isCalm(snap()), false);
  assert.equal(G.isCalm(snap({ status: 'over' })), true);
  assert.equal(G.isCalm(snap({ risk: 'raised' })), true);
  assert.equal(G.isCalm(snap({ risk: 'high' })), true);
});

test("every moment finishes inside Apple's 2 second limit", () => {
  for (const [k, ms] of Object.entries(G.MOMENT_MS)) assert.ok(ms < 2000, `${k} takes ${ms} ms`);
});

// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Dl = require('../dial.js');

const local = (h, m = 0, d = 23) => new Date(2026, 10, d, h, m).getTime();

test('a 2 PM to 6 PM round is a 240 minute arc starting at 14:00', () => {
  assert.deepEqual(Dl.arc(local(14), local(18)), { dasharray: '240 1200', dashoffset: -840 });
});

test('a round across midnight is one arc', () => {
  assert.deepEqual(Dl.arc(local(22), local(2, 0, 24)), { dasharray: '240 1200', dashoffset: -1320 });
});

test('midnight is at the top and 6 AM on the right', () => {
  const top = Dl.point(local(0), 100, 195, 130), right = Dl.point(local(6), 100, 195, 130);
  assert.deepEqual([Math.round(top.x), Math.round(top.y)], [195, 30]);
  assert.deepEqual([Math.round(right.x), Math.round(right.y)], [295, 130]);
});

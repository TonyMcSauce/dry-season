// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../drinks.js');
const M = require('../model.js');

const grams = (d) => M.gramsOf({ abv: d.abv, ml: d.ml, qty: 1, share: 1 });

test('Heineken Silver: 4% in a 440 ml can', () => {
  const d = D.byId('hsil');
  assert.equal(d.abv, 4.0);
  assert.equal(d.ml, 440);
  assert.deepEqual(d.sizes, [330, 440, 500]);
  assert.equal(grams(d).toFixed(1), '13.9');
});

test('Corona Extra: 4.5% in a 355 ml bottle', () => {
  const d = D.byId('corona');
  assert.equal(d.abv, 4.5);
  assert.equal(d.ml, 355);
  assert.equal(grams(d).toFixed(1), '12.6');
});

test('355 ml is a common size and every default size is offered', () => {
  assert.ok(D.SIZES.includes(355));
  D.all().filter((d) => !d.custom).forEach((d) => (d.sizes || []).forEach((ml) => assert.ok(D.SIZES.includes(ml), d.name + ' ' + ml)));
});

test('drink ids are unique and favourites point at real drinks', () => {
  const ids = D.all().map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  D.DEFAULT_FAVS.forEach((id) => assert.ok(D.byId(id) && !D.byId(id).custom, id));
});

test('every built-in drink has a sensible strength and size', () => {
  D.all().forEach((d) => {
    assert.ok(d.abv > 0 && d.abv < 15, d.name);
    assert.ok(d.ml >= 200 && d.ml <= 1000, d.name);
  });
});

test('one version, used by the page and the service worker', () => {
  const root = path.join(__dirname, '..');
  const v = fs.readFileSync(path.join(root, 'version.js'), 'utf8');
  assert.match(v, /self\.DRY_VERSION = '\d+\.\d+\.\d+';/);
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /importScripts\('version\.js'\)/);
  assert.match(sw, /const CACHE = 'dry-season-' \+ VERSION;/);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="version.js"></script>'));
});

test('every file the app needs is saved for offline use', () => {
  const root = path.join(__dirname, '..');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  shell.forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), 'missing ' + f));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:fonts|icons)\/[^"]+|[a-z]+\.js)"/g)].map((m) => m[1]);
  refs.forEach((r) => assert.ok(shell.includes(r), r + ' is not in the offline list'));
  assert.ok(!/fonts\.googleapis|gstatic/.test(html), 'no third-party fonts');
});

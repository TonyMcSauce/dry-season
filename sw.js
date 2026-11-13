/* Dry Season service worker.
 *
 * How it behaves
 * - Install: saves every app file (pages, scripts, fonts, icons) into a cache named
 *   after the version in version.js. Nothing is left to chance on a bad signal.
 * - The app opens from that saved copy straight away, online or not, so a
 *   half-loaded mix of old and new files can never happen mid-night.
 * - The browser checks sw.js and version.js for changes each time the app opens.
 *   A new version installs quietly in the background, then waits. The page shows
 *   an "update ready" card and only switches when the user taps Update now.
 * - Anything not in the saved copy goes to the network first, gives up after
 *   3 seconds, and falls back to whatever is cached.
 */
importScripts('version.js');

const VERSION = self.DRY_VERSION;
const CACHE = 'dry-season-' + VERSION;
const NETWORK_TIMEOUT = 3000;

const SHELL = [
  './',
  './index.html',
  './version.js',
  './model.js',
  './drinks.js',
  './manifest.webmanifest',
  './fonts/alfa-slab-one-400.woff2',
  './fonts/schibsted-grotesk-400.woff2',
  './fonts/schibsted-grotesk-500.woff2',
  './fonts/schibsted-grotesk-600.woff2',
  './fonts/schibsted-grotesk-700.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache so a new version never saves stale files.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('dry-season') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function fromCache(req, opts) {
  const cache = await caches.open(CACHE);
  return cache.match(req, opts);
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Opening the app (including the Add a drink shortcut with ?action=add).
  if (req.mode === 'navigate') {
    event.respondWith(
      fromCache('./index.html').then((hit) => hit || networkFirst(req))
    );
    return;
  }

  // Saved app files: serve the saved copy, fall back to the network if missing.
  event.respondWith(
    fromCache(req, { ignoreSearch: true }).then((hit) => hit || networkFirst(req))
  );
});

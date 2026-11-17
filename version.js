/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '4.0.0';
self.DRY_CHANGES = [
  'Meet the Live Island. On an iPhone with a Dynamic Island it sits right against the real one, showing your level and time to clear.',
  'Tap it to open your night at a glance: status, clear time, a timeline from first sip to clear, and quick actions.',
  'Long-press for Quick add: one tap puts your last drink or a favourite on the tab.',
  'It pops up by itself when you go over the legal limit, drop back under, hit high blackout risk or become clear.',
  'Water break starts a timer that runs right in the island.',
  'Prefer it hidden? Switch it off under Your body.'
];

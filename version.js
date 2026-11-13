/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '3.0.0';
self.DRY_CHANGES = [
  'Works fully offline, fonts included. Open it at a braai with zero bars and everything still runs.',
  'Checks for a new version each time you open it, and gives up after a few seconds on a weak signal instead of hanging.',
  'New versions wait for you. Tap Update now when it suits you and nothing changes mid-night.',
  'Heineken Silver and Corona Extra are on the list, plus a 355 ml size.',
  'Star any drink to pin it to a Favourites group at the top of the picker.',
  'Long-press the home screen icon for an Add a drink shortcut.'
];

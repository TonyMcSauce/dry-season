/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '5.0.1';
self.DRY_CHANGES = [
  'Every past night opens from History now, including ones saved before 5.0.',
  'A past night\'s hills take into account whether you ate.',
  'Saving a night and later starting a new one no longer lists it twice in History.',
  'Saving a round to History no longer sends the glowing orb to tonight\'s hills.',
  'With Reduce Motion on, the dial sheet and the hills now gently cross fade.',
  'Older saves whose stop time came before the start now show a sensible time.',
  'The drive planner always extends the round you are still drinking.'
];

/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '5.0.0';
self.DRY_CHANGES = [
  'Log drinks you already had: set when you started and stopped on a 24 hour dial, and see straight away when you will be fully sober.',
  'A night can have several rounds. Alcohol still in your system from an earlier round counts toward the next one.',
  'Your horizon is now your night: the hills show your level, round by round.',
  'Favourites remember their size. Heineken 330 ml and Heineken Silver 330 ml are the new defaults.'
];

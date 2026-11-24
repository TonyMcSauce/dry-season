/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '5.3.0';
self.DRY_CHANGES = [
  'Say when you started: Just now, 15 minutes to 2 hours ago, a custom time, or right after your last round. No more guessing two hours back.',
  'Tonight\'s stash: add 6 and choose "Open 1, save 5". Tap Open next as you go, and it waits through breaks until you finish.',
  'Catch up: come back after a while and the app asks how many you have opened since, then spreads them across the gap.',
  'One more: long press the app icon to log another of your last drink, or the next from your stash, without browsing.',
  'Adjust times on any round with quick 15 minute nudges.'
];

/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '5.5.1';
self.DRY_CHANGES = [
  'Fixed: after an Undo message faded, buttons near the bottom of the screen sometimes ignored taps until you scrolled. Every button now works wherever it sits.',
  'One tap for another: buttons right under the bottle add another of your last drink. Had two different ones? You get a button for each, most recent first.',
  'Saving some for later? The first button opens the next one from your stash.',
  'Undo: every one tap add shows Undo for 5 seconds, in case of a pocket tap.',
  'Minus and plus on each drink in the round you are on, right on Tonight\'s tab.',
  'A gentle pacing hint under the buttons when you are drinking fast, such as "Wait about 20 minutes for a safer pace". It never stops you.'
];

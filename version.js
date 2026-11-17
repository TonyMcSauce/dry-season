/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '4.3.0';
self.DRY_CHANGES = [
  "Fixed: on recent iPhones the island was hiding blurred behind the real Dynamic Island. iOS frosts the strip under the status bar for home screen apps, so the island now hangs just below it, always sharp.",
  'A drop falls from your real Dynamic Island and springs into the pill when it appears.',
  'The middle of the pill now shows your clear time, with the mug on the left and time to go on the right.',
  'The header makes room for the island so nothing overlaps.'
];

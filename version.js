/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '5.4.0';
self.DRY_CHANGES = [
  'Fixed: right after you log drinks, the app no longer says you\'re clear or under the limit while the alcohol is still kicking in. It now warns you where you\'re heading, for example "Kicking in: over the limit by 22:09".',
  'Fixed: when you add several drinks and change the count, the "All right now?" question now updates to match.',
  'New ? button at the top: a short, friendly guide to how Dry Season works, logging your night, and reading the screen.',
  'New Settings, behind the gear at the top: Appearance (Automatic, Light or Dark) comes first, then your body details.',
  'Show me around: a quick walkthrough of the main screen. New visitors see it once, and anyone can replay it from Help.',
  'iPhone users: Help shows how to set up One more with Shortcuts, Back Tap or the Action Button.'
];

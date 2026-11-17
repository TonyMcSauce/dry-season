/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '4.2.0';
self.DRY_CHANGES = [
  'The island mug is now a little 3D mug with a handle that swivels round when you open it.',
  'Its fill shows the alcohol left to clear, and it drains in real time.',
  'The beer sloshes when the island moves, and wobbles when you press it.',
  'Add a drink and watch it pour in, fizz and foam up. When you are over the limit it pours calmly, no celebration.',
  'Water break: a droplet splashes in, the beer turns to water and ice cubes plop in. Ending it melts the ice.',
  'Text a friend from the island and the mug raises a cheers.'
];

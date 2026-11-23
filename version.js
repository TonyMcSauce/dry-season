/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '5.2.0';
self.DRY_CHANGES = [
  'New Appearance setting under Your body: Automatic follows your phone, or choose Light or Dark for the whole app.',
  'The 3D night scene at the top now always stays at dusk, in Light mode too.'
];

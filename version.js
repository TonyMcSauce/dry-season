/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '4.1.0';
self.DRY_CHANGES = [
  'Fixed: the island no longer stretches wider while you scroll.',
  "The island now follows Apple's Dynamic Island sizes, so it sits snug against the camera and stays balanced.",
  'Smoother motion: real spring physics you can interrupt mid-move, and it follows your finger when you swipe.',
  'Opening it is clearer: the glass and the time to go glide into place instead of fading.',
  'One main button that fits the moment: +1 your drink, start a water break when your risk is raised, or end one.',
  'More (the three dots) opens Quick actions: favourites, water break, text a friend and all drinks.',
  'Alerts only for what matters, and no endlessly looping animations.'
];

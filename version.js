/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '6.0.0';
self.DRY_CHANGES = [
  'A new look: midnight navy and cream, with a floating bar to move between Tonight, Plan, History and You.',
  'Tonight now leads with a blood alcohol gauge, your risk level, session time and quick actions.',
  'A faster drink picker: category chips, compact cards and a one-tap add.',
  'History now shows totals, a peak chart and your nights grouped by month. Your stash of favourites lives under You.',
  'Smoother screens and sheets, a gentle fade when you switch Light and Dark, and a more readable Light theme.',
  'Status messages now appear at the top of the screen.'
];

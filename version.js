/* The one place the app version lives.
 * The page reads it, and the service worker imports it to name its cache.
 * Bump VERSION (and add a line to CHANGES) every time you publish a change:
 * that is what tells installed copies a new version is ready.
 */
self.DRY_VERSION = '6.1.1';
self.DRY_CHANGES = [
  'Under the hood: the page is now split into separate style and script files. Nothing changes in how it looks or works.',
  'Stash polish: a drink running low (two or fewer) is flagged, with Restock on Tonight and Buy more in History to refill it in two taps. Plan now shows what you have on hand.',
  'A calmer Tonight screen: one status pill, one card for your level, peak, time under the limit, session and blackout risk, and the night hills sit lower behind the drinks. The long note under the status is one line you can open, and it stays open when you are over the limit.',
  'Fixed: after you tap Finished drinking, the app no longer asks how many you opened since. Your stash stays, and a new drink starts a new night.',
  'Messages fade out again instead of vanishing, and phones without 3D now get a readable, shorter Tonight screen.',
  'A stash for more than one drink: 2 Corona and 4 Silver can sit side by side. The newest opens first, and you can open any of them from the stash card on Tonight.',
  'Bought more beer? Add it from History at any time. Tonight and History show the same numbers, and what you have left now stays after the night ends.',
  'Logging more than one at a time now always asks if you had them all at once or are opening one and saving the rest, not only at the start of the night. Saving more of the same drink adds to your stash.',
  'A little life in the night scene: the stars twinkle and the sun slowly breathes. It costs almost no battery and turns off with Reduce Motion.',
  'A short opening sequence: the sky fades in, your status and clear time rise into place, the bottle and glass are set down, and the buttons arrive last. It skips itself when Reduce Motion is on.',
  'Tonight now shows both buttons, Another and Log a drink, above the tab bar without scrolling. The risk chip is shorter and the countdown sits on one line.',
  'A livelier gauge: the ring springs to your level, a dot rides its end, and the over the limit zone is tinted. Your level and times glide and flip instead of jumping.',
  'The Round 1 label on the night scene no longer sits on top of the gauge.',
  'A shorter Tonight hero: your clear time, level, bottle, glass and the one tap button now fit on the first screen.',
  'Smoother on your phone: the night scene and the countdown do less work in the background.',
  'A new look: midnight navy and cream, with a floating bar to move between Tonight, Plan, History and You.',
  'Tonight now leads with a blood alcohol gauge, your risk level, session time and quick actions.',
  'A faster drink picker: category chips, compact cards and a one-tap add.',
  'History now shows totals, a peak chart and your nights grouped by month. Your Favourites live under You, ready to log in one tap.',
  'Smoother screens and sheets, a gentle fade when you switch Light and Dark, and a more readable Light theme.',
  'Status messages now appear at the top of the screen.'
];

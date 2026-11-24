# Dry Season 6.0: redesign notes

Branch `v6`, built on the real `main` (5.5.1). The BAC model, drinks, service worker and manifest are the same as
`main`. `night.js` changed in 6.0.6 and 6.0.7: the stash became a list of drinks that lasts past the night and is
edited from History, and the catch-up question only asks about the current evening. The redesign lives in
`index.html`, with version bumps in `version.js`.

## How the app is built (unchanged)

A no-build static PWA. One controller script in `index.html` keeps a single `state` object in `localStorage`
(`dryseason.v1`, plus `dryseason.app` for update and walkthrough flags) and repaints with `render*` functions.
`model.js` (Widmark absorption, Michaelis-Menten elimination, risk, drive planner), `night.js` (rounds, stash,
start times, catch-up), `drinks.js`, `scene3d.js` (three.js hero), `mug.js` and `island.js` (the in-app Live Island,
not a native Live Activity) are plain scripts with Node tests. `sw.js` caches the whole shell under a name taken from
`version.js`, so a new version installs in the background and waits for Update now.

## What changed

- **Look:** midnight navy and cream tokens, with restrained amber. Dark and Light are designed separately; Light uses
  deeper accent text so it stays readable on cream. The 3D dusk hero is unchanged and stays dusk in both.
- **Navigation:** a floating four-tab bar (Tonight, Plan, History, You), 44 px targets, safe-area aware, sliding pill.
  Everything is still one page, so state and timers carry on between tabs.
- **Tonight hero:** BAC gauge with a legal limit tick, blackout risk chip, session time, an always-visible
  "estimate only" line, and quick actions (Log a drink, Water break, Earlier). Main's one-tap buttons, stash and
  pacing hint sit under the bottle as before.
- **Drink sheet:** category chips, two-column cards with strength and size, a one-tap **+** (one tap while a round is going;
  otherwise it opens the options, which ask when you started), a bigger quantity stepper and a sticky confirm bar.
  The "All 6 right now? Log all 6, or open 1 and save 5 for later" question and the start-time chips are intact.
- **History:** a Tonight card kept apart from the past, totals, a peak-per-night chart against your limit, and nights
  grouped by month. **You:** a Favourites list with one-tap logging, and the settings entry (Settings and Help are the
  existing sheets).
- **Messages:** the Undo and status toast now appears at the top, below the Live Island.
- **Motion:** screen and sheet transitions, a Light/Dark fade, tap feedback, count-up stats. All of it is off under
  `prefers-reduced-motion`. The full-screen grain no longer uses a blend mode.

## Bugs found while testing

- v6 was first built on a stale local `main` (5.2.0) and missed 5.3 to 5.5 (stash, start time, Undo, settings, help,
  walkthrough). Fixed by merging `origin/main`; conflicts resolved, features verified.
- Touch targets under 44 px (Help, Settings, Share, the round stepper) are now 44 px.
- The update card covered the tab bar; it now sits above it.
- The walkthrough would have tried to highlight the driving card while it was on another tab; it now switches tabs.

## Test results

- Unit tests (Node): all pass (`tests/night.test.js` covers the stash list and the catch-up rules).
- `tests/late_check.js` (browser, 29 scenarios): all pass.
- `tests/offline_check.js` (new, Node): service worker install, offline open with fonts, offline logging, update card,
  Update now keeps data: all pass.
- Screen-size matrix at 430x932, 390x844, 375x667, 360x640, 320x568, 932x430 (landscape), 768x1024 and 1280x800:
  no horizontal overflow, no clipped content, no console errors, targets at least 44 px, sheets sit on screen.

## Known limits

- Tested in headless Chromium only. Real iPhone Safari (safe-area insets, Dynamic Island clearance, standalone mode,
  keyboard behaviour, orientation changes) still needs a pass on a device.
- `tests/offline_check.py` was updated but cannot run here (no Python Playwright); the Node version covers the same flow.
- In a normal browser tab the floating Live Island sits over screen titles, as before. Installed, the titles make room.

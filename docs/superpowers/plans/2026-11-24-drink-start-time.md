# Logging real nights: plan

**Goal:** Logging matches how nights actually go. You can say when you started, plan a stash ahead, catch up after a gap, and log one more without browsing. Help and a proper Settings screen follow in Part 2.

## Scenarios this must get right

**A. A break in the night.** One beer 9:30 to 10:00, then five from 10:00 to 12:00. Logged at 9:30 and 11:30.
Today: the first round auto closes at 9:30 once the beer clears, and the five land at 9:30 only because of a clamp.
After: at 11:30 the first start option reads **Right after your last round (9:30)**, selected by default, so the five fill the gap honestly. Two back to back rounds.

**B. A six pack for the night.** You log 6 beers at 9:30 meaning "the first of 6".
Today: the app thinks all six went down in a minute, then rewrites history as time passes.
After: logging more than one with nothing in progress asks **Log all 6** or **Open 1, save 5 for later**. The second makes a stash: **1 of 6 opened** with an **Open next** button.

**C. Logging late.** One beer logged at 9:30, one opened at 10:00 unlogged, one at 10:30, then you log 2 at 10:30.
Today and after: both join the open round, spread 9:30 to 10:30, close to reality and slightly ahead of you (the safe side).
After, also: opening the app 30 minutes or more after your last log, with a round open or a stash waiting, asks **How many have you opened since?** first.

## Part 1 (this release, 5.3.0)

### 1. Choose when you started (`night.js`, add drink sheet)
* Shown only when nothing is in progress. Drinks added to an open round join it.
* Options: **Right after your last round (h:mm)** (default when a round is on tonight's tab), **Just now** (default otherwise), **15 min**, **30 min**, **1 hr**, **2 hrs ago**, **Custom** (a time today, never in the future).
* `addLiveDrink(state, drink, now, startAt)` uses the chosen start; the two hour lookback is removed.
* A start inside an earlier round asks **Add to that round** (it reopens) or **Start right after it**.

### 2. Tonight's stash (`night.js` + main screen)
* `session.stash = { drink, total, opened }`.
* `openStash(state, now)` logs one drink from the stash into the open round, or starts a round now.
* Carries over through breaks and into a fresh night. Clears on **Finished drinking**, when the last one is opened, or with **Clear stash**.
* Panel above **Add a drink**: *2 of 6 Heineken opened*, **Open next**, **Clear**.

### 3. Catch up (`night.js` + a small dialog)
* `catchUpDue(session, now)`: true when a round is open or a stash is waiting and the last log (or the last time we asked) is 30 minutes or more ago.
* `catchUp(state, n, now)`: adds n drinks (stash drink, else the last drink) to the open round, or a new round starting right after the last one. Counts against the stash.
* **None** records that we asked, so it stays quiet for another 30 minutes.

### 4. One more shortcut (`manifest.webmanifest`, startup)
* `./?action=one` opens the next stash drink, else repeats your last drink, else opens the picker. Shows a confirmation toast. The catch up question is skipped on this path.
* A short iPhone how-to (Shortcuts, Back Tap, Action Button) goes into the Part 2 help guide.

### 5. Quick time fixes (round cards)
* **Adjust times** on each round card opens **Started h:mm −15 / +15** and, once finished, **Ended h:mm −15 / +15**.
* `nudgeRound(state, id, edge, deltaMs, now)` keeps start ≤ end ≤ now and never crosses a neighbouring round.
* This also covers "I finished earlier": tap Finished, then nudge the end back.

### Tests
* Node (`tests/night.test.js`): scenarios A, B and C; start options defaults; overlap choice; no future start; stash lifecycle and carry over; catch up timing and counts; nudge limits.
* Browser (`tests/late_check.js`): start chips, stash panel, catch up dialog, One more shortcut, nudges.
* Existing suites still pass.

## Part 2 (5.4.0)
* **?** help guide: how it works, logging your night, reading the screen, what it can't know, plus a replayable first run walkthrough.
* Gear icon opening Settings with **Appearance** first, then **Your body**. Appearance leaves the Your body panel.

## Out of scope
* Per drink timestamps inside a round.
* Notifications while the app is closed (it has no server).

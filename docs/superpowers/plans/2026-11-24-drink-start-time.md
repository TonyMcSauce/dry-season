# Drink start time: plan

**Goal:** When you log a drink you say when you started it, so the app stops guessing. A night with a break in it (one drink, a pause, then more) is recorded the way it really happened.

## The scenario this must get right

You open a beer at 9:30 and finish it at 10:00. From 10:00 to 12:00 you have five more. You log the beer at 9:30 and the five at 11:30.

**What today's code does:** the 9:30 beer opens a live round. A single beer clears in about an hour, so by 11:30 `settle()` closes that round at 9:30. The five then open a new round placed two hours back, clamped to the last round's end, so they land at 9:30 by accident, not by design.

**What the plan does:**

1. **9:30:** Add a beer with **Just now** selected. A live round starts at 9:30.
2. **10:00 (optional):** Tap **Finished**. The round becomes 9:30 to 10:00. If you forget, the round closes on its own once the beer has cleared, and you can fix the finish time later with one tap.
3. **11:30:** Add 5 beers. Because a round ended earlier tonight, the first chip reads **Right after your last round (10:00)** and is selected by default. A new live round starts at 10:00 holding the five.
4. **12:00:** Tap **Finished**, or later choose **Finished 15 min ago** and so on.

**Result:** two back to back rounds, 1 beer from 9:30 to 10:00 and 5 beers from 10:00 to 12:00. The BAC curve sees the real pace, a slow start and then a faster stretch, instead of spreading all six evenly across the night. Both rounds sit on tonight's tab as one continuous sitting.

## Behaviour

### 1. "Started" chips on the add drink sheet
They show only when the drink **opens a new round**. A drink added to a round already in progress needs no time; it joins that round.

| Chip | Start time | When it shows |
|---|---|---|
| Right after your last round (h:mm) | that round's end | a round ended earlier tonight; selected by default |
| Just now | now | always; default when there is no earlier round |
| 15 min ago / 30 min ago / 1 hr ago / 2 hrs ago | now minus that | always |
| Custom | time wheel, limited to tonight and never in the future | always |

### 2. No more two hour guess
`addLiveDrink` takes the chosen start. The `now - 2h` default goes away.

### 3. Overlaps ask, never clamp
If the chosen start falls inside an earlier round, reuse the existing overlap prompt (**same round** merges, **extra** keeps them separate) rather than silently moving the start.

### 4. "Finished" chips
Finishing the live round offers **Just now / 15 min ago / 30 min ago / Custom**. The finish time can't fall before the round's start or after now.

### 5. One tap fixes on tonight's tab
Tapping a round's start or end time opens a small inline control: **−15 / +15 min** nudges plus the same chips, saved right away. The full round editor stays for changing drinks or deleting a round.

### 6. Backdating inside a live round
Choosing **Earlier?** on a drink added to a live round with a time before the round's start moves the round's start earlier. Drinks keep being spread evenly within each round; per drink timestamps are out of scope.

## Implementation steps

1. **`night.js`**
   * `addLiveDrink(state, drink, now, startAt)`: when a new round is opened, use `startAt` (default `now`). Remove the two hour lookback. Route overlaps through the existing `place()` and choice flow instead of passing `'extra'` unconditionally.
   * `lastEndTonight(session, now)`: the latest finished round end, for the "Right after your last round" chip.
   * `finishLive(state, now, endAt)`: accept an end time, clamped to between the start and now.
   * `nudgeRound(state, id, edge, deltaMs, now)`: shift the start or end, keeping start ≤ end ≤ now, and never past a neighbouring round.
2. **`index.html`**
   * Chip row on the add drink sheet, shown only when no round is live.
   * Chip row on Finish.
   * Inline time control on round start and end times on tonight's tab.
   * Feed the overlap prompt from the new placement result.
3. **Tests (`tests/`)**
   * The 9:30 / 10:00 / 11:30 / 12:00 scenario end to end: two rounds, correct windows, correct drink counts.
   * Default chip is "Right after your last round" when a round ended tonight, "Just now" otherwise.
   * Backdated start that overlaps an earlier round triggers the prompt; both answers behave correctly.
   * Future times are rejected; finish before start is clamped.
   * Nudge respects neighbours and now.
   * The existing suite still passes.
4. **Version bump** in `version.js` and the service worker cache name, following the repo's usual release pattern.

## Out of scope
* Per drink timestamps inside a round.
* Changing how `settle()` decides to auto close a round.

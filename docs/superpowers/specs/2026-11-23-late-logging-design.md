# Late Logging: Design

Agreed with the owner on 23 November 2026. Visual reference: the "D · Combined" row of the design canvas at https://claude.ai/artifact/NCd68ZmCCGcfBWGrFezyLK (prototype `CombinedFlow`, frames `CombinedDrop`, `CombinedNight`, `CombinedContinue`, and the overlap sheet on `DialNight`).

## Problem

The model is correct, but the app assumes you log while drinking. A new night starts "2 hours ago" with "I'm still drinking" on, so drinks logged at 10 PM for a 2 PM to 6 PM session are spread from 8 PM to now, and the window keeps stretching. The app then shows you rising when you are sobering up, and gives a sober time hours late. Worse, a second session after a break is either merged into one window or, if logged alone, ignores alcohol still in your system.

## Decisions

1. **The algorithm stays.** Widmark distribution, first order absorption, Michaelis-Menten elimination, one step per minute. No per drink timestamps.
2. **A night is a list of rounds.** A round is some drinks plus a start and an end. Drinks inside a round are spread evenly between its start and end, exactly as today. The model sums every round on one timeline, so leftover alcohol carries into later rounds. Today's single window is a night with one round.
3. **At most one round is live.** A live round has no end; its end follows the clock. "I'm still drinking" becomes "the live round".
4. **The default live start stays at 2 hours ago**, clamped so it never starts before the end of the night's previous round.
5. **Where a round goes** (applies to late rounds and to the first live drink of a new round), checked in this order:
   1. Its alcohol overlaps in time with tonight's (each counted from start to fully sober): **continue** tonight.
   2. It is still in your system now: it becomes tonight. That is a **fresh** night when tonight already has (cleared) rounds, which go to History, and a **continue** when tonight is empty.
   3. It started on an earlier calendar day: **History**.
   4. Tonight is empty: **continue** (it becomes tonight).
   5. It started after tonight cleared: **fresh**.
   6. Otherwise it is an earlier, separate session today: **History**.
6. **Overlapping drinking times ask first.** If a late round's drinking window overlaps a round already on tonight's tab, ask "Same drinks, or extra ones?". Same: merge into one round covering both windows, keeping the larger count of each drink. Extra: keep both. The safe default copy says counting both errs on the safe side.
7. **Carried alcohol is shown.** When a round continues the night, show the estimated level at its start: "At 20:00 you still had 0.070% from earlier, so it counts on top."
8. **Quick chips.** From: 2 h ago, 4 h ago, Lunch (13:00), Last night (yesterday 20:00 to 23:00). Until: Just now, 1 h ago, 2 h ago, 4 h ago. Plus 15 minute nudges.
9. **Favourites remember size.** A favourite is `{ id, ml }`. Defaults: Heineken 330 ml (5%) and Heineken Silver 330 ml (4%). Favourites appear as cards in the late sheet so one round can mix them.
10. **Rounds can be edited and removed** by tapping a round card.
11. **Past nights open from History** and show their horizon and sober time.

## Interface

* **Log earlier drinks sheet: the Dial.** A 24 hour ring, midnight at the top. The round is a thick amber arc, a thin line runs on to the sober time, a dot marks the sober time, a small red dot marks now. Tonight's other rounds show as faint arcs. The centre shows "Fully sober at" with the time and a tag (Today/Tomorrow and time to go). A round headed to History turns the ring blue `#8FB4DA` and the tag reads "Yesterday · History". The button reads "Add round to tonight", "Add round · continues tonight" or "Save to History".
* **Your night: the Horizon.** The hero's silhouette becomes the BAC curve: the ridge is drawn in amber over the sunset, rounds are faint bands labelled ROUND 1, ROUND 2, a dotted line shows what is left from earlier rounds, a red dot marks now, a dashed line marks the legal limit. Round cards sit below with the continuation banner.
* **Hand off.** On adding, the sheet glides down, a glowing orb travels from the dial to the new peak on the horizon, and the hill reshapes. Every move finishes in under 1 second. With Reduce Motion on, the sheet and hill simply cross fade.
* **Style.** The app's own fonts (Alfa Slab One, Schibsted Grotesk), colours and paper texture. Touch targets at least 44 px.

# Late Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people log drinks after the fact as timed rounds, carry leftover alcohol between rounds, and see the night on a dial (logging) and a horizon (viewing).

**Architecture:** `model.js` learns to simulate several rounds on one timeline. A new `night.js` owns the session shape (rounds, the live round, where a new round goes, merging, archiving). Two small view modules, `dial.js` and `horizon.js`, turn model output into SVG geometry and update existing elements in place so CSS transitions animate them. `index.html` wires them into a new late logging sheet and the hero.

**Tech Stack:** Plain browser JavaScript (UMD style files that also `require` in Node), `node:test` for unit tests, Node Playwright 1.63 for the browser check, service worker for offline.

**Spec:** `docs/superpowers/specs/2026-11-23-late-logging-design.md`

## Global Constraints

- No build step and no dependencies. Every new file follows the pattern of `model.js`: an IIFE that sets `root.DryX` in the browser and `module.exports` in Node.
- Unit tests run with `node --test tests/*.test.js` (the directory form fails on Node 22). All 32 existing tests must keep passing.
- Times are epoch milliseconds; "minute of day" and "calendar day" use the device's local time.
- Every new file is added to `ASSETS` in `sw.js` and loaded with a `<script>` tag in `index.html`, so the app stays fully offline.
- Copy: no em dashes, warm and plain, sentence case. Exact strings from the spec are used verbatim.
- Motion: every transition under 1 s, easing `cubic-bezier(.22,1,.36,1)`; with `prefers-reduced-motion: reduce`, moves become opacity cross fades (use the existing `reduceMotionPref()`).
- Touch targets at least 44 px. History tone colour `#8FB4DA`.
- Saved data lives under `localStorage['dryseason.v1']`; old saves must load without losing the tab, history or favourites.

## Review Focus

1. **A round that crosses midnight** (22:00 to 02:00) must draw as one arc on the dial and count as tonight, never History. Test in Task 3 and Task 8.
2. **Upgrading with a live session saved** (old `still: true` shape) must keep drinking going with the same start. Test in Task 2.
3. **"Same drinks" merge must never lose a drink type** that only one of the two rounds had. Test in Task 4.
4. **Removing the only round** must leave an empty night with no errors in the hero, horizon or island. Test in Task 10 (browser check).
5. **Adding a live drink the morning after**, once fully clear, must start a fresh night and save the old one to History, not stretch last night. Test in Task 4.

---

### Task 1: Multi round simulation in the model

**Files:**
- Modify: `model.js` (`simulate`, `stdLastHour`, `pacingGap`, `drivePlan`, exports)
- Test: `tests/model.test.js`

**Interfaces:**
- Produces: `roundsOf(o) -> Array<{start:number, end:number, drinks:Drink[]}>` sorted by start. Uses `o.rounds` when present, else wraps legacy `{drinks, start, end}` as one round.
- Produces: `stopAt(o, t) -> o'` with every round's `end` clamped to `min(end, t)`.
- Produces: `simulate(o)` accepting `o.rounds`; `out.start` is the earliest round start; `out.G` is the total grams. The `extra` option keeps working.
- `stdLastHour`, `pacingGap`, `drivePlan` accept the same `o`. In `drivePlan`, only the round whose `end` is the latest is extrapolated at its own pace; earlier rounds stay fixed.

- [ ] **Step 1: Write the failing tests**

```js
const local = (h, m = 0, d = 23) => new Date(2026, 10, d, h, m).getTime();
const hein = (qty) => ({ name: 'Heineken', abv: 5, ml: 330, qty, share: 1 });
const body = { kg: 75, sex: 'm', beta: 0.015, fed: false };

test('legacy window and a single round give the same curve', () => {
  const legacy = M.simulate(Object.assign({ drinks: [hein(6)], start: local(14), end: local(18) }, body));
  const rounds = M.simulate(Object.assign({ rounds: [{ drinks: [hein(6)], start: local(14), end: local(18) }] }, body));
  assert.deepEqual(rounds, legacy);
});

test('six Heinekens from 2 PM to 6 PM clear at 01:16', () => {
  const sim = M.simulate(Object.assign({ rounds: [{ drinks: [hein(6)], start: local(14), end: local(18) }] }, body));
  assert.equal(sim.peak.toFixed(3), '0.089');
  assert.ok(Math.abs(sim.clear - local(1, 16, 24)) <= 2 * 60000);
});

test('a second round after a break carries the leftover alcohol', () => {
  const o = Object.assign({ rounds: [
    { drinks: [hein(3)], start: local(21), end: local(23) },
    { drinks: [hein(6)], start: local(14), end: local(18) }
  ] }, body);
  const sim = M.simulate(o);
  assert.equal(sim.start, local(14));
  assert.equal(M.bacAt(sim, local(21)).toFixed(3), '0.055');
  assert.equal(M.bacAt(sim, local(23)).toFixed(3), '0.088');
  assert.ok(Math.abs(sim.clear - local(6, 24, 24)) <= 2 * 60000);
});

test('stopAt clamps every round and pace counts only the live round', () => {
  const o = Object.assign({ rounds: [
    { drinks: [hein(6)], start: local(14), end: local(18) },
    { drinks: [hein(2)], start: local(21), end: local(23) }
  ] }, body);
  assert.deepEqual(M.roundsOf(M.stopAt(o, local(22))).map((r) => r.end), [local(18), local(22)]);
  assert.equal(M.stdLastHour(o, local(23)).toFixed(2), (M.gramsOf(hein(2)) / 2 / M.STD_G).toFixed(2));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/model.test.js`
Expected: the 4 new tests FAIL (`roundsOf is not a function` or wrong values); the 9 old tests pass.

- [ ] **Step 3: Implement `roundsOf`, `stopAt`, and rounds in `simulate`, `stdLastHour`, `pacingGap`, `drivePlan`**

In `simulate`, precompute per round `{off: minutes from out.start, dur: max(1, minutes), rate: grams*bio/dur}` and add `rate` on each minute `off <= m < off + dur`. The clear check waits until `m >=` the last round's end offset. `pacingGap` uses `stopAt(o, now)` as its base. `drivePlan` keeps the current single round maths but applies it to the latest ending round, passing the other rounds through unchanged.

- [ ] **Step 4: Run all unit tests**

Run: `node --test tests/*.test.js`
Expected: 36 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add model.js tests/model.test.js
git commit -m "Model: simulate several rounds on one timeline"
```

---

### Task 2: Night module, session shape and migration

**Files:**
- Create: `night.js`
- Modify: `sw.js` (`ASSETS`), `index.html` (`<script src="night.js">` after `model.js`)
- Test: `tests/night.test.js`

**Interfaces:**
- Consumes: `M.simulate`, `M.roundsOf` (Task 1).
- Produces types: `Round = { id: string, start: number, end: number|null, drinks: Drink[], late: boolean }`, `Session = { v: 5, rounds: Round[], fed: boolean, driveAt: number|null, water: object|null }`.
- Produces: `DryNight.migrate(session) -> Session` (idempotent), `DryNight.simOpts(session, profile, now) -> o` for `M.simulate` (live round ends at `now`), `DryNight.liveRound(session) -> Round|null`, `DryNight.lastDrink(session) -> Drink|null`, `DryNight.newId() -> string`.

- [ ] **Step 1: Write the failing tests**

```js
// Same local, hein and body helpers as Task 1, declared at the top of this file.
const N = require('../night.js');

test('an old live session becomes one live round with the same start', () => {
  const s = N.migrate({ start: 1000, end: 2000, still: true, fed: true, driveAt: null, water: null, drinks: [hein(2)] });
  assert.equal(s.v, 5);
  assert.equal(s.rounds.length, 1);
  assert.equal(s.rounds[0].start, 1000);
  assert.equal(s.rounds[0].end, null);
  assert.equal(s.fed, true);
  assert.equal(N.liveRound(s), s.rounds[0]);
});

test('an old finished session keeps its end, and an empty one has no rounds', () => {
  assert.equal(N.migrate({ start: 1, end: 9, still: false, drinks: [hein(1)] }).rounds[0].end, 9);
  assert.deepEqual(N.migrate({ start: 1, end: 9, still: true, drinks: [] }).rounds, []);
});

test('migrate leaves a v5 session alone', () => {
  const s = { v: 5, rounds: [], fed: false, driveAt: null, water: null };
  assert.equal(N.migrate(s), s);
});

test('simOpts ends the live round at now', () => {
  const s = N.migrate({ start: local(20), end: 0, still: true, drinks: [hein(2)] });
  const o = N.simOpts(s, { kg: 75, sex: 'm', beta: 0.015 }, local(22));
  assert.equal(o.rounds[0].end, local(22));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/night.test.js`
Expected: FAIL with `Cannot find module '../night.js'`.

- [ ] **Step 3: Create `night.js` with `migrate`, `simOpts`, `liveRound`, `lastDrink`, `newId`**

Load the model as `typeof module !== 'undefined' && module.exports ? require('./model.js') : root.DryModel`. `lastDrink` returns the last drink of the live round, else of the latest ending round.

- [ ] **Step 4: Run all unit tests**

Run: `node --test tests/*.test.js`
Expected: 40 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add night.js tests/night.test.js sw.js index.html
git commit -m "Night: rounds session shape with migration from the old window"
```

---

### Task 3: Where a new round goes

**Files:**
- Modify: `night.js`
- Test: `tests/night.test.js`

**Interfaces:**
- Consumes: Task 2 types, `M.simulate`, `M.bacAt`.
- Produces: `DryNight.place(session, profile, cand, now) -> { action: 'continue'|'fresh'|'history', carried: number, overlap: { roundId: string, from: number, to: number } | null }`. `cand = { start, end: number|null, drinks }`; `end: null` means live (counts to `now`). `carried` is tonight's BAC at `cand.start` when continuing, else 0. `overlap` compares drinking windows only and is set only when `action === 'continue'`.

Apply the six ordered rules from spec decision 5 (rule 2 returns `fresh` when tonight has rounds and `continue` when it is empty). "Alcohol overlaps in time" means the spans `[start, fully sober]` of tonight and of the candidate intersect. "Earlier calendar day" compares local midnight of `cand.start` with local midnight of `now`.

- [ ] **Step 1: Write the failing tests**

```js
const P = { kg: 75, sex: 'm', beta: 0.015 };
const night = (...rounds) => ({ v: 5, fed: false, driveAt: null, water: null,
  rounds: rounds.map((r, i) => Object.assign({ id: 'r' + i, late: true }, r)) });

test('a round after a break continues while alcohol remains, and reports what was left', () => {
  const p = N.place(night({ start: local(14), end: local(18), drinks: [hein(6)] }), P,
    { start: local(21), end: local(23), drinks: [hein(3)] }, local(23));
  assert.equal(p.action, 'continue');
  assert.equal(p.carried.toFixed(3), '0.055');
  assert.equal(p.overlap, null);
});

test('a late round before tonight still continues when its alcohol reached tonight', () => {
  const p = N.place(night({ start: local(20), end: null, drinks: [hein(2)] }), P,
    { start: local(14), end: local(18), drinks: [hein(6)] }, local(22));
  assert.equal(p.action, 'continue');
});

test('overlapping drinking times are reported', () => {
  const p = N.place(night({ start: local(17), end: null, drinks: [hein(3)] }), P,
    { start: local(14), end: local(18), drinks: [hein(6)] }, local(22));
  assert.deepEqual(p.overlap, { roundId: 'r0', from: local(17), to: local(18) });
});

test('once tonight has cleared, a later round starts a fresh night', () => {
  const p = N.place(night({ start: local(12), end: local(13), drinks: [hein(1)] }), P,
    { start: local(20), end: local(21), drinks: [hein(2)] }, local(22));
  assert.equal(p.action, 'fresh');
});

test('yesterday goes to History, unless it is still in your system', () => {
  const empty = night();
  assert.equal(N.place(empty, P, { start: local(20, 0, 22), end: local(23, 0, 22), drinks: [hein(2)] }, local(22)).action, 'history');
  assert.equal(N.place(empty, P, { start: local(22, 0, 22), end: local(2), drinks: [hein(6)] }, local(3)).action, 'continue');
});

test('an earlier, separate session today goes to History', () => {
  const p = N.place(night({ start: local(20), end: local(21), drinks: [hein(2)] }), P,
    { start: local(11), end: local(12), drinks: [hein(1)] }, local(22));
  assert.equal(p.action, 'history');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/night.test.js`
Expected: the 6 new tests FAIL with `N.place is not a function`.

- [ ] **Step 3: Implement `place`**
- [ ] **Step 4: Run all unit tests**

Run: `node --test tests/*.test.js`
Expected: 46 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add night.js tests/night.test.js
git commit -m "Night: decide whether a round continues, starts fresh or goes to History"
```

---

### Task 4: Adding, merging and archiving rounds

**Files:**
- Modify: `night.js`
- Test: `tests/night.test.js`

**Interfaces:**
- Consumes: `place` (Task 3).
- Produces (all pure, return new objects): 
  - `DryNight.addRound(state, cand, now, choice?) -> { state, outcome: { action, carried, archived: boolean } }`. `state = { profile, session, history }`. `choice` is `'same'|'extra'`; when `place` reports an overlap and `choice` is missing, throw `Error('overlap choice needed')`. `fresh` pushes `summarize` of the old night onto `history` (keep the last 20) and makes `[cand]` the night; `history` pushes `summarize` of the candidate alone; `continue` inserts the round and keeps rounds sorted by start.
  - `DryNight.mergeRounds(a, b) -> Round`: start is the earlier start; end is `null` if either is live, else the later end; drinks are matched by `name|ml|abv|share` and keep the larger `qty`; drinks only one round has are kept.
  - `DryNight.addLiveDrink(state, drink, now) -> { state, outcome }`: adds to the live round (increments `qty` when the last drink matches), otherwise creates a live round starting at the 5 minute floor of `max(now - 2 h, latest round end)` and routes it through `addRound`.
  - `DryNight.finishLive(state, now)`, `DryNight.editRound(state, id, patch)`, `DryNight.removeRound(state, id)`.
  - `DryNight.summarize(session, profile, now) -> { start, clear, G, peak, count, rounds }` (the existing History entry plus `rounds`).

- [ ] **Step 1: Write the failing tests**

```js
const silver = (qty) => ({ name: 'Heineken Silver', abv: 4, ml: 330, qty, share: 1 });
const st = (session) => ({ profile: P, session, history: [] });

test('same drinks merge into one round without losing a drink type', () => {
  const m = N.mergeRounds({ id: 'a', start: local(14), end: local(18), drinks: [hein(6)] },
                          { id: 'b', start: local(17), end: null, drinks: [hein(3), silver(2)] });
  assert.equal(m.start, local(14));
  assert.equal(m.end, null);
  assert.deepEqual(m.drinks.map((d) => d.name + ' ' + d.qty), ['Heineken 6', 'Heineken Silver 2']);
});

test('an overlapping round needs a choice, and extra keeps both', () => {
  const s = st(night({ start: local(17), end: null, drinks: [hein(3)] }));
  const cand = { start: local(14), end: local(18), drinks: [hein(6)] };
  assert.throws(() => N.addRound(s, cand, local(22)), /overlap choice needed/);
  assert.equal(N.addRound(s, cand, local(22), 'extra').state.session.rounds.length, 2);
  assert.equal(N.addRound(s, cand, local(22), 'same').state.session.rounds.length, 1);
});

test('a fresh night saves the old one to History', () => {
  const r = N.addRound(st(night({ start: local(12), end: local(13), drinks: [hein(1)] })),
    { start: local(20), end: local(21), drinks: [hein(2)] }, local(22));
  assert.equal(r.outcome.action, 'fresh');
  assert.equal(r.outcome.archived, true);
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.history[0].rounds.length, 1);
  assert.equal(r.state.session.rounds[0].start, local(20));
});

test('the first live drink starts two hours back, but never before the last round ended', () => {
  const a = N.addLiveDrink(st(night()), hein(1), local(22)).state.session.rounds[0];
  assert.equal(a.start, local(20));
  const b = N.addLiveDrink(st(night({ start: local(18), end: local(21), drinks: [hein(4)] })), hein(1), local(22));
  assert.equal(b.state.session.rounds[1].start, local(21));
  assert.equal(b.outcome.action, 'continue');
});

test('a live drink the morning after, once clear, starts a fresh night', () => {
  const r = N.addLiveDrink(st(night({ start: local(20, 0, 22), end: local(23, 0, 22), drinks: [hein(3)] })), hein(1), local(18));
  assert.equal(r.outcome.action, 'fresh');
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.session.rounds.length, 1);
});

test('a second tap on the same drink adds to its count', () => {
  const once = N.addLiveDrink(st(night()), hein(1), local(22)).state;
  const twice = N.addLiveDrink(once, hein(1), local(22, 5)).state;
  assert.equal(twice.session.rounds[0].drinks[0].qty, 2);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/night.test.js`
Expected: the 6 new tests FAIL with `is not a function`.

- [ ] **Step 3: Implement the functions listed in Interfaces**
- [ ] **Step 4: Run all unit tests**

Run: `node --test tests/*.test.js`
Expected: 52 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add night.js tests/night.test.js
git commit -m "Night: add, merge, finish, edit and archive rounds"
```

---

### Task 5: Favourites remember their size

**Files:**
- Modify: `drinks.js`, `index.html` (picker stars, configure sheet star, island favourites, load)
- Test: `tests/drinks.test.js`

**Interfaces:**
- Produces: `DEFAULT_FAVS = [{ id: 'hein', ml: 330 }, { id: 'hsil', ml: 330 }]`; `normalizeFavs(list) -> Array<{id, ml}>` (old string ids get the drink's default `ml`; unknown ids are dropped); `favOf(entry) -> item | null` (the built in drink with `ml` overridden).
- `state.favs` holds `{id, ml}` objects after load. A favourite is the pair `id + ml`: the star in the drink list saves the default size, a new star in the configure sheet saves the size being configured.

- [ ] **Step 1: Write the failing tests**

```js
test('default favourites are Heineken and Heineken Silver, both 330 ml', () => {
  assert.deepEqual(D.DEFAULT_FAVS, [{ id: 'hein', ml: 330 }, { id: 'hsil', ml: 330 }]);
  assert.equal(grams(D.favOf(D.DEFAULT_FAVS[1])).toFixed(1), '10.4');
  assert.equal(grams(D.favOf(D.DEFAULT_FAVS[0])).toFixed(1), '13.0');
});

test('old favourites keep working with their usual size', () => {
  assert.deepEqual(D.normalizeFavs(['hsil', 'corona', 'gone']), [{ id: 'hsil', ml: 440 }, { id: 'corona', ml: 355 }]);
  assert.equal(D.favOf('corona').ml, 355);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/drinks.test.js`
Expected: FAIL (`DEFAULT_FAVS` differs, `favOf is not a function`).

- [ ] **Step 3: Implement `normalizeFavs`, `favOf`, new `DEFAULT_FAVS`, and use them in `index.html`**

Call `normalizeFavs` in `load()`. Key favourites by `id + '|' + ml` wherever `isFav` and the island's `favs` list are built.

- [ ] **Step 4: Run all unit tests**

Run: `node --test tests/*.test.js`
Expected: 54 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add drinks.js index.html tests/drinks.test.js
git commit -m "Favourites remember their size; Heineken 330 ml and Silver 330 ml by default"
```

---

### Task 6: Run the app on rounds

The app keeps its current look in this task; only the data underneath changes, plus the night section.

**Files:**
- Modify: `index.html` (`load`, `newSession`, `effectiveEnd`, `opts`, `renderTimes`, `renderTab`, `renderRisk`, drive planner, `cfgAdd`, `addFromIsland`, island snapshot, tick loop, `saveNight`, `newNight`)
- Create: `tests/late_check.js` (browser check, extended in Tasks 8 to 10)

**Interfaces:**
- Consumes: everything in `DryNight` (Tasks 2 to 4).
- Replace every use of `state.session.start/end/still/drinks` with `DryNight` calls: `opts()` returns `DryNight.simOpts(state.session, state.profile, Date.now())`; "still drinking" means `DryNight.liveRound(state.session) !== null`; the last drink comes from `DryNight.lastDrink`.
- Live adds (`cfgAdd`, `addFromIsland`) go through `DryNight.addLiveDrink`. On `fresh`, toast exactly: `New night started. The last one is saved in History.`
- "The night" section: remove the Started and Stopped inputs and the "I'm still drinking" switch; keep "I ate a proper meal". Add `<ul id="rounds">` of round cards (time range, drinks, "logged late" or "still going") and, on the live round's card, a button `Finished drinking` that calls `finishLive`. The tab groups drinks under each round's time range.

- [ ] **Step 1: Write the failing browser check**

`tests/late_check.js` serves the repo with `python3 -m http.server` on a free port, launches `require('playwright').chromium`, sets `page.clock.setFixedTime(new Date(2026, 10, 23, 22, 0))`, writes the old session shape below to `localStorage['dryseason.v1']`, reloads, and asserts. It exits non zero on any failure or console error.

```js
const old = { profile: { kg: 75, sex: 'm', beta: 0.015, limit: 0.05, island: true },
  session: { start: local(20), end: local(22), still: true, fed: false, driveAt: null, water: null, drinks: [hein(2)] },
  history: [], favs: ['hsil', 'corona'] };
// after reload:
expect(await page.locator('#rounds li').count()).toBe(1);
expect(await page.locator('#rounds li').first().innerText()).toContain('20:00');
expect(await page.locator('#rounds li').first().innerText()).toContain('still going');
await page.getByRole('button', { name: 'Finished drinking' }).click();
expect(await page.locator('#rounds li').first().innerText()).toContain('20:00 to 22:00');
```

- [ ] **Step 2: Run it to see it fail**

Run: `node tests/late_check.js`
Expected: FAIL, `#rounds` not found.

- [ ] **Step 3: Rewire `index.html` as described in Interfaces**
- [ ] **Step 4: Run the browser check and all unit tests**

Run: `node tests/late_check.js && node --test tests/*.test.js`
Expected: `late_check: ok`, then 54 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/late_check.js
git commit -m "Run the app on rounds; round cards replace the start and stop fields"
```

---

### Task 7: The horizon in the hero

**Files:**
- Create: `horizon.js`
- Modify: `index.html` (replace the static `svg.horizon` in the hero with `svg#horizon`, about 150 px tall, styles), `sw.js`
- Test: `tests/horizon.test.js`

**Interfaces:**
- Consumes: `M.simulate` output, `M.bacAt`, rounds from `DryNight.simOpts(...).rounds`.
- Produces: `DryHorizon.paths(sim, rounds, now, { width, height, max, limit, prevSim }) -> { ridge, area, bands: [{x, w, label}], ghost: string|null, nowX, nowY, moonX, limitY, from, to }`. Exactly 64 sample points from `from` to `to`, so CSS `d: path(...)` transitions interpolate. `from` is the hour floor of the first start minus 1 h; `to` is the later of fully sober plus 1 h and now plus 2 h, with a 20 h minimum span. `ghost` is what is left from all rounds except the latest, drawn from the latest round's start to their sober time; `null` when they had cleared. With no drinks, the ridge is flat on the baseline.
- Produces: `DryHorizon.render(svg, view)` updates existing child elements (ridge, area, band rects and labels, ghost, limit line, now dot, moon, acacia) and sets the path `d` both as attribute and as `style.d`.

- [ ] **Step 1: Write the failing tests**

```js
const Hz = require('../horizon.js');
const opts = { width: 400, height: 150, max: 0.11, limit: 0.05 };
const two = { rounds: [{ drinks: [hein(6)], start: local(14), end: local(18) }, { drinks: [hein(3)], start: local(21), end: local(23) }], kg: 75, sex: 'm', beta: 0.015, fed: false };

test('the ridge always has 64 points so it can morph', () => {
  const v = Hz.paths(M.simulate(two), M.roundsOf(two), local(23), opts);
  assert.equal(v.ridge.match(/[ML]/g).length, 64);
  assert.equal(v.bands.length, 2);
  assert.deepEqual(v.bands.map((b) => b.label), ['ROUND 1', 'ROUND 2']);
});

test('the ghost shows what is left from earlier rounds', () => {
  const first = Object.assign({}, two, { rounds: [two.rounds[0]] });
  const v = Hz.paths(M.simulate(two), M.roundsOf(two), local(23), Object.assign({ prevSim: M.simulate(first) }, opts));
  assert.ok(v.ghost && v.ghost.startsWith('M'));
});

test('an empty night is a flat horizon', () => {
  const v = Hz.paths(M.simulate({ rounds: [], kg: 75, sex: 'm', beta: 0.015 }), [], local(22), opts);
  assert.ok(v.ridge.split('L').every((p) => p.trim().endsWith(' ' + opts.height.toFixed(1))));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/horizon.test.js`
Expected: FAIL with `Cannot find module '../horizon.js'`.

- [ ] **Step 3: Implement `paths` and `render`; call `render` from `renderHero` and add the new markup and CSS**

Keep the acacia silhouette; it sits on the baseline at the left. Ridge stroke `var(--amber)` 3 px; area fill a vertical gradient of amber from 0.55 to 0 opacity; bands `rgba(246,237,218,.06)`; ghost `stroke-dasharray: 2 4`.

- [ ] **Step 4: Run all unit tests and the browser check**

Run: `node --test tests/*.test.js && node tests/late_check.js`
Expected: 57 tests, 0 failures, then `late_check: ok`.

- [ ] **Step 5: Commit**

```bash
git add horizon.js index.html sw.js tests/horizon.test.js
git commit -m "Hero horizon: the hills are your blood alcohol, round by round"
```

---

### Task 8: The dial sheet for logging earlier drinks

**Files:**
- Create: `dial.js`
- Modify: `index.html` (new `<dialog class="sheet" id="late">`, a `Log earlier drinks` button in the night section, styles), `sw.js`, `tests/late_check.js`
- Test: `tests/dial.test.js`

**Interfaces:**
- Consumes: `DryNight.place`, `DryNight.addRound` (Tasks 3, 4), `D.favOf` (Task 5).
- Produces: `DryDial.minuteOfDay(ms) -> 0..1439`; `DryDial.arc(start, end) -> { dasharray: string, dashoffset: number }` for a circle with `pathLength="1440"` rotated so midnight is at the top; `DryDial.point(ms, r, cx, cy) -> {x, y}`; `DryDial.render(svg, { round: {start, end}, others: [{start, end}], soberAt, now, tone: 'amber'|'history' })`.
- Sheet state: a draft `{ start, end, drinks }` that starts as From `2 h ago`, Until `Just now`, and one of the first favourite. Chips and nudges exactly as spec decision 8. Favourite cards: tap the name to add one, `−` to remove one, the round can never reach zero drinks; an `All drinks` link opens the existing picker and adds the chosen drink to the draft.
- Live preview on every change: run `place` against the current night, simulate the result, and show "Fully sober at" or "Sober since", the time, and the tag. Button text: `Add round to tonight`, `Add round · continues tonight`, or `Save to History`; tone `history` when `place` says History.
- On commit with no overlap: `addRound`, save, close the sheet, render. (Overlap and the hand off arrive in Task 9.)

- [ ] **Step 1: Write the failing tests**

```js
const Dl = require('../dial.js');

test('a 2 PM to 6 PM round is a 240 minute arc starting at 14:00', () => {
  assert.deepEqual(Dl.arc(local(14), local(18)), { dasharray: '240 1440', dashoffset: -840 });
});

test('a round across midnight is one arc', () => {
  assert.deepEqual(Dl.arc(local(22), local(2, 0, 24)), { dasharray: '240 1440', dashoffset: -1320 });
});

test('midnight is at the top and 6 AM on the right', () => {
  const top = Dl.point(local(0), 100, 195, 130), right = Dl.point(local(6), 100, 195, 130);
  assert.deepEqual([Math.round(top.x), Math.round(top.y)], [195, 30]);
  assert.deepEqual([Math.round(right.x), Math.round(right.y)], [295, 130]);
});
```

Extend `tests/late_check.js`: with an empty night at 22:00, open `Log earlier drinks`, tap chips so the round is 14:00 to 18:00 with Heineken × 6, and assert the sheet shows `01:16`; tap `Add round to tonight` and assert the hero shows `01:16` and one round card reads `14:00 to 18:00`. Then tap `Last night` and assert the button reads `Save to History`.

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/dial.test.js && node tests/late_check.js`
Expected: FAIL with `Cannot find module '../dial.js'`.

- [ ] **Step 3: Implement `dial.js`, the sheet markup, CSS and wiring**

Ring radius 100, stroke 18, hour ticks every hour with longer ticks at 00, 06, 12, 18. Arcs and handles transition `stroke-dasharray`, `stroke-dashoffset`, `cx`, `cy` over 0.7 s.

- [ ] **Step 4: Run all unit tests and the browser check**

Run: `node --test tests/*.test.js && node tests/late_check.js`
Expected: 60 tests, 0 failures, then `late_check: ok`.

- [ ] **Step 5: Commit**

```bash
git add dial.js index.html sw.js tests/dial.test.js tests/late_check.js
git commit -m "Log earlier drinks on a 24 hour dial with quick chips and favourites"
```

---

### Task 9: Overlap question, continuation banner and the hand off

**Files:**
- Modify: `index.html`, `tests/late_check.js`

**Interfaces:**
- Consumes: `place(...).overlap`, `place(...).carried`, `addRound(..., choice)`, `DryHorizon.paths(...).bands` and the peak position.
- Overlap: when `place` reports an overlap, the sheet switches to a second view (like the picker's list and configure views) titled `Same drinks, or extra ones?` with the two choices and the line `Not sure? Counting both keeps your estimate on the safe side.` (copy as on the `DialNight` board).
- Banner under the horizon after a continuing round: `This round continues tonight.` then `At HH:MM you still had 0.0XX% from earlier, so it counts on top.` After a fresh night: `A fresh night.` `Your earlier drinks had cleared, so that night is saved in History.` After History: `Saved to History.` `That night does not change tonight's numbers.` The banner stays until the next change to the night.
- Hand off: the sheet slides down, a 26 px amber orb travels from the dial centre to the new peak on the horizon and fades, the hill morphs. 0.8 s in total. With Reduce Motion on, cross fade only and no orb.

- [ ] **Step 1: Extend the browser check**

Continuing from Task 8's state (round 14:00 to 18:00): log 3 × Heineken from 20:00 to Just now; assert the button reads `Add round · continues tonight`, then after adding, the banner contains `At 20:00 you still had 0.070%` and the hero reads `06:22`. Then log 2 × Heineken from 17:00 to 18:00; assert `Same drinks, or extra ones?` appears; choose `Extra drinks` and assert three round cards.

- [ ] **Step 2: Run it to see it fail**

Run: `node tests/late_check.js`
Expected: FAIL at the banner assertion.

- [ ] **Step 3: Implement the overlap view, banner and hand off**
- [ ] **Step 4: Run all checks**

Run: `node --test tests/*.test.js && node tests/late_check.js`
Expected: 60 tests, 0 failures, then `late_check: ok`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/late_check.js
git commit -m "Ask about overlaps, explain carried alcohol, and hand the round to the horizon"
```

---

### Task 10: Edit and remove rounds; open past nights

**Files:**
- Modify: `index.html`, `tests/late_check.js`

**Interfaces:**
- Consumes: `editRound`, `removeRound` (Task 4), the dial sheet (Task 8), `DryHorizon` (Task 7), History entries with `rounds` (Task 4).
- Tapping a round card opens the dial sheet in edit mode: title `Edit round`, button `Save round`, plus a quiet `Remove round` button with a `confirm('Remove this round?')`. Saving an edit does not re-run `place`.
- Tapping a History entry that has `rounds` opens a read only sheet with that night's horizon, peak and sober time. Older entries without `rounds` stay as they are.

- [ ] **Step 1: Extend the browser check**

Tap the `14:00 to 18:00` card, nudge Until 15 minutes earlier, `Save round`, and assert the card reads `14:00 to 17:45`. Then remove every round through its card and assert the hero reads `--:--`, the horizon is flat and there are no console errors. Seed one History entry with `rounds`, tap it, and assert the sheet shows its sober time.

- [ ] **Step 2: Run it to see it fail**

Run: `node tests/late_check.js`
Expected: FAIL, `Edit round` not found.

- [ ] **Step 3: Implement edit mode, removal and the History sheet**
- [ ] **Step 4: Run all checks**

Run: `node --test tests/*.test.js && node tests/late_check.js`
Expected: 60 tests, 0 failures, then `late_check: ok`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/late_check.js
git commit -m "Edit or remove a round, and open past nights from History"
```

---

### Task 11: Release 5.0

**Files:**
- Modify: `version.js`, `README.md`, `tests/offline_check.py` (only if it lists asset files)

- [ ] **Step 1: Set `DRY_VERSION = '5.0.0'` and replace `DRY_CHANGES` with these lines**

```js
'Log drinks you already had: set when you started and stopped on a 24 hour dial, and see straight away when you will be fully sober.',
'A night can have several rounds. Alcohol still in your system from an earlier round counts toward the next one.',
'Your horizon is now your night: the hills show your level, round by round.',
'Favourites remember their size. Heineken 330 ml and Heineken Silver 330 ml are the new defaults.'
```

- [ ] **Step 2: Add a "New in 5.0: late logging" section to the top of `README.md`**, in the same style as 4.3, covering rounds, the dial, the horizon, the continuation rule and History.
- [ ] **Step 3: Run every check**

Run: `node --test tests/*.test.js && node tests/late_check.js`
Expected: 60 tests, 0 failures, then `late_check: ok`. Then confirm offline: open the app, switch the server off, reload, and log a round.

- [ ] **Step 4: Commit**

```bash
git add version.js README.md
git commit -m "Dry Season 5.0: late logging"
```

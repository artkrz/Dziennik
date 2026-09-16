# Known issues and follow-ups — 2026-09-16

Carried out of the session that produced the
[session reliability and endpoint wiring](plans/2026-09-16-session-reliability-and-endpoint-wiring.md)
branch. Everything here was found by review, judged non-blocking, and
deliberately not fixed. Nothing here blocks merge.

## Library bugs (pre-existing, not introduced by that branch)

### `lib/resources/absence.js` — the semester split has never worked

```js
_.groupBy(array, (obj, index) => +(index < semesterSize))
```

Lodash's `groupBy` iteratee receives **only the value**, so `index` is always
`undefined` and the expression is always `0`. Every absence collapses into key
`"0"`; the `"1"` key never appears. Verified: grouping 5 rows with
`semesterSize = 3` yields keys `["0"]`.

Not fixed because it needs a real design decision — `semesterSize` is a
scrape-time row index, and detecting the semester boundary properly is its own
piece of work. Both consumers are agnostic: `routes/absences.js` wraps whatever
it gets as `{ semesters }`, and `AbsencesCard` sums across all buckets, so the
displayed count is correct either way. `app/frontend/src/api.ts` carries a
comment so the next consumer does not build on a split that isn't there.

### `lib/resources/inbox.js` — three methods bypass the caller-readiness guard

`removeMessage`, `sendMessage` and `getFile` call `this.api.caller.*` directly
rather than going through `_request`. They would hit the same
`TypeError: Cannot read properties of undefined (reading 'request')` that the
branch fixed, if they were the first call on a freshly restored client.

Unreachable from the app (no route uses them) but **reachable by consumers of
the published npm package**. Same defect class as the Critical the branch fixed;
worth closing for library users.

### `lib/api.js` — `authorize()` is safe only by accident

`authorize` calls `caller.get`/`postForm` directly. Both URLs it visits
(`/loguj/portalRodzina`, `/OAuth/Authorization`) match `looksLikeLoginPage`'s own
regexes, so routing it through `_request` would make every login throw
`LibrusSessionExpiredError` and loop. A `NOTE` comment above the call now says
so — do not remove it.

## Product decisions left to the owner

### Teacher-absence agenda entries always show "not found"

`getEvent(id)` defaults to `terminarz/szczegoly/<id>`; teacher-absence entries
live at `terminarz/szczegoly_wolne/<id>`, whose table the default branch cannot
read. `getCalendar` gives no signal to tell the two apart, so the route returns a
clean 404 rather than guessing, and the dialog says "Brak dodatkowych
informacji."

Options: fall back to the absence variant when the first result is empty, or
soften the copy. Either is a product call.

### Two delete paths

`SettingsView` and `TimetableDialog` both delete an account, both now behind the
same `window.confirm`. Settings is the canonical home for account management;
the timetable-dialog button is arguably redundant. Removing it is a product
decision, deliberately not made.

## Validation and robustness

- **Three id-validation postures coexist.** `PATCH /accounts/:id` validates and
  400s; `DELETE /accounts/:id` validates nothing and returns 204 for
  `/accounts/abc`; the seven data routers don't validate `accountId` either. No
  security impact — `accountId` is a bound SQLite parameter and never reaches a
  Librus URL — but a non-numeric id produces a shared `grades:[null]`-style cache
  key. Pick one posture and apply it.
- **`cache.invalidateAccount` substring-matches a key format it doesn't own.** A
  crafted query value can forge a match (`?from=:[7]`), causing a spurious cache
  *miss* for another account — never a leak. The robust fix is to store the
  accountId on the entry at `fetch` time and compare values.
- **The cache has no sweep and no maximum size.** Expired entries are replaced on
  re-request but never dropped, and `timetable`/`agenda`/`homework` take
  arbitrary query params, so the key set is caller-shaped.
- **`withSession` retries on any error, not just `LibrusSessionExpiredError`.**
  Deliberate — it buys resilience to transient failures — but a persistent parse
  failure now costs one full login per request, and failures are never cached so
  nothing dampens it.
- **`persistSession` runs only from `login()`**, so a client that restored a jar
  never re-serializes it; the stored row only ages until the next full login.

## Test gaps worth closing

- `looksLikeLoginPage` has only ever been tested against a **synthetic** fixture.
  Whether it fires against Librus's real login page is unvalidated and needs a
  live session. This detector gates every library request.
- `routes/info.js` (lucky-number, announcements) has no tests. Both are currently
  unreachable from the UI; add tests before the first card consumes them.
- `agendaEvent.test.js`'s `0`-return case documents `_singleMapper`'s real return
  shape but does not discriminate — almost any truthiness guard passes it.
- `TimetableDialog`'s delete confirmation has no component test; the frontend has
  no test harness at all (`app/frontend/package.json` has no test script).
- `lib/api.js`'s `_getFile` bypasses `_request`, so attachment downloads get no
  session-expiry detection.

## Cosmetic

- `App.tsx` calls `setSelectedId` from inside a `setAccounts` updater. Updaters
  must be pure and React StrictMode double-invokes them; the computation is
  idempotent so there is no live bug, but it will bite under a future React.
  Deriving `selected` with an `?? accounts[0]` fallback removes the class.
- `App.tsx`'s "Wybierz dziecko na stronie głównej." branch is unreachable — every
  path that mutates `accounts` also repoints `selectedId`. Defensive only.
- `EditAccountDialog`'s effect deps omit `account.id`; unreachable today because
  `SettingsView` fully unmounts the dialog between rows.

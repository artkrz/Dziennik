# Session Reliability and Endpoint Wiring — Design

**Status:** approved 2026-09-16
**Plan:** [docs/superpowers/plans/2026-09-16-session-reliability-and-endpoint-wiring.md](../plans/2026-09-16-session-reliability-and-endpoint-wiring.md)

## Problem

Two separate problems, both found while surveying the Librus API surface on 2026-09-16.

### 1. The session layer is fragile in ways that risk the account

`app/backend/src/librusSessions.js` holds authorized clients in an in-memory
`Map`, and `lib/api.js` builds a brand-new `CookieJar` per client. Together
that means:

- **Every backend restart is a brand-new device to Librus.** The
  `DeviceCookie` set on `api.librus.pl` (~1 year lifetime) is believed to be
  what lets a normal login skip the captcha/2FA challenge. Discarding it on
  every restart steadily raises the odds of hitting a reCAPTCHA that a
  headless backend cannot solve, which takes the whole app down until a human
  intervenes.
- **Session expiry is detected by guessing at payload shapes.**
  `routes/messages.js:19` treats an empty inbox as an expired session and
  `routes/timetable.js:16` treats an empty timetable week the same way. A
  legitimately empty inbox or a holiday week therefore triggers a full
  re-login on every request — more logins, for no reason, against an account
  we are trying to keep quiet.
- **A captcha challenge surfaces as an opaque parse failure.** `authorize()`
  has no idea what a captcha page looks like, so the failure shows up
  somewhere downstream as a cheerio selector returning nothing.
- **There is no caching or rate limiting at all.** Every browser request
  produces a live Librus request. The project's own README warns against
  systematic scraping; the app currently does the opposite.

### 2. The app uses about a third of the library it ships

`lib/` already implements `getGrades`, `getAbsences`, `getCalendar`,
`listHomework`, `getLuckyNumber` and `listAnnouncements`. The backend exposes
none of them — `app/backend/src/routes/` covers only accounts, timetable and
inbox. The highest-value-per-line work available is wiring up code that is
already written and already working.

## Non-goals for this plan

- The JSON gateway migration (`synergia.librus.pl/gateway/api/2.0`). That is
  the follow-up plan and is gated on smoke-test results; this plan only
  delivers the smoke-test script that produces those results.
- Change detection / push notifications, snapshot history, iCal export,
  combined family briefing. All deferred.
- Any change to the Librus ToS position. Moving to a private gateway later
  does not change it either; caching and rate limiting are the only things
  here that actually reduce exposure.

## Decisions

### `lib/` is now modifiable

Both prior plans carry the constraint "`lib/` (the published `librus-api`
library) is never modified". **This plan deliberately reverses that.** This
repo is the maintained fork and the session/auth concerns being fixed belong
in the library, not bolted onto one consumer of it. The constraint is
retired, not violated by accident — future plans should not re-assert it.

Root `package.json` is likewise now modifiable, but only to add a `test`
script. No new runtime dependencies: Node's built-in test runner needs none.

### Session persistence is encrypted at rest

The serialized cookie jar is a bearer credential — anyone holding it is
logged in as the student until it expires. It gets the same AES-256-GCM
treatment as the stored password, reusing `app/backend/src/crypto.js`, in a
`sessions` table keyed by account id.

### Expiry is detected at the source, not guessed at the edge

`lib/api.js` learns what a Librus login page looks like and throws a typed
`LibrusSessionExpiredError` from `_request`. The backend's existing
catch-and-retry path in `withSession` then handles it correctly for every
route at once, and the per-route `isExpired` payload heuristics are deleted
rather than refined.

### Cache is per account and per resource, in memory

A TTL cache with in-flight deduplication. In memory is sufficient: a cold
cache after a restart costs one Librus request per card, and keeping it out
of SQLite avoids persisting student data we would then have to reason about.
Timetable and grades change slowly; a 5-minute default TTL is a large
reduction in traffic with no visible staleness for a dashboard.

Messages get the same treatment for the *list*, but a single message body is
never cached and never prefetched — on the newer messages subsystem, fetching
one message marks it read server-side, so it must only ever follow a
deliberate user action.

## Interfaces introduced

```
lib/errors.js
  LibrusError, LibrusAuthError, LibrusCaptchaError, LibrusSessionExpiredError

lib/api.js
  new Librus(cookies, { session, caller, ... })
  client.exportSession() -> string
  client.importSession(serialized) -> void
  Librus.looksLikeLoginPage($) -> boolean

app/backend/src/db.js
  makeSessionsStore(db) -> { save, load, remove }

app/backend/src/cache.js
  createCache({ ttlMs }) -> { fetch(key, producer), invalidate(key), clear() }

app/backend/src/routes/
  grades.js, absences.js, agenda.js, homework.js, info.js

scripts/gateway-smoke-test.js
  standalone; credentials from env; prints per-endpoint status + shape
```

## Risks

- **The captcha marker is a guess until observed.** The detector matches on
  several signals (a `g-recaptcha` element, the `captcha` query parameter,
  the login form reappearing) rather than one brittle string, and failing to
  detect one degrades to today's behavior — an error — not to something worse.
- **Cookie-jar serialization format is `tough-cookie`'s.** A major-version
  bump could invalidate stored sessions. `importSession` treats any
  deserialization failure as "no session", falling back to a fresh login.
- **The smoke test hits a real account.** It is read-only, runs each endpoint
  once, and is meant to be run by hand, not scheduled.

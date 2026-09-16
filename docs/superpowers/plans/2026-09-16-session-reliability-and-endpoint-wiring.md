# Session Reliability and Endpoint Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Librus session layer survive restarts without re-registering as a new device, detect captcha and expiry properly instead of guessing, stop hammering Librus on every page view, and expose the six library endpoints the app already ships but never calls.

**Architecture:** `lib/` gains a typed error module, captcha/expiry detection, and cookie-jar export/import so a session can outlive the process. The backend persists that jar encrypted in SQLite next to the password, wraps every Librus call in a TTL cache with in-flight deduplication, and grows five new routers over library methods that already exist. The frontend adds bento cards for grades, absences and the agenda. A standalone smoke-test script (run by hand, never scheduled) probes the JSON gateway to unblock the follow-up plan.

**Tech Stack:** Node.js 20, Express, `better-sqlite3`, `node:test`, `tough-cookie`, `cheerio`, React 18 + Vite + TypeScript, Tailwind v4, shadcn/ui, MagicUI (`bento-grid`, `dock`), Docker.

**Spec:** [docs/superpowers/specs/2026-09-16-session-reliability-and-endpoint-wiring-design.md](../specs/2026-09-16-session-reliability-and-endpoint-wiring-design.md)

## Global Constraints

- **`lib/` IS modifiable in this plan.** This deliberately retires the "`lib/` is never modified" constraint from the 2026-09-14 and 2026-09-15 plans. Do not re-assert it.
- Root `package.json` may be modified **only** to add a `test` script. No new runtime or dev dependencies anywhere — `node --test` is built in.
- Librus passwords are never logged: in every `catch`, log **only `error.message`**, never the raw error (an `AxiosError` carries the plaintext password in `error.config.data`).
- A serialized cookie jar is a bearer credential. It is encrypted at rest with the same AES-256-GCM helper as the password and is never logged, never returned over HTTP, and never sent to the frontend.
- Message bodies are third-party content: the API returns plain-text `content` only — the library's raw `html` field must never reach the frontend.
- Any id interpolated into an outbound Librus URL path must be validated as a positive integer first.
- A single message body is never cached and never prefetched — on the newer messages subsystem a GET marks it read server-side, so it must only follow a deliberate user action.
- Backend still refuses to start without `ACCOUNTS_ENC_KEY`.
- Generated shadcn/MagicUI components import the class helper as `import { cn } from "cn"` (the `cn` npm package), **not** from `@/lib/utils`.
- Backend tests run with `cd app/backend && npm test`; library tests with `npm test` at the repo root.
- **The repo root has no `node_modules`.** Run `npm install` at the root once before Task 2 — `lib/api.js` requires `cheerio`, `lodash`, `axios` and `tough-cookie`, so every library test fails with `Cannot find module 'cheerio'` until it is installed. `npm install` only materializes what `package-lock.json` already pins; it must not change the lockfile.

---

## File Structure

```
scripts/
  gateway-smoke-test.js          # NEW: hand-run JSON gateway probe (Task 1)

lib/
  errors.js                      # NEW: typed error hierarchy (Task 2)
  api.js                         # MOD: caller injection, captcha detection,
                                 #      session export/import, login-page detection
test/
  errors.test.js                 # NEW (Task 2)
  authorize.test.js              # NEW (Task 2)
  session.test.js                # NEW (Task 3)
  request.test.js                # NEW (Task 5)
  tableValues.test.js            # NEW (Task 6)

app/backend/src/
  crypto.js                      # MOD: generic encryptText/decryptText (Task 4)
  db.js                          # MOD: sessions table + makeSessionsStore (Task 4)
  librusSessions.js              # MOD: restore/persist session (Task 4),
                                 #      drop isExpired plumbing (Task 5)
  cache.js                       # NEW: TTL cache + in-flight dedupe (Task 7)
  server.js                      # MOD: wire stores, cache, new routers
  routes/
    timetable.js                 # MOD: drop isExpired heuristic, use cache
    messages.js                  # MOD: drop isExpired heuristic, cache list only
    grades.js                    # NEW (Task 8)
    absences.js                  # NEW (Task 8)
    agenda.js                    # NEW (Task 8)
    homework.js                  # NEW (Task 8)
    info.js                      # NEW (Task 8)

app/backend/test/
  cache.test.js                  # NEW (Task 7)
  grades.test.js                 # NEW (Task 8)
  absences.test.js               # NEW (Task 8)
  agenda.test.js                 # NEW (Task 8)

app/frontend/src/
  api.ts                         # MOD: new typed clients (Task 9)
  components/GradesCard.tsx      # NEW (Task 9)
  components/AbsencesCard.tsx    # NEW (Task 9)
  components/AgendaCard.tsx      # NEW (Task 9)
  components/AppDock.tsx         # MOD: two new views
  App.tsx                        # MOD: render the new views
```

**Task order rationale:** Task 1 ships first so its output can be produced by
hand while the rest proceeds — it blocks the *follow-up* plan, nothing here.
Tasks 2–3 build the library primitives Task 4 consumes. Task 5 must land
before Task 7, because the cache would otherwise memoize a login page.

---

### Task 1: JSON gateway smoke-test script

Standalone, hand-run, read-only. Prints **shapes only** — endpoint, HTTP
status, top-level keys, item count, and the keys of the first item. It never
prints a value, so the output is safe to paste into an issue or a chat.

**Files:**
- Create: `scripts/gateway-smoke-test.js`

**Interfaces:**
- Consumes: `lib/api.js`'s existing `authorize(login, pass)` and the
  `client.caller` axios instance it leaves behind.
- Produces: nothing other code imports. Output feeds the follow-up plan.

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
"use strict";

/**
 * Hand-run probe for the Librus JSON gateway.
 *
 * Usage:
 *   LIBRUS_LOGIN=1234567u LIBRUS_PASS='...' node scripts/gateway-smoke-test.js
 *
 * Read-only: one GET per endpoint, nothing written, nothing scheduled.
 * Prints SHAPES ONLY (status, key names, counts) - never a value - so the
 * output is safe to share.
 */

const Librus = require("../lib/api.js");

const GATEWAY = "https://synergia.librus.pl/gateway/api/2.0";

const ENDPOINTS = [
  "Me",
  "Grades",
  "Grades/Categories",
  "Grades/Comments",
  "Grades/Types",
  "PointGrades",
  "DescriptiveGrades",
  "TextGrades",
  "Notes",
  "Notes/Categories",
  "BehaviourGrades/Points",
  "BehaviourGrades/Points/Categories",
  "BehaviourGrades/Points/Comments",
  "Attendances",
  "Attendances/Types",
  "Timetables",
  "HomeWorks",
  "HomeWorks/Categories",
  "HomeWorkAssignments",
  "SchoolNotices",
  "LuckyNumbers",
  "Subjects",
  "Users",
  "Classrooms",
  "Schools",
  "Classes",
  "VirtualClasses",
  "SchoolFreeDays",
  "ClassFreeDays",
  "ParentTeacherConferences",
  "Units",
];

/** Describe a payload without revealing any of its values. */
function describe(payload) {
  if (payload === null || payload === undefined) return "empty";
  if (Array.isArray(payload)) {
    return `bare array (${payload.length}) first item keys: ${itemKeys(payload[0])}`;
  }
  if (typeof payload !== "object") return typeof payload;

  const keys = Object.keys(payload);
  const parts = [`keys: [${keys.join(", ")}]`];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      parts.push(`${key}[] count=${value.length} item keys: ${itemKeys(value[0])}`);
    }
  }
  return parts.join(" | ");
}

function itemKeys(item) {
  if (!item || typeof item !== "object") return "-";
  return `[${Object.keys(item).join(", ")}]`;
}

async function main() {
  const login = process.env.LIBRUS_LOGIN;
  const pass = process.env.LIBRUS_PASS;
  if (!login || !pass) {
    console.error("Set LIBRUS_LOGIN and LIBRUS_PASS in the environment.");
    process.exit(1);
  }

  const client = new Librus();
  try {
    await client.authorize(login, pass);
  } catch (error) {
    // Only error.message - the raw error can carry the plaintext password.
    console.error(`Login failed: ${error.message}`);
    process.exit(1);
  }
  console.log("Login OK. Probing gateway endpoints...\n");

  let reachable = 0;
  for (const endpoint of ENDPOINTS) {
    let line;
    try {
      const response = await client.caller.get(`${GATEWAY}/${endpoint}`, {
        validateStatus: null,
        headers: { Accept: "application/json" },
      });
      if (response.status === 200) reachable += 1;
      const shape = response.status === 200 ? describe(response.data) : "";
      line = `${String(response.status).padEnd(4)} ${endpoint.padEnd(34)} ${shape}`;
    } catch (error) {
      line = `ERR  ${endpoint.padEnd(34)} ${error.message}`;
    }
    console.log(line);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.log(`\n${reachable}/${ENDPOINTS.length} endpoints returned 200.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it refuses to run without credentials**

Run: `node scripts/gateway-smoke-test.js`
Expected: prints `Set LIBRUS_LOGIN and LIBRUS_PASS in the environment.`, exit code 1.

- [ ] **Step 3: Commit**

```bash
git add scripts/gateway-smoke-test.js
git commit -m "feat: add hand-run JSON gateway smoke-test script"
```

- [ ] **Step 4: Hand off to the user**

Tell the user to run it themselves so no credentials enter the transcript:

```
! LIBRUS_LOGIN=... LIBRUS_PASS='...' node scripts/gateway-smoke-test.js
```

Do not run it on their behalf and do not ask for the credentials.

---

### Task 2: Typed errors and captcha detection in `authorize()`

Today a wrong password makes `authorize()` reach `new URL(undefined)` and
throw a `TypeError`, and a captcha challenge fails somewhere downstream as an
empty cheerio selection. Both become explicit, typed failures.

**Files:**
- Create: `lib/errors.js`
- Create: `test/errors.test.js`
- Create: `test/authorize.test.js`
- Modify: `lib/api.js` (constructor options, `_initializeCaller`, `authorize`)
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `lib/errors.js` exporting `LibrusError`, `LibrusAuthError`,
  `LibrusCaptchaError`, `LibrusSessionExpiredError` — all `Error` subclasses
  whose `name` equals the class name. `LibrusCaptchaError extends
  LibrusAuthError extends LibrusError`; `LibrusSessionExpiredError extends
  LibrusError`.
- Produces: `new Librus(cookies, { caller })` — when `options.caller` is
  supplied, `_initializeCaller` adopts it verbatim instead of building an
  axios instance. This is the seam every library test uses.
- Produces: `Librus.detectsCaptcha(payload) -> boolean` (static).

- [ ] **Step 1: Write the failing tests**

`test/errors.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LibrusError,
  LibrusAuthError,
  LibrusCaptchaError,
  LibrusSessionExpiredError,
} = require("../lib/errors.js");

test("every error is an Error and names itself", () => {
  assert.ok(new LibrusError("x") instanceof Error);
  assert.equal(new LibrusCaptchaError("x").name, "LibrusCaptchaError");
  assert.equal(new LibrusSessionExpiredError("x").name, "LibrusSessionExpiredError");
});

test("captcha is an auth failure, expiry is not", () => {
  assert.ok(new LibrusCaptchaError("x") instanceof LibrusAuthError);
  assert.ok(new LibrusAuthError("x") instanceof LibrusError);
  assert.ok(!(new LibrusSessionExpiredError("x") instanceof LibrusAuthError));
});
```

`test/authorize.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Librus = require("../lib/api.js");
const { LibrusAuthError, LibrusCaptchaError } = require("../lib/errors.js");

/** Minimal stand-in for the axios instance lib/api.js builds. */
function stubCaller({ postFormData }) {
  return {
    get: async () => ({
      request: { res: { responseUrl: "https://api.librus.pl/OAuth/Authorization?client_id=46" } },
      data: "",
    }),
    postForm: async () => ({ data: postFormData }),
    request: async () => ({ data: "" }),
  };
}

test("authorize throws LibrusCaptchaError when the login response demands a captcha", async () => {
  const client = new Librus(undefined, {
    caller: stubCaller({ postFormData: { errors: ["Wymagane jest przepisanie kodu g-recaptcha"] } }),
  });
  await assert.rejects(
    () => client.authorize("user", "pass"),
    (error) => error instanceof LibrusCaptchaError
  );
});

test("authorize throws LibrusAuthError when no redirect target comes back", async () => {
  const client = new Librus(undefined, { caller: stubCaller({ postFormData: {} }) });
  await assert.rejects(
    () => client.authorize("user", "pass"),
    (error) => error instanceof LibrusAuthError && !(error instanceof LibrusCaptchaError)
  );
});

test("authorize resolves with cookies on the happy path", async () => {
  const client = new Librus(undefined, {
    caller: stubCaller({
      postFormData: { goTo: "/OAuth/Authorization?client_id=46&response_type=code&scope=mydata" },
    }),
  });
  const cookies = await client.authorize("user", "pass");
  assert.ok(Array.isArray(cookies));
});

test("detectsCaptcha ignores an ordinary success payload", () => {
  assert.equal(Librus.detectsCaptcha({ goTo: "/OAuth/Authorization?client_id=46" }), false);
});
```

- [ ] **Step 2: Install root dependencies, add the test script, run to verify failure**

Run: `npm install`
Expected: `node_modules/` appears; `package-lock.json` is unchanged (`git diff --exit-code package-lock.json`).

Add to root `package.json` `scripts`:

```json
"test": "node --test test/"
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/errors.js'`.

- [ ] **Step 3: Write `lib/errors.js`**

```js
"use strict";

/** Base class for every error this library raises deliberately. */
class LibrusError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

/** Login was rejected: bad credentials, captcha, or an unexpected response. */
class LibrusAuthError extends LibrusError {}

/** Librus demanded a captcha - a human has to log in once in a browser. */
class LibrusCaptchaError extends LibrusAuthError {}

/** The session cookies are no longer valid; log in again and retry. */
class LibrusSessionExpiredError extends LibrusError {}

module.exports = {
  LibrusError,
  LibrusAuthError,
  LibrusCaptchaError,
  LibrusSessionExpiredError,
};
```

- [ ] **Step 4: Add caller injection and captcha detection to `lib/api.js`**

At the top, alongside the existing requires:

```js
const { LibrusAuthError, LibrusCaptchaError } = require("./errors.js");
```

In `_initializeCaller`, make injection the first thing it checks:

```js
  async _initializeCaller() {
    // Tests (and any embedder with its own HTTP stack) inject a caller here.
    if (this.options.caller) {
      this.caller = this.options.caller;
      return this.caller;
    }
    const { wrapper } = await import("axios-cookiejar-support");
```

Add the static detector next to the other statics:

```js
  /**
   * Does this login response look like a captcha challenge?
   * Matched on several signals rather than one string - Librus has
   * changed the wording before, and a miss degrades to a generic auth
   * error rather than to something worse.
   */
  static detectsCaptcha(payload) {
    if (!payload) return false;
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    return /g-recaptcha|grecaptcha|recaptcha|captcha/i.test(text);
  }
```

In `authorize`, replace the step-3 block:

```js
    // Step 3: GET the 2FA/next URL returned in the JSON response.
    if (Librus.detectsCaptcha(loginResponse.data)) {
      throw new LibrusCaptchaError(
        "Librus demanded a captcha. Log in once in a browser on this machine, then retry."
      );
    }
    const goTo = loginResponse.data?.goTo;
    if (!goTo) {
      throw new LibrusAuthError(
        "Librus login did not return a redirect target - most likely wrong credentials."
      );
    }
    const nextUrl = this._safeAuthorizationUrl(goTo);
    await caller.get(nextUrl);
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/errors.js lib/api.js test/errors.test.js test/authorize.test.js package.json
git commit -m "feat(lib): typed errors, captcha detection, and a test seam for authorize"
```

---

### Task 3: Cookie-jar export/import so sessions outlive the process

**Files:**
- Create: `test/session.test.js`
- Modify: `lib/api.js` (constructor, `exportSession`, `importSession`)

**Interfaces:**
- Consumes: Task 2's `options.caller` seam.
- Produces: `client.exportSession() -> string` (JSON, or `""` if the jar
  cannot be serialized); `client.importSession(serialized) -> boolean`
  (`true` when adopted, `false` on any malformed input — never throws);
  `new Librus(cookies, { session })` which imports at construction time.

- [ ] **Step 1: Write the failing test**

`test/session.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Librus = require("../lib/api.js");

test("exportSession round-trips through importSession", async () => {
  const source = new Librus(undefined, { caller: {} });
  await source.cookie.setCookie("DZIENNIKSID=abc123; Path=/", "https://synergia.librus.pl");
  const serialized = source.exportSession();
  assert.equal(typeof serialized, "string");
  assert.ok(serialized.length > 0);

  const restored = new Librus(undefined, { caller: {}, session: serialized });
  const cookies = await restored.cookie.getCookies("https://synergia.librus.pl");
  const names = cookies.map((c) => c.key);
  assert.ok(names.includes("DZIENNIKSID"));
});

test("importSession keeps cookies from other Librus domains", async () => {
  const source = new Librus(undefined, { caller: {} });
  await source.cookie.setCookie("DeviceCookie=dev-1; Path=/", "https://api.librus.pl");
  const restored = new Librus(undefined, { caller: {}, session: source.exportSession() });
  const cookies = await restored.cookie.getCookies("https://api.librus.pl");
  assert.ok(cookies.map((c) => c.key).includes("DeviceCookie"));
});

test("importSession returns false for junk instead of throwing", () => {
  const client = new Librus(undefined, { caller: {} });
  assert.equal(client.importSession("not json"), false);
  assert.equal(client.importSession(""), false);
  assert.equal(client.importSession(null), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `client.exportSession is not a function`.

- [ ] **Step 3: Implement in `lib/api.js`**

In the constructor, replace the jar setup so a restored session wins over the
placeholder cookie, and import before the caller is built:

```js
    this.cookie = new CookieJar();
    this.options = Object.assign(
      {
        requestTimeout: 30000,
        filePollAttempts: 10,
        filePollDelay: 500,
      },
      options
    );

    this.cookie.setCookie("TestCookie=1;", config.page_url);
    if (this.options.session) this.importSession(this.options.session);

    // Initialize caller asynchronously
    this._callerReady = this._initializeCaller();
```

Add the two methods (place them just after `authorize`):

```js
  /**
   * Serialize the whole cookie jar - every Librus domain, not just
   * synergia. The api.librus.pl DeviceCookie in particular is long-lived
   * and is what keeps a normal login captcha-free, so it must survive a
   * restart along with the session itself.
   *
   * The result is a bearer credential: encrypt it at rest, never log it.
   * @returns {String} Serialized jar, or "" if it cannot be serialized
   */
  exportSession() {
    try {
      return JSON.stringify(this.cookie.serializeSync());
    } catch {
      return "";
    }
  }

  /**
   * Adopt a previously exported jar. Any malformed input is treated as
   * "no session" so the caller falls back to a fresh login rather than
   * crashing on a stale or truncated blob.
   * @param serialized Output of exportSession()
   * @returns {Boolean} Whether the session was adopted
   */
  importSession(serialized) {
    if (typeof serialized !== "string" || !serialized.length) return false;
    let jar;
    try {
      jar = CookieJar.deserializeSync(JSON.parse(serialized));
    } catch {
      return false;
    }
    if (!jar) return false;
    this.cookie = jar;
    // The caller is bound to the old jar, so rebuild it against the new one.
    this._callerReady = this._initializeCaller();
    return true;
  }
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/api.js test/session.test.js
git commit -m "feat(lib): export and import the cookie jar to persist sessions"
```

---

### Task 4: Persist sessions encrypted in SQLite

**Files:**
- Modify: `app/backend/src/crypto.js`
- Modify: `app/backend/src/db.js`
- Modify: `app/backend/src/librusSessions.js`
- Modify: `app/backend/src/server.js`
- Modify: `app/backend/src/routes/accounts.js` (drop the session row on delete)
- Create: `app/backend/test/sessionsStore.test.js`
- Modify: `app/backend/test/librusSessions.test.js` (add restore/persist cases)

**Interfaces:**
- Consumes: Task 3's `exportSession`/`importSession` and the `session`
  constructor option.
- Produces: `encryptText(plainText) -> Buffer` and `decryptText(blob) ->
  string` from `crypto.js` (`encryptPassword`/`decryptPassword` stay exported
  as aliases so existing callers keep working).
- Produces: `makeSessionsStore(db) -> { save(accountId, blob), load(accountId)
  -> Buffer|undefined, remove(accountId) }` from `db.js`.
- Produces: `createSessionManager({ accountsStore, decryptPassword,
  librusFactory, sessionsStore?, encryptText?, decryptText? })` — the three
  new options are optional, so every existing test keeps passing unchanged.
  `librusFactory` is now called as `librusFactory({ session })`.

- [ ] **Step 1: Write the failing tests**

`app/backend/test/sessionsStore.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDb, makeSessionsStore } = require("../src/db.js");

function freshStore() {
  return makeSessionsStore(createDb(":memory:"));
}

test("save then load round-trips the blob", () => {
  const store = freshStore();
  store.save(1, Buffer.from("cipher"));
  assert.ok(Buffer.from(store.load(1)).equals(Buffer.from("cipher")));
});

test("save twice keeps only the newest blob", () => {
  const store = freshStore();
  store.save(1, Buffer.from("old"));
  store.save(1, Buffer.from("new"));
  assert.ok(Buffer.from(store.load(1)).equals(Buffer.from("new")));
});

test("load returns undefined for an unknown account", () => {
  assert.equal(freshStore().load(99), undefined);
});

test("remove deletes the row", () => {
  const store = freshStore();
  store.save(1, Buffer.from("cipher"));
  store.remove(1);
  assert.equal(store.load(1), undefined);
});
```

Append to `app/backend/test/librusSessions.test.js`:

```js
test("withSession restores a stored session instead of logging in", async () => {
  let authorizeCalls = 0;
  let seenSession;
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: ({ session } = {}) => {
      seenSession = session;
      return { authorize: async () => { authorizeCalls += 1; } };
    },
    sessionsStore: { save() {}, load: () => Buffer.from("blob"), remove() {} },
    encryptText: (text) => Buffer.from(text),
    decryptText: () => "serialized-jar",
  });

  const result = await manager.withSession(1, async () => "ok");

  assert.equal(result, "ok");
  assert.equal(authorizeCalls, 0);
  assert.equal(seenSession, "serialized-jar");
});

test("withSession persists the jar after a real login", async () => {
  const saved = [];
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: () => ({
      authorize: async () => {},
      exportSession: () => "fresh-jar",
    }),
    sessionsStore: { save: (id, blob) => saved.push([id, blob.toString()]), load: () => undefined, remove() {} },
    encryptText: (text) => Buffer.from(text),
    decryptText: () => "",
  });

  await manager.withSession(1, async () => "ok");

  assert.deepEqual(saved, [[1, "fresh-jar"]]);
});

test("withSession falls back to a fresh login when the stored jar is unusable", async () => {
  let authorizeCalls = 0;
  const manager = createSessionManager({
    accountsStore: stubAccountsStore({ id: 1, login: "u", password_encrypted: Buffer.from("x") }),
    decryptPassword: () => "plain-pass",
    librusFactory: () => ({ authorize: async () => { authorizeCalls += 1; } }),
    sessionsStore: { save() {}, load: () => Buffer.from("blob"), remove() {} },
    encryptText: (text) => Buffer.from(text),
    decryptText: () => { throw new Error("bad key"); },
  });

  await manager.withSession(1, async () => "ok");

  assert.equal(authorizeCalls, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app/backend && npm test`
Expected: FAIL — `makeSessionsStore is not a function`.

- [ ] **Step 3: Add generic text encryption to `crypto.js`**

Rename the bodies and keep the old names as aliases:

```js
function encryptText(plainText) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptText(blob) {
  const key = getEncryptionKey();
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(12, 28);
  const encrypted = blob.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

module.exports = {
  encryptText,
  decryptText,
  // Kept for existing callers - a password is just text to this module.
  encryptPassword: encryptText,
  decryptPassword: decryptText,
  getEncryptionKey,
};
```

Delete the old `encryptPassword`/`decryptPassword` function declarations.

- [ ] **Step 4: Add the sessions table and store to `db.js`**

Extend the `db.exec` block:

```js
    CREATE TABLE IF NOT EXISTS sessions (
      account_id INTEGER PRIMARY KEY,
      session_encrypted BLOB NOT NULL,
      updated_at TEXT NOT NULL
    )
```

Add the store and export it:

```js
function makeSessionsStore(db) {
  const saveStmt = db.prepare(
    `INSERT INTO sessions (account_id, session_encrypted, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       session_encrypted = excluded.session_encrypted,
       updated_at = excluded.updated_at`
  );
  const loadStmt = db.prepare("SELECT session_encrypted FROM sessions WHERE account_id = ?");
  const removeStmt = db.prepare("DELETE FROM sessions WHERE account_id = ?");

  return {
    save(accountId, blob) {
      saveStmt.run(accountId, blob, new Date().toISOString());
    },
    load(accountId) {
      return loadStmt.get(accountId)?.session_encrypted;
    },
    remove(accountId) {
      removeStmt.run(accountId);
    },
  };
}

module.exports = { createDb, makeAccountsStore, makeSessionsStore };
```

- [ ] **Step 5: Restore and persist in `librusSessions.js`**

Replace the whole module:

```js
"use strict";

function createSessionManager({
  accountsStore,
  decryptPassword,
  librusFactory,
  sessionsStore,
  encryptText,
  decryptText,
}) {
  const factory = librusFactory || (() => new (require("../../../lib/api.js"))());
  const clients = new Map();
  const pendingLogins = new Map();

  /** Decrypt a stored jar, or undefined if there isn't a usable one. */
  function restoreSession(accountId) {
    if (!sessionsStore || !decryptText) return undefined;
    const blob = sessionsStore.load(accountId);
    if (!blob) return undefined;
    try {
      return decryptText(Buffer.from(blob)) || undefined;
    } catch (error) {
      // A jar we cannot decrypt (rotated key, truncated row) is not fatal -
      // drop it and log in fresh. Log only error.message.
      console.error("discarding unreadable session for account %s: %s", accountId, error.message);
      sessionsStore.remove(accountId);
      return undefined;
    }
  }

  function persistSession(accountId, client) {
    if (!sessionsStore || !encryptText || typeof client.exportSession !== "function") return;
    const serialized = client.exportSession();
    if (!serialized) return;
    try {
      sessionsStore.save(accountId, encryptText(serialized));
    } catch (error) {
      // Persisting is an optimization; a failure must not fail the request.
      console.error("failed to persist session for account %s: %s", accountId, error.message);
    }
  }

  /** Build a client from the stored jar without hitting Librus. */
  function adopt(accountId) {
    const session = restoreSession(accountId);
    if (!session) return undefined;
    const client = factory({ session });
    clients.set(accountId, client);
    return client;
  }

  function login(accountId) {
    const pending = pendingLogins.get(accountId);
    if (pending) return pending;

    const attempt = (async () => {
      const account = accountsStore.get(accountId);
      if (!account) {
        throw new Error(`Unknown account ${accountId}`);
      }
      const password = decryptPassword(account.password_encrypted);
      const client = factory({});
      await client.authorize(account.login, password);
      clients.set(accountId, client);
      persistSession(accountId, client);
      return client;
    })();

    pendingLogins.set(accountId, attempt);
    return attempt.finally(() => pendingLogins.delete(accountId));
  }

  async function withSession(accountId, fn) {
    let client = clients.get(accountId);
    let fresh = false;

    if (!client) {
      // A restored jar is unproven: if it turns out to be stale, the catch
      // below logs in for real and retries exactly once.
      client = adopt(accountId);
    }
    if (!client) {
      client = await login(accountId);
      fresh = true;
    }

    try {
      return await fn(client);
    } catch (error) {
      if (fresh) throw error;
      client = await login(accountId);
      return fn(client);
    }
  }

  function forget(accountId) {
    clients.delete(accountId);
    if (sessionsStore) sessionsStore.remove(accountId);
  }

  return { withSession, login, forget };
}

module.exports = { createSessionManager };
```

Note the `isExpired` parameter is gone — Task 5 replaces it with a typed
error raised at the source.

- [ ] **Step 5b: Delete the two tests for the parameter this task removed**

Remove these two tests from `app/backend/test/librusSessions.test.js`:
`"withSession re-logs in and retries once when isExpired reports staleness"`
and `"withSession does not retry isExpired on a freshly-logged-in client"`.
They test a parameter this task deletes, so they belong in this task's diff —
every task must end on a green suite. The behaviour they covered becomes
Task 5's typed error plus the surviving
`"re-logs in and retries once when fn throws on a cached client"` test.

- [ ] **Step 6: Wire the store in `server.js`**

```js
const { getEncryptionKey, encryptText, decryptText } = require("./crypto.js");
const { createDb, makeAccountsStore, makeSessionsStore } = require("./db.js");
```

**The default `librusFactory` must forward its options**, or a restored jar is
silently dropped and session persistence becomes a no-op in production — the
tests cannot catch this because they all inject stubs:

```js
function createApp({
  dbPath = process.env.DB_PATH || "/data/accounts.db",
  librusFactory = (options) => new (require("../../../lib/api.js"))(undefined, options),
} = {}) {
```

```js
  const db = createDb(dbPath);
  const accountsStore = makeAccountsStore(db);
  const sessionsStore = makeSessionsStore(db);
  const sessionManager = createSessionManager({
    accountsStore,
    decryptPassword: decryptText,
    librusFactory,
    sessionsStore,
    encryptText,
    decryptText,
  });
```

Update the accounts router call to pass `encryptPassword: encryptText`:

```js
  app.use(
    "/api/accounts",
    createAccountsRouter({ accountsStore, encryptPassword: encryptText, sessionManager, librusFactory })
  );
```

In `routes/accounts.js`, the `DELETE` handler already calls
`sessionManager.forget(id)`, which now removes the stored jar too — no change
needed there. The `POST` handler calls `librusFactory()` with no argument;
that still works because the factory's parameter is optional.

- [ ] **Step 7: Run the tests**

Run: `cd app/backend && npm test`
Expected: the four `sessionsStore` tests and the three new `librusSessions`
tests PASS; the two `isExpired` tests FAIL (removed in Task 5).

- [ ] **Step 8: Commit**

```bash
git add app/backend/src/crypto.js app/backend/src/db.js app/backend/src/librusSessions.js \
        app/backend/src/server.js app/backend/test/sessionsStore.test.js \
        app/backend/test/librusSessions.test.js
git commit -m "feat(backend): persist Librus sessions encrypted in SQLite"
```

---

### Task 5: Detect an expired session at the source

**Files:**
- Create: `test/request.test.js`
- Modify: `lib/api.js` (`_request`, `looksLikeLoginPage`)
- Modify: `app/backend/src/routes/timetable.js`
- Modify: `app/backend/src/routes/messages.js`
- Modify: `app/backend/test/librusSessions.test.js` (delete the two `isExpired` tests)

**Interfaces:**
- Consumes: Task 2's `LibrusSessionExpiredError` and `options.caller` seam.
- Produces: `Librus.looksLikeLoginPage($, responseUrl) -> boolean` (static).
  `_request` now throws `LibrusSessionExpiredError` instead of returning a
  parsed login page, which Task 4's `withSession` catch-and-retry already
  handles for every route at once.

- [ ] **Step 1: Write the failing test**

`test/request.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Librus = require("../lib/api.js");
const { LibrusSessionExpiredError } = require("../lib/errors.js");

const LOGIN_PAGE = `
  <html><body>
    <form id="login-form" action="/loguj">
      <input type="text" name="login" />
      <input type="password" name="pass" />
    </form>
  </body></html>`;

const REAL_PAGE = `
  <html><body><table class="decorated"><tbody><tr><td>Matematyka</td></tr></tbody></table></body></html>`;

function clientReturning(data, responseUrl) {
  return new Librus(undefined, {
    caller: {
      request: async () => ({ data, request: { res: { responseUrl } } }),
    },
  });
}

test("_request throws LibrusSessionExpiredError when handed a login page", async () => {
  const client = clientReturning(LOGIN_PAGE, "https://synergia.librus.pl/loguj");
  await assert.rejects(
    () => client._request("get", "przegladaj_oceny/uczen"),
    (error) => error instanceof LibrusSessionExpiredError
  );
});

test("_request throws when redirected to the OAuth authorization page", async () => {
  const client = clientReturning(REAL_PAGE, "https://api.librus.pl/OAuth/Authorization?client_id=46");
  await assert.rejects(
    () => client._request("get", "przegladaj_oceny/uczen"),
    (error) => error instanceof LibrusSessionExpiredError
  );
});

test("_request returns the parsed document for a real page", async () => {
  const client = clientReturning(REAL_PAGE, "https://synergia.librus.pl/przegladaj_oceny/uczen");
  const $ = await client._request("get", "przegladaj_oceny/uczen");
  assert.equal($("table.decorated td").text().trim(), "Matematyka");
});

test("looksLikeLoginPage ignores a page that merely mentions logging in", () => {
  const $ = Librus._loadDocument("<html><body><p>Zostales wylogowany. Zaloguj sie ponownie.</p></body></html>");
  assert.equal(Librus.looksLikeLoginPage($, "https://synergia.librus.pl/uczen_index"), false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Librus.looksLikeLoginPage is not a function`.

- [ ] **Step 3: Implement in `lib/api.js`**

**Replace** the `require("./errors.js")` line Task 2 added (do not add a
second destructuring require of the same module):

```js
const { LibrusAuthError, LibrusCaptchaError, LibrusSessionExpiredError } = require("./errors.js");
```

Add the static detector:

```js
  /**
   * Is this response the login page rather than the page we asked for?
   *
   * Two independent signals: we were bounced to a login/authorization URL,
   * or the document actually contains a login form. Matching on markup
   * structure rather than on wording avoids false positives from pages
   * that merely mention logging in.
   *
   * @param $            Parsed document
   * @param responseUrl  Final URL after redirects, if known
   * @returns {Boolean}
   */
  static looksLikeLoginPage($, responseUrl) {
    if (typeof responseUrl === "string") {
      if (/\/OAuth\/Authorization/i.test(responseUrl)) return true;
      if (/synergia\.librus\.pl\/(loguj|wyloguj)/i.test(responseUrl)) return true;
    }
    if ($("#login-form").length) return true;
    return $('input[name="login"]').length > 0 && $('input[name="pass"]').length > 0;
  }
```

Replace `_request`:

```js
  _request(method, apiFunction, data, blank) {
    /** Make request */
    const target = apiFunction.startsWith("https://")
      ? apiFunction
      : config.page_url + "/" + apiFunction;
    return this.caller
      .request({
        method,
        url: target,
        data,
      })
      .then((response) => {
        const $ = Librus._loadDocument(response.data);
        const responseUrl = response.request?.res?.responseUrl;
        if (Librus.looksLikeLoginPage($, responseUrl)) {
          throw new LibrusSessionExpiredError(
            `Librus returned the login page for ${apiFunction} - the session has expired.`
          );
        }
        return $;
      });
  }
```

- [ ] **Step 4: Run the library tests**

Run: `npm test`
Expected: PASS, 13 tests.

- [ ] **Step 5: Drop the payload heuristics from the routes**

`app/backend/src/routes/timetable.js` — the third argument goes away:

```js
      const timetable = await sessionManager.withSession(accountId, (client) =>
        client.calendar.getTimetable(from, to)
      );
```

`app/backend/src/routes/messages.js` — both handlers:

```js
      const messages = await sessionManager.withSession(accountId, (client) =>
        client.inbox.listInbox(RECEIVED)
      );
```

```js
      const message = await sessionManager.withSession(accountId, (client) =>
        client.inbox.getMessage(RECEIVED, messageId)
      );
```

- [ ] **Step 6: Run the backend tests**

Run: `cd app/backend && npm test`
Expected: PASS — everything green now that the `isExpired` tests are gone.

- [ ] **Step 7: Commit**

```bash
git add lib/api.js test/request.test.js app/backend/src/routes/timetable.js \
        app/backend/src/routes/messages.js app/backend/test/librusSessions.test.js
git commit -m "fix: detect an expired session in lib instead of guessing at payload shapes"
```

---

### Task 6: Remove the dead `tableValues` overload

`lib/api.js` declares `static tableValues(table)` at line 382 and then
`static tableValues(table, keys)` at line 399. The second silently shadows the
first, which is therefore unreachable — and it references an undefined
`cheerio` default import that would throw if it ever ran.

**Files:**
- Create: `test/tableValues.test.js`
- Modify: `lib/api.js` (delete lines 376–397, the dead overload and its docblock)

**Interfaces:**
- Produces: nothing new. `Librus.tableValues(table, keys)` keeps its exact
  current behaviour; this only deletes unreachable code.

- [ ] **Step 1: Write the characterization test**

`test/tableValues.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Librus = require("../lib/api.js");

test("tableValues maps header cells through the keys translation", () => {
  const $ = Librus._loadDocument(`
    <table><tbody>
      <tr><th>Nauczyciel:</th><td>Anna Kowalska</td></tr>
      <tr><th>Termin:</th><td>2026-09-20</td></tr>
    </tbody></table>`);
  const result = Librus.tableValues($("table"), {
    "Nauczyciel:": "teacher",
    "Termin:": "due",
  });
  assert.deepEqual(result, { teacher: "Anna Kowalska", due: "2026-09-20" });
});

// Guard, not a red test: JS keeps only the LAST declaration, so arity is
// already 2 today. This exists to fail if anyone ever re-adds an overload
// above the real one and silently shadows it again.
test("tableValues takes exactly two parameters - no shadowing overload", () => {
  assert.equal(Librus.tableValues.length, 2);
});

test("mapTableValues zips the second column onto positional keys", () => {
  const $ = Librus._loadDocument(`
    <table><tbody>
      <tr><td>Id:</td><td>23</td></tr>
      <tr><td>Name:</td><td>test</td></tr>
    </tbody></table>`);
  assert.deepEqual(Librus.mapTableValues($("table"), ["id", "name"]), { id: "23", name: "test" });
});
```

- [ ] **Step 2: Run the tests and confirm the duplicate**

Run: `npm test`
Expected: PASS. This task is a pure deletion of unreachable code, so there is
no red phase — the tests are characterization tests that pin the surviving
behaviour before the dead declaration is removed.

Run: `grep -c "static tableValues" lib/api.js`
Expected before the fix: `2` — that duplicate is the whole reason for the task.

- [ ] **Step 3: Delete the dead overload**

Remove the docblock and body of the one-argument `static tableValues(table)`
(currently `lib/api.js:376-397`), leaving only the two-argument version and
its `@param keys` docblock.

- [ ] **Step 4: Verify**

Run: `grep -c "static tableValues" lib/api.js`
Expected: `1`

Run: `npm test`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/api.js test/tableValues.test.js
git commit -m "refactor(lib): drop the unreachable one-arg tableValues overload"
```

---

### Task 7: TTL cache with in-flight deduplication

**Files:**
- Create: `app/backend/src/cache.js`
- Create: `app/backend/test/cache.test.js`
- Modify: `app/backend/src/server.js` (build one cache, pass to routers)
- Modify: `app/backend/src/routes/timetable.js`, `app/backend/src/routes/messages.js`

**Interfaces:**
- Produces: `createCache({ ttlMs?, now? }) -> { fetch(key, producer),
  invalidate(key), clear() }`. `ttlMs` defaults to 300000; `now` defaults to
  `Date.now` and exists so tests can control the clock. `fetch` returns a
  promise; concurrent calls for the same key share one producer run; a
  rejected producer is never cached.

- [ ] **Step 1: Write the failing tests**

`app/backend/test/cache.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCache } = require("../src/cache.js");

test("fetch caches a resolved value for the TTL", async () => {
  let calls = 0;
  let clock = 1000;
  const cache = createCache({ ttlMs: 500, now: () => clock });
  const producer = async () => { calls += 1; return calls; };

  assert.equal(await cache.fetch("k", producer), 1);
  assert.equal(await cache.fetch("k", producer), 1);
  assert.equal(calls, 1);

  clock += 501;
  assert.equal(await cache.fetch("k", producer), 2);
  assert.equal(calls, 2);
});

test("concurrent fetches share one producer run", async () => {
  let calls = 0;
  const cache = createCache({ ttlMs: 500 });
  const producer = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "value";
  };

  const [a, b] = await Promise.all([cache.fetch("k", producer), cache.fetch("k", producer)]);

  assert.equal(a, "value");
  assert.equal(b, "value");
  assert.equal(calls, 1);
});

test("a rejected producer is not cached", async () => {
  let calls = 0;
  const cache = createCache({ ttlMs: 500 });
  const producer = async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
    return "recovered";
  };

  await assert.rejects(() => cache.fetch("k", producer));
  assert.equal(await cache.fetch("k", producer), "recovered");
  assert.equal(calls, 2);
});

test("keys are independent and invalidate drops just one", async () => {
  const cache = createCache({ ttlMs: 500 });
  await cache.fetch("a", async () => "A");
  await cache.fetch("b", async () => "B");
  cache.invalidate("a");
  assert.equal(await cache.fetch("a", async () => "A2"), "A2");
  assert.equal(await cache.fetch("b", async () => "B2"), "B");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app/backend && npm test`
Expected: FAIL — `Cannot find module '../src/cache.js'`.

- [ ] **Step 3: Implement `app/backend/src/cache.js`**

```js
"use strict";

/**
 * Small TTL cache with in-flight deduplication.
 *
 * Every entry here is one live Librus request saved. The project's own
 * README warns against systematic scraping, so treat a cache miss as
 * something to avoid rather than as the normal path.
 *
 * In memory on purpose: a cold cache after a restart costs one request per
 * card, which is cheaper than persisting student data we would then have to
 * reason about.
 *
 * @param ttlMs  How long a resolved value stays fresh (default 5 minutes)
 * @param now    Clock, injectable for tests
 */
function createCache({ ttlMs = 5 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map();

  function fetch(key, producer) {
    const hit = entries.get(key);
    if (hit && (hit.pending || hit.expiresAt > now())) return hit.value;

    const value = Promise.resolve().then(producer);
    const entry = { value, pending: true, expiresAt: 0 };
    entries.set(key, entry);

    value.then(
      () => {
        entry.pending = false;
        entry.expiresAt = now() + ttlMs;
      },
      () => {
        // Never cache a failure - the next caller should try Librus again.
        if (entries.get(key) === entry) entries.delete(key);
      }
    );

    return value;
  }

  function invalidate(key) {
    entries.delete(key);
  }

  function clear() {
    entries.clear();
  }

  return { fetch, invalidate, clear };
}

module.exports = { createCache };
```

- [ ] **Step 4: Run the tests**

Run: `cd app/backend && npm test`
Expected: PASS.

- [ ] **Step 5: Wire it into `server.js`**

```js
const { createCache } = require("./cache.js");
```

```js
function createApp({
  dbPath = process.env.DB_PATH || "/data/accounts.db",
  librusFactory = () => new (require("../../../lib/api.js"))(),
  cacheTtlMs = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000,
} = {}) {
```

```js
  const cache = createCache({ ttlMs: cacheTtlMs });
```

Pass `cache` to the timetable and messages routers (and, in Task 8, to the
five new ones):

```js
  app.use("/api/accounts", createTimetableRouter({ sessionManager, cache }));
  app.use("/api/accounts", createMessagesRouter({ sessionManager, cache }));
```

- [ ] **Step 6: Use the cache in the two existing routers**

`routes/timetable.js`:

```js
function createTimetableRouter({ sessionManager, cache }) {
```

```js
      const timetable = await cache.fetch(`timetable:${accountId}:${from || ""}:${to || ""}`, () =>
        sessionManager.withSession(accountId, (client) => client.calendar.getTimetable(from, to))
      );
```

`routes/messages.js` — the **list** only:

```js
function createMessagesRouter({ sessionManager, cache }) {
```

```js
      const messages = await cache.fetch(`messages:${accountId}`, () =>
        sessionManager.withSession(accountId, (client) => client.inbox.listInbox(RECEIVED))
      );
```

Leave the single-message handler uncached — see the Global Constraints.

- [ ] **Step 7: Run the tests**

Run: `cd app/backend && npm test`
Expected: PASS. Note that `server.test.js` and `messages.test.js` start a
fresh app per test, so each gets its own empty cache.

- [ ] **Step 8: Commit**

```bash
git add app/backend/src/cache.js app/backend/test/cache.test.js app/backend/src/server.js \
        app/backend/src/routes/timetable.js app/backend/src/routes/messages.js
git commit -m "feat(backend): cache Librus responses with a TTL and in-flight dedupe"
```

---

### Task 8: Expose the five unused library capabilities

Every method below already exists in `lib/` and already works. This task is
routing, shaping and caching only — no new scraping.

**Files:**
- Create: `app/backend/src/routes/grades.js`, `absences.js`, `agenda.js`, `homework.js`, `info.js`
- Create: `app/backend/test/grades.test.js`, `absences.test.js`, `agenda.test.js`
- Modify: `app/backend/src/server.js`

**Interfaces:**
- Consumes: Task 7's `cache`, Task 4's `sessionManager`.
- Produces these routes, all mounted under `/api/accounts`:
  - `GET /:id/grades` → `[{ name, semester, tempAverage, average }]` straight
    from `client.info.getGrades()`.
  - `GET /:id/absences` → `{ semesters: { "0": [...], "1": [...] } }` —
    `getAbsences()` returns an object keyed by semester group, so it is
    wrapped rather than returned bare (an array-vs-object flip at the top
    level is the kind of thing that breaks a frontend silently).
  - `GET /:id/agenda?month=&year=` → a **flat** `[{ id, day, title }]`;
    `getCalendar()` yields an array of per-day arrays, so the route flattens
    and drops empties.
  - `GET /:id/homework?from=&to=&subject=` → `[{ id, subject, user, title,
    type, from, to, status }]`.
  - `GET /:id/lucky-number` → `{ luckyNumber }`.
  - `GET /:id/announcements` → `[{ title, user, date, content }]`.

- [ ] **Step 1: Write the failing tests**

`app/backend/test/grades.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createApp } = require("../src/server.js");

function startApp(librusFactory) {
  process.env.ACCOUNTS_ENC_KEY = crypto.randomBytes(32).toString("base64");
  const app = createApp({ dbPath: ":memory:", librusFactory });
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function createAccount(base) {
  return (
    await fetch(`${base}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
    })
  ).json();
}

test("GET /api/accounts/:id/grades returns the subject list", async () => {
  const grades = [
    { name: "Matematyka", semester: [], tempAverage: 4.2, average: 4.0 },
    { name: "Polski", semester: [], tempAverage: 3.5, average: 3.6 },
  ];
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    info: { getGrades: async () => grades },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/grades`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), grades);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/grades reports a Librus failure as 502", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    info: { getGrades: async () => { throw new Error("librus down"); } },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/grades`);
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/grades hits Librus once for two requests", async () => {
  let calls = 0;
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    info: { getGrades: async () => { calls += 1; return []; } },
  }));
  try {
    const account = await createAccount(base);
    await fetch(`${base}/api/accounts/${account.id}/grades`);
    await fetch(`${base}/api/accounts/${account.id}/grades`);
    assert.equal(calls, 1);
  } finally {
    server.close();
  }
});
```

`app/backend/test/absences.test.js` (same `startApp`/`createAccount` helpers,
copied in full — each test file stands alone):

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createApp } = require("../src/server.js");

function startApp(librusFactory) {
  process.env.ACCOUNTS_ENC_KEY = crypto.randomBytes(32).toString("base64");
  const app = createApp({ dbPath: ":memory:", librusFactory });
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function createAccount(base) {
  return (
    await fetch(`${base}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
    })
  ).json();
}

test("GET /api/accounts/:id/absences wraps the semester-keyed object", async () => {
  const bySemester = {
    0: [{ date: "2026-05-10", table: [], info: [] }],
    1: [{ date: "2026-02-03", table: [], info: [] }],
  };
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    absence: { getAbsences: async () => bySemester },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/absences`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { semesters: bySemester });
  } finally {
    server.close();
  }
});
```

`app/backend/test/agenda.test.js` (same helpers again):

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createApp } = require("../src/server.js");

function startApp(librusFactory) {
  process.env.ACCOUNTS_ENC_KEY = crypto.randomBytes(32).toString("base64");
  const app = createApp({ dbPath: ":memory:", librusFactory });
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function createAccount(base) {
  return (
    await fetch(`${base}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Jas", login: "jas", password: "pw" }),
    })
  ).json();
}

test("GET /api/accounts/:id/agenda flattens the per-day arrays", async () => {
  const nested = [
    [{ id: 1, day: "2026-09-10", title: "Sprawdzian" }],
    undefined,
    [{ id: 2, day: "2026-09-12", title: "Wycieczka" }],
  ];
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: { getCalendar: async () => nested },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/agenda`);
    assert.deepEqual(await res.json(), [
      { id: 1, day: "2026-09-10", title: "Sprawdzian" },
      { id: 2, day: "2026-09-12", title: "Wycieczka" },
    ]);
  } finally {
    server.close();
  }
});

test("GET /api/accounts/:id/agenda rejects a non-numeric month", async () => {
  const { server, base } = startApp(() => ({
    authorize: async () => {},
    calendar: { getCalendar: async () => [] },
  }));
  try {
    const account = await createAccount(base);
    const res = await fetch(`${base}/api/accounts/${account.id}/agenda?month=abc`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd app/backend && npm test`
Expected: FAIL — the new routes 404.

- [ ] **Step 3: Write `routes/grades.js`**

```js
"use strict";
const express = require("express");

function createGradesRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/grades", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const grades = await cache.fetch(`grades:${accountId}`, () =>
        sessionManager.withSession(accountId, (client) => client.info.getGrades())
      );
      res.json(grades);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus grades fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch grades from Librus" });
    }
  });

  return router;
}

module.exports = { createGradesRouter };
```

- [ ] **Step 4: Write `routes/absences.js`**

```js
"use strict";
const express = require("express");

function createAbsencesRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/absences", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const bySemester = await cache.fetch(`absences:${accountId}`, () =>
        sessionManager.withSession(accountId, (client) => client.absence.getAbsences())
      );
      // getAbsences resolves to an object keyed by semester group, not an
      // array - wrap it so the response shape stays stable either way.
      res.json({ semesters: bySemester });
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus absences fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch absences from Librus" });
    }
  });

  return router;
}

module.exports = { createAbsencesRouter };
```

- [ ] **Step 5: Write `routes/agenda.js`**

```js
"use strict";
const express = require("express");

/** Parse an optional numeric query param, returning null when absent. */
function optionalNumber(raw) {
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : NaN;
}

function createAgendaRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/agenda", async (req, res) => {
    const accountId = Number(req.params.id);
    const month = optionalNumber(req.query.month);
    const year = optionalNumber(req.query.year);

    if (Number.isNaN(month) || (month !== null && (month < 1 || month > 12))) {
      return res.status(400).json({ error: "month must be an integer between 1 and 12" });
    }
    if (Number.isNaN(year)) {
      return res.status(400).json({ error: "year must be an integer" });
    }

    try {
      const nested = await cache.fetch(`agenda:${accountId}:${month ?? ""}:${year ?? ""}`, () =>
        sessionManager.withSession(accountId, (client) =>
          client.calendar.getCalendar(month ?? undefined, year ?? undefined)
        )
      );
      // getCalendar yields one array per day cell, with gaps for empty days.
      const events = (nested || []).flat().filter(Boolean);
      res.json(events);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus agenda fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch the agenda from Librus" });
    }
  });

  return router;
}

module.exports = { createAgendaRouter };
```

- [ ] **Step 6: Write `routes/homework.js`**

```js
"use strict";
const express = require("express");

function createHomeworkRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/homework", async (req, res) => {
    const accountId = Number(req.params.id);
    const { from, to } = req.query;
    const subject = req.query.subject === undefined ? -1 : Number(req.query.subject);

    if (!Number.isInteger(subject)) {
      return res.status(400).json({ error: "subject must be an integer" });
    }

    try {
      const homework = await cache.fetch(
        `homework:${accountId}:${subject}:${from || ""}:${to || ""}`,
        () =>
          sessionManager.withSession(accountId, (client) =>
            client.homework.listHomework(subject, from, to)
          )
      );
      res.json(homework);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus homework fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch homework from Librus" });
    }
  });

  return router;
}

module.exports = { createHomeworkRouter };
```

- [ ] **Step 7: Write `routes/info.js`**

```js
"use strict";
const express = require("express");

function createInfoRouter({ sessionManager, cache }) {
  const router = express.Router();

  router.get("/:id/lucky-number", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const luckyNumber = await cache.fetch(`lucky:${accountId}`, () =>
        sessionManager.withSession(accountId, (client) => client.info.getLuckyNumber())
      );
      res.json({ luckyNumber });
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus lucky number fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch the lucky number from Librus" });
    }
  });

  router.get("/:id/announcements", async (req, res) => {
    const accountId = Number(req.params.id);

    try {
      const announcements = await cache.fetch(`announcements:${accountId}`, () =>
        sessionManager.withSession(accountId, (client) => client.inbox.listAnnouncements())
      );
      res.json(announcements);
    } catch (error) {
      // Log only error.message - the raw error can carry the plaintext Librus password.
      console.error("librus announcements fetch failed for account %s: %s", accountId, error.message);
      res.status(502).json({ error: "Failed to fetch announcements from Librus" });
    }
  });

  return router;
}

module.exports = { createInfoRouter };
```

- [ ] **Step 8: Mount them in `server.js`**

```js
const { createGradesRouter } = require("./routes/grades.js");
const { createAbsencesRouter } = require("./routes/absences.js");
const { createAgendaRouter } = require("./routes/agenda.js");
const { createHomeworkRouter } = require("./routes/homework.js");
const { createInfoRouter } = require("./routes/info.js");
```

```js
  app.use("/api/accounts", createGradesRouter({ sessionManager, cache }));
  app.use("/api/accounts", createAbsencesRouter({ sessionManager, cache }));
  app.use("/api/accounts", createAgendaRouter({ sessionManager, cache }));
  app.use("/api/accounts", createHomeworkRouter({ sessionManager, cache }));
  app.use("/api/accounts", createInfoRouter({ sessionManager, cache }));
```

- [ ] **Step 9: Run the tests**

Run: `cd app/backend && npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add app/backend/src/routes/grades.js app/backend/src/routes/absences.js \
        app/backend/src/routes/agenda.js app/backend/src/routes/homework.js \
        app/backend/src/routes/info.js app/backend/src/server.js app/backend/test/
git commit -m "feat(backend): expose grades, absences, agenda, homework and info routes"
```

---

### Task 9: Grades, absences and agenda cards

**Files:**
- Modify: `app/frontend/src/api.ts`
- Create: `app/frontend/src/components/GradesCard.tsx`
- Create: `app/frontend/src/components/AbsencesCard.tsx`
- Create: `app/frontend/src/components/AgendaCard.tsx`
- Modify: `app/frontend/src/components/AppDock.tsx`
- Modify: `app/frontend/src/App.tsx`

**Interfaces:**
- Consumes: Task 8's routes.
- Produces: `getGrades(id)`, `getAbsences(id)`, `getAgenda(id, month?, year?)`
  in `api.ts` with the types below; `View` in `AppDock.tsx` widens to
  `"calendar" | "messages" | "grades" | "agenda" | "add"`.

- [ ] **Step 1: Add the typed clients to `api.ts`**

```ts
export interface SubjectGrade {
  id: number;
  info: string;
  value: string;
}

export interface SubjectSemester {
  grades: SubjectGrade[];
  tempAverage: number;
  average: number;
}

export interface SubjectGrades {
  name: string;
  semester: SubjectSemester[];
  tempAverage: number;
  average: number;
}

export interface AbsenceDay {
  date: string;
  table: ({ type: string; id: number } | null)[];
  info: string[];
}

export interface Absences {
  semesters: Record<string, AbsenceDay[]>;
}

export interface AgendaEvent {
  id: number;
  day: string;
  title: string;
}

export function getGrades(id: number): Promise<SubjectGrades[]> {
  return fetch(`${BASE}/${id}/grades`).then((res) => asJson<SubjectGrades[]>(res));
}

export function getAbsences(id: number): Promise<Absences> {
  return fetch(`${BASE}/${id}/absences`).then((res) => asJson<Absences>(res));
}

export function getAgenda(id: number, month?: number, year?: number): Promise<AgendaEvent[]> {
  const params = new URLSearchParams();
  if (month) params.set("month", String(month));
  if (year) params.set("year", String(year));
  const query = params.toString();
  return fetch(`${BASE}/${id}/agenda${query ? `?${query}` : ""}`).then((res) =>
    asJson<AgendaEvent[]>(res)
  );
}
```

- [ ] **Step 2: Write `GradesCard.tsx`**

Mirror `TodayCard.tsx`'s structure: one card per account, own fetch, own
loading and error state, Polish copy.

```tsx
import { useEffect, useState } from "react";
import { Account, getGrades, SubjectGrades } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/** Weighted-free arithmetic mean over the subjects that have one. */
export function overallAverage(subjects: SubjectGrades[]): number | null {
  const values = subjects.map((s) => s.average).filter((v) => Number.isFinite(v));
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export default function GradesCard({ account }: { account: Account }) {
  const [subjects, setSubjects] = useState<SubjectGrades[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGrades(account.id)
      .then(setSubjects)
      .catch((err) => setError(err instanceof Error ? err.message : "Błąd pobierania ocen"));
  }, [account.id]);

  const average = subjects ? overallAverage(subjects) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          <span>{account.label}</span>
          {average !== null && (
            <span className="text-sm font-normal text-muted-foreground">
              średnia {average.toFixed(2)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !subjects && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {subjects && subjects.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak ocen.</p>
        )}
        {subjects && subjects.length > 0 && (
          <ul className="flex flex-col gap-1">
            {subjects.map((subject) => (
              <li key={subject.name} className="flex justify-between gap-2 text-sm">
                <span className="truncate">{subject.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Number.isFinite(subject.average) ? subject.average.toFixed(2) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `AbsencesCard.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Absences, Account, getAbsences } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/** Total absence marks across every semester bucket. */
export function countAbsences(data: Absences): number {
  return Object.values(data.semesters).reduce(
    (total, days) =>
      total + days.reduce((dayTotal, day) => dayTotal + day.table.filter(Boolean).length, 0),
    0
  );
}

export default function AbsencesCard({ account }: { account: Account }) {
  const [data, setData] = useState<Absences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAbsences(account.id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Błąd pobierania frekwencji"));
  }, [account.id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{account.label} — frekwencja</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !data && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {data && (
          <p className="text-2xl font-medium tabular-nums">
            {countAbsences(data)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">nieobecności</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write `AgendaCard.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Account, AgendaEvent, getAgenda } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/** Events from today onward, soonest first. */
export function upcoming(events: AgendaEvent[], today: string): AgendaEvent[] {
  return events
    .filter((event) => event.day >= today)
    .sort((a, b) => a.day.localeCompare(b.day));
}

export default function AgendaCard({ account }: { account: Account }) {
  const [events, setEvents] = useState<AgendaEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAgenda(account.id)
      .then(setEvents)
      .catch((err) => setError(err instanceof Error ? err.message : "Błąd pobierania terminarza"));
  }, [account.id]);

  const today = new Date().toISOString().slice(0, 10);
  const list = events ? upcoming(events, today).slice(0, 6) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{account.label} — terminarz</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !list && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {list && list.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak nadchodzących wydarzeń.</p>
        )}
        {list && list.length > 0 && (
          <ul className="flex flex-col gap-1">
            {list.map((event) => (
              <li key={`${event.day}-${event.id}-${event.title}`} className="text-sm">
                <span className="text-muted-foreground tabular-nums">{event.day}</span>
                <span className="ml-2">{event.title}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Widen the dock**

In `AppDock.tsx`, extend the exported type and add two items to the existing
`DockItem` list, following the file's current pattern exactly:

```tsx
export type View = "calendar" | "messages" | "grades" | "agenda" | "add";
```

Import `GraduationCap` and `CalendarClock` from `lucide-react` and add two
entries to the `ITEMS` array (`app/frontend/src/components/AppDock.tsx:14`),
between the `messages` and `add` entries. Note the key is `Icon`, capitalized,
matching the existing `DockItem` type at line 11:

```tsx
  { view: "grades", label: "Oceny", Icon: GraduationCap },
  { view: "agenda", label: "Terminarz", Icon: CalendarClock },
```

- [ ] **Step 6: Render the new views in `App.tsx`**

Add imports and two blocks mirroring the existing `view === "messages"` block:

```tsx
      {view === "grades" && accounts.length > 0 && (
        <BentoGrid className="grid-cols-1 auto-rows-auto md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <GradesCard key={account.id} account={account} />
          ))}
          {accounts.map((account) => (
            <AbsencesCard key={`abs-${account.id}`} account={account} />
          ))}
        </BentoGrid>
      )}

      {view === "agenda" && accounts.length > 0 && (
        <BentoGrid className="grid-cols-1 auto-rows-auto md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AgendaCard key={account.id} account={account} />
          ))}
        </BentoGrid>
      )}
```

- [ ] **Step 7: Verify the frontend builds**

Run: `cd app/frontend && npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add app/frontend/src/api.ts app/frontend/src/components/GradesCard.tsx \
        app/frontend/src/components/AbsencesCard.tsx app/frontend/src/components/AgendaCard.tsx \
        app/frontend/src/components/AppDock.tsx app/frontend/src/App.tsx
git commit -m "feat(frontend): add grades, absences and agenda cards"
```

---

### Task 10: Document the new behaviour

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Document the new library surface in `README.md`**

Add to the usage block, after the existing examples:

```javascript
  // Persist a session across restarts (the jar is a bearer credential -
  // encrypt it at rest and never log it)
  const jar = client.exportSession();
  const restored = new Librus(undefined, { session: jar });

  // Typed failures
  const { LibrusCaptchaError, LibrusSessionExpiredError } = require("librus-api/lib/errors.js");
```

- [ ] **Step 2: Document `CACHE_TTL_MS` in `.env.example`**

```
# How long backend responses from Librus stay fresh, in milliseconds.
# Defaults to 300000 (5 minutes). Lower values mean more requests to Librus.
CACHE_TTL_MS=300000
```

- [ ] **Step 3: Run everything once more**

Run: `npm test && cd app/backend && npm test && cd ../frontend && npm run build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add README.md .env.example
git commit -m "docs: document session persistence, typed errors and CACHE_TTL_MS"
```

---

## Self-Review Notes

- **Spec coverage:** cookie/DeviceCookie persistence → Tasks 3–4; real expiry
  signal → Task 5; captcha detection → Task 2; caching/rate limiting →
  Task 7; dead-code removal → Task 6; wiring the six unused capabilities →
  Tasks 8–9; smoke-test script → Task 1. Every spec section maps to a task.
- **Known cross-task breakage (intentional, called out at the point it
  happens):** Task 4 removes `withSession`'s `isExpired` parameter, so the two
  tests covering it fail until Task 5 step 1 deletes them. Tasks 4 and 5 must
  land together or in order; do not stop between them.
- **Type consistency:** `librusFactory` is called as `librusFactory({ session })`
  in Task 4 and as `librusFactory({})` for a fresh login; `routes/accounts.js`
  calls it as `librusFactory()`, which is why the parameter is optional and
  destructured with a default (`({ session } = {})`) in every test stub.
  `encryptText`/`decryptText` are the real names everywhere after Task 4;
  `encryptPassword`/`decryptPassword` survive only as aliases.
- **Rate limiting:** delivered as caching plus in-flight deduplication rather
  than a token bucket. A dashboard's traffic is bursty-on-open, which dedupe
  and a TTL handle completely; a queue would add latency without removing
  requests. If the follow-up plan adds background polling, revisit this.

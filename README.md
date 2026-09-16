# librus-api

[![npm](https://img.shields.io/npm/v/librus-api.svg?style=flat)](https://www.npmjs.com/package/librus-api)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat)](http://opensource.org/licenses/MIT)

A fork of [Mati365/librus-api](https://github.com/Mati365/librus-api) that has
grown into two things:

- **`lib/`** — the HTTP client that scrapes Librus Synergia. This is what gets
  published to npm as `librus-api`.
- **`app/`** — a self-hosted family dashboard built on top of it: one view per
  child, timetable, grades, attendance, agenda and threaded messages.

If you only want the library, `npm install librus-api` and skip to
[The library](#the-library). The dashboard is the reason most of the recent
work exists.

---

**⚠️ WAŻNE OSTRZEŻENIE**

- Ta biblioteka **nie jest oficjalnym produktem** firmy Librus / Synergia i nie jest z nimi powiązana w żaden sposób.
- Jest to nieoficjalny, reverse-engineered klient HTTP działający jak zwykła przeglądarka.
- Korzystanie z niej może być niezgodne z [Regulaminem Synergia](https://synergia.librus.pl/regulamin) (w szczególności zakazem systematycznego pobierania danych).
- Biblioteka jest przeznaczona **wyłącznie do użytku prywatnego i edukacyjnego** przez pojedynczego użytkownika na swoim koncie.
- **Nie używaj jej do automatycznego scrapingu na dużą skalę**, botów, monitoringu klasowego ani komercyjnie.
- Autor nie ponosi żadnej odpowiedzialności za zablokowanie konta, utratę danych ani jakiekolwiek konsekwencje.
- Używaj na własne ryzyko i z poszanowaniem limitów serwerów Librusa.

This applies to the dashboard too — more so, since a dashboard polls. It caches
every response and reuses sessions specifically to keep that traffic low.

---

## The dashboard

A small self-hosted app for parents with more than one child in Librus. The UI
is in Polish.

- **Dzieci** — pick which child you are looking at; every other view follows it.
- **Plan lekcji** — the whole week, one tab per day, opening on today or on the
  next day once today's lessons have finished.
- **Oceny** — per-subject averages and the overall average.
- **Frekwencja** — absence totals.
- **Terminarz** — upcoming events, with a details dialog per entry.
- **Wiadomości** — messages grouped into conversations and shown as a chat.
  Bodies load one at a time, on click, because fetching a message marks it read
  on Librus's servers.
- **Ustawienia** — add, rename or remove a child. Renaming keeps the stored
  session; changing a password is verified against Librus before it is saved.

### Running it

```bash
cp .env.example .env
openssl rand -base64 32          # paste into ACCOUNTS_ENC_KEY in .env
docker compose up -d --build
```

Then open <http://localhost:3000>.

| Variable | Required | Meaning |
|---|---|---|
| `ACCOUNTS_ENC_KEY` | yes | Base64 32-byte key encrypting stored passwords and session jars. The backend refuses to start without it. |
| `CACHE_TTL_MS` | no | How long a Librus response stays fresh. Default 300000 (5 min). Lower means more traffic to Librus. |
| `DB_PATH` | no | SQLite path. Set to `/data/accounts.db` in the container. |

**Losing `ACCOUNTS_ENC_KEY` means losing every stored account** — the passwords
cannot be decrypted without it. Back it up somewhere other than the server.

The frontend is served on `:3000`; the backend binds to `127.0.0.1:3001` and is
not reachable from outside the host. Accounts live in a named Docker volume.

### What is stored

SQLite, in the `data` volume:

- **`accounts`** — label, Synergia login, and the password encrypted with
  AES-256-GCM. The password is needed because Librus sessions are short-lived
  and the app has to be able to log in again unattended.
- **`sessions`** — the serialized cookie jar, encrypted the same way. Treat it
  as a bearer credential: anyone holding it is logged in as that student until
  it expires.

Nothing is sent anywhere except Librus.

### HTTP API

All under `/api/accounts`, all returning JSON. Consumed by the frontend; there
is no auth layer, which is why the backend is bound to localhost.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/` | configured children |
| `POST` | `/` | add a child (credentials verified against Librus first) |
| `PATCH` | `/:id` | rename, and optionally replace the password |
| `DELETE` | `/:id` | remove a child, its session and its cached data |
| `GET` | `/:id/timetable?from=&to=` | one week |
| `GET` | `/:id/grades` | per-subject grades and averages |
| `GET` | `/:id/absences` | absences, wrapped as `{ semesters }` |
| `GET` | `/:id/agenda?month=&year=` | calendar entries, flattened |
| `GET` | `/:id/agenda/:eventId` | one entry's details |
| `GET` | `/:id/homework?from=&to=&subject=` | homework |
| `GET` | `/:id/threads` | messages grouped into conversations |
| `GET` | `/:id/messages` · `/:id/messages/sent` | inbox / sent folder |
| `GET` | `/:id/messages/:messageId?folder=` | one message body — **marks it read on Librus** |
| `GET` | `/:id/lucky-number` · `/:id/announcements` | szczęśliwy numerek, ogłoszenia |

---

## The library

```bash
npm install librus-api
```

```javascript
"use strict";
const Librus = require("librus-api");

const client = new Librus();
await client.authorize("login", "pass");

await client.calendar.getTimetable();          // current week, or (from, to)
await client.calendar.getCalendar(month, year);
await client.calendar.getEvent(id);

await client.info.getGrades();
await client.info.getGrade(id);
await client.info.getPointGrade(id);
await client.info.getAccountInfo();
await client.info.getLuckyNumber();
await client.info.getNotifications();

await client.absence.getAbsences();
await client.absence.getAbsence(id);

await client.homework.listSubjects();
await client.homework.listHomework(subjectId, from, to);  // -1 for all subjects
await client.homework.getHomework(id);

await client.inbox.listInbox(5);               // 5 = received, 6 = sent
await client.inbox.getMessage(5, id);          // marks the message read
await client.inbox.listAnnouncements();
await client.inbox.listReceivers();
await client.inbox.sendMessage(userId, "title", "body");
await client.inbox.removeMessage(id);
```

Attachments come back on a message and are fetched separately:

```javascript
const message = await client.inbox.getMessage(5, 181186);
for (const file of message.files) {
  const stream = await client.inbox.getFile(file.path);
  stream.pipe(fs.createWriteStream(file.name));
}
```

### Sessions

Logging in repeatedly is what eventually earns you a captcha, so the jar can be
persisted and reused:

```javascript
const jar = client.exportSession();            // a bearer credential - encrypt it
const restored = new Librus(undefined, { session: jar });

if (!(await restored.hasLiveSession())) {
  await restored.authorize(login, pass);       // reuses the jar's DeviceCookie
}
```

Two cookies matter and they behave very differently:

- **`oauth_token`** is the session and lasts about **ten minutes**. A jar older
  than that cannot fetch anything — and Librus answers with a normal-looking
  `200` whose body is an access-denied notice rather than a redirect to the
  login page, so this fails silently unless you check. `hasLiveSession()` is
  that check.
- **`DeviceCookie`** lasts about a year and is what keeps logins captcha-free.
  Pass the old jar into a new login so it survives; do not start from an empty
  one.

### Errors

```javascript
const {
  LibrusAuthError,            // login rejected
  LibrusCaptchaError,         // captcha demanded - a human must log in once
  LibrusSessionExpiredError,  // session died mid-request; log in and retry
} = require("librus-api/lib/errors.js");
```

`LibrusSessionExpiredError` is thrown from the request layer when Librus
returns its login page, so every resource method benefits without each caller
having to guess from the shape of an empty result.

---

## Development

```bash
npm install && npm test                         # library — 25 tests
cd app/backend  && npm install && npm test      # backend — 94 tests
cd app/frontend && npm install && npm test      # frontend helpers — 28 tests
cd app/frontend && npm run build                # typecheck + build
```

```
lib/                 the published library
app/backend/         Express API, SQLite, session manager, cache
app/frontend/        React + Vite dashboard
scripts/             gateway-smoke-test.js — hand-run probe, needs your credentials
docs/superpowers/    design notes and known issues
```

Only `lib/` is published to npm (`files` in `package.json`); the dashboard is
not shipped to library consumers.

## How this differs from upstream

Upstream is a scraping library. This fork keeps that and adds:

- Encrypted session persistence, with the short `oauth_token` / long
  `DeviceCookie` distinction handled explicitly.
- Typed errors (`LibrusAuthError`, `LibrusCaptchaError`,
  `LibrusSessionExpiredError`) and login-page detection at the request layer,
  replacing guesswork about empty results.
- Captcha detection during login.
- A test suite — the library had none.
- The whole `app/` dashboard.

## Known issues

[`docs/superpowers/2026-09-16-known-issues-and-followups.md`](docs/superpowers/2026-09-16-known-issues-and-followups.md)
records what is known to be imperfect and deliberately unfixed, including two
pre-existing library bugs. Worth reading before building on this.

## Credits and licence

Originally by **Mateusz Bagiński** and **Krzysztof Rzymkowski**
([Mati365/librus-api](https://github.com/Mati365/librus-api)). This fork is
maintained separately and has diverged substantially; bugs here are not theirs.

The MIT License (MIT)

Copyright (c) 2025 Mateusz Bagiński

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

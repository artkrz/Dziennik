# Dziennik

[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat)](LICENSE)

A self-hosted dashboard for parents with children in
[Librus Synergia](https://synergia.librus.pl/). Add each child once, then see
their week, grades, attendance, agenda and messages without logging in and out
of separate accounts. The interface is in Polish.

Runs on your own machine or server. Nothing is sent anywhere except Librus.

---

**⚠️ WAŻNE OSTRZEŻENIE**

- Dziennik **nie jest oficjalnym produktem** firmy Librus / Synergia i nie jest z nimi powiązany w żaden sposób.
- Korzysta z nieoficjalnego, reverse-engineered klienta HTTP działającego jak zwykła przeglądarka.
- Korzystanie z niego może być niezgodne z [Regulaminem Synergia](https://synergia.librus.pl/regulamin) (w szczególności zakazem systematycznego pobierania danych).
- Jest przeznaczony **wyłącznie do użytku prywatnego** — dla własnych kont i kont własnych dzieci.
- **Nie używaj go do automatycznego scrapingu na dużą skalę**, botów, monitoringu klasowego ani komercyjnie.
- Autorzy nie ponoszą żadnej odpowiedzialności za zablokowanie konta, utratę danych ani jakiekolwiek konsekwencje.
- Używaj na własne ryzyko i z poszanowaniem limitów serwerów Librusa.

A dashboard polls, which makes this warning matter more rather than less.
Dziennik caches every response and reuses sessions specifically to keep that
traffic close to what a person clicking around would generate.

---

## What it does

Pick a child on the home screen; every other view follows that choice.

| View | |
|---|---|
| **Dzieci** | choose which child you are looking at |
| **Plan lekcji** | the whole week, one tab per day, opening on today — or on the next day once today's lessons have finished |
| **Oceny** | per-subject averages and the overall average |
| **Frekwencja** | absence totals |
| **Terminarz** | upcoming events, with details per entry |
| **Wiadomości** | messages grouped into conversations and shown as a chat |
| **Ustawienia** | add, rename or remove a child |

Two behaviours worth knowing before you use it:

- **Opening a message marks it read on Librus**, exactly as it would in the
  real app. Conversation bodies therefore load one at a time when you click
  them — opening a thread to glance at it does not mark the whole thing read.
- **Renaming a child keeps their stored session.** Changing a stored password
  is verified against Librus before it is saved, so a typo cannot quietly break
  the account.

## Running it

```bash
cp .env.example .env
openssl rand -base64 32          # paste into ACCOUNTS_ENC_KEY in .env
docker compose up -d --build
```

Then open <http://localhost:3000>.

| Variable | Required | Meaning |
|---|---|---|
| `ACCOUNTS_ENC_KEY` | yes | Base64 32-byte key encrypting stored passwords and sessions. The backend refuses to start without it. |
| `CACHE_TTL_MS` | no | How long a Librus response stays fresh. Default `300000` (5 min). Lower means more traffic to Librus. |
| `DB_PATH` | no | SQLite location. Set to `/data/accounts.db` inside the container. |

> **Back up `ACCOUNTS_ENC_KEY` somewhere other than the server.** Lose it and
> every stored account is unrecoverable — the passwords cannot be decrypted
> without it, and each child has to be added again.

The dashboard is served on port `3000`. The backend binds to `127.0.0.1:3001`
and is not reachable from outside the host — it has no authentication of its
own, so **do not expose it directly to the internet**. Put it behind a VPN or
an authenticating reverse proxy if you want access from elsewhere.

## What it stores

SQLite, in a named Docker volume:

- **Accounts** — a label, the Synergia login, and the password encrypted with
  AES-256-GCM. The password has to be recoverable rather than hashed because
  Librus sessions are short-lived and Dziennik must be able to log in again
  unattended.
- **Sessions** — the serialized cookie jar, encrypted the same way. Treat it
  as a credential in its own right: anyone holding it is logged in as that
  student until it expires.

Neither is ever written to a log or returned over HTTP.

## How it works

```
app/frontend/   React + Vite dashboard, served by nginx
app/backend/    Express API, SQLite, session manager, response cache
lib/            the Librus Synergia client — see Credits
scripts/        gateway-smoke-test.js, a hand-run probe for API research
docs/           design notes and known issues
```

The backend keeps one logged-in Librus client per child, caches responses for
`CACHE_TTL_MS`, and re-authenticates when a session dies. Synergia's session
cookie lasts about **ten minutes**, and a stale one fails in an unhelpful way —
Librus answers with an ordinary-looking `200` whose body is an access-denied
notice rather than redirecting to the login page. Dziennik checks the cookie
directly instead of guessing from empty results, and carries the long-lived
device cookie into each new login so that repeated logins do not trigger a
captcha.

### Internal API

Consumed by the frontend, under `/api/accounts`. Listed for anyone modifying
Dziennik; it is not a public interface and has no auth.

| Method | Path |
|---|---|
| `GET` `POST` | `/` |
| `PATCH` `DELETE` | `/:id` |
| `GET` | `/:id/timetable?from=&to=` |
| `GET` | `/:id/grades` · `/:id/absences` |
| `GET` | `/:id/agenda?month=&year=` · `/:id/agenda/:eventId` |
| `GET` | `/:id/homework?from=&to=&subject=` |
| `GET` | `/:id/threads` · `/:id/messages` · `/:id/messages/sent` |
| `GET` | `/:id/messages/:messageId?folder=` — **marks the message read on Librus** |
| `GET` | `/:id/lucky-number` · `/:id/announcements` |

## Development

```bash
npm install            && npm test      # Librus client — 25 tests
cd app/backend  && npm install && npm test      # API — 94 tests
cd app/frontend && npm install && npm test      # helpers — 28 tests
cd app/frontend && npm run build                # typecheck + build
```

Known rough edges, deliberately unfixed, are written up in
[`docs/superpowers/2026-09-16-known-issues-and-followups.md`](docs/superpowers/2026-09-16-known-issues-and-followups.md).
Worth reading before changing the session or scraping layers.

## Credits

Dziennik is built on a fork of
**[Mati365/librus-api](https://github.com/Mati365/librus-api)** by
**Mateusz Bagiński** and **Krzysztof Rzymkowski** — the Librus Synergia HTTP
client that became `lib/`. Without it this app would have started from an empty
page. It is used and modified under the MIT licence.

That client has since diverged: it gained session persistence, typed errors,
captcha and expiry detection, and a test suite. Bugs in this fork are not
theirs. The modified client is still published to npm as
[`librus-api`](https://www.npmjs.com/package/librus-api) from this repository.

## Licence

MIT — see [LICENSE](LICENSE), which retains the original authors' copyright
notice as that licence requires.

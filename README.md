# Dziennik

[![Licencja](https://img.shields.io/badge/licencja-MIT-green.svg?style=flat)](LICENSE)

Panel dla rodziców, których dzieci korzystają z
[Librus Synergia](https://synergia.librus.pl/). Dodajesz każde dziecko raz,
a potem widzisz jego plan lekcji, oceny, frekwencję, terminarz i wiadomości
bez przelogowywania się między kontami.

Uruchamiasz go na własnym komputerze lub serwerze. Dane nie trafiają nigdzie
poza Librusa.

---

**⚠️ WAŻNE OSTRZEŻENIE**

- Dziennik **nie jest oficjalnym produktem** firmy Librus / Synergia i nie jest z nimi powiązany w żaden sposób.
- Korzysta z nieoficjalnego, odtworzonego przez analizę (reverse engineering) klienta HTTP, który działa jak zwykła przeglądarka.
- Korzystanie z niego może być niezgodne z [Regulaminem Synergia](https://synergia.librus.pl/regulamin) (w szczególności z zakazem systematycznego pobierania danych).
- Jest przeznaczony **wyłącznie do użytku prywatnego** — dla własnego konta i kont własnych dzieci.
- **Nie używaj go do masowego scrapingu**, botów, monitorowania klasy ani do celów komercyjnych.
- Autorzy nie ponoszą żadnej odpowiedzialności za zablokowanie konta, utratę danych ani jakiekolwiek inne konsekwencje.
- Używaj na własną odpowiedzialność i z poszanowaniem limitów serwerów Librusa.

Panel odpytuje Librusa cyklicznie, więc powyższe ostrzeżenie jest tu ważniejsze,
a nie mniej ważne. Dziennik buforuje każdą odpowiedź i ponownie wykorzystuje
sesje właśnie po to, żeby ruch był zbliżony do tego, co generuje człowiek
klikający po stronie.

---

## Co potrafi

Na ekranie głównym wybierasz dziecko — wszystkie pozostałe widoki podążają za
tym wyborem.

| Widok | |
|---|---|
| **Dzieci** | wybór dziecka, którego dane oglądasz |
| **Plan lekcji** | cały tydzień, zakładka na każdy dzień; otwiera się na dziś — albo na kolejny dzień, jeśli dzisiejsze lekcje już się skończyły |
| **Oceny** | średnie z poszczególnych przedmiotów i średnia ogólna |
| **Frekwencja** | podsumowanie nieobecności |
| **Terminarz** | nadchodzące wydarzenia, ze szczegółami każdego wpisu |
| **Wiadomości** | wiadomości pogrupowane w rozmowy i pokazane jak czat |
| **Ustawienia** | dodanie, zmiana nazwy lub usunięcie dziecka |

Dwie rzeczy, o których warto wiedzieć przed użyciem:

- **Otwarcie wiadomości oznacza ją w Librusie jako przeczytaną** — dokładnie tak
  samo jak w oryginalnej aplikacji. Dlatego treści w rozmowie wczytują się
  pojedynczo, po kliknięciu: zajrzenie do wątku nie oznacza od razu wszystkich
  wiadomości jako przeczytanych.
- **Zmiana nazwy dziecka zachowuje jego zapisaną sesję.** Zmiana zapisanego
  hasła jest weryfikowana w Librusie przed zapisaniem, więc literówka nie
  zepsuje po cichu konta.

## Uruchomienie

```bash
cp .env.example .env
openssl rand -base64 32          # wynik wklej do ACCOUNTS_ENC_KEY w .env
docker compose up -d --build
```

Następnie otwórz <http://localhost:3000>.

| Zmienna | Wymagana | Znaczenie |
|---|---|---|
| `ACCOUNTS_ENC_KEY` | tak | Klucz (32 bajty, base64) szyfrujący zapisane hasła i sesje. Bez niego backend się nie uruchomi. |
| `CACHE_TTL_MS` | nie | Jak długo odpowiedź z Librusa pozostaje aktualna. Domyślnie `300000` (5 minut). Mniejsza wartość to większy ruch do Librusa. |
| `DB_PATH` | nie | Położenie bazy SQLite. W kontenerze ustawione na `/data/accounts.db`. |

> **Zrób kopię `ACCOUNTS_ENC_KEY` w innym miejscu niż serwer.** Jeśli go
> stracisz, wszystkie zapisane konta przepadają — bez niego haseł nie da się
> odszyfrować i każde dziecko trzeba dodać od nowa.

Panel działa na porcie `3000`. Backend nasłuchuje na `127.0.0.1:3001` i nie
jest dostępny spoza hosta — **nie ma własnego uwierzytelniania, więc nie
wystawiaj go bezpośrednio do internetu**. Jeśli chcesz mieć dostęp z zewnątrz,
schowaj go za VPN-em albo za reverse proxy z logowaniem.

## Co przechowuje

Baza SQLite w nazwanym wolumenie Dockera:

- **Konta** — etykieta, login Synergii oraz hasło zaszyfrowane algorytmem
  AES-256-GCM. Hasło musi dać się odszyfrować (a nie tylko zahaszować),
  ponieważ sesje Librusa są krótkie i Dziennik musi umieć zalogować się
  ponownie bez udziału człowieka.
- **Sesje** — zserializowany zestaw ciasteczek, zaszyfrowany tak samo. Traktuj
  go jak osobne poświadczenie: kto go ma, jest zalogowany jako dany uczeń aż do
  wygaśnięcia sesji.

Żadne z nich nigdy nie trafia do logów ani nie jest zwracane przez API.

## Jak to działa

```
app/frontend/   panel w React + Vite, serwowany przez nginx
app/backend/    API w Express, SQLite, zarządzanie sesjami, bufor odpowiedzi
lib/            klient Librus Synergia — zobacz Podziękowania
scripts/        gateway-smoke-test.js — ręcznie uruchamiana sonda do badania API
docs/           notatki projektowe i znane problemy
```

Backend trzyma jednego zalogowanego klienta Librusa na dziecko, buforuje
odpowiedzi przez `CACHE_TTL_MS` i loguje się ponownie, gdy sesja wygaśnie.
Ciasteczko sesyjne Synergii żyje około **dziesięciu minut**, a przeterminowane
zawodzi w mylący sposób: Librus odpowiada zwyczajnie wyglądającym kodem `200`,
którego treścią jest komunikat o braku dostępu, zamiast przekierować na stronę
logowania. Dziennik sprawdza więc samo ciasteczko, zamiast zgadywać na
podstawie pustych wyników, i przenosi długo żyjące ciasteczko urządzenia do
każdego nowego logowania, żeby powtarzane logowania nie wywołały captchy.

### Wewnętrzne API

Używane przez panel, pod `/api/accounts`. Spisane dla osób modyfikujących
Dziennik — nie jest to interfejs publiczny i nie ma uwierzytelniania.

| Metoda | Ścieżka |
|---|---|
| `GET` `POST` | `/` |
| `PATCH` `DELETE` | `/:id` |
| `GET` | `/:id/timetable?from=&to=` |
| `GET` | `/:id/grades` · `/:id/absences` |
| `GET` | `/:id/agenda?month=&year=` · `/:id/agenda/:eventId` |
| `GET` | `/:id/homework?from=&to=&subject=` |
| `GET` | `/:id/threads` · `/:id/messages` · `/:id/messages/sent` |
| `GET` | `/:id/messages/:messageId?folder=` — **oznacza wiadomość jako przeczytaną w Librusie** |
| `GET` | `/:id/lucky-number` · `/:id/announcements` |

## Praca nad kodem

```bash
npm install            && npm test      # klient Librusa — 25 testów
cd app/backend  && npm install && npm test      # API — 94 testy
cd app/frontend && npm install && npm test      # funkcje pomocnicze — 28 testów
cd app/frontend && npm run build                # sprawdzenie typów + build
```

Znane niedoskonałości, świadomie niepoprawione, są opisane w
[`docs/superpowers/2026-09-16-known-issues-and-followups.md`](docs/superpowers/2026-09-16-known-issues-and-followups.md).
Warto przeczytać przed zmianami w warstwie sesji albo scrapingu.

## Podziękowania

Dziennik powstał na forku projektu
**[Mati365/librus-api](https://github.com/Mati365/librus-api)** autorstwa
**Mateusza Bagińskiego** i **Krzysztofa Rzymkowskiego** — to ich klient HTTP do
Librus Synergia stał się katalogiem `lib/`. Bez niego ta aplikacja zaczynałaby
od pustej strony. Jest używany i modyfikowany na warunkach licencji MIT.

Ten klient od tego czasu się rozszedł z oryginałem: doszły trwałe sesje, typowane
błędy, wykrywanie captchy i wygasłej sesji oraz testy. Błędy w tym forku nie są
winą autorów oryginału. Zmodyfikowany klient nadal jest publikowany w npm jako
[`librus-api`](https://www.npmjs.com/package/librus-api) z tego repozytorium.

## Licencja

MIT — zobacz [LICENSE](LICENSE), gdzie zachowana jest nota o prawach autorskich
oryginalnych autorów, czego ta licencja wymaga. Sam tekst licencji pozostaje po
angielsku: to jego kanoniczne brzmienie i tłumaczenie nie miałoby mocy prawnej.

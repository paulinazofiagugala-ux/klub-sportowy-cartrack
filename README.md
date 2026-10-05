# Klub Sportowy Cartrack

Klubowy ranking dystansu i kalorii. Każda osoba loguje się kontem Google, dodaje swoje treningi i widzi podium, statystyki oraz rekordy klubu.

**Adres aplikacji:** https://paulinazofiagugala-ux.github.io/klub-sportowy-cartrack/

- Strona jest hostowana za darmo na GitHub Pages (to repozytorium).
- Logowanie i baza danych działają na Firebase, projekt `cartrack-move-app`, plan Spark (darmowy).

## Instalacja na telefonie i komputerze

- **iPhone (Safari):** Udostępnij → „Do ekranu początkowego”.
- **Android (Chrome):** menu ⋮ → „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.
- **Komputer (Chrome lub Edge):** ikona instalacji na końcu paska adresu.

## Jak wprowadzać zmiany

Otwórz plik w repozytorium, kliknij ikonę ołówka, wprowadź zmianę i kliknij **Commit changes**. Możesz też wgrać nową wersję przez **Add file → Upload files**. Strona odświeży się po 1–2 minutach.

## Pliki

| Plik | Do czego służy |
| --- | --- |
| `index.html` | Cała aplikacja: wygląd i działanie |
| `firebase-config.js` | Połączenie z projektem Firebase |
| `firestore.rules` | Kopia reguł bezpieczeństwa bazy (obowiązujące są w konsoli Firebase → Firestore → Rules) |
| `manifest.webmanifest`, `sw.js`, `*.png` | Instalacja aplikacji i ikony |

## Opcjonalnie: tylko adresy firmowe

Żeby do klubu mogły dołączyć tylko osoby z firmowym adresem e-mail, w regułach Firestore zamień każde `request.auth != null` na:

    request.auth != null && request.auth.token.email.matches('.*@twojafirma[.]com$')

W miejsce `twojafirma[.]com` wpisz domenę firmową, a potem opublikuj reguły w konsoli Firebase. Działa to tylko wtedy, gdy firmowe adresy są kontami Google, np. w Google Workspace.

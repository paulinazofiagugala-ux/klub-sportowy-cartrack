# Klub Sportowy Cartrack

Klubowa aplikacja sportowa: rankingi, wyzwania, cele, kalendarz, serie i odznaki. Uczestnicy logują się kontem Google albo e-mailem i hasłem.

**Adres aplikacji:** https://paulinazofiagugala-ux.github.io/klub-sportowy-cartrack/

- Strona jest hostowana za darmo na GitHub Pages (to repozytorium).
- Logowanie i baza danych działają na Firebase, projekt `cartrack-move-app`, plan Spark (darmowy).

## Co potrafi

- **Ranking osób i działów:** tydzień, miesiąc, 7 dni albo cały czas; według dystansu, kalorii, liczby treningów lub czasu; filtr rodzaju aktywności ze średnim tempem. W trybie Działy widać, który dział zebrał najwięcej.
- **Dodawanie treningu:** ręcznie (czas z dokładnością do setnych sekundy), z pliku GPX, TCX lub FIT albo ze zrzutu ekranu podsumowania treningu (Garmin, Amazfit, Apple Watch, Samsung Health, Strava, Komoot, adidas Running, Whoop). Zdjęcie jest odczytywane w przeglądarce i nigdzie nie jest wysyłane. Rodzaj aktywności jest rozpoznawany z pliku, zdjęcia albo z tempa. Rodzaje: bieg, spacer, nordic walking, rower, rolki, pływanie oraz bez dystansu (kalorie liczone z czasu): siłownia, joga, HIIT, aerobik, padel i tenis.
- **Wyzwania:** cel klubu (np. 1000 km w październiku), wyzwanie firmowe, wyzwanie działowe i wirtualny bieg na dystans. Tworzą je administratorzy.
- **Kalendarz:** własne treningi albo treningi całego klubu oraz trwające wyzwania.
- **Moje:** seria tygodni z treningiem, cele osobiste, odznaki, średnie tempo, lista treningów i profil z działem.
- **Panel administratora** (zakładka Moje): lista działów i nadawanie uprawnień administratora.

## Instalacja na telefonie i komputerze

- **iPhone (Safari):** Udostępnij → „Do ekranu początkowego”.
- **Android (Chrome):** menu ⋮ → „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.
- **Komputer (Chrome lub Edge):** ikona instalacji na końcu paska adresu.

## Pliki

| Plik | Do czego służy |
| --- | --- |
| `index.html` | Układ aplikacji |
| `styles.css` | Wygląd w stylistyce Cartrack |
| `app.js` | Działanie aplikacji: logowanie, rankingi, wyzwania, kalendarz, odznaki |
| `parse.js` | Odczyt plików GPX, TCX i FIT oraz rozpoznawanie rodzaju aktywności |
| `ocr.js` | Odczyt danych treningu ze zrzutu ekranu (rozpoznawanie tekstu Tesseract.js) |
| `firebase-config.js` | Połączenie z projektem Firebase |
| `CHANGELOG.md` | Historia zmian – dopisuj wpis przy każdej zmianie |
| `firestore.rules` | Kopia reguł bezpieczeństwa bazy (obowiązujące są w konsoli Firebase → Firestore → Rules) |
| `manifest.webmanifest`, `sw.js`, `*.png` | Instalacja aplikacji, logo i ikony |

## Jak wprowadzać zmiany

Otwórz plik w repozytorium, kliknij ikonę ołówka, wprowadź zmianę i kliknij **Commit changes**. Strona odświeży się po 1–2 minutach.

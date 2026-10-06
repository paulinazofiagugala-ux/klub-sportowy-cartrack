# Historia zmian – Klub Sportowy Cartrack

Każda zmiana w aplikacji jest tu zapisywana, żeby kolejne sesje (z Claude albo z inną osobą) wiedziały, co i dlaczego zostało zrobione. Najnowsze wpisy są na górze.

**Jak dopisywać:** nowa sekcja `## vN – RRRR-MM-DD – krótki tytuł`, pod nią: co się zmieniło dla uczestników, które pliki zmieniono, co trzeba jeszcze sprawdzić. Przy każdej zmianie podbij numer wersji w `index.html` (`styles.css?v=N`, `app.js?v=N`) i w `sw.js` (`CACHE = "ksc-vN"`), inaczej telefony mogą pokazywać starą wersję.

## v9 – 2026-10-06 – Skąd są dane w podsumowaniu

- Kafelki podsumowania w Rankingu (km, kcal, treningi, czas) są klikalne. Otwierają widok „…: skąd są dane” z tymi samymi filtrami (okres, rodzaj aktywności, filtr działu).
- Widok pokazuje: sumę, podział **według sposobu dodania** (ręcznie / zrzut / plik, z udziałem %) oraz **według osób** (wartość, udział %, dział, liczba treningów i z jakiego źródła). Kliknięcie osoby rozwija jej treningi z tego okresu ze znacznikami źródła i przyciskiem do profilu.
- Drobna zmiana: czas „1 h 0 min” wyświetla się jako „1 h”.
- Pliki: `app.js` (`fillTotals`, `rankEntries`, `renderSum`, widok `sum`), `index.html` (`#v-sum`), `styles.css`, `sw.js` (cache `ksc-v9`).
- Uwaga: pierwsza publikacja tej wersji utknęła po stronie GitHub Pages (krok „deploy” czekał ponad 30 min). Wdrożenie anulowano i opublikowano ponownie tym wpisem. Jeśli strona się nie zmienia po commicie, sprawdź zakładkę Actions w repozytorium.

## v8 – 2026-10-06 – Siłownia i joga

- Nowe rodzaje aktywności: **Siłownia** i **Joga**. Nie mają dystansu: po wybraniu ich pole „Dystans” znika, a wymagany jest czas treningu.
- Kalorie są szacowane z czasu: siłownia 6 kcal/min, joga 3 kcal/min (można wpisać własną wartość, np. z zegarka).
- Na listach zamiast „0 km” widać czas treningu; tempo i rekord „Najdłuższy dystans” pomijają treningi bez dystansu.
- Ranking i filtry rodzaju aktywności mają nowe pozycje Siłownia i Joga (w rankingu według km mają 0 km; najlepiej porównywać je według kalorii, treningów lub czasu).
- Odczyt zrzutów rozpoznaje m.in. „Siłownia”, „Trening siłowy”, „Strength Training”, „HIIT”, „CrossFit” (→ Siłownia) oraz „Joga”/„Yoga” (→ Joga). Test na 2 nowych makietach: wszystkie pola poprawne.
- Pliki: `app.js` (`TYPES`, `noDist`, `estKcal`), `ocr.js`, `index.html` (`#kmWrap`), `sw.js` (cache `ksc-v8`), `README.md`.

## v7 – 2026-10-06 – Lepszy odczyt dużych liczb ze zrzutów

- Test na prawdziwym silniku OCR w przeglądarce pokazał, że duża liczba dystansu (np. „7,45 km” na górze ekranu Samsung Health) po powiększeniu obrazu rozpadała się na kawałki i aplikacja wpisywała 5 km zamiast 7,45 km.
- Zmiany w `ocr.js`: zrzuty z telefonu (szerokość ≥ 800 px) nie są już powiększane (małe obrazy nadal tak, bardzo duże są zmniejszane), a przy dystansie bez etykiety pierwszeństwo mają wartości z przecinkiem przed liczbami całkowitymi.
- Pliki: `ocr.js`, `index.html`, `sw.js` (cache `ksc-v7`).

## v6 – 2026-10-06 – Ranking działów i Samsung Health

- Ranking: nowy przełącznik **Osoby / Działy**. W trybie Działy widać, który dział zebrał najwięcej km, kcal, treningów lub czasu w wybranym okresie (tydzień, miesiąc, 7 dni, cały czas) i dla wybranego rodzaju aktywności. Wynik działu to suma treningów jego członków; przy dziale widać też liczbę aktywnych osób i średnią na osobę. Twój dział jest wyróżniony.
- Kliknięcie działu pokazuje ranking osób tylko z tego działu (filtr „Dział: …” z krzyżykiem do wyłączenia).
- Odczyt zrzutów ekranu: dodano Samsung Health (etykiety „Czas treningu”, „Kalorie spalone…”, „Total burned calories”, rodzaj „Chodzenie”). Test na 3 makietach Samsung Health: 14/15 pól; jedyny błąd to źle rozpoznana bardzo duża liczba dystansu przez testowy OCR, do sprawdzenia na prawdziwych zrzutach.
- Pliki: `app.js` (`renderDeptRank`, `rmode`, `deptF`), `index.html`, `styles.css`, `ocr.js`, `sw.js` (cache `ksc-v6`), `README.md`.

## v5 – 2026-10-06 – Znacznik sposobu dodania treningu

- Przy każdym treningu (lista w Moje, kalendarz, profil uczestnika) widać znacznik: **Ręcznie** (szary), **Zrzut ekranu** (niebieski) albo **Plik GPX/TCX/FIT** (pomarańczowy).
- Działa też dla starszych wpisów: pole `src` w danych (`manual`, `foto`, `gpx`/`tcx`/`fit`); brak pola = ręcznie.
- Pliki: `app.js` (funkcje `srcInfo`, `srcTag`), `styles.css` (`.srctag`), `index.html`, `sw.js` (cache `ksc-v5`).

## v4 – 2026-10-06 – Odczyt treningu ze zrzutu ekranu

- Nowe pole **„Wgraj zrzut ekranu”** w zakładce Dodaj. Aplikacja odczytuje z obrazka podsumowania treningu: rodzaj aktywności, dystans, czas, kalorie i datę, i wpisuje je do formularza. Uczestnik sprawdza dane i klika Dodaj.
- Obsługiwane układy: Garmin Connect, Amazfit (Zepp), Apple Watch (Fitness), Strava, Komoot, adidas Running, Whoop; po polsku i angielsku, tryb jasny i ciemny.
- Rozpoznawanie tekstu działa w przeglądarce uczestnika (Tesseract.js 5.1.1 z cdn.jsdelivr.net, pobierany przy pierwszym użyciu). Zdjęcie nie jest nigdzie wysyłane ani zapisywane.
- Jeśli czegoś nie da się odczytać (np. Whoop często nie pokazuje dystansu), aplikacja prosi o uzupełnienie tego pola ręcznie. Kalorie bez odczytu są szacowane jak dotąd.
- W szczegółach treningu źródło pokazuje się jako „ze zrzutu ekranu” (`src: "foto"`).
- Pliki: nowy `ocr.js`; zmienione `app.js`, `index.html`, `styles.css`, `sw.js` (cache `ksc-v4`, `ocr.js` w SHELL), `README.md`.
- Do sprawdzenia: odczyt był testowany na 14 makietach ekranów (70/70 pól poprawnie). Potrzebne są prawdziwe zrzuty z każdej z 7 aplikacji, żeby potwierdzić skuteczność i ewentualnie dostroić `ocr.js`.

## v3 – 2026-10-06 – Okresy w rankingu i podgląd aktywności innych

- Ranking: tydzień i miesiąc kalendarzowy ze strzałkami i widocznymi datami oraz nowa opcja „7 dni” (ostatnie 7 dni). Wcześniejsze zgłoszenie „tydzień nie sumuje całości” wynikało z tego, że tydzień liczy się od poniedziałku.
- Kliknięcie osoby w rankingu lub na podium otwiera jej profil z listą treningów i szczegółami (każdy uczestnik widzi aktywności innych).
- Pliki: `app.js`, `index.html`, `styles.css`, `sw.js` (cache `ksc-v3`).

## v2 – Pełna wersja klubowa

- Logowanie Google oraz e-mail i hasło (Firebase Auth); dane w Firestore (`people`, `challenges`, `config/departments`, `admins`).
- Rankingi (kcal, km, liczba treningów, czas), średnie tempo, czas z setnymi sekundy.
- Import plików GPX, TCX i FIT (`parse.js`), automatyczne rozpoznawanie rodzaju aktywności.
- Wyzwania: cel klubu, firmowe, działowe, wirtualny bieg; kalendarz; cele osobiste; serie; odznaki.
- Panel administratora: działy i uprawnienia (super administrator: paulinazofiagugala@gmail.com).
- Stylistyka Cartrack, logo, instalacja jako aplikacja (PWA), hosting na GitHub Pages.

## v1 – Pierwsza wersja

- Prosty ranking dystansu i kalorii jako artefakt Claude; zastąpiona przez wersję v2 działającą niezależnie od Claude.

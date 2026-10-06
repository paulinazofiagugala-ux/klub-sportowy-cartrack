// Odczyt treningu ze zrzutu ekranu (Garmin, Amazfit/Zepp, Apple Watch, Samsung Health, Strava, Komoot, adidas Running, Whoop).
// 1) ocrImage(file) – rozpoznaje tekst w przeglądarce (Tesseract.js, ładowany dopiero przy pierwszym użyciu),
// 2) parseStatsText(text) – wyciąga z tekstu: rodzaj, dystans, czas, kalorie i datę.
// Wynik: { type, km, sec, kcal, d, found: [...] } – pola mogą być null; uczestnik zawsze sprawdza dane przed zapisem.

const TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

// ---------- helpers ----------
const norm = s => String(s || "").toLowerCase()
  .replace(/[ąà]/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l").replace(/ń/g, "n")
  .replace(/ó/g, "o").replace(/ś/g, "s").replace(/[źż]/g, "z")
  .replace(/[’`´]/g, "'").replace(/[“”″]/g, '"').replace(/ /g, " ");
const num = s => parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
const pad = n => String(n).padStart(2, "0");

const MONTHS = {
  sty: 1, jan: 1, lut: 2, feb: 2, mar: 3, kwi: 4, apr: 4, maj: 5, may: 5, cze: 6, jun: 6, lip: 7, jul: 7,
  sie: 8, aug: 8, wrz: 9, sep: 9, paz: 10, oct: 10, lis: 11, nov: 11, gru: 12, dec: 12
};

// ---------- value patterns ----------
// dystans: "10,02 km", "10.02km", "6.2 mi", "1 500 m" (tylko z etykietą dystansu)
const RE_KM = /(\d{1,3}(?:[.,]\d{1,3})?)\s?(km|mi)\b(?!\s?\/\s?h)/;
const RE_M = /(\d{1,2}\s?\d{3}|\d{2,4})\s?m\b(?!in)/;
// tempo (żeby nie pomylić go z czasem): "5:14 /km", "5:14/km", "5'14\"/km", "5:14 min/km", "/100 m"
const RE_PACE = /\d{1,2}\s?[:'.]\s?\d{2}\s?(?:"|'')?\s?(?:min)?\s?\/\s?(?:km|mi|100\s?m)/g;
// czas: "1:02:33", "0:52:31,4", "52:31", "1h 05m", "1 godz. 5 min", "52 min 31 s", "1:05 h"
const RE_HMS = /\b(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,2}))?\b/;
const RE_MS = /\b(\d{1,3}):(\d{2})(?:[.,](\d{1,2}))?\b(?!\s?(?:"|''|\/|min\/))/;
const RE_HM_H = /\b(\d{1,2}):(\d{2})\s?h\b/;
const RE_WORDS = /(?:(\d{1,2})\s?(?:h|godz\.?|godzin[ay]?|hr|hrs)\s?)?(?:(\d{1,3})\s?(?:m|min|minut[ay]?)\b\.?\s?)?(?:(\d{1,2})\s?(?:s|sek|sec)\b)?/;
// kalorie: "712 kcal", "712 cal", "712 KCAL"
const RE_KCAL = /(\d{1,2}[\s,.]?\d{3}|\d{2,4})\s?(?:k?cal|kcal)\b/;
const RE_INT = /\b(\d{1,2}[\s,.]?\d{3}|\d{2,4})\b/;

function stripPace(line) { return line.replace(RE_PACE, " "); }

function readKm(line, withLabel) {
  const m = line.match(RE_KM);
  if (m) { const v = num(m[1]); return m[2] === "mi" ? v * 1.609344 : v; }
  if (withLabel) { const mm = line.match(RE_M); if (mm) { const v = num(mm[1]); if (v >= 50) return v / 1000; } }
  return null;
}
function readTime(line) {
  const l = stripPace(line);
  let m = l.match(RE_HMS);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +(m[4].padEnd(2, "0")) / 100 : 0);
  m = l.match(RE_HM_H);
  if (m) return +m[1] * 3600 + +m[2] * 60;
  m = l.match(RE_MS);
  if (m) return +m[1] * 60 + +m[2] + (m[3] ? +(m[3].padEnd(2, "0")) / 100 : 0);
  m = l.match(RE_WORDS);
  if (m && (m[1] || m[2])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return null;
}
function readKcal(line, withLabel) {
  const int = s => parseInt(String(s).replace(/\D/g, ""), 10);
  const m = line.match(RE_KCAL);
  if (m) return int(m[1]);
  if (withLabel) { const l = stripPace(line).replace(RE_HMS, " ").replace(RE_MS, " "); const mm = l.match(RE_INT); if (mm) return int(mm[1]); }
  return null;
}

// ---------- labels (bez polskich znaków, małe litery) – kolejność = priorytet ----------
const LABELS = {
  time: ["moving time", "czas ruchu", "czas w ruchu", "workout time", "czas treningu", "duration", "czas trwania", "czas aktywnosci", "total time", "czas calkowity", "elapsed time", "uplyniety czas", "czas", "time"],
  km: ["distance", "dystans", "odleglosc", "total distance", "laczny dystans"],
  kcal: ["total kilocalories", "total calories", "laczne kalorie", "calkowite kalorie", "calories", "kalorie", "spalone kalorie", "kalorie spalone", "calories burned", "burned calories", "energy burned", "active kilocalories", "active calories", "aktywne kalorie", "kcal"]
};
const TYPE_WORDS = [
  ["nordic", "nordic"], ["nordic walking", "nordic"],
  ["plywanie", "swim"], ["swim", "swim"], ["basen", "swim"], ["pool", "swim"],
  ["rolki", "skate"], ["inline", "skate"], ["skating", "skate"],
  ["rower", "bike"], ["kolarstwo", "bike"], ["cycling", "bike"], ["ride", "bike"], ["jazda", "bike"], ["bike", "bike"], ["mtb", "bike"], ["gravel", "bike"],
  ["bieg", "run"], ["bieganie", "run"], ["running", "run"], ["run", "run"], ["trail", "run"], ["jogging", "run"],
  ["spacer", "walk"], ["chodzenie", "walk"], ["chod", "walk"], ["walk", "walk"], ["walking", "walk"], ["wedrowka", "walk"], ["hike", "walk"], ["hiking", "walk"], ["turystyka piesza", "walk"]
];

function labelHit(L, lab) {
  let from = 0;
  while (true) {
    const at = L.indexOf(lab, from);
    if (at < 0) return -1;
    const before = L[at - 1], after = L[at + lab.length];
    if (!(before && /[a-z]/.test(before)) && !(after && /[a-z]/.test(after))) return at;
    from = at + 1;
  }
}
// Tekst bez pozycji: etykieta i wartość w tej samej linii albo w sąsiedniej
function findByLabel(lines, labels, reader) {
  for (const lab of labels) {
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i], at = labelHit(L, lab);
      if (at < 0) continue;
      if ((lab === "kalorie" || lab === "calories") && /(aktywne|active)\s$/.test(L.slice(0, at))) continue;
      const cands = [L.slice(at + lab.length), L.slice(0, at), lines[i + 1], lines[i - 1], lines[i + 2]];
      for (const c of cands) { if (c == null) continue; const v = reader(c); if (v != null && v > 0) return { v, lab }; }
    }
  }
  return null;
}
// Słowa z pozycjami (z OCR): wartość w tej samej kolumnie, pod albo nad etykietą, albo na prawo od niej
function groupLines(words) {
  const ws = words.filter(w => w.text && w.text.trim()).map(w => ({ t: norm(w.text), x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, cy: (w.y0 + w.y1) / 2, h: Math.max(1, w.y1 - w.y0) }))
    .sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const lines = [];
  for (const w of ws) {
    const L = lines.find(l => Math.abs(l.cy - w.cy) < Math.max(l.h, w.h) * 0.55);
    if (L) { L.words.push(w); L.cy = (L.cy * (L.words.length - 1) + w.cy) / L.words.length; L.h = Math.max(L.h, w.h); }
    else lines.push({ cy: w.cy, h: w.h, words: [w] });
  }
  for (const L of lines) L.words.sort((a, b) => a.x0 - b.x0);
  return lines.sort((a, b) => a.cy - b.cy);
}
function clustersOf(words) {
  const out = []; let cur = null;
  for (const w of words) {
    if (cur && w.x0 - cur.x1 <= Math.max(w.h, cur.h) * 1.6) { cur.words.push(w); cur.x1 = Math.max(cur.x1, w.x1); cur.h = Math.max(cur.h, w.h); }
    else { cur = { x0: w.x0, x1: w.x1, h: w.h, words: [w] }; out.push(cur); }
  }
  return out;
}
function findByLabelBoxes(lines, labels, reader, dirs) {
  dirs = dirs || [1, -1, 2, -2];
  for (const lab of labels) {
    const parts = lab.split(" ");
    for (let li = 0; li < lines.length; li++) {
      const W = lines[li].words;
      for (let wi = 0; wi + parts.length <= W.length; wi++) {
        let ok = true;
        for (let k = 0; k < parts.length; k++) { if (W[wi + k].t.replace(/[^a-z.]/g, "") !== parts[k].replace(/[^a-z.]/g, "")) { ok = false; break; } }
        if (!ok) continue;
        if ((lab === "kalorie" || lab === "calories") && wi > 0 && /^(aktywne|active)$/.test(W[wi - 1].t)) continue;
        // pojedyncze słowo-etykieta nie może być fragmentem dłuższej etykiety (np. "czas" w "czas ruchu")
        const lx0 = W[wi].x0, lx1 = W[wi + parts.length - 1].x1, lw = lx1 - lx0, lh = lines[li].h;
        // kolumna etykiety: od jej lewej krawędzi do początku następnego słowa odległego o więcej niż 2 wysokości
        let colEnd = lx1 + lw * 0.8; const next = W[wi + parts.length];
        if (next && next.x0 - lx1 > lh * 2) colEnd = Math.min(colEnd, next.x0 - lh * 0.5);
        let prevEnd = lx0 - lw * 0.8; const prev = W[wi - 1];
        if (prev && lx0 - prev.x1 > lh * 2) prevEnd = Math.max(prevEnd, prev.x1 + lh * 0.5);
        const textOf = ws => ws.map(w => w.t).join(" ");
        const lc = (lx0 + lx1) / 2;
        // klaster słów w sąsiedniej linii, który leży w tej samej kolumnie co etykieta
        const colText = L2 => {
          const cl = clustersOf(L2.words);
          let best = null, bestScore = -Infinity;
          for (const c of cl) {
            const overlap = Math.min(c.x1, colEnd) - Math.max(c.x0, prevEnd);
            const score = overlap > 0 ? overlap : -Math.abs((c.x0 + c.x1) / 2 - lc);
            if (score > bestScore) { bestScore = score; best = c; }
          }
          return best && bestScore > -lw ? textOf(best.words) : "";
        };
        const right = W.slice(wi + parts.length);
        const cands = [[0, textOf(right)]];
        for (const d of dirs) {
          const L2 = lines[li + d]; if (!L2) continue;
          if (Math.abs(L2.cy - lines[li].cy) > lh * 5) continue;
          cands.push([d, colText(L2)]);
        }
        for (const [d, c] of cands) { if (!c) continue; const v = reader(c); if (v != null && v > 0) return { v, lab, dir: d }; }
      }
    }
  }
  return null;
}

function readDate(text) {
  const t = norm(text);
  let m = t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (m) return m[3] + "-" + pad(m[2]) + "-" + pad(m[1]);
  m = t.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (m) return m[1] + "-" + pad(m[2]) + "-" + pad(m[3]);
  m = t.match(/\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(20\d{2})\b/);
  if (m && MONTHS[m[2]]) return m[3] + "-" + pad(MONTHS[m[2]]) + "-" + pad(m[1]);
  m = t.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (m && MONTHS[m[1]]) return m[3] + "-" + pad(MONTHS[m[1]]) + "-" + pad(m[2]);
  return null;
}

export function parseStatsText(text, words) {
  const lines = String(text || "").split(/\r?\n/).map(norm).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const boxLines = Array.isArray(words) && words.length ? groupLines(words) : null;
  let dirs = null;
  const find = (labels, reader) => (boxLines && findByLabelBoxes(boxLines, labels, reader, dirs)) || findByLabel(lines, labels, reader);
  const all = lines.join(" \n ");
  const found = [];
  // rodzaj aktywności
  let type = null;
  for (const [w, k] of TYPE_WORDS) { if (new RegExp("\\b" + w + "\\b").test(all)) { type = k; break; } }
  // dystans
  let km = null; const kmL = find(LABELS.km, l => readKm(l, true));
  if (kmL) { km = kmL.v; found.push("dystans"); if (kmL.dir === -1 || kmL.dir === -2) dirs = [-1, 1, -2, 2]; }
  else { for (const l of lines) { const v = readKm(l, false); if (v) { km = v; found.push("dystans"); break; } } }
  // duża liczba na górze ekranu (np. "6.55 km" w Amazfit, adidas Running), gdy OCR nie odczytał małego "km"
  if (km == null) {
    let hero = null;
    if (boxLines) for (const L of boxLines) {
      const W = L.words;
      for (let i = 0; i < W.length; i++) {
        const nx = W[i + 1] ? W[i + 1].t : "";
        if (/strain|kg|bpm|%|h$/.test(nx)) continue;
        let v = null;
        if (/^\d{1,3}[.,]\d{1,2}$/.test(W[i].t)) v = num(W[i].t);
        else if (type === "swim" && /^\d{3,4}[.,]?$/.test(W[i].t)) v = parseInt(W[i].t, 10) / 1000; // pływanie: metry
        if (v != null && (!hero || W[i].h > hero.h)) hero = { h: W[i].h, v };
      }
    }
    if (!hero) for (const l of lines) { const m = l.match(/^(\d{1,3}[.,]\d{1,2})\s*(?:k\S{0,2}|i\S{0,2}|m)?$/); if (m) { hero = { v: num(m[1]) }; break; } }
    if (hero && hero.v > 0) { km = hero.v; found.push("dystans"); }
  }
  // czas
  let sec = null; const tL = find(LABELS.time, readTime);
  if (tL) { sec = tL.v; found.push("czas"); if (!dirs && (tL.dir === -1 || tL.dir === -2)) dirs = [-1, 1, -2, 2]; }
  else {
    let best = null; for (const l of lines) { const v = readTime(l); if (v && (!best || v > best)) best = v; }
    if (best) { sec = best; found.push("czas"); }
  }
  // kalorie
  let kcal = null; const kL = find(LABELS.kcal, l => readKcal(l, true));
  if (kL) { kcal = kL.v; found.push("kalorie"); }
  else { for (const l of lines) { const v = readKcal(l, false); if (v) { kcal = v; found.push("kalorie"); break; } } }
  // sanity: czas krótszy niż 1 min albo dłuższy niż 24 h → odrzuć
  if (sec != null && (sec < 60 || sec > 86400)) sec = null;
  if (km != null && (km <= 0 || km > 500)) km = null;
  if (kcal != null && (kcal <= 0 || kcal > 15000)) kcal = null;
  const d = readDate(text);
  if (d) found.push("data");
  return { type, km: km != null ? Math.round(km * 100) / 100 : null, sec, kcal, d, found };
}

// ---------- OCR w przeglądarce ----------
let tessPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessPromise) tessPromise = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = TESS_URL; s.async = true;
    s.onload = () => window.Tesseract ? res(window.Tesseract) : rej(new Error("no-tesseract"));
    s.onerror = () => { tessPromise = null; rej(new Error("load-failed")); };
    document.head.append(s);
  });
  return tessPromise;
}

// Powiększenie, skala szarości i odwrócenie ciemnych zrzutów (tryb ciemny) – OCR czyta wtedy dużo lepiej.
async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(2.5, Math.max(1, 1800 / Math.max(bmp.width, bmp.height)));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), px = img.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) { const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = y; sum += y; }
  if (sum / (px.length / 4) < 110) for (let i = 0; i < px.length; i += 4) { px[i] = px[i + 1] = px[i + 2] = 255 - px[i]; }
  g.putImageData(img, 0, 0);
  return c;
}

export async function ocrImage(file, onProgress) {
  const T = await loadTesseract();
  const canvas = await prepareImage(file);
  const { data } = await T.recognize(canvas, "pol+eng", {
    logger: m => { if (onProgress && m && typeof m.progress === "number") onProgress(m.status, m.progress); }
  });
  const words = (data && data.words || []).map(w => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
  return { text: data && data.text ? data.text : "", words };
}

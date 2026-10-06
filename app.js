import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { parseActivityFile, typeFromSpeed, ymdLocal } from "./parse.js";

const SUPER_ADMIN = "paulinazofiagugala@gmail.com";
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = name => { const s = el("span", "ms", name); s.setAttribute("aria-hidden", "true"); return s; };
try { document.fonts.load('24px "Material Symbols Outlined"', "route").then(f => { if (f.length) document.documentElement.classList.add("icons-ready"); }).catch(() => {}); } catch (e) {}

// ---------- Firebase ----------
let auth = null, fs = null;
const configured = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("WKLEJ");
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); auth.languageCode = "pl";
  fs = getFirestore(app);
}

// ---------- Activity types: kcal per km for an average adult (about 70 kg); editable per entry ----------
const TYPES = [
  { k: "run", n: "Bieg", i: "directions_run", f: 70, pace: "km" },
  { k: "walk", n: "Spacer", i: "directions_walk", f: 50, pace: "km" },
  { k: "nordic", n: "Nordic walking", i: "nordic_walking", f: 55, pace: "km" },
  { k: "bike", n: "Rower", i: "directions_bike", f: 25, pace: "speed" },
  { k: "skate", n: "Rolki", i: "roller_skating", f: 32, pace: "speed" },
  { k: "swim", n: "Pływanie", i: "pool", f: 245, pace: "100m" }
];
const TMAP = Object.fromEntries(TYPES.map(t => [t.k, t]));
const METRICS = [
  { k: "km", n: "Dystans", i: "route" },
  { k: "kcal", n: "Kalorie", i: "local_fire_department" },
  { k: "count", n: "Treningi", i: "event_available" },
  { k: "time", n: "Czas", i: "timer" }
];
const KINDS = {
  group: { n: "Cel klubu", i: "groups", d: "Wszyscy razem zbieramy na wspólny cel." },
  company: { n: "Wyzwanie firmowe", i: "corporate_fare", d: "Każdy walczy o swoje miejsce w rankingu." },
  dept: { n: "Wyzwanie działowe", i: "diversity_3", d: "Działy rywalizują między sobą." },
  virtual: { n: "Wirtualny bieg", i: "sprint", d: "Pokonaj dystans w terminie, liczy się najlepszy czas." }
};
const AV = [["#F47735","#FFFFFF"],["#000000","#FFFFFF"],["#AAD4F9","#000000"],["#F55500","#FFFFFF"],["#7BC1FF","#000000"],["#37393C","#FFFFFF"],["#FDE9DF","#000000"],["#5B5F63","#FFFFFF"]];
const nf1 = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });

// ---------- state ----------
let user = null, me = null, people = {}, myDoc = null, challenges = [], depts = [], admins = new Set();
let view = "rank", period = "week", metric = "km", rtype = "all";
let addType = null, autoType = null, kcalTouched = false, fileSrc = "manual";
let calMode = "me", calMonth = new Date(), calSel = null, editingCh = null;
let pOff = 0, personId = null, prevView = "rank";
const unsubs = [];
try { const s = JSON.parse(localStorage.getItem("ksc-ui") || "{}"); period = s.p || period; metric = s.m || metric; rtype = s.t || rtype; } catch (e) {}
const saveUi = () => { try { localStorage.setItem("ksc-ui", JSON.stringify({ p: period, m: metric, t: rtype })); } catch (e) {} };

// ---------- helpers ----------
function toast(t) { const e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => e.hidden = true, 2600); }
function showMsg(t) { const m = $("dbmsg"); m.textContent = t || ""; m.hidden = !t; }
const today = () => ymdLocal(new Date());
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymdLocal(d); };
const weekStart = s => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymdLocal(d); };
const monthStart = s => s.slice(0, 8) + "01";
const monthEnd = s => { const d = parseYmd(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return ymdLocal(d); };
function periodRange(p, off = 0) {
  const t = today();
  if (p === "week") { const ws = addDays(weekStart(t), 7 * off); return [ws, addDays(ws, 6)]; }
  if (p === "month") { const d = parseYmd(monthStart(t)); d.setMonth(d.getMonth() + off); const ms = ymdLocal(d); return [ms, monthEnd(ms)]; }
  if (p === "last7") return [addDays(t, -6), t];
  return ["0000-00-00", "9999-12-31"];
}
function periodLabel(p, off) {
  const [a, b] = periodRange(p, off);
  if (p === "month") return parseYmd(a).toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  if (p === "all") return "Od początku klubu";
  const da = parseYmd(a), db = parseYmd(b);
  const left = da.getMonth() === db.getMonth() ? String(da.getDate()) : fmtDate(a);
  return left + " – " + fmtDate(b) + " " + db.getFullYear();
}
const secOf = e => e.sec != null ? +e.sec : (e.min ? e.min * 60 : null);
function val(e, m) { if (m === "km") return +e.km || 0; if (m === "kcal") return +e.kcal || 0; if (m === "count") return 1; if (m === "time") return secOf(e) || 0; return 0; }
function fmtDur(sec, cs) {
  if (sec == null) return "";
  const whole = Math.floor(sec), c = Math.round((sec - whole) * 100);
  const h = Math.floor(whole / 3600), m = Math.floor(whole % 3600 / 60), s = whole % 60;
  let out = (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0");
  if (cs && c) out += "," + String(c).padStart(2, "0");
  return out;
}
function fmtHours(sec) { const h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60); return h ? h + " h " + m + " min" : m + " min"; }
function fmtVal(m, v) {
  if (m === "km") return nf1.format(v) + " km";
  if (m === "kcal") return nf0.format(v) + " kcal";
  if (m === "count") return v + " " + plTren(v);
  if (m === "time") return fmtHours(v);
  return String(v);
}
function fmtNum(m, v) { return m === "km" ? nf1.format(v) : m === "time" ? fmtHours(v) : nf0.format(v); }
const unitOf = m => m === "km" ? "km" : m === "kcal" ? "kcal" : m === "count" ? "tren." : "";
function fmtPace(t, km, sec) {
  if (!(km > 0) || !(sec > 0)) return "";
  const kind = (TMAP[t] || TMAP.run).pace;
  if (kind === "speed") return nf1.format(km / (sec / 3600)) + " km/h";
  if (kind === "100m") return fmtDur(sec / (km * 10)) + " /100 m";
  return fmtDur(sec / km) + " /km";
}
const plTren = n => n === 1 ? "trening" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "treningi" : "treningów");
function fmtDate(s, long) { return parseYmd(s).toLocaleDateString("pl-PL", long ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "short" }); }
function avColor(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; }
const initials = n => (n || "?").trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase() || "?";
function avatar(id, nick) { const d = el("div", "av", initials(nick)); const [b, f] = avColor(id); d.style.background = b; d.style.color = f; return d; }
const nickOf = id => String((people[id] && people[id].nick) || "Ktoś").slice(0, 24);
const entriesOf = id => Array.isArray(people[id] && people[id].entries) ? people[id].entries.filter(e => e && e.d) : [];
function allEntries() { const out = []; for (const id of Object.keys(people)) for (const e of entriesOf(id)) out.push({ ...e, uid: id }); return out; }
const isAdmin = () => !!me && ((user && user.email === SUPER_ADMIN && user.emailVerified) || admins.has(me));
function twoTap(btn, label, action) {
  btn.onclick = () => {
    if (!btn.classList.contains("arm")) { btn.classList.add("arm"); btn.textContent = "Na pewno?"; setTimeout(() => { btn.classList.remove("arm"); btn.textContent = label; }, 3000); return; }
    action();
  };
}
function progressBar(frac, blue, big) { const b = el("div", "bar" + (blue ? " blue" : "") + (big ? " big" : "")); const i = el("i"); i.style.width = Math.max(2, Math.min(100, frac * 100)) + "%"; b.append(i); return b; }

// ---------- views ----------
function show(v) {
  view = v;
  for (const b of document.querySelectorAll(".tabbar button")) { if (b.dataset.v === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
  for (const k of ["rank", "ch", "add", "cal", "me", "person"]) $("v-" + k).hidden = k !== v;
  window.scrollTo(0, 0);
  render();
}
function setSignedIn(on) {
  $("v-login").hidden = on; $("tabbar").hidden = !on;
  if (on) show(view); else for (const k of ["rank", "ch", "add", "cal", "me", "person"]) $("v-" + k).hidden = true;
}
document.querySelectorAll(".tabbar button").forEach(b => b.onclick = () => show(b.dataset.v));
document.querySelectorAll("#periodSeg button").forEach(b => b.onclick = () => { period = b.dataset.p; pOff = 0; saveUi(); render(); });
$("pPrev").onclick = () => { pOff--; render(); };
$("pNext").onclick = () => { if (pOff < 0) { pOff++; render(); } };
function clickable(node, id) {
  if (!id || !people[id]) return node;
  node.classList.add("clickable"); node.tabIndex = 0; node.setAttribute("role", "button");
  node.onclick = () => openPerson(id);
  node.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openPerson(id); } };
  return node;
}
function openPerson(id) { if (view !== "person") prevView = view; personId = id; show("person"); }

// ---------- badges ----------
const BADGES = [
  { id: "c1", m: "count", t: 1, n: "Pierwszy krok", i: "footprint" },
  { id: "c10", m: "count", t: 10, n: "10 treningów", i: "event_available" },
  { id: "c25", m: "count", t: 25, n: "25 treningów", i: "event_available" },
  { id: "c50", m: "count", t: 50, n: "50 treningów", i: "event_available" },
  { id: "c100", m: "count", t: 100, n: "100 treningów", i: "workspace_premium" },
  { id: "k42", m: "km", t: 42.2, n: "Dystans maratonu", i: "route" },
  { id: "k100", m: "km", t: 100, n: "100 km", i: "route" },
  { id: "k250", m: "km", t: 250, n: "250 km", i: "route" },
  { id: "k500", m: "km", t: 500, n: "500 km", i: "route" },
  { id: "k1000", m: "km", t: 1000, n: "1000 km", i: "public" },
  { id: "e1000", m: "kcal", t: 1000, n: "1 000 kcal", i: "local_fire_department" },
  { id: "e5000", m: "kcal", t: 5000, n: "5 000 kcal", i: "local_fire_department" },
  { id: "e10000", m: "kcal", t: 10000, n: "10 000 kcal", i: "local_fire_department" },
  { id: "e25000", m: "kcal", t: 25000, n: "25 000 kcal", i: "mode_heat" },
  { id: "e50000", m: "kcal", t: 50000, n: "50 000 kcal", i: "mode_heat" },
  { id: "s4", m: "streak", t: 4, n: "4 tygodnie z rzędu", i: "bolt" },
  { id: "s8", m: "streak", t: 8, n: "8 tygodni z rzędu", i: "bolt" },
  { id: "s12", m: "streak", t: 12, n: "12 tygodni z rzędu", i: "bolt" },
  { id: "w3", m: "week3", t: 1, n: "3 treningi w tygodniu", i: "calendar_view_week" }
];
function streakInfo(entries) {
  const weeks = new Set(entries.map(e => weekStart(e.d)));
  const cur = weekStart(today());
  let w = weeks.has(cur) ? cur : addDays(cur, -7), streak = 0;
  while (weeks.has(w)) { streak++; w = addDays(w, -7); }
  const sorted = [...weeks].sort(); let best = 0, run = 0, prev = null;
  for (const x of sorted) { run = prev && addDays(prev, 7) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  const perWeek = {}; for (const e of entries) { const k = weekStart(e.d); perWeek[k] = (perWeek[k] || 0) + 1; }
  const maxWeek = Math.max(0, ...Object.values(perWeek));
  return { streak, best, thisWeek: perWeek[cur] || 0, weeks, maxWeek };
}
function clubRecords() {
  let kcal = null; const longest = {};
  for (const e of allEntries()) {
    if (!kcal || (+e.kcal || 0) > (+kcal.kcal || 0)) kcal = e;
    const t = e.t in TMAP ? e.t : "run";
    if (!longest[t] || (+e.km || 0) > (+longest[t].km || 0)) longest[t] = e;
  }
  return { kcal, longest };
}
function badgesFor(id, recs) {
  const es = entriesOf(id);
  const tot = { count: es.length, km: es.reduce((s, e) => s + (+e.km || 0), 0), kcal: es.reduce((s, e) => s + (+e.kcal || 0), 0) };
  const si = streakInfo(es);
  const list = BADGES.map(b => {
    let cur = b.m === "streak" ? si.best : b.m === "week3" ? (si.maxWeek >= 3 ? 1 : 0) : tot[b.m];
    return { ...b, on: cur >= b.t, cur };
  });
  recs = recs || clubRecords();
  if (recs.kcal && recs.kcal.uid === id && +recs.kcal.kcal > 0) list.unshift({ id: "rk", n: "Rekord kalorii klubu", i: "whatshot", on: true, special: true, note: nf0.format(recs.kcal.kcal) + " kcal naraz" });
  for (const [t, e] of Object.entries(recs.longest)) if (e.uid === id && +e.km > 0) list.unshift({ id: "rl" + t, n: "Najdłuższy: " + TMAP[t].n, i: TMAP[t].i, on: true, special: true, note: nf1.format(e.km) + " km" });
  for (const c of challenges) {
    const r = challengeResult(c);
    if (r && r.finishers && r.finishers.has(id)) list.unshift({ id: "ch" + c.id, n: c.title, i: KINDS[c.kind] ? KINDS[c.kind].i : "flag", on: true, special: true, note: c.kind === "virtual" ? "Ukończony bieg" : "Cel osiągnięty" });
  }
  return list;
}
const badgeCount = (id, recs) => badgesFor(id, recs).filter(b => b.on).length;

// ---------- ranking ----------
function renderRank() {
  document.querySelectorAll("#periodSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.p === period));
  const mc = $("metricChips"); mc.replaceChildren();
  for (const m of METRICS) { const b = el("button", "chip"); b.type = "button"; b.append(icon(m.i), m.n); b.setAttribute("aria-pressed", m.k === metric); b.onclick = () => { metric = m.k; saveUi(); render(); }; mc.append(b); }
  const tc = $("typeChips"); tc.replaceChildren();
  for (const t of [{ k: "all", n: "Wszystkie", i: "apps" }, ...TYPES]) { const b = el("button", "chip blue"); b.type = "button"; b.append(icon(t.i), t.n); b.setAttribute("aria-pressed", t.k === rtype); b.onclick = () => { rtype = t.k; saveUi(); render(); }; tc.append(b); }
  const [from, to] = periodRange(period, pOff);
  const nav = period === "week" || period === "month";
  $("pPrev").hidden = !nav; $("pNext").hidden = !nav; $("pNext").disabled = pOff >= 0;
  $("pLabel").textContent = periodLabel(period, pOff);
  const recs = clubRecords();
  const rows = []; let T = { km: 0, kcal: 0, count: 0, time: 0 };
  for (const id of Object.keys(people)) {
    const es = entriesOf(id).filter(e => e.d >= from && e.d <= to && (rtype === "all" || (e.t || "run") === rtype));
    if (!es.length) continue;
    const r = { id, nick: nickOf(id), es, km: 0, kcal: 0, count: es.length, time: 0, pk: 0, ps: 0 };
    for (const e of es) { r.km += +e.km || 0; r.kcal += +e.kcal || 0; const s = secOf(e); if (s) { r.time += s; if (+e.km > 0) { r.pk += +e.km; r.ps += s; } } }
    for (const k in T) T[k] += r[k];
    rows.push(r);
  }
  const tots = $("totals"); tots.replaceChildren();
  for (const m of METRICS) { const d = el("div", "tot"); d.append(icon(m.i), el("b", "", m.k === "time" ? nf1.format(T.time / 3600) + " h" : fmtNum(m.k, T[m.k])), el("small", "", m.k === "km" ? "km" : m.k === "kcal" ? "kcal" : m.k === "count" ? "Treningi" : "Czas")); tots.append(d); }
  rows.sort((a, b) => b[metric] - a[metric] || b.count - a.count);
  const pod = $("podium"), list = $("ranklist"), rec = $("records");
  pod.replaceChildren(); list.replaceChildren(); rec.replaceChildren();
  if (!rows.length) {
    pod.hidden = true; rec.hidden = true; rec.previousElementSibling.hidden = true;
    const e = el("div", "empty"); e.append(icon("directions_run"), el("b", "", Object.keys(people).length ? "W tym okresie nikt jeszcze nie trenował" : "Ranking jest jeszcze pusty"), el("span", "", "Dodaj trening, a pojawisz się na podium."));
    const b = el("button", "btn"); b.type = "button"; b.append(icon("add"), "Dodaj trening"); b.onclick = () => show("add"); e.append(b); list.append(e);
    return;
  }
  pod.hidden = false; rec.hidden = false; rec.previousElementSibling.hidden = false;
  const showVal = r => metric === "time" ? fmtDur(r.time) : fmtNum(metric, r[metric]);
  for (const i of [1, 0, 2]) {
    const r = rows[i]; const c = el("div", "pod p" + (i + 1));
    if (r) { if (i === 0) c.append(icon("emoji_events")); c.append(avatar(r.id, r.nick), el("div", "name", r.nick), el("div", "val", showVal(r) + (metric === "time" ? "" : " " + unitOf(metric)))); clickable(c, r.id); c.title = "Zobacz aktywności: " + r.nick; }
    c.append(el("div", "step", String(i + 1))); pod.append(c);
  }
  const max = rows[0][metric] || 1;
  rows.forEach((r, i) => {
    const row = el("div", "row"); const mid = el("div", "mid");
    const nm = el("div", "nm"); nm.append(el("span", "", r.nick));
    if (r.id === me) nm.append(el("span", "tag", "Ty"));
    const bc = badgeCount(r.id, recs); if (bc) { const s = el("span", "badgecount"); s.title = "Odznaki"; s.append(icon("military_tech"), String(bc)); nm.append(s); }
    const parts = [];
    if (metric !== "km") parts.push(nf1.format(r.km) + " km");
    if (metric !== "kcal") parts.push(nf0.format(r.kcal) + " kcal");
    if (metric !== "count") parts.push(r.count + " " + plTren(r.count));
    if (rtype !== "all" && r.pk > 0) parts.push("tempo " + fmtPace(rtype, r.pk, r.ps));
    mid.append(nm, progressBar(r[metric] / max, metric === "kcal"), el("div", "sub", parts.join(" · ")));
    const v = el("div", "v", showVal(r)); if (metric !== "time") v.append(el("small", "", unitOf(metric)));
    row.append(el("div", "pos", String(i + 1)), avatar(r.id, r.nick), mid, v); clickable(row, r.id); list.append(row);
  });
  let longest = null, bestKcal = null, mostN = rows[0], longTime = null;
  for (const r of rows) {
    for (const e of r.es) { if (!longest || +e.km > +longest.e.km) longest = { r, e }; if (!bestKcal || +e.kcal > +bestKcal.e.kcal) bestKcal = { r, e }; const s = secOf(e); if (s && (!longTime || s > secOf(longTime.e))) longTime = { r, e }; }
    if (r.count > mostN.count) mostN = r;
  }
  const add = (lab, who, txt, uid) => { const s = el("div", "stat"); s.append(el("small", "", lab), el("b", "", who), el("span", "", txt)); clickable(s, uid); rec.append(s); };
  add("Najdłuższy dystans", longest.r.nick, nf2.format(longest.e.km) + " km · " + (TMAP[longest.e.t] || TMAP.run).n, longest.r.id);
  add("Najwięcej kcal naraz", bestKcal.r.nick, nf0.format(bestKcal.e.kcal) + " kcal · " + (TMAP[bestKcal.e.t] || TMAP.run).n, bestKcal.r.id);
  add("Najwięcej treningów", mostN.nick, mostN.count + " " + plTren(mostN.count), mostN.id);
  if (longTime) add("Najdłuższy trening", longTime.r.nick, fmtDur(secOf(longTime.e), true) + " · " + (TMAP[longTime.e.t] || TMAP.run).n, longTime.r.id);
  else add("Średnio na osobę", "Cały klub", nf1.format(T.km / rows.length) + " km");
}

// ---------- challenges ----------
function chStatus(c) { const t = today(); return t < c.start ? "upcoming" : t > c.end ? "done" : "active"; }
function chEntries(c, uid) { const types = c.types || []; return entriesOf(uid).filter(e => e.d >= c.start && e.d <= c.end && (!types.length || types.includes(e.t || "run"))); }
function challengeResult(c) {
  if (!c || !c.start || !c.end) return null;
  const ids = Object.keys(people);
  if (c.kind === "virtual") {
    const D = +c.distance || 0; const res = [];
    for (const id of ids) {
      let best = null;
      for (const e of chEntries(c, id)) { const s = secOf(e); if (s && +e.km >= D * 0.98) { const t = s * D / +e.km; if (best === null || t < best) best = t; } }
      if (best !== null) res.push({ id, v: best });
    }
    res.sort((a, b) => a.v - b.v);
    return { rows: res, finishers: new Set(res.map(r => r.id)) };
  }
  const m = c.metric || "km";
  const per = ids.map(id => ({ id, v: chEntries(c, id).reduce((s, e) => s + val(e, m), 0) })).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
  const tgt = m === "time" ? (+c.target || 0) * 3600 : +c.target || 0;
  if (c.kind === "group") { const total = per.reduce((s, r) => s + r.v, 0); return { rows: per, total, tgt, finishers: tgt && total >= tgt ? new Set(per.map(r => r.id)) : new Set() }; }
  if (c.kind === "dept") {
    const by = {};
    for (const r of per) { const d = (people[r.id] && people[r.id].dept) || ""; if (!d) continue; (by[d] = by[d] || { d, v: 0, n: 0 }); by[d].v += r.v; by[d].n++; }
    const members = {}; for (const id of ids) { const d = people[id].dept; if (d) members[d] = (members[d] || 0) + 1; }
    const rows = Object.values(by).map(x => ({ ...x, members: members[x.d] || x.n, avg: x.v / (members[x.d] || x.n) })).sort((a, b) => (c.by === "avg" ? b.avg - a.avg : b.v - a.v));
    return { rows, tgt, finishers: new Set() };
  }
  return { rows: per, tgt, finishers: tgt ? new Set(per.filter(r => r.v >= tgt).map(r => r.id)) : new Set() };
}
function miniRows(rows, fmt, labelOf, limit) {
  const box = el("div", "mini");
  const myIdx = rows.findIndex(r => r.id === me);
  rows.forEach((r, i) => {
    if (i >= limit && i !== myIdx) return;
    const d = el("div", "r" + (r.id && r.id === me ? " me" : ""));
    d.append(el("span", "p", String(i + 1)), el("b", "", labelOf(r)), el("span", "vv", fmt(r)));
    if (r.id) clickable(d, r.id);
    box.append(d);
  });
  return box;
}
function chCard(c) {
  const st = chStatus(c), K = KINDS[c.kind] || KINDS.company, r = challengeResult(c) || { rows: [] };
  const card = el("div", "card");
  const head = el("div", "ch-head"); const ic = el("div", "ic"); ic.append(icon(K.i));
  const mid = el("div", "mid"); mid.append(el("h3", "", c.title || K.n));
  const meta = el("div", "ch-meta"); meta.append(el("span", "tag" + (st === "active" ? "" : st === "upcoming" ? " blue" : " grey"), st === "active" ? "Trwa" : st === "upcoming" ? "Wkrótce" : "Zakończone"), el("span", "", K.n), el("span", "", fmtDate(c.start) + " – " + fmtDate(c.end)));
  if (c.types && c.types.length) meta.append(el("span", "", c.types.map(t => (TMAP[t] || {}).n).filter(Boolean).join(", ")));
  mid.append(meta); head.append(ic, mid); card.append(head);
  if (c.desc) card.append(el("p", "hint", c.desc));
  const m = c.metric || "km";
  if (c.kind === "group") {
    const p = el("div", "ch-progress"); const nums = el("div", "nums");
    nums.append(el("span", "", fmtVal(m, r.total || 0)), el("small", "", r.tgt ? "cel: " + fmtVal(m, r.tgt) + " · " + nf0.format(Math.min(100, (r.total || 0) / r.tgt * 100)) + "%" : ""));
    p.append(nums, progressBar(r.tgt ? (r.total || 0) / r.tgt : 0, false, true)); card.append(p);
    if (r.rows.length) { card.append(el("small", "hint", "Najwięcej dołożyli:")); card.append(miniRows(r.rows, x => fmtVal(m, x.v), x => nickOf(x.id), 5)); }
  } else if (c.kind === "dept") {
    if (!r.rows.length) card.append(el("p", "hint", depts.length ? "Jeszcze nikt nie zdobył punktów dla swojego działu." : "Administrator nie dodał jeszcze działów."));
    else card.append(miniRows(r.rows, x => fmtVal(m, c.by === "avg" ? x.avg : x.v) + (c.by === "avg" ? " / os." : ""), x => x.d + " (" + x.n + "/" + x.members + ")", 20));
    card.append(el("small", "hint", c.by === "avg" ? "Liczy się średnia na osobę w dziale." : "Liczy się suma wyników działu."));
    const myDept = myDoc && myDoc.dept; if (!myDept) card.append(el("small", "hint", "Wybierz swój dział w zakładce Moje, żeby zbierać punkty dla działu."));
  } else if (c.kind === "virtual") {
    card.append(el("p", "hint", "Dystans: " + nf2.format(+c.distance || 0) + " km. Liczy się najlepszy czas pojedynczego treningu o co najmniej tym dystansie."));
    if (r.rows.length) card.append(miniRows(r.rows, x => fmtDur(x.v, true), x => nickOf(x.id), 10));
    else card.append(el("p", "hint", "Jeszcze nikt nie ukończył tego biegu."));
  } else {
    if (r.tgt) card.append(el("p", "hint", "Cel na osobę: " + fmtVal(m, r.tgt) + ". Ukończyło: " + r.finishers.size + " " + (r.finishers.size === 1 ? "osoba" : "osób") + "."));
    if (r.rows.length) card.append(miniRows(r.rows, x => fmtVal(m, x.v) + (r.tgt && x.v >= r.tgt ? " ✓" : ""), x => nickOf(x.id), 10));
    else card.append(el("p", "hint", "Jeszcze nikt nie zdobył punktów."));
  }
  if (isAdmin()) {
    const a = el("div", "row-actions");
    const e = el("button", "btn small ghost", "Edytuj"); e.type = "button"; e.onclick = () => openChForm(c);
    const d = el("button", "del", "Usuń"); d.type = "button";
    twoTap(d, "Usuń", () => deleteDoc(doc(fs, "challenges", c.id)).then(() => toast("Usunięto wyzwanie")).catch(() => toast("Nie udało się usunąć")));
    a.append(e, d); card.append(a);
  }
  return card;
}
function renderCh() {
  $("newChBtn").hidden = !isAdmin();
  const groups = { active: [], upcoming: [], done: [] };
  for (const c of challenges) groups[chStatus(c)].push(c);
  groups.active.sort((a, b) => a.end.localeCompare(b.end)); groups.upcoming.sort((a, b) => a.start.localeCompare(b.start)); groups.done.sort((a, b) => b.end.localeCompare(a.end));
  const A = $("chActive"), U = $("chUpcoming"), D = $("chDone");
  A.replaceChildren(); U.replaceChildren(); D.replaceChildren();
  if (!challenges.length) { const e = el("div", "empty card"); e.append(icon("flag"), el("b", "", "Nie ma jeszcze wyzwań"), el("span", "", isAdmin() ? "Kliknij „Nowe”, żeby dodać cel klubu, wyzwanie albo wirtualny bieg." : "Administrator wkrótce doda pierwsze wyzwanie.")); A.append(e); }
  for (const c of groups.active) A.append(chCard(c));
  if (groups.upcoming.length) { U.append(el("h3", "sec-title", "Wkrótce")); for (const c of groups.upcoming) U.append(chCard(c)); }
  $("chDoneWrap").hidden = !groups.done.length;
  for (const c of groups.done) D.append(chCard(c));
}
function openChForm(c) {
  editingCh = c || null;
  const f = $("chForm"); f.replaceChildren(); f.hidden = false;
  const data = c || { kind: "group", title: "", desc: "", metric: "km", target: "", distance: 10, types: [], start: monthStart(today()), end: monthEnd(today()), by: "sum" };
  f.append(el("h2", "", c ? "Edytuj wyzwanie" : "Nowe wyzwanie"));
  const kindSel = el("select"); kindSel.id = "c-kind";
  for (const [k, K] of Object.entries(KINDS)) { const o = el("option", "", K.n); o.value = k; kindSel.append(o); }
  kindSel.value = data.kind;
  const kindL = el("label", "", "Rodzaj"); kindL.append(kindSel);
  const kindHint = el("p", "hint");
  const title = el("input"); title.id = "c-title"; title.maxLength = 80; title.value = data.title; title.placeholder = "np. 1000 km w październiku";
  const titleL = el("label", "", "Nazwa"); titleL.append(title);
  const desc = el("input"); desc.id = "c-desc"; desc.maxLength = 200; desc.value = data.desc || ""; desc.placeholder = "Opcjonalnie: krótki opis";
  const descL = el("label", "", "Opis"); descL.append(desc);
  const mSel = el("select"); mSel.id = "c-metric"; for (const m of METRICS) { const o = el("option", "", m.n + (m.k === "time" ? " (godz.)" : m.k === "km" ? " (km)" : m.k === "kcal" ? " (kcal)" : "")); o.value = m.k; mSel.append(o); } mSel.value = data.metric || "km";
  const mL = el("label", "", "Co liczymy"); mL.append(mSel);
  const tgt = el("input"); tgt.id = "c-target"; tgt.type = "number"; tgt.min = "0"; tgt.step = "any"; tgt.inputMode = "decimal"; tgt.value = data.target || "";
  const tL = el("label", "", "Cel"); tL.append(tgt);
  const byS = el("select"); byS.id = "c-by"; for (const [k, n] of [["sum", "Suma działu"], ["avg", "Średnia na osobę"]]) { const o = el("option", "", n); o.value = k; byS.append(o); } byS.value = data.by || "sum";
  const byL = el("label", "", "Ranking działów według"); byL.append(byS);
  const dist = el("input"); dist.id = "c-dist"; dist.type = "number"; dist.min = "0.1"; dist.step = "any"; dist.inputMode = "decimal"; dist.value = data.distance || 10;
  const dL = el("label", "", "Dystans biegu (km)"); dL.append(dist);
  const g1 = el("div", "grid2"); g1.append(mL, tL);
  const st = el("input"); st.id = "c-start"; st.type = "date"; st.value = data.start;
  const en = el("input"); en.id = "c-end"; en.type = "date"; en.value = data.end;
  const sL = el("label", "", "Od"); sL.append(st); const eL = el("label", "", "Do"); eL.append(en);
  const g2 = el("div", "grid2"); g2.append(sL, eL);
  const typesL = el("div", "", null); typesL.append(el("label", "", "Rodzaje aktywności (brak zaznaczenia = wszystkie)"));
  const chips = el("div", "chips"); chips.style.flexWrap = "wrap"; chips.style.marginTop = "6px";
  const sel = new Set(data.types || []);
  for (const t of TYPES) { const b = el("button", "chip blue"); b.type = "button"; b.append(icon(t.i), t.n); const paint = () => b.setAttribute("aria-pressed", sel.has(t.k)); paint(); b.onclick = () => { sel.has(t.k) ? sel.delete(t.k) : sel.add(t.k); paint(); }; chips.append(b); }
  typesL.append(chips);
  const err = el("p", "err"); err.hidden = true;
  const act = el("div", "row-actions"); const save = el("button", "btn", "Zapisz"); save.type = "submit"; const cancel = el("button", "btn ghost", "Anuluj"); cancel.type = "button"; cancel.onclick = () => { f.hidden = true; editingCh = null; };
  act.append(save, cancel);
  f.append(kindL, kindHint, titleL, descL, g1, byL, dL, g2, typesL, err, act);
  const sync = () => {
    const k = kindSel.value; kindHint.textContent = KINDS[k].d;
    g1.hidden = k === "virtual"; dL.hidden = k !== "virtual"; byL.hidden = k !== "dept";
    tL.firstChild.textContent = k === "group" ? "Cel klubu (wymagany)" : "Cel na osobę (opcjonalny)";
    tL.hidden = k === "dept";
    if (k === "virtual" && !sel.size && !c) { sel.add("run"); chips.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", sel.has(TYPES[i].k))); }
  };
  kindSel.onchange = sync; sync();
  f.onsubmit = ev => {
    ev.preventDefault(); err.hidden = true;
    const k = kindSel.value;
    const out = { kind: k, title: title.value.trim(), desc: desc.value.trim(), metric: mSel.value, target: parseFloat(String(tgt.value).replace(",", ".")) || 0, distance: parseFloat(String(dist.value).replace(",", ".")) || 0, by: byS.value, types: [...sel], start: st.value, end: en.value, updatedBy: me, updatedAt: Date.now() };
    if (!out.title) out.title = k === "group" && out.target ? fmtVal(out.metric, out.metric === "time" ? out.target * 3600 : out.target) + " razem" : KINDS[k].n;
    const fail = t => { err.textContent = t; err.hidden = false; };
    if (!out.start || !out.end || out.end < out.start) return fail("Ustaw poprawne daty: data końca nie może być przed datą początku.");
    if (k === "group" && !(out.target > 0)) return fail("Podaj cel klubu, np. 1000.");
    if (k === "virtual" && !(out.distance > 0)) return fail("Podaj dystans biegu w km.");
    const id = c ? c.id : "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!c) { out.createdBy = me; out.createdAt = Date.now(); } else { out.createdBy = c.createdBy || me; out.createdAt = c.createdAt || Date.now(); }
    setDoc(doc(fs, "challenges", id), out).then(() => { toast(c ? "Zapisano zmiany" : "Dodano wyzwanie"); f.hidden = true; editingCh = null; }).catch(e => { console.error(e); fail("Nie udało się zapisać. Sprawdź, czy masz uprawnienia administratora."); });
  };
  f.scrollIntoView({ behavior: "smooth", block: "start" });
}
$("newChBtn").onclick = () => openChForm(null);

// ---------- add form ----------
const typesEl = $("types");
TYPES.forEach(t => { const b = el("button"); b.type = "button"; b.dataset.k = t.k; b.append(icon(t.i), t.n); b.onclick = () => { addType = t.k; paintTypes(); updateAddHints(); }; typesEl.append(b); });
const effType = () => addType || autoType;
function paintTypes() {
  typesEl.querySelectorAll("button").forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.k === effType());
    const old = b.querySelector(".auto"); if (old) old.remove();
    if (!addType && autoType === b.dataset.k) b.append(el("span", "auto", "auto"));
  });
}
const numIn = id => { const v = parseFloat(String($(id).value).replace(",", ".")); return isFinite(v) ? v : 0; };
function timeSec() { const h = numIn("a-h"), m = numIn("a-m"), s = numIn("a-s"), c = numIn("a-c"); const t = h * 3600 + m * 60 + s + Math.min(99, c) / 100; return t > 0 ? t : null; }
function setTime(sec) {
  if (!sec) { for (const id of ["a-h", "a-m", "a-s", "a-c"]) $(id).value = ""; return; }
  const whole = Math.floor(sec), cs = Math.round((sec - whole) * 100);
  $("a-h").value = Math.floor(whole / 3600) || ""; $("a-m").value = Math.floor(whole % 3600 / 60); $("a-s").value = whole % 60; $("a-c").value = cs || "";
}
function updateAddHints() {
  const km = numIn("a-km"), sec = timeSec();
  if (fileSrc === "manual") autoType = typeFromSpeed(km, sec);
  paintTypes();
  const t = effType();
  if (!kcalTouched) $("a-kcal").value = km > 0 && t ? Math.round(km * TMAP[t].f) : "";
  const det = $("detected");
  if (fileSrc !== "manual") { det.hidden = false; $("detectedTxt").textContent = "Odczytano z pliku " + fileSrc.toUpperCase() + (autoType ? ": " + TMAP[autoType].n : "") + ". Sprawdź dane i kliknij Dodaj."; }
  else if (autoType && !addType) { det.hidden = false; $("detectedTxt").textContent = "Rozpoznano: " + TMAP[autoType].n + " (na podstawie tempa). Kliknij inny rodzaj, jeśli to coś innego."; }
  else det.hidden = true;
  const pace = t && km > 0 && sec ? fmtPace(t, km, sec) : "";
  $("paceOut").hidden = !pace; $("paceTxt").textContent = pace ? "Tempo: " + pace : "";
}
for (const id of ["a-km", "a-h", "a-m", "a-s", "a-c"]) $(id).addEventListener("input", updateAddHints);
$("a-kcal").addEventListener("input", () => { kcalTouched = $("a-kcal").value !== ""; });
function resetAdd() {
  $("a-km").value = ""; setTime(null); $("a-kcal").value = ""; $("a-date").value = today(); $("a-date").max = today();
  addType = null; autoType = null; kcalTouched = false; fileSrc = "manual"; $("a-err").hidden = true; $("a-file").value = ""; updateAddHints();
}
async function handleFile(file) {
  if (!file) return;
  try {
    const r = await parseActivityFile(file);
    fileSrc = file.name.split(".").pop().toLowerCase();
    addType = null; autoType = r.type || null;
    $("a-km").value = r.km ? Math.round(r.km * 100) / 100 : "";
    setTime(r.sec ? Math.round(r.sec * 100) / 100 : null);
    if (r.d) $("a-date").value = r.d > today() ? today() : r.d;
    if (r.kcal != null) { $("a-kcal").value = Math.round(r.kcal); kcalTouched = true; } else kcalTouched = false;
    $("a-err").hidden = true;
    updateAddHints();
    toast("Wczytano plik " + file.name);
  } catch (e) {
    console.error(e);
    const er = $("a-err"); er.textContent = "Nie udało się odczytać pliku. Obsługiwane są pliki GPX, TCX i FIT wyeksportowane z aplikacji sportowej."; er.hidden = false;
  }
}
$("a-file").addEventListener("change", e => handleFile(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); handleFile(e.dataTransfer.files[0]); });
$("addForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const er = $("a-err"); er.hidden = true;
  const fail = t => { er.textContent = t; er.hidden = false; };
  const km = numIn("a-km"), sec = timeSec(), t = effType();
  if (!t) return fail("Wybierz rodzaj aktywności.");
  if (!(km > 0)) return fail("Podaj dystans w km.");
  if (numIn("a-m") > 59 || numIn("a-s") > 59) return fail("Minuty i sekundy mogą mieć najwyżej 59.");
  let kcal = parseInt($("a-kcal").value, 10); if (!(kcal >= 0)) kcal = Math.round(km * TMAP[t].f);
  const d = $("a-date").value || today();
  if (d > today()) return fail("Data nie może być z przyszłości.");
  const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), d, t, km: Math.round(km * 100) / 100, sec: sec ? Math.round(sec * 100) / 100 : null, kcal, src: fileSrc, at: Date.now() };
  writeMine({ ...myDoc, entries: [...(myDoc.entries || []), e] }, "Dodano: " + nf2.format(e.km) + " km");
  resetAdd(); show("rank");
});

// ---------- calendar ----------
document.querySelectorAll("#calSeg button").forEach(b => b.onclick = () => { calMode = b.dataset.c; render(); });
$("calPrev").onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); calSel = null; render(); };
$("calNext").onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); calSel = null; render(); };
function actRow(e, showWho) {
  const r = el("div", "act"); const ic = el("div", "ic"); ic.append(icon((TMAP[e.t] || TMAP.run).i));
  const mid = el("div", "mid"); mid.append(el("div", "t", (showWho ? nickOf(e.uid) + " · " : "") + (TMAP[e.t] || TMAP.run).n));
  const s = secOf(e); const bits = [fmtDate(e.d)]; if (s) bits.push(fmtDur(s, true)); const p = fmtPace(e.t, +e.km, s); if (p) bits.push(p);
  mid.append(el("div", "sub", bits.join(" · ")));
  const n = el("div", "n", nf2.format(+e.km || 0) + " km"); n.append(el("span", "", nf0.format(+e.kcal || 0) + " kcal"));
  r.append(ic, mid, n); if (showWho) clickable(r, e.uid); return r;
}
function renderCal() {
  document.querySelectorAll("#calSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.c === calMode));
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  $("calTitle").textContent = calMonth.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  const first = ymdLocal(new Date(y, mo, 1)), last = monthEnd(first);
  const src = calMode === "me" ? (myDoc && myDoc.entries || []).map(e => ({ ...e, uid: me })) : allEntries();
  const byDay = {}; for (const e of src) { if (e.d >= addDays(weekStart(first), 0) && e.d <= addDays(last, 7)) (byDay[e.d] = byDay[e.d] || []).push(e); }
  const cal = $("cal"); cal.replaceChildren();
  for (const n of ["pn", "wt", "śr", "cz", "pt", "sb", "nd"]) cal.append(el("div", "dow", n));
  let d = weekStart(first); const t = today();
  const endGrid = addDays(weekStart(last), 6);
  while (d <= endGrid) {
    const es = byDay[d] || []; const km = es.reduce((s, e) => s + (+e.km || 0), 0);
    const b = el("button", (d < first || d > last ? "out " : "") + (d === t ? "today " : "") + (d === calSel ? "sel " : "") + (es.length ? "has " : "") + (es.length > 2 ? "many" : ""));
    b.type = "button"; b.append(el("span", "", String(parseYmd(d).getDate())));
    b.append(el("span", "km", es.length ? (calMode === "club" ? es.length + "×" : nf1.format(km)) : ""));
    const chOn = challenges.some(c => c.start <= d && c.end >= d);
    const dot = el("span", chOn ? "chd" : ""); b.append(dot);
    b.setAttribute("aria-label", fmtDate(d, true) + (es.length ? ", " + es.length + " " + plTren(es.length) : ""));
    const dd = d; b.onclick = () => { calSel = dd; render(); };
    cal.append(b); d = addDays(d, 1);
  }
  const monthEs = src.filter(e => e.d >= first && e.d <= last);
  const ms = $("calMonthStats"); ms.replaceChildren();
  const add = (lab, v) => { const s = el("div", "stat"); s.append(el("small", "", lab), el("b", "", v)); ms.append(s); };
  add("Treningi w miesiącu", String(monthEs.length));
  add("Kilometry w miesiącu", nf1.format(monthEs.reduce((s, e) => s + (+e.km || 0), 0)) + " km");
  add("Kalorie w miesiącu", nf0.format(monthEs.reduce((s, e) => s + (+e.kcal || 0), 0)) + " kcal");
  add("Aktywne dni", String(new Set(monthEs.map(e => e.d)).size));
  const day = calSel || (t >= first && t <= last ? t : null);
  const list = $("calDay"); list.replaceChildren();
  $("calDayTitle").textContent = day ? fmtDate(day, true) : "";
  $("calDayTitle").hidden = !day; list.hidden = !day;
  if (day) { const es = byDay[day] || []; if (!es.length) list.append(el("div", "empty", "Brak treningów tego dnia.")); for (const e of es) list.append(actRow(e, calMode === "club")); }
  const chs = challenges.filter(c => c.start <= last && c.end >= first);
  $("calChTitle").hidden = !chs.length; const cl = $("calCh"); cl.hidden = !chs.length; cl.replaceChildren();
  for (const c of chs) { const r = el("div", "act"); const ic = el("div", "ic"); ic.style.background = "var(--ink)"; ic.style.color = "var(--bg)"; ic.append(icon((KINDS[c.kind] || KINDS.company).i)); const mid = el("div", "mid"); mid.append(el("div", "t", c.title), el("div", "sub", fmtDate(c.start) + " – " + fmtDate(c.end) + " · " + (KINDS[c.kind] || KINDS.company).n)); r.append(ic, mid, el("span"), el("span")); r.style.cursor = "pointer"; r.onclick = () => show("ch"); cl.append(r); }
}

// ---------- participant profile ----------
$("personBack").onclick = () => show(prevView || "rank");
function actDetail(e) {
  const t = TMAP[e.t] || TMAP.run, s = secOf(e);
  const box = el("div", "actd");
  const top = el("div", "top"); const ic = el("div", "ic"); ic.append(icon(t.i));
  const mid = el("div", "mid"); mid.append(el("div", "t", t.n), el("div", "sub", fmtDate(e.d, true)));
  top.append(ic, mid); box.append(top);
  const grid = el("div", "grid");
  const cell = (lab, v) => { const c = el("div", "cell"); c.append(el("small", "", lab), el("b", "", v)); grid.append(c); };
  cell("Dystans", nf2.format(+e.km || 0) + " km");
  cell("Czas", s ? fmtDur(s, true) : "—");
  cell("Tempo", fmtPace(e.t, +e.km, s) || "—");
  cell("Kalorie", nf0.format(+e.kcal || 0) + " kcal");
  box.append(grid);
  const bits = [];
  if (e.at) bits.push("Dodano " + new Date(e.at).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
  bits.push(e.src && e.src !== "manual" ? "z pliku " + String(e.src).toUpperCase() : "wpis ręczny");
  box.append(el("small", "hint", bits.join(" · ")));
  return box;
}
function renderPerson() {
  const id = personId, box = $("personBody"); box.replaceChildren();
  if (!id || !people[id]) { box.append(el("p", "hint", "Nie znaleziono uczestnika.")); return; }
  const p = people[id], es = entriesOf(id).slice().sort((a, b) => b.d.localeCompare(a.d) || (b.at || 0) - (a.at || 0));
  const head = el("div", "card"); const ph = el("div", "phead"); const mid = el("div", "mid");
  const h = el("h2", "", nickOf(id)); if (id === me) h.append(el("span", "tag", "Ty"));
  mid.append(h, el("div", "sub", (p.dept || "bez działu") + " · " + es.length + " " + plTren(es.length)));
  ph.append(avatar(id, nickOf(id)), mid); head.append(ph);
  const si = streakInfo(es);
  head.append(el("p", "hint", "Seria: " + si.streak + " tyg. z rzędu · w tym tygodniu: " + si.thisWeek + " " + plTren(si.thisWeek)));
  box.append(head);
  const T = { km: 0, kcal: 0, count: es.length, time: 0 };
  for (const e of es) { T.km += +e.km || 0; T.kcal += +e.kcal || 0; T.time += secOf(e) || 0; }
  const tots = el("div", "totals");
  for (const m of METRICS) { const d = el("div", "tot"); d.append(icon(m.i), el("b", "", m.k === "time" ? nf1.format(T.time / 3600) + " h" : fmtNum(m.k, T[m.k])), el("small", "", m.k === "km" ? "km razem" : m.k === "kcal" ? "kcal razem" : m.k === "count" ? "Treningi" : "Czas")); tots.append(d); }
  box.append(tots);
  const earned = badgesFor(id).filter(b => b.on);
  if (earned.length) {
    box.append(el("h3", "sec-title", "Odznaki (" + earned.length + ")"));
    const line = el("div", "chipline");
    for (const b of earned) { const c = el("span", "bchip"); c.append(icon(b.i), b.n); line.append(c); }
    box.append(line);
  }
  box.append(el("h3", "sec-title", "Aktywności (" + es.length + ")"));
  const list = el("div", "list");
  if (!es.length) list.append(el("div", "empty", "Ta osoba nie dodała jeszcze treningów."));
  for (const e of es.slice(0, 200)) list.append(actDetail(e));
  box.append(list);
}

// ---------- me ----------
function goalRange(g) { if (g.period === "custom") return [g.start, g.end]; return periodRange(g.period); }
function renderMe() {
  const mine = (myDoc && myDoc.entries || []).filter(e => e && e.d);
  const si = streakInfo(mine);
  const sc = $("streakCard"); sc.replaceChildren();
  const top = el("div", "streak"); const fl = el("div", "flame"); fl.append(icon("local_fire_department"));
  const txt = el("div", "mid"); txt.append(el("b", "", si.streak + " " + (si.streak === 1 ? "tydzień" : si.streak % 10 >= 2 && si.streak % 10 <= 4 && (si.streak % 100 < 12 || si.streak % 100 > 14) ? "tygodnie" : "tygodni") + " z rzędu"), el("span", "hint", si.thisWeek + " " + plTren(si.thisWeek) + " w tym tygodniu · najlepsza seria: " + si.best));
  top.append(fl, txt); sc.append(top);
  const wk = el("div", "weeks"); const cur = weekStart(today());
  for (let i = 11; i >= 0; i--) { const w = addDays(cur, -7 * i); const x = el("i", si.weeks.has(w) ? "on" : ""); x.title = "Tydzień od " + fmtDate(w); wk.append(x); }
  sc.append(wk, el("small", "hint", "Ostatnie 12 tygodni. Seria rośnie, gdy trenujesz przynajmniej raz w każdym tygodniu."));
  // goals
  const gb = $("goals"); gb.replaceChildren();
  const goals = (myDoc && myDoc.goals) || [];
  if (!goals.length) gb.append(el("p", "hint", "Nie masz jeszcze celów. Dodaj np. 20 km tygodniowo albo 12 treningów w miesiącu."));
  for (const g of goals) {
    const [a, b] = goalRange(g);
    const v = mine.filter(e => e.d >= a && e.d <= b && (!g.type || g.type === "all" || (e.t || "run") === g.type)).reduce((s, e) => s + val(e, g.metric), 0);
    const tgt = g.metric === "time" ? g.target * 3600 : g.target;
    const card = el("div", "card"); const h = el("div", "ch-head"); const ic = el("div", "ic"); ic.append(icon(v >= tgt ? "check" : (METRICS.find(m => m.k === g.metric) || METRICS[0]).i));
    const mid = el("div", "mid"); mid.append(el("h3", "", fmtVal(g.metric, tgt) + (g.period === "week" ? " w tygodniu" : g.period === "month" ? " w miesiącu" : "")));
    mid.append(el("div", "ch-meta", (g.type && g.type !== "all" ? TMAP[g.type].n + " · " : "") + (g.period === "custom" ? fmtDate(a) + " – " + fmtDate(b) : g.period === "week" ? "od " + fmtDate(a) : fmtDate(a, false) + " – " + fmtDate(b))));
    const del = el("button", "del", "Usuń"); del.type = "button"; twoTap(del, "Usuń", () => writeMine({ ...myDoc, goals: goals.filter(x => x.id !== g.id) }, "Usunięto cel"));
    h.append(ic, mid, del); card.append(h);
    const p = el("div", "ch-progress"); const nums = el("div", "nums"); nums.append(el("span", "", fmtVal(g.metric, v)), el("small", "", v >= tgt ? "Cel osiągnięty!" : nf0.format(v / tgt * 100) + "%"));
    p.append(nums, progressBar(v / tgt, false, true)); card.append(p); gb.append(card);
  }
  // badges
  const bx = $("badges"); bx.replaceChildren();
  for (const b of badgesFor(me)) {
    const t = el("div", "badge" + (b.on ? " on" : "") + (b.special ? " special" : ""));
    const md = el("div", "medal"); md.append(icon(b.i)); t.append(md, el("b", "", b.n));
    t.append(el("small", "", b.note || (b.on ? "Zdobyta" : b.m === "week3" ? "3 treningi w 1 tydzień" : fmtNum(b.m === "streak" ? "count" : b.m, Math.min(b.cur, b.t)) + " / " + fmtNum(b.m === "streak" ? "count" : b.m, b.t))));
    bx.append(t);
  }
  // pace stats
  const ps = $("paceStats"); ps.replaceChildren();
  let anyPace = false;
  for (const t of TYPES) {
    const es = mine.filter(e => (e.t || "run") === t.k && secOf(e) && +e.km > 0);
    if (!es.length) continue; anyPace = true;
    const km = es.reduce((s, e) => s + +e.km, 0), sec = es.reduce((s, e) => s + secOf(e), 0);
    const best = es.reduce((b, e) => (secOf(e) / e.km < secOf(b) / b.km ? e : b));
    const r = el("div", "act"); const ic = el("div", "ic"); ic.append(icon(t.i));
    const mid = el("div", "mid"); mid.append(el("div", "t", t.n), el("div", "sub", es.length + " " + plTren(es.length) + " z czasem · najlepsze: " + fmtPace(t.k, +best.km, secOf(best))));
    r.append(ic, mid, el("div", "v", fmtPace(t.k, km, sec)), el("span")); ps.append(r);
  }
  if (!anyPace) ps.append(el("div", "empty", "Dodaj trening z czasem, a pokażę Twoje średnie tempo."));
  // my list
  const list = $("mylist"); list.replaceChildren();
  const es = mine.slice().sort((a, b) => b.d.localeCompare(a.d) || (b.at || 0) - (a.at || 0));
  if (!es.length) list.append(el("div", "empty", "Po dodaniu treningi pojawią się tutaj."));
  for (const e of es.slice(0, 100)) {
    const r = actRow(e, false);
    const del = el("button", "del", "Usuń"); del.type = "button"; del.setAttribute("aria-label", "Usuń trening");
    twoTap(del, "Usuń", () => writeMine({ ...myDoc, entries: (myDoc.entries || []).filter(x => x.id !== e.id) }, "Usunięto trening"));
    r.append(del); list.append(r);
  }
  // profile & admin
  fillDeptSelect($("m-dept"), myDoc && myDoc.dept);
  if (myDoc && document.activeElement !== $("m-nick")) $("m-nick").value = myDoc.nick || "";
  $("adminCard").hidden = !isAdmin();
  if (isAdmin()) renderAdmin();
}
function fillDeptSelect(s, cur) {
  if (document.activeElement === s) return;
  s.replaceChildren(); const o0 = el("option", "", depts.length ? "— wybierz dział —" : "— brak działów —"); o0.value = ""; s.append(o0);
  const list = depts.slice(); if (cur && !list.includes(cur)) list.push(cur);
  for (const d of list) { const o = el("option", "", d); o.value = d; s.append(o); }
  s.value = cur || "";
}
$("newGoalBtn").onclick = () => { const f = $("goalForm"); f.hidden = !f.hidden; if (!f.hidden) { $("g-start").value = today(); $("g-end").value = monthEnd(today()); } };
$("g-cancel").onclick = () => { $("goalForm").hidden = true; };
$("g-period").onchange = () => { $("g-dates").hidden = $("g-period").value !== "custom"; };
(() => { const s = $("g-type"); const o = el("option", "", "Wszystkie"); o.value = "all"; s.append(o); for (const t of TYPES) { const x = el("option", "", t.n); x.value = t.k; s.append(x); } })();
$("goalForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const target = parseFloat(String($("g-target").value).replace(",", "."));
  if (!(target > 0)) { toast("Podaj wartość celu"); return; }
  const g = { id: "g" + Date.now().toString(36), metric: $("g-metric").value, target, period: $("g-period").value, type: $("g-type").value };
  if (g.period === "custom") { g.start = $("g-start").value; g.end = $("g-end").value; if (!g.start || !g.end || g.end < g.start) { toast("Ustaw poprawne daty"); return; } }
  writeMine({ ...myDoc, goals: [...((myDoc && myDoc.goals) || []), g].slice(-50) }, "Dodano cel");
  $("goalForm").hidden = true; $("g-target").value = "";
});
$("m-save").onclick = () => {
  const nick = $("m-nick").value.trim();
  if (!nick) { toast("Nick nie może być pusty"); return; }
  writeMine({ ...myDoc, nick, dept: $("m-dept").value }, "Zapisano profil");
};

// ---------- admin ----------
function renderAdmin() {
  const ta = $("deptText"); if (document.activeElement !== ta) ta.value = depts.join("\n");
  const box = $("adminList"); box.replaceChildren();
  const ids = Object.keys(people).sort((a, b) => nickOf(a).localeCompare(nickOf(b), "pl"));
  for (const id of ids) {
    const r = el("div", "r"); const mid = el("div", "mid"); mid.append(el("div", "nm", nickOf(id)), el("div", "sub", (people[id].dept || "bez działu") + (id === me ? " · to Ty" : "")));
    const sw = el("button", "switch"); sw.type = "button"; sw.setAttribute("role", "switch");
    const on = admins.has(id) || (id === me && user.email === SUPER_ADMIN);
    sw.setAttribute("aria-checked", on); sw.setAttribute("aria-label", "Administrator: " + nickOf(id));
    if (id === me && user.email === SUPER_ADMIN) sw.disabled = true;
    sw.onclick = () => {
      const ref = doc(fs, "admins", id);
      (admins.has(id) ? deleteDoc(ref) : setDoc(ref, { by: me, at: Date.now() })).then(() => toast(admins.has(id) ? "Odebrano uprawnienia" : "Nadano uprawnienia")).catch(() => toast("Nie udało się zmienić uprawnień"));
    };
    r.append(avatar(id, nickOf(id)), mid, sw); box.append(r);
  }
}
$("deptSave").onclick = () => {
  const list = [...new Set($("deptText").value.split("\n").map(s => s.trim()).filter(Boolean))].slice(0, 100);
  setDoc(doc(fs, "config", "departments"), { list, updatedBy: me, updatedAt: Date.now() }).then(() => toast("Zapisano działy")).catch(() => toast("Nie udało się zapisać działów"));
};

// ---------- render ----------
function renderForms() {
  const has = !!(myDoc && myDoc.nick);
  $("profileCard").hidden = has || !me; $("addForm").hidden = !has;
  $("meCard").hidden = !has;
  fillDeptSelect($("p-dept"), $("p-dept").value);
  $("p-deptWrap").hidden = !depts.length;
  $("who").hidden = !has; $("whoName").textContent = has ? ("Grasz jako " + myDoc.nick + (myDoc.dept ? " · " + myDoc.dept : "")) : "";
}
function render() {
  if (!me) return;
  renderForms();
  try {
    if (view === "rank") renderRank();
    else if (view === "ch") renderCh();
    else if (view === "cal") renderCal();
    else if (view === "me") renderMe();
    else if (view === "person") renderPerson();
  } catch (e) { console.error(e); }
}

// ---------- writes (one at a time) ----------
let chain = Promise.resolve();
function writeMine(next, msg) {
  if (!fs || !me) return;
  const clean = { nick: String(next.nick || "").slice(0, 24), dept: String(next.dept || "").slice(0, 60), entries: (next.entries || []).slice(-1500), goals: (next.goals || []).slice(-50) };
  myDoc = clean; people[me] = clean; render();
  chain = chain.then(() => setDoc(doc(fs, "people", me), clean)).then(() => msg && toast(msg)).catch(err => {
    console.error(err);
    toast(err && err.code === "permission-denied" ? "Brak uprawnień do zapisu. Zaloguj się ponownie." : "Nie udało się zapisać. Sprawdź internet i spróbuj ponownie.");
  });
}
$("p-save").onclick = () => {
  const nick = $("p-nick").value.trim();
  if (!nick) { $("p-nick").focus(); toast("Wpisz nick"); return; }
  writeMine({ nick, dept: $("p-dept").value, entries: (myDoc && myDoc.entries) || [], goals: (myDoc && myDoc.goals) || [] }, "Witaj w klubie!");
};

// ---------- auth ----------
const AUTH_ERR = {
  "auth/invalid-email": "Ten adres e-mail wygląda na niepoprawny.",
  "auth/missing-password": "Wpisz hasło.",
  "auth/weak-password": "Hasło musi mieć co najmniej 6 znaków.",
  "auth/email-already-in-use": "Konto z tym adresem już istnieje. Kliknij Zaloguj albo Nie pamiętam hasła.",
  "auth/invalid-credential": "Nieprawidłowy e-mail lub hasło.",
  "auth/wrong-password": "Nieprawidłowy e-mail lub hasło.",
  "auth/user-not-found": "Nieprawidłowy e-mail lub hasło.",
  "auth/too-many-requests": "Za dużo prób. Spróbuj ponownie za kilka minut.",
  "auth/operation-not-allowed": "Logowanie e-mailem nie jest jeszcze włączone w Firebase.",
  "auth/network-request-failed": "Brak połączenia z internetem."
};
const loginErr = t => { const e = $("l-err"); e.textContent = t; e.hidden = !t; };
$("loginGoogle").onclick = async () => {
  if (!auth) return;
  const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, provider); }
  catch (err) {
    if (err && (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment")) { await signInWithRedirect(auth, provider); return; }
    if (err && (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request")) return;
    if (err && err.code === "auth/unauthorized-domain") { loginErr("Ten adres strony nie jest dodany w Firebase (Authentication → Settings → Authorized domains)."); return; }
    console.error(err); loginErr("Nie udało się zalogować. Spróbuj ponownie.");
  }
};
$("emailForm").addEventListener("submit", async ev => {
  ev.preventDefault(); loginErr("");
  try { await signInWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-pass").value); }
  catch (err) { loginErr(AUTH_ERR[err.code] || "Nie udało się zalogować. Spróbuj ponownie."); }
});
$("l-register").onclick = async () => {
  loginErr("");
  try { await createUserWithEmailAndPassword(auth, $("l-email").value.trim(), $("l-pass").value); toast("Konto założone. Witaj!"); }
  catch (err) { loginErr(AUTH_ERR[err.code] || "Nie udało się założyć konta. Spróbuj ponownie."); }
};
$("l-reset").onclick = async () => {
  const email = $("l-email").value.trim();
  if (!email) { loginErr("Wpisz swój e-mail powyżej, a wyślę link do ustawienia nowego hasła."); return; }
  try { await sendPasswordResetEmail(auth, email); loginErr(""); toast("Jeśli konto istnieje, wysłaliśmy link na " + email); }
  catch (err) { loginErr(AUTH_ERR[err.code] || "Nie udało się wysłać wiadomości."); }
};
$("logoutBtn").onclick = () => auth && signOut(auth);

resetAdd();
if (!configured) {
  setSignedIn(false); $("loginGoogle").disabled = true;
  showMsg("Aplikacja nie jest jeszcze połączona z Firebase. Uzupełnij plik firebase-config.js.");
} else {
  getRedirectResult(auth).catch(() => {});
  onAuthStateChanged(auth, u => {
    while (unsubs.length) unsubs.pop()();
    if (!u) { user = null; me = null; myDoc = null; people = {}; challenges = []; admins = new Set(); setSignedIn(false); return; }
    user = u; me = u.uid; showMsg("");
    if (!$("p-nick").value) $("p-nick").value = (u.displayName || (u.email || "").split("@")[0] || "").split(" ")[0];
    let first = true;
    unsubs.push(onSnapshot(collection(fs, "people"), snap => {
      const next = {}; snap.forEach(d => { const v = d.data(); if (v && v.nick) next[d.id] = v; });
      people = next; myDoc = people[me] || (myDoc && myDoc.nick ? myDoc : null); if (myDoc) people[me] = myDoc;
      if (first) { first = false; if (!myDoc) view = "add"; setSignedIn(true); } else render();
    }, err => { console.error(err); showMsg("Nie udało się wczytać rankingu. Odśwież stronę."); }));
    unsubs.push(onSnapshot(collection(fs, "challenges"), snap => { const a = []; snap.forEach(d => { const v = d.data(); if (v && v.start && v.end) a.push({ ...v, id: d.id }); }); challenges = a; render(); }, err => console.error(err)));
    unsubs.push(onSnapshot(doc(fs, "config", "departments"), snap => { const v = snap.exists() ? snap.data() : null; depts = v && Array.isArray(v.list) ? v.list.map(String) : []; render(); }, err => console.error(err)));
    unsubs.push(onSnapshot(collection(fs, "admins"), snap => { const s = new Set(); snap.forEach(d => s.add(d.id)); admins = s; render(); }, err => console.error(err)));
  });
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});

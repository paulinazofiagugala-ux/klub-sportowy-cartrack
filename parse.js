// Odczyt plików z treningów (GPX, TCX, FIT) i rozpoznawanie rodzaju aktywności.
// Wynik: { type, km, sec, kcal, d } – pola mogą być null, jeśli plik ich nie zawiera.

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z w sekundach Unix

export function ymdLocal(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

// Rodzaj aktywności z nazwy (GPX/TCX) – zwraca klucz typu albo null
export function typeFromName(name) {
  const s = String(name || "").toLowerCase();
  if (!s) return null;
  if (/nordic/.test(s)) return "nordic";
  if (/swim|pływ|plyw|pool/.test(s)) return "swim";
  if (/skat|rolk|roller/.test(s)) return "skate";
  if (/run|bieg|jog|trail/.test(s)) return "run";
  if (/bik|cycl|ride|rower|mtb|gravel/.test(s)) return "bike";
  if (/walk|hik|spacer|trek/.test(s)) return "walk";
  // stare eksporty Stravy używają numerów: 1 rower, 9 bieg, 10 spacer, 11 spacer
  if (s === "1") return "bike";
  if (s === "9") return "run";
  if (s === "10" || s === "11") return "walk";
  return null;
}

// Rodzaj aktywności z prędkości średniej (km/h)
export function typeFromSpeed(km, sec) {
  if (!(km > 0) || !(sec > 0)) return null;
  const v = km / (sec / 3600);
  if (v < 7) return "walk";
  if (v < 17) return "run";
  return "bike";
}

const FIT_SPORT = { 1: "run", 2: "bike", 5: "swim", 11: "walk", 17: "walk", 30: "skate" };

function haversine(a, b) {
  const R = 6371.0088, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("bad-xml");
  const typeEl = doc.getElementsByTagName("type")[0];
  const nameEl = doc.getElementsByTagName("name")[0];
  let type = typeFromName(typeEl && typeEl.textContent) || typeFromName(nameEl && nameEl.textContent);
  const pts = [...doc.getElementsByTagName("trkpt")];
  const rte = pts.length ? pts : [...doc.getElementsByTagName("rtept")];
  let km = 0, prev = null, t0 = null, t1 = null;
  for (const p of rte) {
    const cur = { lat: parseFloat(p.getAttribute("lat")), lon: parseFloat(p.getAttribute("lon")) };
    if (!isFinite(cur.lat) || !isFinite(cur.lon)) continue;
    if (prev) km += haversine(prev, cur);
    prev = cur;
    const tEl = p.getElementsByTagName("time")[0];
    if (tEl) { const t = Date.parse(tEl.textContent); if (!isNaN(t)) { if (t0 === null) t0 = t; t1 = t; } }
  }
  if (!rte.length) throw new Error("no-points");
  const sec = t0 !== null && t1 > t0 ? (t1 - t0) / 1000 : null;
  const metaTime = doc.getElementsByTagName("time")[0];
  const start = t0 !== null ? new Date(t0) : (metaTime ? new Date(metaTime.textContent) : null);
  return { type: type || typeFromSpeed(km, sec), km: km || null, sec, kcal: null, d: start && !isNaN(start) ? ymdLocal(start) : null };
}

export function parseTCX(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("bad-xml");
  const act = doc.getElementsByTagName("Activity")[0];
  if (!act) throw new Error("no-activity");
  let type = typeFromName(act.getAttribute("Sport"));
  const num = (el, tag) => { const x = el.getElementsByTagName(tag)[0]; return x ? parseFloat(x.textContent) : NaN; };
  let m = 0, sec = 0, kcal = 0, hasK = false;
  for (const lap of act.getElementsByTagName("Lap")) {
    const dm = num(lap, "DistanceMeters"), ts = num(lap, "TotalTimeSeconds"), c = num(lap, "Calories");
    if (isFinite(ts)) sec += ts;
    if (isFinite(c)) { kcal += c; hasK = true; }
    // DistanceMeters występuje też w punktach trasy – bierzemy tylko bezpośrednie dziecko okrążenia
    const direct = [...lap.children].find(ch => ch.localName === "DistanceMeters");
    if (direct) m += parseFloat(direct.textContent) || 0; else if (isFinite(dm)) m += dm;
  }
  const idEl = act.getElementsByTagName("Id")[0];
  const start = idEl ? new Date(idEl.textContent) : null;
  const km = m / 1000;
  return { type: type || typeFromSpeed(km, sec), km: km || null, sec: sec || null, kcal: hasK ? Math.round(kcal) : null, d: start && !isNaN(start) ? ymdLocal(start) : null };
}

export function parseFIT(buffer) {
  const dv = new DataView(buffer);
  const hdr = dv.getUint8(0);
  if (dv.byteLength < 12 || String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11)) !== ".FIT") throw new Error("not-fit");
  const end = Math.min(dv.byteLength, hdr + dv.getUint32(4, true));
  const defs = {};
  let pos = hdr;
  const sessions = [];
  let lastDist = null, firstTs = null, lastTs = null;
  const readUint = (p, size, le) => size === 1 ? dv.getUint8(p) : size === 2 ? dv.getUint16(p, le) : size === 4 ? dv.getUint32(p, le) : null;
  while (pos < end) {
    const h = dv.getUint8(pos++);
    let local, isDef = false, hasDev = false;
    if (h & 0x80) { local = (h >> 5) & 3; }
    else { local = h & 0x0f; isDef = !!(h & 0x40); hasDev = !!(h & 0x20); }
    if (isDef) {
      const le = dv.getUint8(pos + 1) === 0;
      const gmsg = dv.getUint16(pos + 2, le);
      const n = dv.getUint8(pos + 4);
      pos += 5;
      const fields = [];
      for (let i = 0; i < n; i++) { fields.push({ num: dv.getUint8(pos), size: dv.getUint8(pos + 1) }); pos += 3; }
      let devSize = 0;
      if (hasDev) { const nd = dv.getUint8(pos++); for (let i = 0; i < nd; i++) { devSize += dv.getUint8(pos + 1); pos += 3; } }
      defs[local] = { le, gmsg, fields, devSize };
      continue;
    }
    const def = defs[local];
    if (!def) throw new Error("bad-fit");
    const vals = {};
    for (const f of def.fields) {
      if (f.size <= 4) vals[f.num] = readUint(pos, f.size, def.le);
      pos += f.size;
    }
    pos += def.devSize;
    if (def.gmsg === 18) sessions.push(vals);
    else if (def.gmsg === 20) {
      if (vals[5] != null && vals[5] !== 0xffffffff) lastDist = vals[5] / 100;
      if (vals[253] != null && vals[253] !== 0xffffffff) { if (firstTs === null) firstTs = vals[253]; lastTs = vals[253]; }
    }
  }
  const ok = (v, bad) => v != null && v !== bad ? v : null;
  let type = null, km = 0, sec = 0, kcal = 0, hasK = false, startTs = null;
  for (const s of sessions) {
    if (!type) type = FIT_SPORT[ok(s[5], 0xff)] || null;
    const dist = ok(s[9], 0xffffffff); if (dist != null) km += dist / 100 / 1000;
    const t = ok(s[8], 0xffffffff) ?? ok(s[7], 0xffffffff); if (t != null) sec += t / 1000;
    const c = ok(s[11], 0xffff); if (c != null) { kcal += c; hasK = true; }
    const st = ok(s[2], 0xffffffff); if (startTs === null && st != null) startTs = st;
  }
  if (!sessions.length) {
    if (lastDist != null) km = lastDist / 1000;
    if (firstTs != null && lastTs > firstTs) sec = lastTs - firstTs;
    startTs = firstTs;
  }
  const start = startTs != null ? new Date((startTs + FIT_EPOCH) * 1000) : null;
  return { type: type || typeFromSpeed(km, sec), km: km || null, sec: sec || null, kcal: hasK ? kcal : null, d: start ? ymdLocal(start) : null };
}

export async function parseActivityFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".fit")) return parseFIT(await file.arrayBuffer());
  const text = await file.text();
  if (name.endsWith(".tcx") || /<TrainingCenterDatabase/i.test(text)) return parseTCX(text);
  if (name.endsWith(".gpx") || /<gpx/i.test(text)) return parseGPX(text);
  throw new Error("unsupported");
}

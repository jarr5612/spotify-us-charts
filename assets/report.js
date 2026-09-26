// Report page: fills index.html from data/report.json (built by scripts/analysis.py)
// and draws the eight interactive visuals as plain SVG (no chart library).
(function () {
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = n => Math.round(n).toLocaleString("en-US");
const big = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : fmt(n);
const pct = (n, d = 1) => n.toFixed(d) + "%";
const get = (o, path) => path.split(".").reduce((a, k) => a[k], o);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const vers = v => v > 1 ? ` <span class="versions">(across ${v} versions)</span>` : "";
const versTxt = v => v > 1 ? ` (across ${v} versions)` : "";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
// music (assets/music.js): a ▶ button or data-play-id anywhere plays that song in the listening booth
const playAttr = s => `data-play-id="${s.track_id}" data-play-t="${esc(s.track)}" data-play-a="${esc(s.artists || "")}"`;
const playBtn = s => s && s.track_id ? `<button type="button" class="play-btn" ${playAttr(s)} aria-label="Play ${esc(s.track)}" title="Play"></button>` : "";
const songLink = s => `<button type="button" class="song-link" ${playAttr(s)} title="Play">${esc(s.track)}</button>`;
const play = s => { if (s && s.track_id && window.playSong) window.playSong(s); };
const CLICK = `<br><span class="m">▶ click to play</span>`;
const NS = "http://www.w3.org/2000/svg";
const $ = id => document.getElementById(id);

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
function svgIn(box, w, h, label) {
  const s = el("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": label || "" });
  box.appendChild(s); return s;
}
const lin = (d0, d1, r0, r1) => { const f = v => r0 + (v - d0) / (d1 - d0) * (r1 - r0); f.inv = p => d0 + (p - r0) / (r1 - r0) * (d1 - d0); return f; };
const logs = (d0, d1, r0, r1) => { const a = Math.log(d0), b = Math.log(d1); const f = v => r0 + (Math.log(v) - a) / (b - a) * (r1 - r0); f.inv = p => Math.exp(a + (p - r0) / (r1 - r0) * (b - a)); return f; };
function svgPoint(svg, evt) {
  const p = svg.createSVGPoint(); p.x = evt.clientX; p.y = evt.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

// one shared tooltip
const tip = document.createElement("div"); tip.className = "viz-tip"; tip.setAttribute("role", "status"); document.body.appendChild(tip);
function showTip(html, evt) {
  tip.innerHTML = html; tip.classList.add("on");
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = evt.clientX + 14, y = evt.clientY + 14;
  if (x + w > innerWidth - 8) x = evt.clientX - w - 14;
  if (y + h > innerHeight - 8) y = evt.clientY - h - 14;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
const hideTip = () => tip.classList.remove("on");

function toggle(box, options, initial, onChange) {
  const g = document.createElement("div"); g.className = "tgl"; g.setAttribute("role", "group");
  options.forEach(([v, label]) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.dataset.v = v;
    b.setAttribute("aria-pressed", v === initial);
    b.addEventListener("click", () => { g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); onChange(v); });
    g.appendChild(b);
  });
  box.appendChild(g); return g;
}
function keynums(id, items) { $(id).innerHTML = items.map(t => `<li>${t}</li>`).join(""); }
function table(id, cols, rows) {
  const head = cols.map(c => `<th class="${c.n ? "n" : ""}">${c.label}</th>`).join("");
  const body = rows.map(r => "<tr>" + cols.map(c => `<td class="${c.n ? "n" : ""}">${c.f ? c.f(r[c.key], r) : esc(r[c.key])}</td>`).join("") + "</tr>").join("");
  $(id).innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
function axisX(svg, x, y, ticks, fmtT, x0, x1) {
  const g = el("g", { class: "ax" }, svg);
  el("line", { x1: x0, x2: x1, y1: y, y2: y }, g);
  ticks.forEach(t => { const px = x(t); el("line", { x1: px, x2: px, y1: y, y2: y + 4 }, g);
    el("text", { x: px, y: y + 17, "text-anchor": "middle" }, g).textContent = fmtT(t); });
}
function axisY(svg, y, x, ticks, fmtT, x1) {
  const g = el("g", { class: "grid" }, svg), a = el("g", { class: "ax" }, svg);
  ticks.forEach(t => { const py = y(t); el("line", { x1: x, x2: x1, y1: py, y2: py }, g);
    el("text", { x: x - 8, y: py + 4, "text-anchor": "end" }, a).textContent = fmtT(t); });
}

// =============================================================================
fetch("data/report.json").then(r => r.json()).then(R => {
  document.querySelectorAll("[data-f]").forEach(e => { const v = get(R, e.dataset.f); e.textContent = typeof v === "number" ? fmt(v) : v; });
  $("range").textContent = `${R.meta.first_date} to ${R.meta.last_date}`;
  const H = R.headline;
  $("h1").textContent = big(H.total_streams).replace(/\.(\d)\dB$/, ".$1B");
  $("h2").textContent = fmt(H.unique_songs);
  $("h3").textContent = fmt(H.unique_lead_artists);
  $("h4").textContent = fmt(H.songs_reaching_no1);

  const draws = [v1, v2, v3, v4, v5, v6, v7, v8];
  const drawAll = () => draws.forEach((f, i) => { const box = $("v" + (i + 1)); box.innerHTML = ""; try { f(R, box); } catch (e) { console.error(e); } });
  drawAll();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawAll);
}).catch(err => {
  document.querySelector("main").insertAdjacentHTML("afterbegin",
    `<p class="placeholder">Could not load data/report.json (${err}). If you opened this file directly, run a local server: <code>python3 -m http.server</code> and open http://localhost:8000.</p>`);
});

// ---- 1. Artists: 100 records, each 1% of streams ----------------------------
function v1(R, box) {
  const A = R.s1_artists, grid = A.grid;
  keynums("k1", [`#1 artist: ${A.top10[0].artist}, ${pct(A.top10[0].share_pct)} of streams`,
                 `Top 10 artists: ${pct(A.top10_share_pct)}`, `Top 1% of artists (${A.top1pct_n} of ${fmt(A.n_artists)}): ${pct(A.top1pct_share_pct)}`]);
  table("t1", [{ key: "artist", label: "Lead artist" }, { key: "top_song", label: "Most-streamed song", f: v => playBtn(v) + esc(v.track) },
               { key: "streams", label: "Streams", n: 1, f: fmt }, { key: "share_pct", label: "Share", n: 1, f: v => pct(v) }], A.top10);

  const wrap = document.createElement("div"); wrap.className = "v1-wrap"; box.appendChild(wrap);
  const left = document.createElement("div"); wrap.appendChild(left);
  const svg = svgIn(left, 360, 360, "A 10 by 10 grid of records; each record is 1 percent of all streams, grouped by artist");
  const owner = []; grid.forEach((g, gi) => { for (let k = 0; k < g.cells; k++) owner.push(gi); });
  const acc = css("--accent"), brass = css("--brass"), rest = "#b9ab94";
  const recs = owner.map((gi, k) => {
    const cx = 18 + (k % 10) * 36, cy = 18 + Math.floor(k / 10) * 36, isRest = gi === grid.length - 1;
    const g = el("g", { class: "v1-rec", "data-g": gi }, svg);
    el("circle", { cx, cy, r: 16, fill: isRest ? "#8d8373" : "#151210", "fill-opacity": isRest ? .35 : 1 }, g);
    for (const r of [13.5, 11.5, 9.5]) el("circle", { cx, cy, r, fill: "none", stroke: isRest ? "#fff" : "#3a3531", "stroke-opacity": isRest ? .25 : .8, "stroke-width": .6 }, g);
    const lab = el("circle", { cx, cy, r: 5.6, class: "lab", fill: isRest ? rest : acc }, g);
    el("circle", { cx, cy, r: 1.1, fill: css("--surface") }, g);
    return { g, lab, gi, isRest };
  });
  const list = document.createElement("ol"); list.className = "v1-legend"; wrap.appendChild(list);
  list.innerHTML = grid.map((g, gi) => `<li data-g="${gi}" class="${gi === grid.length - 1 ? "rest" : ""}"><span class="dot"></span>
      <span>${esc(g.artist)}</span><span class="pct"><span class="n">${g.cells}</span> record${g.cells > 1 ? "s" : ""} · ${pct(g.share_pct)}</span></li>`).join("");
  const items = [...list.children];
  function focus(gi) {
    recs.forEach(r => { const on = gi === null || r.gi === gi;
      r.g.style.opacity = on ? 1 : .18; r.lab.setAttribute("fill", gi !== null && r.gi === gi ? brass : (r.isRest ? rest : acc)); });
    items.forEach((li, k) => li.classList.toggle("on", k === gi));
  }
  const topSong = gi => gi < A.top10.length ? A.top10[gi].top_song : null;
  const tipFor = gi => { const g = grid[gi], ts = topSong(gi); return `<b>${esc(g.artist)}</b><br><span class="v">${pct(g.share_pct, 2)}</span> of all Top-200 streams<br><span class="m">${g.cells} of 100 records (each = 1%, rounded)</span>` +
    (ts ? `<br><span class="m">▶ click to play their top song, “${esc(ts.track)}”</span>` : ""); };
  recs.forEach(r => {
    r.g.addEventListener("pointerenter", e => { focus(r.gi); showTip(tipFor(r.gi), e); });
    r.g.addEventListener("pointermove", e => showTip(tipFor(r.gi), e));
    r.g.addEventListener("pointerleave", () => { focus(null); hideTip(); });
    r.g.addEventListener("click", () => play(topSong(r.gi)));
  });
  items.forEach((li, gi) => { li.addEventListener("pointerenter", () => focus(gi)); li.addEventListener("pointerleave", () => focus(null));
    const ts = topSong(gi); if (ts) { li.title = `Play “${ts.track}”`; li.addEventListener("click", () => play(ts)); } });
}

// ---- 2. Songs: drag along the concentration curve ---------------------------
function v2(R, box) {
  const S = R.s2_songs, cum = S.cum_pct, N = S.n_songs;
  const t0 = S.top10[0];
  keynums("k2", [`Top 10 songs: ${pct(S.top10_share_pct)} of streams`, `Top 100 of ${fmt(N)}: ${pct(S.top100_share_pct)}`,
                 `${playBtn(t0)}#1 song: ${esc(t0.track)} (${big(t0.streams)})${vers(t0.versions)}`]);
  table("t2", [{ key: "track", label: "Song", f: (v, r) => playBtn(r) + esc(v) + vers(r.versions) }, { key: "artists", label: "Artists" },
               { key: "streams", label: "Streams", n: 1, f: fmt }, { key: "days", label: "Days charted", n: 1 }], S.top10);

  const read = document.createElement("p"); read.className = "viz-readout"; box.appendChild(read);
  const W = 800, Ht = 330, m = { l: 52, r: 20, t: 12, b: 40 };
  const svg = svgIn(box, W, Ht, "Cumulative share of streams earned by the top N songs");
  const x = logs(1, N, m.l, W - m.r), y = lin(0, 100, Ht - m.b, m.t);
  axisY(svg, y, m.l, [0, 25, 50, 75, 100], v => v + "%", W - m.r);
  axisX(svg, x, Ht - m.b, [1, 10, 100, 1000, N], v => v === N ? fmt(N) : fmt(v), m.l, W - m.r);
  el("text", { x: W - m.r, y: Ht - 2, "text-anchor": "end", "font-size": 11, fill: css("--ink-3"), "font-style": "italic" }, svg).textContent = "top N songs (log scale)";
  // equal-share reference
  const eq = []; for (let k = 1; k <= N; k *= 1.15) eq.push(`${x(k).toFixed(1)},${y(k / N * 100).toFixed(1)}`);
  eq.push(`${x(N)},${y(100)}`);
  el("polyline", { points: eq.join(" "), fill: "none", stroke: css("--ink-3"), "stroke-dasharray": "4 4", "stroke-width": 1 }, svg);
  el("text", { x: x(300), y: y(300 / N * 100) - 8, "font-size": 11, fill: css("--ink-3"), "font-style": "italic" }, svg).textContent = "if every song earned the same";
  const pts = cum.map((v, k) => `${x(k + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = el("polygon", { points: `${x(1)},${y(0)} ${pts} ${x(N)},${y(0)}`, fill: css("--accent"), "fill-opacity": .08 }, svg);
  el("polyline", { points: pts, fill: "none", stroke: css("--accent"), "stroke-width": 2.5 }, svg);
  const vline = el("line", { stroke: css("--brass"), "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
  const hline = el("line", { stroke: css("--brass"), "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
  const knob = el("circle", { r: 8, fill: css("--surface"), stroke: css("--accent"), "stroke-width": 3, style: "cursor:grab" }, svg);
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: Ht - m.t - m.b, fill: "transparent", style: "cursor:ew-resize;touch-action:none" }, svg);
  svg.appendChild(knob);

  const ctl = document.createElement("div"); ctl.className = "viz-controls"; box.appendChild(ctl);
  ctl.innerHTML = `<label class="hint" for="v2r">Or use the slider:</label>`;
  const rng = document.createElement("input"); rng.type = "range"; rng.id = "v2r"; rng.min = 0; rng.max = 1000; ctl.appendChild(rng);
  const toK = v => Math.max(1, Math.min(N, Math.round(Math.exp(v / 1000 * Math.log(N)))));
  function set(k) {
    const px = x(k), py = y(cum[k - 1]);
    knob.setAttribute("cx", px); knob.setAttribute("cy", py);
    vline.setAttribute("x1", px); vline.setAttribute("x2", px); vline.setAttribute("y1", py); vline.setAttribute("y2", Ht - m.b);
    hline.setAttribute("x1", m.l); hline.setAttribute("x2", px); hline.setAttribute("y1", py); hline.setAttribute("y2", py);
    rng.value = Math.round(Math.log(k) / Math.log(N) * 1000);
    const names = S.ranked.slice(0, Math.min(k, 3)).map(s => `${songLink(s)}${vers(s.versions)}`).join(", ");
    read.innerHTML = `The top <b>${fmt(k)}</b> song${k > 1 ? "s" : ""} (${pct(k / N * 100)} of all ${fmt(N)}) earned <b>${pct(cum[k - 1])}</b> of all streams` +
      (k <= 50 ? `<br><span class="hint">led by ${names}${k > 3 ? " …" : ""}</span>` : "");
  }
  let drag = false;
  const move = e => set(Math.max(1, Math.min(N, Math.round(x.inv(svgPoint(svg, e).x)))));
  hit.addEventListener("pointerdown", e => { drag = true; hit.setPointerCapture(e.pointerId); move(e); });
  knob.addEventListener("pointerdown", e => { drag = true; knob.setPointerCapture(e.pointerId); });
  [hit, knob].forEach(t => { t.addEventListener("pointermove", e => { if (drag) move(e); });
    t.addEventListener("pointerup", () => drag = false); t.addEventListener("pointercancel", () => drag = false); });
  rng.addEventListener("input", () => set(toK(+rng.value)));
  set(100);
}

// ---- 3. #1 spot: every run at #1 ---------------------------------------------
function v3(R, box) {
  const Nn = R.s3_no1, runs = Nn.runs, days = R.meta.days;
  const t0 = Nn.top10[0];
  keynums("k3", [`${Nn.n_songs} songs reached #1`, `Median time at #1: ${Nn.median_days_at_1} days`,
                 `${Nn.one_day_only} held it only 1 day`, `${playBtn(t0)}Longest: ${esc(t0.track)}, ${t0.days_at_1} days${vers(t0.versions)}`]);
  table("t3", [{ key: "track", label: "Song", f: (v, r) => playBtn(r) + esc(v) + vers(r.versions) }, { key: "artists", label: "Artists" },
               { key: "days_at_1", label: "Days at #1", n: 1 }], Nn.top10);

  const start = new Date(R.meta.first_date + "T00:00:00Z");
  const dayIx = s => Math.round((new Date(s + "T00:00:00Z") - start) / 864e5);
  const dateOf = i => new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10);
  const nice = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const topIds = Nn.top_ids, rowOf = id => { const k = topIds.indexOf(id); return k < 0 ? topIds.length : k; };
  const totals = {}; runs.forEach(r => totals[r.song_id] = (totals[r.song_id] || 0) + r.days);
  const nOther = new Set(runs.filter(r => rowOf(r.song_id) === topIds.length).map(r => r.song_id)).size;

  const read = document.createElement("p"); read.className = "viz-readout"; box.appendChild(read);
  read.innerHTML = `<span class="hint">Hover the timeline to see what was #1 on any day.</span>`;
  const rowsN = topIds.length + 1, rh = 24, W = 800, m = { l: 215, r: 12, t: 6, b: 34 }, Ht = m.t + rowsN * rh + m.b;
  const svg = svgIn(box, W, Ht, "Timeline of every song's runs at number one");
  const x = lin(0, days, m.l, W - m.r);
  // month grid
  const ax = el("g", { class: "ax" }, svg), gr = el("g", { class: "grid" }, svg);
  for (let i = 0; i < days; i++) { const d = dateOf(i); if (d.endsWith("-01")) {
    el("line", { x1: x(i), x2: x(i), y1: m.t, y2: Ht - m.b }, gr);
    if (+d.slice(5, 7) % 3 === 1) el("text", { x: x(i), y: Ht - m.b + 16, "text-anchor": "middle" }, ax).textContent =
      new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit" }); } }
  // row labels
  for (let k = 0; k < rowsN; k++) {
    const yy = m.t + k * rh + rh / 2 + 4;
    let name, dd;
    if (k < topIds.length) { const r = runs.find(q => q.song_id === topIds[k]); name = r.track; dd = totals[topIds[k]]; }
    else { name = `${nOther} other #1 songs`; dd = null; }
    const t = el("text", { x: m.l - 10, y: yy, "text-anchor": "end", "font-size": 12, fill: k < topIds.length ? css("--ink") : css("--ink-3") }, svg);
    t.textContent = (name.length > 24 ? name.slice(0, 23) + "…" : name) + (dd ? `  ${dd}d` : "");
    if (k < topIds.length) { const r0 = runs.find(q => q.song_id === topIds[k]); if (r0.versions_at_1 > 1) el("title", {}, t).textContent = `${dd} days at #1 across ${r0.versions_at_1} versions`; }
    if (k % 2 === 0) el("rect", { x: m.l, y: m.t + k * rh, width: W - m.l - m.r, height: rh, fill: css("--ink"), "fill-opacity": .03 }, svg);
  }
  const acc = css("--accent"), brass = css("--brass");
  const blocks = runs.map(r => {
    const k = rowOf(r.song_id), s = dayIx(r.start);
    const b = el("rect", { x: x(s), y: m.t + k * rh + 3, width: Math.max(1.4, x(s + r.days) - x(s) - .6), height: rh - 6, rx: 2,
      fill: k < topIds.length ? acc : brass, "fill-opacity": k < topIds.length ? .92 : .7 }, svg);
    return { b, r, k, s };
  });
  const cross = el("line", { y1: m.t, y2: Ht - m.b, stroke: css("--ink"), "stroke-width": 1, "stroke-opacity": 0, "pointer-events": "none" }, svg);
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: rowsN * rh, fill: "transparent", style: "cursor:pointer" }, svg);
  let last3 = null;
  hit.addEventListener("click", () => last3 && play(last3));
  hit.addEventListener("pointermove", e => {
    const p = svgPoint(svg, e), i = Math.max(0, Math.min(days - 1, Math.floor(x.inv(p.x))));
    const cur = blocks.find(q => i >= q.s && i < q.s + q.r.days); if (!cur) return;
    cross.setAttribute("x1", x(i + .5)); cross.setAttribute("x2", x(i + .5)); cross.setAttribute("stroke-opacity", .45);
    blocks.forEach(q => q.b.setAttribute("stroke", q === cur ? css("--ink") : "none"));
    const r = cur.r;
    const html = `<span class="m">${nice(dateOf(i))} · #1 was</span><br><b>${esc(r.track)}</b><br>${esc(r.artists)}<br>` +
      `<span class="v">This run: ${r.days} day${r.days > 1 ? "s" : ""}</span> (${nice(r.start)} – ${nice(r.end)})<br>` +
      `<span class="m">Total at #1: ${totals[r.song_id]} days${versTxt(r.versions_at_1)}</span>` + CLICK;
    last3 = r;
    showTip(html, e);
    read.innerHTML = `${nice(dateOf(i))}: <i>${esc(r.track)}</i> — ${esc(r.artists)} · run of <b>${r.days}</b> day${r.days > 1 ? "s" : ""}`;
  });
  hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("stroke-opacity", 0); blocks.forEach(q => q.b.setAttribute("stroke", "none")); });
}

// ---- 4. Lifespan: survival curve with a slider -------------------------------
function v4(R, box) {
  const L = R.s4_lifespan, P = L.atleast_pct, C = L.atleast_n, days = R.meta.days, total = C[0];
  keynums("k4", [`Median: ${L.median_days} days on the chart`, `${pct(L.one_day_pct)} charted exactly 1 day`,
                 `${L.all_days} songs charted all ${days} days`]);
  table("t4", [{ key: "bucket", label: "Days charted" }, { key: "songs", label: "Songs", n: 1, f: fmt },
               { key: "share_pct", label: "Share of songs", n: 1, f: v => pct(v) }], L.histogram);

  const read = document.createElement("p"); read.className = "viz-readout"; box.appendChild(read);
  const W = 800, Ht = 320, m = { l: 52, r: 20, t: 12, b: 40 };
  const svg = svgIn(box, W, Ht, "Share of songs that charted at least N days");
  const x = logs(1, days, m.l, W - m.r), y = lin(0, 100, Ht - m.b, m.t);
  axisY(svg, y, m.l, [0, 25, 50, 75, 100], v => v + "%", W - m.r);
  axisX(svg, x, Ht - m.b, [1, 7, 30, 90, 365, days], v => ({ 1: "1 day", 7: "1 week", 30: "30 days", 90: "90", 365: "1 year", [days]: "all " + days }[v]), m.l, W - m.r);
  let d = `M ${x(1)} ${y(P[0])}`;
  for (let k = 1; k < days; k++) d += ` H ${x(k + 1).toFixed(1)} V ${y(P[k]).toFixed(1)}`;
  el("path", { d: d + ` V ${y(0)} H ${x(1)} Z`, fill: css("--accent"), "fill-opacity": .08 }, svg);
  el("path", { d, fill: "none", stroke: css("--accent"), "stroke-width": 2.5 }, svg);
  const vline = el("line", { stroke: css("--brass"), "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
  const knob = el("circle", { r: 7, fill: css("--surface"), stroke: css("--accent"), "stroke-width": 3 }, svg);
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: Ht - m.t - m.b, fill: "transparent", style: "cursor:ew-resize;touch-action:none" }, svg);
  const ctl = document.createElement("div"); ctl.className = "viz-controls"; box.appendChild(ctl);
  ctl.innerHTML = `<label class="hint" for="v4r">Days on the chart:</label>`;
  const rng = document.createElement("input"); rng.type = "range"; rng.id = "v4r"; rng.min = 0; rng.max = 1000; ctl.appendChild(rng);
  function set(n) {
    const px = x(n), py = y(P[n - 1]);
    knob.setAttribute("cx", px); knob.setAttribute("cy", py);
    vline.setAttribute("x1", px); vline.setAttribute("x2", px); vline.setAttribute("y1", m.t); vline.setAttribute("y2", Ht - m.b);
    rng.value = Math.round(Math.log(n) / Math.log(days) * 1000);
    read.innerHTML = `<b>${pct(P[n - 1])}</b> of songs (${fmt(C[n - 1])} of ${fmt(total)}) lasted at least <b>${fmt(n)}</b> day${n > 1 ? "s" : ""} on the chart` +
      (n > 1 ? `<span class="hint"> — ${fmt(total - C[n - 1])} dropped off before day ${n}</span>` : "");
  }
  let drag = false;
  const move = e => set(Math.max(1, Math.min(days, Math.round(x.inv(svgPoint(svg, e).x)))));
  hit.addEventListener("pointerdown", e => { drag = true; hit.setPointerCapture(e.pointerId); move(e); });
  hit.addEventListener("pointermove", e => { if (drag || e.pointerType === "mouse") move(e); });
  hit.addEventListener("pointerup", () => drag = false);
  rng.addEventListener("input", () => set(Math.max(1, Math.min(days, Math.round(Math.exp(rng.value / 1000 * Math.log(days)))))));
  set(7);
}

// ---- 5. Debuts: the first 60 days of each debut -----------------------------
function v5(R, box) {
  const D = R.s5_debut;
  keynums("k5", [`${fmt(D.n_debuts)} debuts`, ...D.bands.slice(0, 2).map(b => `Debut ${b.debut_rank}: median ${b.median_days} days`)]);
  table("t5", [{ key: "debut_rank", label: "Debut rank" }, { key: "songs", label: "Songs", n: 1, f: fmt },
               { key: "median_days", label: "Median days", n: 1 }, { key: "mean_days", label: "Average days", n: 1 }], D.bands);

  const ctl = document.createElement("div"); ctl.className = "viz-controls"; box.appendChild(ctl);
  const read = document.createElement("p"); read.className = "viz-readout"; box.appendChild(read);
  const W = 800, Ht = 340, m = { l: 52, r: 16, t: 12, b: 40 }, HZ = 60;
  const svg = svgIn(box, W, Ht, "Chart rank over the first 60 days for each debut");
  const x = lin(1, HZ, m.l, W - m.r), y = lin(1, 200, m.t, Ht - m.b - 14);
  const offY = Ht - m.b;
  axisY(svg, y, m.l, [1, 50, 100, 150, 200], v => "#" + v, W - m.r);
  el("text", { x: m.l - 8, y: offY + 3, "text-anchor": "end", "font-size": 10, fill: css("--ink-3") }, svg).textContent = "off";
  axisX(svg, x, offY, [1, 7, 14, 21, 30, 45, 60], v => v === 1 ? "debut" : "day " + v, m.l, W - m.r);
  const lines = el("g", {}, svg), top = el("g", {}, svg);
  const med = el("path", { fill: "none", stroke: css("--accent"), "stroke-width": 3, "stroke-linejoin": "round" }, top);
  const hl = el("path", { fill: "none", stroke: css("--brass"), "stroke-width": 2.5 }, top);
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: Ht - m.t - m.b, fill: "transparent", style: "cursor:pointer" }, svg);
  let last5 = null;
  hit.addEventListener("click", () => last5 && play(last5));
  const pathD = ranks => { let d = "", pen = false;
    ranks.forEach((r, i) => { if (r) { d += `${pen ? "L" : "M"}${x(i + 1).toFixed(1)} ${y(r).toFixed(1)} `; pen = true; } else pen = false; }); return d; };
  let set = [];
  function draw(band) {
    lines.innerHTML = ""; hl.setAttribute("d", "");
    set = D.paths.filter(p => band === "top10" ? p.debut_rank <= 10 : p.debut_rank > 10);
    const ink = css("--ink");
    set.forEach(p => el("path", { d: pathD(p.ranks), fill: "none", stroke: ink, "stroke-opacity": band === "top10" ? .16 : .09, "stroke-width": 1 }, lines));
    const mids = []; for (let i = 0; i < HZ; i++) { const v = set.map(p => p.ranks[i] || 201).sort((a, b) => a - b); mids.push(v[Math.floor((v.length - 1) / 2)]); }
    med.setAttribute("d", mids.map((r, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)} ${(r > 200 ? offY : y(r)).toFixed(1)}`).join(" "));
    const still = d => set.filter(p => p.ranks[d - 1]).length;
    read.innerHTML = `${fmt(set.length)} songs · still on the chart after a week: <b>${pct(still(7) / set.length * 100, 0)}</b>, ` +
      `after 30 days: <b>${pct(still(30) / set.length * 100, 0)}</b>, after 60 days: <b>${pct(still(60) / set.length * 100, 0)}</b>` +
      `<br><span class="hint">Thick line = the typical (median) song. Hover to follow one song.</span>`;
  }
  toggle(ctl, [["top10", "Debuted in the Top 10"], ["rest", "Debuted at #11–50"]], "top10", draw);
  hit.addEventListener("pointermove", e => {
    const p = svgPoint(svg, e), i = Math.max(0, Math.min(HZ - 1, Math.round(x.inv(p.x)) - 1));
    let best = null, bd = 1e9;
    for (const s of set) { const r = s.ranks[i]; const py = r ? y(r) : offY; const dd = Math.abs(py - p.y); if (dd < bd) { bd = dd; best = s; } }
    if (!best || bd > 18) { hl.setAttribute("d", ""); hideTip(); last5 = null; return; }
    last5 = best;
    hl.setAttribute("d", pathD(best.ranks));
    const r = best.ranks[i], last = best.ranks.reduce((a, v, k) => v ? k + 1 : a, 0);
    showTip(`<b>${esc(best.track)}</b><br>${esc(best.artists)}${best.versions > 1 ? `<br><span class="m">(across ${best.versions} versions)</span>` : ""}<br>` +
      `<span class="m">Debuted ${best.debut} at #${best.debut_rank}</span><br>` +
      `<span class="v">Day ${i + 1}: ${r ? "#" + r : "off the chart"}</span>${last < HZ ? `<br><span class="m">last day in the Top 200 in this window: day ${last}</span>` : ""}` + CLICK, e);
  });
  hit.addEventListener("pointerleave", () => { hl.setAttribute("d", ""); hideTip(); });
  draw("top10");
  const note = document.createElement("p"); note.className = "hint"; note.textContent = D.paths_note + "."; box.appendChild(note);
}

// ---- 6. Solo vs collaboration: a split record --------------------------------
function v6(R, box) {
  const C = R.s6_collab, solo = C[0], col = C[1];
  keynums("k6", C.map(r => `${r.type}: ${fmt(r.avg_streams_per_row)} streams per chart spot`)
                 .concat([`Median days charted: ${solo.median_days} vs ${col.median_days}`]));
  table("t6", [{ key: "type", label: "" }, { key: "songs", label: "Songs", n: 1, f: fmt }, { key: "songs_share_pct", label: "% of songs", n: 1, f: v => pct(v) },
               { key: "rows_share_pct", label: "% of chart spots", n: 1, f: v => pct(v) }, { key: "streams_share_pct", label: "% of streams", n: 1, f: v => pct(v) },
               { key: "avg_streams_per_row", label: "Streams per chart spot", n: 1, f: fmt },
               { key: "median_days", label: "Median days", n: 1 }, { key: "median_best_rank", label: "Median best rank", n: 1 }], C);

  const ctl = document.createElement("div"); ctl.className = "viz-controls"; box.appendChild(ctl);
  const W = 800, Ht = 330, cx = 250, cy = 165, R0 = 58, R1 = 150;
  const svg = svgIn(box, W, Ht, "A record split between solo songs and collaborations");
  const c1 = css("--series-1"), c2 = css("--series-2");
  el("circle", { cx, cy, r: R1 + 4, fill: "#151210" }, svg);
  const sA = el("path", { fill: c1 }, svg), sB = el("path", { fill: c2 }, svg);
  for (let r = R0 + 3; r < R1; r += 3.2) el("circle", { cx, cy, r, fill: "none", stroke: "#000", "stroke-opacity": .18, "stroke-width": .7 }, svg);
  el("circle", { cx, cy, r: R0, fill: css("--surface"), stroke: "#151210", "stroke-width": 3 }, svg);
  const lt = el("text", { x: cx, y: cy - 4, "text-anchor": "middle", "font-size": 12, fill: css("--ink-3") }, svg);
  const lv = el("text", { x: cx, y: cy + 15, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: css("--ink") }, svg);
  const la = el("text", { "font-size": 15, "font-weight": 700, fill: "#fff", "text-anchor": "middle" }, svg);
  const lb = el("text", { "font-size": 15, "font-weight": 700, fill: "#fff", "text-anchor": "middle" }, svg);
  // right side: legend + streams per spot
  const lx = 470;
  [[solo, c1, 70], [col, c2, 150]].forEach(([r, c, yy]) => {
    el("rect", { x: lx, y: yy - 12, width: 14, height: 14, rx: 3, fill: c }, svg);
    el("text", { x: lx + 22, y: yy, "font-size": 16, "font-weight": 700, fill: css("--ink") }, svg).textContent = r.type;
    el("text", { x: lx + 22, y: yy + 22, "font-size": 13, fill: css("--ink-2") }, svg).textContent = `${fmt(r.songs)} songs · ${fmt(r.avg_streams_per_row)} streams per chart spot`;
    el("text", { x: lx + 22, y: yy + 40, "font-size": 13, fill: css("--ink-2") }, svg).textContent = `median ${r.median_days} days charted · median best rank #${r.median_best_rank}`;
  });
  const arc = (a0, a1) => { const p = (a, r) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`, lg = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${p(a0, R1)} A ${R1} ${R1} 0 ${lg} 1 ${p(a1, R1)} L ${p(a1, R0)} A ${R0} ${R0} 0 ${lg} 0 ${p(a0, R0)} Z`; };
  const KEYS = { songs: ["songs_share_pct", "Share of songs"], spots: ["rows_share_pct", "Share of chart spots"], streams: ["streams_share_pct", "Share of streams"] };
  let cur = solo.songs_share_pct, raf = 0;
  function render(v) {
    const a = v / 100 * 2 * Math.PI;
    sA.setAttribute("d", arc(0.0001, a)); sB.setAttribute("d", arc(a, 2 * Math.PI - 0.0001));
    const mid = (a0, a1) => { const m = (a0 + a1) / 2, r = (R0 + R1) / 2; return [cx + r * Math.sin(m), cy - r * Math.cos(m) + 5]; };
    const [ax, ay] = mid(0, a), [bx, by] = mid(a, 2 * Math.PI);
    la.setAttribute("x", ax); la.setAttribute("y", ay); la.textContent = pct(v);
    lb.setAttribute("x", bx); lb.setAttribute("y", by); lb.textContent = pct(100 - v);
  }
  function go(key) {
    const target = solo[KEYS[key][0]]; lt.textContent = KEYS[key][1]; lv.textContent = "solo vs. collab";
    cancelAnimationFrame(raf);
    if (reduce) { cur = target; render(cur); return; }
    const from = cur, t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3); cur = from + (target - from) * e; render(cur); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  toggle(ctl, [["songs", "Share of songs"], ["spots", "Share of chart spots"], ["streams", "Share of streams"]], "songs", go);
  go("songs");
}

// ---- 7. Release day: calendar of all 608 days --------------------------------
function v7(R, box) {
  const Wd = R.s7_weekday, daily = Wd.daily, byW = Wd.by_weekday;
  const fri = byW.find(d => d.weekday === "Friday"), sun = byW.find(d => d.weekday === "Sunday");
  keynums("k7", [`${pct(Wd.friday_debut_share_pct)} of debuts land on Friday`, `Friday: ${big(fri.avg_daily_streams)} streams/day`,
                 `Sunday: ${big(sun.avg_daily_streams)} streams/day`]);
  table("t7", [{ key: "weekday", label: "Weekday" }, { key: "debuts", label: "Debuts", n: 1, f: fmt },
               { key: "debut_share_pct", label: "% of debuts", n: 1, f: v => pct(v) }, { key: "avg_daily_streams", label: "Avg streams per day", n: 1, f: fmt }], byW);

  const ctl = document.createElement("div"); ctl.className = "viz-controls"; box.appendChild(ctl);
  const read = document.createElement("p"); read.className = "viz-readout"; box.appendChild(read);
  const dark = matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light";
  const lo = dark ? [58, 36, 28] : [246, 234, 221], hi = dark ? [236, 132, 110] : [109, 26, 18];
  const ramp = t => `rgb(${lo.map((c, i) => Math.round(c + (hi[i] - c) * t)).join(",")})`;
  const first = new Date(daily[0].date + "T12:00:00Z"), off = (first.getUTCDay() + 6) % 7;   // Monday = 0
  const cell = 8.6, gap = 1.6, weeks = Math.ceil((daily.length + off) / 7), m = { l: 34, t: 22 };
  const W = m.l + weeks * (cell + gap) + 8, Ht = m.t + 7 * (cell + gap) + 44;
  const svg = svgIn(box, W, Ht, "Calendar of every day in the data");
  ["Mon", "", "Wed", "", "Fri", "", "Sun"].forEach((t, i) => t && (el("text", { x: m.l - 6, y: m.t + i * (cell + gap) + cell - 1, "text-anchor": "end", "font-size": 9, fill: css("--ink-3") }, svg).textContent = t));
  const rects = daily.map((d, k) => {
    const i = k + off, wk = Math.floor(i / 7), wd = i % 7;
    if (d.date.endsWith("-01") || k === 0) el("text", { x: m.l + wk * (cell + gap), y: m.t - 7, "font-size": 9, fill: css("--ink-3") }, svg).textContent =
      new Date(d.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short" }) + (d.date.slice(5, 7) === "01" || k === 0 ? " ’" + d.date.slice(2, 4) : "");
    const r = el("rect", { x: m.l + wk * (cell + gap), y: m.t + wd * (cell + gap), width: cell, height: cell, rx: 1.6 }, svg);
    return { r, d, wd };
  });
  const legend = el("g", {}, svg), ly = m.t + 7 * (cell + gap) + 20;
  let metric = "streams";
  function paint(mt) {
    metric = mt;
    const vals = daily.map(d => d[mt]), mn = mt === "debuts" ? 0 : Math.min(...vals), mx = Math.max(...vals);
    const t = v => mt === "debuts" ? Math.sqrt(v / mx) : (v - mn) / (mx - mn);
    rects.forEach(o => o.r.setAttribute("fill", ramp(t(o.d[mt]))));
    legend.innerHTML = "";
    const lab = mt === "debuts" ? "debuts that day" : "Top-200 streams that day";
    el("text", { x: m.l, y: ly + 9, "font-size": 10, fill: css("--ink-3") }, legend).textContent = mt === "debuts" ? "0" : big(mn);
    for (let i = 0; i < 12; i++) el("rect", { x: m.l + 30 + i * 12, y: ly, width: 11, height: 11, rx: 1.5, fill: ramp(i / 11) }, legend);
    el("text", { x: m.l + 30 + 12 * 12 + 6, y: ly + 9, "font-size": 10, fill: css("--ink-3") }, legend).textContent = (mt === "debuts" ? mx : big(mx)) + "  " + lab;
    const avg = byW.map(w => [w.weekday.slice(0, 3), mt === "debuts" ? w.debut_share_pct : w.avg_daily_streams]);
    read.innerHTML = mt === "debuts"
      ? `Fridays hold <b>${pct(Wd.friday_debut_share_pct)}</b> of all debuts — the bright column. <span class="hint">Share of debuts by weekday: ${avg.map(([d, v]) => `${d} ${pct(v, 0)}`).join(" · ")}</span>`
      : `Average Top-200 streams per day: <span class="hint">${avg.map(([d, v]) => `${d} ${big(v)}`).join(" · ")}</span>`;
  }
  const nice = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  rects.forEach(o => {
    o.r.style.cursor = "pointer";
    o.r.addEventListener("click", () => play(o.d.no1));
    o.r.addEventListener("pointerenter", e => { o.r.setAttribute("stroke", css("--ink")); showTip(`<b>${nice(o.d.date)}</b><br>` +
      `<span class="v">${big(o.d.streams)}</span> Top-200 streams<br><span class="v">${o.d.debuts}</span> debut${o.d.debuts === 1 ? "" : "s"}` +
      `<br><span class="m">#1 that day: ${esc(o.d.no1.track)} — ${esc(o.d.no1.artists)}</span>` + CLICK, e); });
    o.r.addEventListener("pointerleave", () => { o.r.removeAttribute("stroke"); hideTip(); });
  });
  toggle(ctl, [["streams", "Streams per day"], ["debuts", "Debuts per day"]], "streams", paint);
  paint("streams");
}

// ---- 8. Catalog vs current: stacked area with play ---------------------------
function v8(R, box) {
  const K = R.s8_catalog, M = K.by_month_streams, S = K.by_month;
  keynums("k8", [`Overall: ${pct(K.overall_share_pct)} of streams`, `${S[0].month}: ${pct(K.first_month_pct)}`, `${S.at(-1).month}: ${pct(K.last_month_pct)}`]);
  table("t8", [{ key: "month", label: "Month" }, { key: "catalog_share_pct", label: "Catalog share", n: 1, f: v => pct(v) }], S);

  const ctl = document.createElement("div"); ctl.className = "viz-controls"; box.appendChild(ctl);
  const read = document.createElement("p"); read.className = "viz-readout"; box.appendChild(read);
  const W = 800, Ht = 320, m = { l: 58, r: 20, t: 14, b: 40 }, n = M.length;
  const svg = svgIn(box, W, Ht, "Streams per day from catalog songs and current songs, by month");
  const c1 = css("--series-1"), c2 = css("--series-2");
  const x = lin(0, n - 1, m.l, W - m.r);
  const gAxes = el("g", {}, svg), gA = el("g", {}, svg);
  const areaCat = el("path", { fill: c1, "fill-opacity": .88 }, gA), areaCur = el("path", { fill: c2, "fill-opacity": .55 }, gA);
  const clip = el("clipPath", { id: "v8clip" }, svg), clipR = el("rect", { x: 0, y: 0, width: W, height: Ht }, clip);
  gA.setAttribute("clip-path", "url(#v8clip)");
  const vline = el("line", { y1: m.t, y2: Ht - m.b, stroke: css("--ink"), "stroke-opacity": 0, "stroke-width": 1 }, svg);
  const lg = el("g", {}, svg);
  [[c1, "Catalog (on the chart over a year)", .88], [c2, "Current", .55]].forEach(([c, t, o], i) => {
    el("rect", { x: m.l + 10 + i * 250, y: m.t + 4, width: 12, height: 12, rx: 2, fill: c, "fill-opacity": o }, lg);
    el("text", { x: m.l + 28 + i * 250, y: m.t + 14, "font-size": 12, fill: css("--ink") }, lg).textContent = t; });
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: Ht - m.t - m.b, fill: "transparent" }, svg);
  let mode = "share", y;
  function draw() {
    gAxes.innerHTML = "";
    const top = mode === "share" ? 100 : Math.max(...M.map(d => d.catalog_per_day + d.current_per_day)) * 1.08 / 1e6;
    y = lin(0, top, Ht - m.b, m.t);
    const ticks = mode === "share" ? [0, 25, 50, 75, 100] : [0, 25, 50, 75, 100, 125].filter(t => t <= top);
    axisY(gAxes, y, m.l, ticks, v => mode === "share" ? v + "%" : v + "M", W - m.r);
    axisX(gAxes, x, Ht - m.b, M.map((_, i) => i).filter(i => i % 3 === 0),
      i => new Date(M[i].month + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit" }), m.l, W - m.r);
    const cat = M.map(d => mode === "share" ? d.catalog_per_day / (d.catalog_per_day + d.current_per_day) * 100 : d.catalog_per_day / 1e6);
    const tot = M.map(d => mode === "share" ? 100 : (d.catalog_per_day + d.current_per_day) / 1e6);
    const P = (arr) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    areaCat.setAttribute("d", `M ${x(0)},${y(0)} L ${P(cat).join(" L ")} L ${x(n - 1)},${y(0)} Z`);
    areaCur.setAttribute("d", `M ${P(cat).join(" L ")} L ${P(tot).reverse().join(" L ")} Z`);
  }
  function show(i) {
    const d = M[i], tot = d.catalog_per_day + d.current_per_day;
    vline.setAttribute("x1", x(i)); vline.setAttribute("x2", x(i)); vline.setAttribute("stroke-opacity", .5);
    const lab = new Date(d.month + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric" });
    read.innerHTML = `${lab}: catalog songs earned <b>${pct(d.catalog_per_day / tot * 100)}</b> of streams ` +
      `<span class="hint">(${big(d.catalog_per_day)} of ${big(tot)} streams per day)</span>`;
  }
  hit.addEventListener("pointermove", e => show(Math.max(0, Math.min(n - 1, Math.round(x.inv(svgPoint(svg, e).x))))));
  toggle(ctl, [["share", "Share of streams"], ["streams", "Streams per day"]], "share", v => { mode = v; draw(); });
  const play = document.createElement("button"); play.type = "button"; play.className = "play"; play.textContent = "▶ Play the months"; ctl.appendChild(play);
  let raf = 0;
  play.addEventListener("click", () => {
    cancelAnimationFrame(raf);
    if (reduce) { clipR.setAttribute("width", W); show(n - 1); return; }
    const t0 = performance.now(), dur = 6000;
    const step = t => { const k = Math.min(1, (t - t0) / dur), i = Math.round(k * (n - 1));
      clipR.setAttribute("width", x(k * (n - 1)) + 1); show(i); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  });
  draw(); show(n - 1);
}
})();

// dashboard.html — loads data/dashboard.json and does every calculation in the browser.
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = n => Math.round(n).toLocaleString("en-US");
const big = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : fmt(n);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BANDS = ["#1-10", "#11-50", "#51-100", "#101-200"];
const STATUS = ["Returning", "Debut", "Re-entry"];
const MEASURES = {
  streams: { label: "Total streams", f: g => g.s, fmt: big },
  spots:   { label: "Chart spots", f: g => g.n, fmt: fmt },
  avg:     { label: "Avg streams per spot", f: g => g.n ? g.s / g.n : 0, fmt: big },
  songs:   { label: "Different songs", f: g => g.songs.size, fmt: fmt },
};
const DIMS = { artist: "Lead artist", label: "Label", song: "Song", type: "Song type", status: "Entry status" };

let D, months, rowMonth, rowWeekday, charts = {};
const songOf = new Map();   // song breakdown: group label -> song index (for the play buttons)
const escA = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const state = { measure: "streams", dim: "artist" };

const newGroup = () => ({ s: 0, n: 0, songs: new Set() });
function add(map, key, s, t) {
  let g = map.get(key); if (!g) map.set(key, g = newGroup());
  g.s += s; g.n += 1; g.songs.add(t);
}

function readFilters() {
  const artistTxt = $("f-artist").value.trim().toLowerCase();
  const labelTxt = $("f-label").value.trim().toLowerCase();
  const artist = artistTxt ? D.artists.findIndex(a => a.toLowerCase() === artistTxt) : -1;
  const label = labelTxt ? D.labels.findIndex(l => l.toLowerCase() === labelTxt) : -1;
  return {
    from: +$("f-from").value, to: +$("f-to").value,
    artistTxt, artist, labelTxt, label,
    type: $("f-type").value, cat: $("f-cat").value, rankMax: +$("f-rank").value,
  };
}

function compute(F) {
  const T = { s: 0, n: 0, songs: new Set(), artists: new Set(), debuts: 0 };
  songOf.clear();
  const byMonth = new Map(), byGroup = new Map(), byWd = new Map(), byBand = new Map();
  const tr = D.tracks, N = D.s.length;
  for (let i = 0; i < N; i++) {
    const m = rowMonth[i]; if (m < F.from || m > F.to) continue;
    const r = D.r[i]; if (r > F.rankMax) continue;
    const t = D.t[i], k = tr[t];
    if (F.artistTxt && k[2] !== F.artist) continue;
    if (F.labelTxt && D.l[i] !== F.label) continue;
    if (F.type !== "" && k[3] !== +F.type) continue;
    if (F.cat !== "" && D.c[i] !== +F.cat) continue;
    const s = D.s[i];
    T.s += s; T.n += 1; T.songs.add(t); T.artists.add(k[2]); if (D.e[i] === 1) T.debuts++;
    add(byMonth, m, s, t);
    add(byWd, rowWeekday[i], s, t);
    add(byBand, r <= 10 ? 0 : r <= 50 ? 1 : r <= 100 ? 2 : 3, s, t);
    const key = state.dim === "artist" ? D.artists[k[2]] : state.dim === "label" ? D.labels[D.l[i]]
              : state.dim === "song" ? `${k[0]} — ${k[1]}${k[4] > 1 ? ` (across ${k[4]} versions)` : ""}` : state.dim === "type" ? (k[3] ? "Collaboration" : "Solo")
              : STATUS[D.e[i]];
    add(byGroup, key, s, t);
    if (state.dim === "song") songOf.set(key, t);
  }
  return { T, byMonth, byGroup, byWd, byBand };
}

function barOpts(horizontal, M) {
  const ink2 = css("--ink-2"), line = css("--line");
  const val = { beginAtZero: true, grid: { color: line }, ticks: { color: ink2, callback: v => M.fmt(v) } };
  const cat = { grid: { display: false }, ticks: { color: ink2, autoSkip: !horizontal,
                callback: function (v) { const l = this.getLabelForValue(v); return l.length > 28 ? l.slice(0, 27) + "…" : l; } } };
  return { responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? "y" : "x",
           interaction: { mode: "index", intersect: false, axis: horizontal ? "y" : "x" },
           plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${M.label}: ${M.fmt(c.raw)}` } } },
           scales: horizontal ? { x: val, y: cat } : { x: cat, y: val } };
}
function draw(id, type, labels, values, horizontal = false) {
  const M = MEASURES[state.measure], accent = css("--accent");
  const ds = type === "line"
    ? { data: values, borderColor: accent, backgroundColor: accent, borderWidth: 2, pointRadius: 3, tension: 0 }
    : { data: values, backgroundColor: accent, borderRadius: 4, borderSkipped: "start", maxBarThickness: 32 };
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), { type, data: { labels, datasets: [ds] }, options: barOpts(horizontal, M) });
}

function render() {
  const F = readFilters();
  const warn = [];
  if (F.artistTxt && F.artist < 0) warn.push(`no lead artist named “${$("f-artist").value}”`);
  if (F.labelTxt && F.label < 0) warn.push(`no label named “${$("f-label").value}”`);
  if (F.from > F.to) warn.push("“From” is after “To”");
  const { T, byMonth, byGroup, byWd, byBand } = compute(F);
  const M = MEASURES[state.measure];
  $("status").textContent = warn.length ? "Check filters: " + warn.join("; ") + "." :
    `${fmt(T.n)} chart rows match (${months[F.from]} to ${months[F.to]}).`;

  $("k-streams").textContent = big(T.s);
  $("k-songs").textContent = fmt(T.songs.size);
  $("k-artists").textContent = fmt(T.artists.size);
  $("k-avg").textContent = T.n ? fmt(T.s / T.n) : "–";
  $("k-debuts").textContent = fmt(T.debuts);

  const mIdx = []; for (let m = F.from; m <= F.to; m++) mIdx.push(m);
  $("ch1-title").textContent = `${M.label} by month`;
  draw("ch1", "line", mIdx.map(m => months[m]), mIdx.map(m => byMonth.has(m) ? M.f(byMonth.get(m)) : 0));

  const groups = [...byGroup.entries()].map(([k, g]) => ({ k, g, v: M.f(g) })).sort((a, b) => b.v - a.v);
  $("ch2-title").textContent = `Top 10 by ${DIMS[state.dim].toLowerCase()} — ${M.label.toLowerCase()}`;
  const top = groups.slice(0, 10);
  draw("ch2", "bar", top.map(x => x.k), top.map(x => x.v), true);

  $("ch3-title").textContent = `${M.label} by weekday`;
  draw("ch3", "bar", WEEKDAYS, WEEKDAYS.map((_, i) => byWd.has(i) ? M.f(byWd.get(i)) : 0));
  $("ch4-title").textContent = `${M.label} by chart position`;
  draw("ch4", "bar", BANDS, BANDS.map((_, i) => byBand.has(i) ? M.f(byBand.get(i)) : 0));

  $("tbl-title").textContent = `Numbers behind the current view — by ${DIMS[state.dim].toLowerCase()} (${fmt(groups.length)} groups)`;
  const rows = groups.slice(0, 50).map((x, i) => { const si = songOf.get(x.k), tr = si !== undefined ? D.tracks[si] : null;
      const btn = tr ? `<button type="button" class="play-btn" data-play-id="${tr[5]}" data-play-t="${escA(tr[0])}" data-play-a="${escA(tr[1])}" aria-label="Play ${escA(tr[0])}" title="Play"></button>` : "";
      return `<tr><td class="n">${i + 1}</td><td>${btn}${escA(x.k)}</td>
      <td class="n">${fmt(x.g.s)}</td><td class="n">${T.s ? (100 * x.g.s / T.s).toFixed(1) + "%" : "–"}</td>
      <td class="n">${fmt(x.g.n)}</td><td class="n">${fmt(x.g.s / x.g.n)}</td><td class="n">${fmt(x.g.songs.size)}</td></tr>`; }).join("");
  $("tbl").innerHTML = `<table><thead><tr><th class="n">#</th><th>${DIMS[state.dim]}</th><th class="n">Total streams</th>
      <th class="n">Share of streams</th><th class="n">Chart spots</th><th class="n">Avg streams per spot</th>
      <th class="n">Different songs</th></tr></thead><tbody>${rows ||
      '<tr><td colspan="7">No chart rows match these filters.</td></tr>'}</tbody></table>`;
}

function setupSwitch(id, key) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    state[key] = b.dataset.v;
    $(id).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    render();
  });
}
function reset() {
  $("f-from").value = 0; $("f-to").value = months.length - 1;
  ["f-artist", "f-label", "f-type", "f-cat"].forEach(id => $(id).value = "");
  $("f-rank").value = "200";
  state.measure = "streams"; state.dim = "artist";
  for (const [id, v] of [["sw-measure", "streams"], ["sw-dim", "artist"]])
    $(id).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === v));
  render();
}

fetch("data/dashboard.json").then(r => r.json()).then(data => {
  D = data;
  Chart.defaults.font.family = css("--font");
  months = [...new Set(D.dates.map(d => d.slice(0, 7)))];
  const mOf = D.dates.map(d => months.indexOf(d.slice(0, 7)));
  const wdOf = D.dates.map(d => (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7); // Mon=0
  rowMonth = Int16Array.from(D.d, x => mOf[x]);
  rowWeekday = Int8Array.from(D.d, x => wdOf[x]);
  const opts = months.map((m, i) => `<option value="${i}">${m}</option>`).join("");
  $("f-from").innerHTML = opts; $("f-to").innerHTML = opts;
  $("artist-list").innerHTML = D.artists.map(a => `<option value="${a.replace(/"/g, "&quot;")}">`).join("");
  $("label-list").innerHTML = D.labels.map(a => `<option value="${a.replace(/"/g, "&quot;")}">`).join("");
  ["f-from", "f-to", "f-type", "f-cat", "f-rank", "f-artist", "f-label"].forEach(id => $(id).addEventListener("change", render));
  $("reset").addEventListener("click", reset);
  setupSwitch("sw-measure", "measure"); setupSwitch("sw-dim", "dim");
  reset();
}).catch(err => {
  $("status").textContent = `Could not load data/dashboard.json (${err}). If you opened the file directly, run "python3 -m http.server" and open http://localhost:8000/dashboard.html.`;
});

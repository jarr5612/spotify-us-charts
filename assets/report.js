// Fills index.html from data/report.json (built by scripts/analysis.py).
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = n => n.toLocaleString("en-US");
const big = n => n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : fmt(n);
const pct = n => n.toFixed(1) + "%";
const get = (o, path) => path.split(".").reduce((a, k) => a[k], o);

function keynums(id, items) {
  document.getElementById(id).innerHTML = items.map(t => `<li>${t}</li>`).join("");
}
function table(id, cols, rows) {
  const head = cols.map(c => `<th class="${c.n ? "n" : ""}">${c.label}</th>`).join("");
  const body = rows.map(r => "<tr>" + cols.map(c => `<td class="${c.n ? "n" : ""}">${c.f ? c.f(r[c.key]) : r[c.key]}</td>`).join("") + "</tr>").join("");
  document.getElementById(id).innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function baseOptions({ horizontal = false, yLabel = "", xLabel = "", legend = false, tip } = {}) {
  const ink2 = css("--ink-2"), line = css("--line");
  const valueAxis = { beginAtZero: true, grid: { color: line }, ticks: { color: ink2 },
                      title: { display: !!(horizontal ? xLabel : yLabel), text: horizontal ? xLabel : yLabel, color: ink2 } };
  const catAxis = { grid: { display: false }, ticks: { color: ink2, autoSkip: false },
                    title: { display: !!(horizontal ? yLabel : xLabel), text: horizontal ? yLabel : xLabel, color: ink2 } };
  return {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: legend, labels: { color: ink2 } },
               tooltip: tip ? { callbacks: { label: tip } } : {} },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
  };
}
const bar = (color) => ({ backgroundColor: color, borderRadius: 4, borderSkipped: "start", maxBarThickness: 36 });

fetch("data/report.json").then(r => r.json()).then(R => {
  Chart.defaults.font.family = css("--font");
  const accent = css("--accent");

  document.querySelectorAll("[data-f]").forEach(el => {
    const v = get(R, el.dataset.f); el.textContent = typeof v === "number" ? fmt(v) : v;
  });
  document.getElementById("range").textContent = `${R.meta.first_date} to ${R.meta.last_date}`;
  const H = R.headline;
  document.getElementById("h1").textContent = big(H.total_streams);
  document.getElementById("h2").textContent = fmt(H.unique_songs);
  document.getElementById("h3").textContent = fmt(H.unique_lead_artists);
  document.getElementById("h4").textContent = fmt(H.songs_reaching_no1);

  // 1 — artists
  const A = R.s1_artists;
  keynums("k1", [`#1 artist: ${A.top10[0].artist}, ${pct(A.top10[0].share_pct)} of streams`,
                 `Top 10 artists: ${pct(A.top10_share_pct)}`,
                 `Top 1% of artists (${A.top1pct_n} of ${fmt(A.n_artists)}): ${pct(A.top1pct_share_pct)}`]);
  new Chart(c1, { type: "bar", data: { labels: A.top10.map(d => d.artist),
    datasets: [{ label: "Share of streams", data: A.top10.map(d => d.share_pct), ...bar(accent) }] },
    options: baseOptions({ horizontal: true, xLabel: "% of all Top-200 streams",
      tip: c => ` ${pct(c.raw)} (${big(A.top10[c.dataIndex].streams)} streams)` }) });
  table("t1", [{ key: "artist", label: "Lead artist" }, { key: "streams", label: "Streams", n: 1, f: fmt },
               { key: "share_pct", label: "Share", n: 1, f: pct }], A.top10);

  // 2 — song concentration
  const S = R.s2_songs;
  keynums("k2", [`Top 10 songs: ${pct(S.top10_share_pct)} of streams`, `Top 100 of ${fmt(S.n_songs)}: ${pct(S.top100_share_pct)}`,
                 `#1 song: ${S.top10[0].track} (${big(S.top10[0].streams)})`]);
  new Chart(c2, { type: "line", data: { labels: S.curve.map(d => d.top_n === S.n_songs ? `All ${fmt(d.top_n)}` : `Top ${fmt(d.top_n)}`),
    datasets: [{ label: "Cumulative share", data: S.curve.map(d => d.share_pct), borderColor: accent, backgroundColor: accent,
                 borderWidth: 2, pointRadius: 4, tension: 0 }] },
    options: { ...baseOptions({ yLabel: "% of all streams", xLabel: "Songs, ranked by streams", tip: c => ` ${pct(c.raw)} of streams` }),
               scales: { ...baseOptions({ yLabel: "% of all streams", xLabel: "Songs, ranked by streams" }).scales,
                         y: { ...baseOptions({ yLabel: "% of all streams" }).scales.y, max: 100 } } } });
  table("t2", [{ key: "track", label: "Song" }, { key: "artists", label: "Artists" }, { key: "streams", label: "Streams", n: 1, f: fmt },
               { key: "days", label: "Days charted", n: 1 }], S.top10);

  // 3 — #1 runs
  const N = R.s3_no1;
  keynums("k3", [`${N.n_songs} songs reached #1`, `Median time at #1: ${N.median_days_at_1} days`,
                 `${N.one_day_only} held it only 1 day`, `Longest: ${N.top10[0].track}, ${N.top10[0].days_at_1} days`]);
  new Chart(c3, { type: "bar", data: { labels: N.top10.map(d => d.track),
    datasets: [{ label: "Days at #1", data: N.top10.map(d => d.days_at_1), ...bar(accent) }] },
    options: baseOptions({ horizontal: true, xLabel: "Days at #1", tip: c => ` ${c.raw} days — ${N.top10[c.dataIndex].artists}` }) });
  table("t3", [{ key: "track", label: "Song" }, { key: "artists", label: "Artists" }, { key: "days_at_1", label: "Days at #1", n: 1 }], N.top10);

  // 4 — lifespan
  const L = R.s4_lifespan;
  keynums("k4", [`Median: ${L.median_days} days on the chart`, `${pct(L.one_day_pct)} charted exactly 1 day`,
                 `${L.all_days} songs charted all ${R.meta.days} days`]);
  new Chart(c4, { type: "bar", data: { labels: L.histogram.map(d => d.bucket),
    datasets: [{ label: "Songs", data: L.histogram.map(d => d.songs), ...bar(accent) }] },
    options: baseOptions({ yLabel: "Number of songs", xLabel: "Days charted", tip: c => ` ${fmt(c.raw)} songs (${pct(L.histogram[c.dataIndex].share_pct)})` }) });
  table("t4", [{ key: "bucket", label: "Days charted" }, { key: "songs", label: "Songs", n: 1, f: fmt },
               { key: "share_pct", label: "Share of songs", n: 1, f: pct }], L.histogram);

  // 5 — debut rank
  const D = R.s5_debut;
  keynums("k5", [`${fmt(D.n_debuts)} debuts`, ...D.bands.slice(0, 2).map(b => `Debut ${b.debut_rank}: median ${b.median_days} days`)]);
  new Chart(c5, { type: "bar", data: { labels: D.bands.map(d => "Debut rank " + d.debut_rank),
    datasets: [{ label: "Median days charted", data: D.bands.map(d => d.median_days), ...bar(accent) }] },
    options: baseOptions({ yLabel: "Median days on chart", tip: c => ` median ${c.raw} days (${fmt(D.bands[c.dataIndex].songs)} songs)` }) });
  table("t5", [{ key: "debut_rank", label: "Debut rank" }, { key: "songs", label: "Songs", n: 1, f: fmt },
               { key: "median_days", label: "Median days", n: 1 }, { key: "mean_days", label: "Average days", n: 1 }], D.bands);

  // 6 — solo vs collab (two series on one % axis)
  const C = R.s6_collab;
  keynums("k6", C.map(r => `${r.type}: ${fmt(r.avg_streams_per_row)} streams per chart spot`)
                 .concat([`Median days charted: ${C[0].median_days} vs ${C[1].median_days}`]));
  new Chart(c6, { type: "bar", data: { labels: ["Share of songs", "Share of streams"],
    datasets: C.map((r, i) => ({ label: r.type, data: [r.songs_share_pct, r.streams_share_pct],
                                ...bar(css(i ? "--series-2" : "--series-1")) })) },
    options: baseOptions({ yLabel: "%", legend: true, tip: c => ` ${c.dataset.label}: ${pct(c.raw)}` }) });
  table("t6", [{ key: "type", label: "" }, { key: "songs", label: "Songs", n: 1, f: fmt }, { key: "songs_share_pct", label: "% of songs", n: 1, f: pct },
               { key: "streams_share_pct", label: "% of streams", n: 1, f: pct }, { key: "avg_streams_per_row", label: "Streams per chart spot", n: 1, f: fmt },
               { key: "median_days", label: "Median days", n: 1 }, { key: "median_best_rank", label: "Median best rank", n: 1 }], C);

  // 7 — weekday (two charts, one axis each)
  const W = R.s7_weekday.by_weekday, wl = W.map(d => d.weekday.slice(0, 3));
  const fri = W.find(d => d.weekday === "Friday"), sun = W.find(d => d.weekday === "Sunday");
  keynums("k7", [`${pct(R.s7_weekday.friday_debut_share_pct)} of debuts land on Friday`,
                 `Friday: ${big(fri.avg_daily_streams)} streams/day`, `Sunday: ${big(sun.avg_daily_streams)} streams/day`]);
  new Chart(c7a, { type: "bar", data: { labels: wl, datasets: [{ label: "% of debuts", data: W.map(d => d.debut_share_pct),
    ...bar(accent) }] }, options: baseOptions({ yLabel: "% of debuts", tip: c => ` ${pct(c.raw)} (${fmt(W[c.dataIndex].debuts)} debuts)` }) });
  new Chart(c7b, { type: "bar", data: { labels: wl, datasets: [{ label: "Avg streams per day (M)", data: W.map(d => +(d.avg_daily_streams / 1e6).toFixed(1)),
    ...bar(accent) }] }, options: baseOptions({ yLabel: "Millions of streams", tip: c => ` ${c.raw}M streams` }) });
  table("t7", [{ key: "weekday", label: "Weekday" }, { key: "debuts", label: "Debuts", n: 1, f: fmt }, { key: "debut_share_pct", label: "% of debuts", n: 1, f: pct },
               { key: "avg_daily_streams", label: "Avg streams per day", n: 1, f: fmt }], W);

  // 8 — catalog share
  const K = R.s8_catalog;
  keynums("k8", [`Overall: ${pct(K.overall_share_pct)} of streams`, `${K.by_month[0].month}: ${pct(K.first_month_pct)}`,
                 `${K.by_month.at(-1).month}: ${pct(K.last_month_pct)}`]);
  new Chart(c8, { type: "line", data: { labels: K.by_month.map(d => d.month),
    datasets: [{ label: "Catalog share", data: K.by_month.map(d => d.catalog_share_pct), borderColor: accent, backgroundColor: accent,
                 borderWidth: 2, pointRadius: 3, tension: 0 }] },
    options: baseOptions({ yLabel: "% of streams from catalog songs", tip: c => ` ${pct(c.raw)}` }) });
  table("t8", [{ key: "month", label: "Month" }, { key: "catalog_share_pct", label: "Catalog share", n: 1, f: pct }], K.by_month);
}).catch(err => {
  document.querySelector("main").insertAdjacentHTML("afterbegin",
    `<p class="placeholder">Could not load data/report.json (${err}). If you opened this file directly, run a local server: <code>python3 -m http.server</code> and open http://localhost:8000.</p>`);
});

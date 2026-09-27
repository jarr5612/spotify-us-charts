// The record player beside the report.
// The record is the report: each finding is a track cut into the vinyl.
// As you scroll, the tonearm moves through the tracks (its position = where you are
// in the report) and the record turns while you are in the findings.
// Click a groove band or a track in the list to drop the needle there.
(function () {
  const svg = document.getElementById("deck");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };

  // ---- the tracks = the report's finding sections ----
  const sections = [...document.querySelectorAll("section.finding[id^='s']")];
  const tracks = sections.map((s, i) => {
    const tag = (s.querySelector(".num")?.textContent || "").split("·").pop().trim();
    return { id: s.id, n: i + 1, name: tag || `Finding ${i + 1}` };
  });
  const N = tracks.length;

  // ---- geometry (viewBox 320 x 334) ----
  const C = { x: 150, y: 146 };          // spindle
  const R_PLATTER = 128, R_REC = 121, R_LEADIN = 117, R_RUNOUT = 48, R_LABEL = 41;
  const P = { x: 288, y: 46 };           // tonearm pivot
  const L = 188;                          // pivot to stylus
  const bandW = (R_LEADIN - R_RUNOUT) / N, GAP = 1.6;
  const bandOuter = i => R_LEADIN - i * bandW;           // outer radius of track i (0-based)
  const bandInner = i => R_LEADIN - (i + 1) * bandW + GAP;

  // ---- defs: wood, felt, metal, vinyl sheen, shadows ----
  const defs = el("defs", {}, svg);
  defs.innerHTML = `
    <filter id="d-wood" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".006 .16" numOctaves="3" seed="11" result="n"/>
      <feColorMatrix in="n" values="0 0 0 0 .20  0 0 0 0 .10  0 0 0 0 .04  0 0 0 .55 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="d-felt" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="3"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .35 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="d-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="3" dy="5" stdDeviation="3.2" flood-color="#1a0d05" flood-opacity=".55"/>
    </filter>
    <filter id="d-soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity=".6"/>
    </filter>
    <linearGradient id="d-plinth" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7b4a2b"/><stop offset=".5" stop-color="#5e371f"/><stop offset="1" stop-color="#3f2415"/>
    </linearGradient>
    <linearGradient id="d-bevel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b98a5c" stop-opacity=".55"/><stop offset=".06" stop-color="#000" stop-opacity="0"/>
      <stop offset=".94" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/>
    </linearGradient>
    <radialGradient id="d-mat" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#4a1f18"/><stop offset=".97" stop-color="#3a1611"/><stop offset="1" stop-color="#241009"/>
    </radialGradient>
    <linearGradient id="d-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1efe9"/><stop offset=".45" stop-color="#8f8c86"/><stop offset=".6" stop-color="#d8d5ce"/><stop offset="1" stop-color="#5f5c57"/>
    </linearGradient>
    <linearGradient id="d-chrome" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5d5a55"/><stop offset=".3" stop-color="#f3f1ec"/><stop offset=".55" stop-color="#b5b2ab"/><stop offset="1" stop-color="#4f4c48"/>
    </linearGradient>
    <radialGradient id="d-knob" cx=".38" cy=".32" r=".75">
      <stop offset="0" stop-color="#f7f5f0"/><stop offset=".55" stop-color="#a9a6a0"/><stop offset="1" stop-color="#4e4b47"/>
    </radialGradient>
    <radialGradient id="d-label" cx=".4" cy=".35" r=".75">
      <stop offset="0" stop-color="#b23b2b"/><stop offset=".7" stop-color="#8b2318"/><stop offset="1" stop-color="#6a170f"/>
    </radialGradient>
    <radialGradient id="d-sheen" gradientUnits="userSpaceOnUse" cx="${C.x}" cy="${C.y}" r="${R_REC}">
      <stop offset=".34" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity=".09"/>
      <stop offset=".85" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="d-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
    <linearGradient id="d-brass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e2c27a"/><stop offset=".5" stop-color="#b8862b"/><stop offset="1" stop-color="#8a6420"/>
    </linearGradient>
    <path id="d-arc-top" d="M ${C.x - 30} ${C.y} A 30 30 0 0 1 ${C.x + 30} ${C.y}"/>
    <path id="d-arc-bot" d="M ${C.x - 35} ${C.y} A 35 35 0 0 0 ${C.x + 35} ${C.y}"/>`;

  // ---- plinth ----
  el("rect", { x: 4, y: 4, width: 312, height: 326, rx: 11, fill: "url(#d-plinth)", filter: "url(#d-shadow)" }, svg);
  el("rect", { x: 4, y: 4, width: 312, height: 326, rx: 11, fill: "#000", filter: "url(#d-wood)" }, svg);
  el("rect", { x: 4, y: 4, width: 312, height: 326, rx: 11, fill: "url(#d-bevel)" }, svg);
  el("rect", { x: 8.5, y: 8.5, width: 303, height: 317, rx: 8, fill: "none", stroke: "#2a160b", "stroke-opacity": .5 }, svg);

  // ---- platter + felt mat ----
  el("circle", { cx: C.x, cy: C.y, r: R_PLATTER, fill: "url(#d-rim)", filter: "url(#d-soft)" }, svg);
  el("circle", { cx: C.x, cy: C.y, r: R_PLATTER - 3, fill: "url(#d-mat)" }, svg);
  el("circle", { cx: C.x, cy: C.y, r: R_PLATTER - 3, fill: "#000", filter: "url(#d-felt)" }, svg);

  // ---- the record (this group turns) ----
  const rec = el("g", { class: "d-record" }, svg);
  el("circle", { cx: C.x, cy: C.y, r: R_REC, fill: "#0e0d0c", filter: "url(#d-soft)" }, rec);
  el("circle", { cx: C.x, cy: C.y, r: R_REC - .6, fill: "none", stroke: "#2a2826", "stroke-width": 1.2 }, rec);
  // lead-in and run-out: smooth, slightly glossy vinyl
  el("circle", { cx: C.x, cy: C.y, r: (R_REC + R_LEADIN) / 2, fill: "none", stroke: "#1b1a18", "stroke-width": R_REC - R_LEADIN }, rec);
  el("circle", { cx: C.x, cy: C.y, r: (R_RUNOUT + R_LABEL) / 2, fill: "none", stroke: "#181715", "stroke-width": R_RUNOUT - R_LABEL }, rec);
  // grooves inside each track, and a glossy gap between tracks
  const bands = [];
  for (let i = 0; i < N; i++) {
    const g = el("g", { class: "d-band", "data-i": i }, rec);
    for (let r = bandOuter(i) - .5; r > bandInner(i); r -= .85)
      el("circle", { cx: C.x, cy: C.y, r: r.toFixed(2), fill: "none", stroke: (Math.round(r * 7) % 3) ? "#161513" : "#211f1c", "stroke-width": .55 }, g);
    const hi = el("circle", { cx: C.x, cy: C.y, r: ((bandOuter(i) + bandInner(i)) / 2).toFixed(2), fill: "none",
                              class: "d-band-hi", "stroke-width": (bandOuter(i) - bandInner(i)).toFixed(2) }, g);
    if (i < N - 1) el("circle", { cx: C.x, cy: C.y, r: (bandInner(i) - GAP / 2).toFixed(2), fill: "none", stroke: "#34312d", "stroke-width": GAP * .8 }, rec);
    const title = el("title", {}, g); title.textContent = `Track ${String(i + 1).padStart(2, "0")} · ${tracks[i].name}`;
    bands.push({ g, hi });
  }
  // a few pressing marks so the turning is visible
  for (const [a, r0, r1] of [[12, 60, 112], [131, 72, 96], [247, 55, 80]]) {
    const t = a * Math.PI / 180;
    el("line", { x1: C.x + r0 * Math.cos(t), y1: C.y + r0 * Math.sin(t), x2: C.x + r1 * Math.cos(t), y2: C.y + r1 * Math.sin(t),
                 stroke: "#ffffff", "stroke-opacity": .035, "stroke-width": 3 }, rec);
  }
  // label
  el("circle", { cx: C.x, cy: C.y, r: R_LABEL, fill: "url(#d-label)" }, rec);
  el("circle", { cx: C.x, cy: C.y, r: R_LABEL - 3, fill: "none", stroke: "#f3e3c3", "stroke-opacity": .55, "stroke-width": .5 }, rec);
  const t1 = el("text", { class: "d-arc" }, rec);
  el("textPath", { href: "#d-arc-top", startOffset: "50%", "text-anchor": "middle" }, t1).textContent = "THE US TOP 200";
  const t2 = el("text", { class: "d-arc d-arc-sm" }, rec);
  el("textPath", { href: "#d-arc-bot", startOffset: "50%", "text-anchor": "middle" }, t2).textContent = "SIDE A · 33⅓ R.P.M. · 2025–2026";
  el("line", { x1: C.x - 17, y1: C.y + 7, x2: C.x + 17, y2: C.y + 7, stroke: "#f3e3c3", "stroke-opacity": .45, "stroke-width": .35 }, rec);
  const labTrack = el("text", { x: C.x, y: C.y + 13, class: "d-lab-k", "text-anchor": "middle" }, rec);
  const labName = el("text", { x: C.x, y: C.y + 21, class: "d-lab-t", "text-anchor": "middle" }, rec);
  labTrack.textContent = "SIDE A"; labName.textContent = `${N} tracks`;

  // fixed light reflection (does not turn with the record), then spindle
  const sheen = el("g", { "pointer-events": "none", filter: "url(#d-blur)" }, svg);
  const wedge = (a0, a1, r0, r1) => {
    const p = (a, r) => `${C.x + r * Math.cos(a * Math.PI / 180)} ${C.y + r * Math.sin(a * Math.PI / 180)}`;
    return `M ${p(a0, r0)} L ${p(a0, r1)} A ${r1} ${r1} 0 0 1 ${p(a1, r1)} L ${p(a1, r0)} A ${r0} ${r0} 0 0 0 ${p(a0, r0)} Z`;
  };
  el("path", { d: wedge(-64, -26, R_LABEL + 4, R_REC - 3), fill: "url(#d-sheen)" }, sheen);
  el("path", { d: wedge(116, 154, R_LABEL + 4, R_REC - 3), fill: "url(#d-sheen)", opacity: .75 }, sheen);
  el("circle", { cx: C.x, cy: C.y, r: 3.4, fill: "url(#d-knob)", filter: "url(#d-soft)" }, svg);

  // ---- brass plate ----
  el("rect", { x: 26, y: 294, width: 150, height: 20, rx: 2, fill: "url(#d-brass)", filter: "url(#d-soft)" }, svg);
  el("rect", { x: 28.5, y: 296.5, width: 145, height: 15, rx: 1.5, fill: "none", stroke: "#6e4f16", "stroke-opacity": .6, "stroke-width": .5 }, svg);
  const plate = el("text", { x: 101, y: 307.3, class: "d-plate", "text-anchor": "middle" }, svg);
  plate.textContent = "THE US TOP 200 · SIDE A";

  // ---- speed knob and arm lift (decorative, period style) ----
  el("circle", { cx: 246, cy: 306, r: 11, fill: "#2a1a10", filter: "url(#d-soft)" }, svg);
  el("circle", { cx: 246, cy: 306, r: 9, fill: "url(#d-knob)" }, svg);
  el("line", { x1: 246, y1: 306, x2: 246, y2: 298.5, stroke: "#3a2a1e", "stroke-width": 1.4 }, svg);
  for (const [dx, t] of [[-17, "33"], [17, "45"]]) { const x = el("text", { x: 246 + dx, y: 309, class: "d-knob-t", "text-anchor": "middle" }, svg); x.textContent = t; }

  // ---- tonearm ----
  const armRest = { x: P.x, y: P.y + L - 20 };
  el("rect", { x: armRest.x - 5, y: armRest.y - 4, width: 10, height: 18, rx: 2, fill: "#241a14", filter: "url(#d-soft)" }, svg);
  el("path", { d: `M ${armRest.x - 7} ${armRest.y - 5} q 7 6 14 0`, stroke: "url(#d-chrome)", "stroke-width": 3, fill: "none" }, svg);
  el("circle", { cx: P.x, cy: P.y, r: 24, fill: "#1f1712", filter: "url(#d-shadow)" }, svg);
  el("circle", { cx: P.x, cy: P.y, r: 20, fill: "url(#d-knob)" }, svg);
  el("circle", { cx: P.x, cy: P.y, r: 15, fill: "none", stroke: "#000", "stroke-opacity": .25 }, svg);
  const arm = el("g", { class: "d-arm", filter: "url(#d-shadow)" }, svg);
  el("rect", { x: P.x - 9, y: P.y - 42, width: 18, height: 22, rx: 3, fill: "url(#d-chrome)" }, arm);        // counterweight
  el("rect", { x: P.x - 9, y: P.y - 34, width: 18, height: 1.5, fill: "#000", "fill-opacity": .3 }, arm);
  el("rect", { x: P.x - 3, y: P.y - 22, width: 6, height: 20, fill: "url(#d-chrome)" }, arm);
  el("path", { d: `M ${P.x - 3} ${P.y} L ${P.x - 2.2} ${P.y + L - 26} L ${P.x + 2.2} ${P.y + L - 26} L ${P.x + 3} ${P.y} Z`, fill: "url(#d-chrome)" }, arm);
  const head = el("g", { transform: `rotate(18 ${P.x} ${P.y + L - 26})` }, arm);
  el("rect", { x: P.x - 7, y: P.y + L - 28, width: 14, height: 26, rx: 2.5, fill: "#1e1a17" }, head);
  el("rect", { x: P.x - 5.5, y: P.y + L - 26.5, width: 11, height: 23, rx: 2, fill: "url(#d-chrome)" }, head);
  el("rect", { x: P.x - 4, y: P.y + L - 14, width: 8, height: 10, rx: 1, fill: "#7a1f16" }, head);
  el("rect", { x: P.x + 5, y: P.y + L - 24, width: 8, height: 2, rx: 1, fill: "url(#d-chrome)" }, head);
  el("circle", { cx: P.x, cy: P.y, r: 8, fill: "url(#d-knob)" }, arm);
  el("circle", { cx: P.x, cy: P.y, r: 2.2, fill: "#2a2522" }, arm);

  // stylus reach: find the arm angle that puts the stylus at radius r
  const tip = th => ({ x: P.x - L * Math.sin(th), y: P.y + L * Math.cos(th) });
  const dist = th => { const t = tip(th); return Math.hypot(t.x - C.x, t.y - C.y); };
  function angleFor(r) {
    let lo = 0, hi = 1.2;                   // radians; distance falls as the arm swings in
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (dist(m) > r) lo = m; else hi = m; }
    return (lo + hi) / 2 * 180 / Math.PI;
  }
  const REST = 0;

  // ---- track list ----
  const list = document.getElementById("tracklist");
  const now = document.getElementById("player-now");
  list.innerHTML = tracks.map(t => `<li><a href="#${t.id}" data-i="${t.n - 1}"><span class="no">${String(t.n).padStart(2, "0")}</span>${t.name}</a></li>`).join("");
  const links = [...list.querySelectorAll("a")];

  // ---- state + animation ----
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let spin = 0, vel = 0, armA = REST, armTarget = REST, onRecord = false, active = -1, last = 0, raf = 0;
  let musicOn = false, musicSong = null;          // a song playing in the listening booth
  const trunc = (t, n) => t.length > n ? t.slice(0, n - 1) + "…" : t;

  function readPosition() {
    const y = window.scrollY + window.innerHeight * 0.4;
    const topOf = s => s.getBoundingClientRect().top + window.scrollY;
    if (y < topOf(sections[0])) return { i: -1 };
    for (let i = 0; i < N; i++) {
      const s = sections[i], top = topOf(s), h = (sections[i + 1] ? topOf(sections[i + 1]) : top + s.offsetHeight) - top;
      if (y < top + h) return { i, f: Math.max(0, Math.min(1, (y - top) / h)) };
    }
    return { i: N, f: 1 };                  // past the last track: run-out groove
  }
  function update() {
    const pos = readPosition();
    onRecord = pos.i >= 0 || musicOn;
    let r;
    if (pos.i < 0) armTarget = musicOn ? angleFor(R_LEADIN - 3) : REST;
    else if (pos.i >= N) { r = (R_RUNOUT + R_LABEL) / 2 + 2; armTarget = angleFor(r); }
    else { r = bandOuter(pos.i) - pos.f * (bandOuter(pos.i) - bandInner(pos.i)); armTarget = angleFor(r); }
    const i = pos.i >= 0 && pos.i < N ? pos.i : -1;
    if (i !== active) {
      active = i;
      links.forEach((a, k) => a.classList.toggle("on", k === i));
      bands.forEach((b, k) => b.g.classList.toggle("on", k === i));
      if (i >= 0) {
        labTrack.textContent = `TRACK ${String(i + 1).padStart(2, "0")}`;
        labName.textContent = tracks[i].name.length > 14 ? tracks[i].name.slice(0, 13) + "…" : tracks[i].name;
        now.innerHTML = `<span class="k">Now playing · Track ${String(i + 1).padStart(2, "0")} of ${N}</span><span class="t">${tracks[i].name}</span>`;
      } else if (pos.i >= N) {
        labTrack.textContent = "SIDE A"; labName.textContent = "run-out";
        now.innerHTML = `<span class="k">Side A · end</span><span class="t">Liner notes</span>`;
      } else {
        labTrack.textContent = "SIDE A"; labName.textContent = `${N} tracks`;
        now.innerHTML = `<span class="k">Side A</span><span class="t">Needle up. Scroll or pick a track.</span>`;
      }
    }
    if (musicOn && musicSong) { labTrack.textContent = "NOW SPINNING"; labName.textContent = trunc(musicSong.track || "", 14); }
    if (musicOn && pos.i < 0) now.innerHTML = `<span class="k">Side A · needle down</span><span class="t">Playing from the listening booth</span>`;
    kick();
  }
  function frame(t) {
    const dt = last ? Math.min(.05, (t - last) / 1000) : 0; last = t;
    const target = onRecord && !reduce ? 200 : 0;             // 33⅓ rpm = 200°/s
    vel += (target - vel) * Math.min(1, dt * (target > vel ? 1.5 : .8));
    spin = (spin + vel * dt) % 360;
    armA += (armTarget - armA) * Math.min(1, dt * (reduce ? 20 : 3.5));
    rec.setAttribute("transform", `rotate(${spin.toFixed(2)} ${C.x} ${C.y})`);
    arm.setAttribute("transform", `rotate(${armA.toFixed(3)} ${P.x} ${P.y})`);
    const still = !onRecord && vel < .3 && Math.abs(armA - armTarget) < .01;
    if (still || (reduce && Math.abs(armA - armTarget) < .01)) { raf = 0; last = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // click a groove band to drop the needle on that track
  const go = i => sections[i].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  bands.forEach((b, i) => b.g.addEventListener("click", () => go(i)));
  links.forEach(a => a.addEventListener("click", e => { e.preventDefault(); go(+a.dataset.i); history.replaceState(null, "", a.getAttribute("href")); }));

  let pending = false;
  const onScroll = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; update(); }); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  addEventListener("load", update);
  document.addEventListener("music:state", e => {
    musicOn = !!e.detail.playing; musicSong = e.detail.song;
    active = -99;                       // redraw the label
    update();
  });
  update();
})();

// Phones: the rail is a player bar at the bottom of the screen; the button opens the track list.
(function () {
  const rail = document.querySelector(".rail"), btn = document.getElementById("rail-toggle");
  if (!rail || !btn) return;
  document.body.classList.add("has-rail");
  const set = open => { rail.classList.toggle("open", open); btn.setAttribute("aria-expanded", open);
    btn.textContent = open ? "Close ▾" : "Tracks ▴"; };
  btn.addEventListener("click", () => set(!rail.classList.contains("open")));
  document.getElementById("tracklist").addEventListener("click", () => set(false));
})();

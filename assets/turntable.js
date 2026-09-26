// Interactive turntable for the report header.
// Start/stop (tonearm swings in, platter spins up and down), 33⅓ / 45 speed,
// drag the record to scratch, optional vinyl crackle made with the Web Audio API,
// and a "now playing" line that steps through the top 10 songs in data/report.json.
(function () {
  const root = document.getElementById("turntable");
  if (!root) return;
  const $ = s => root.querySelector(s);
  const record = $(".tt-record"), arm = $(".tt-arm"), power = $(".tt-power"), led = $(".tt-led");
  const speedBtns = root.querySelectorAll(".tt-speed button"), soundBtn = document.querySelector(".tt-sound");
  const labelSong = $(".tt-label-song"), labelSpeed = $(".tt-label-speed");
  const now = document.getElementById("tt-now");

  let playing = false, angle = 0, vel = 0, rpm = 33.333, last = 0, raf = 0;
  let armAngle = 0, armTarget = 0, playStart = 0;
  let dragging = false, dragPrev = 0, dragT = 0;
  let songs = [], songIx = -1;
  const REST = 0, LEAD_IN = 24, RUN_OUT = 33;         // tonearm angles (degrees)
  const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : (n / 1e6).toFixed(1) + "M";

  fetch("data/report.json").then(r => r.json()).then(R => { songs = R.s2_songs.top10; }).catch(() => {});

  function nextSong() {
    if (!songs.length) return;
    songIx = (songIx + 1) % songs.length;
    const s = songs[songIx];
    labelSong.textContent = s.track.length > 22 ? s.track.slice(0, 21) + "…" : s.track;
    now.innerHTML = `<span class="tt-now-k">Now playing · No. ${songIx + 1} most-streamed</span>
      <span class="tt-now-t">${s.track}</span> <span class="tt-now-a">— ${s.artists}</span>
      <span class="tt-now-n">${fmt(s.streams)} US streams · ${s.days} days on the chart</span>`;
  }

  function loop(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
    const target = playing && armAngle > LEAD_IN - 1 ? rpm * 6 : 0;   // degrees per second
    if (!dragging) {
      vel += (target - vel) * Math.min(1, dt * (target > vel ? 1.6 : 0.9));
      angle += vel * dt;
    }
    // tonearm: swing to lead-in, then creep inward while the record plays
    if (playing) armTarget = Math.min(RUN_OUT, LEAD_IN + (t - playStart) / 1000 * 0.12);
    armAngle += (armTarget - armAngle) * Math.min(1, dt * 2.2);
    record.style.transform = `rotate(${angle % 360}deg)`;
    arm.style.transform = `rotate(${armAngle}deg)`;
    crackle.update(playing && armAngle > LEAD_IN - 1 && !dragging ? 1 : 0, Math.abs(vel));
    const idle = !playing && Math.abs(vel) < 0.5 && Math.abs(armAngle - REST) < 0.05 && !dragging;
    if (idle) { raf = 0; last = 0; return; }
    raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  function toggle() {
    playing = !playing;
    root.classList.toggle("is-playing", playing);
    power.setAttribute("aria-pressed", playing);
    power.setAttribute("aria-label", playing ? "Stop the record" : "Play the record");
    if (playing) { playStart = performance.now(); armTarget = LEAD_IN; nextSong(); }
    else { armTarget = REST; }
    kick();
  }
  power.addEventListener("click", toggle);

  speedBtns.forEach(b => b.addEventListener("click", () => {
    rpm = +b.dataset.rpm;
    speedBtns.forEach(x => x.setAttribute("aria-pressed", x === b));
    labelSpeed.textContent = b.dataset.rpm === "45" ? "45 RPM" : "33⅓ RPM";
    kick();
  }));

  // scratch: drag the record around its spindle
  const center = () => { const r = record.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const ang = e => { const [cx, cy] = center(); return Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI; };
  record.addEventListener("pointerdown", e => {
    dragging = true; dragPrev = ang(e); dragT = performance.now();
    record.setPointerCapture(e.pointerId); root.classList.add("is-scratching"); kick();
  });
  record.addEventListener("pointermove", e => {
    if (!dragging) return;
    const a = ang(e), t = performance.now();
    let d = a - dragPrev; if (d > 180) d -= 360; if (d < -180) d += 360;
    angle += d; vel = d / Math.max(0.008, (t - dragT) / 1000);
    crackle.scratch(Math.min(1, Math.abs(d) / 25));
    dragPrev = a; dragT = t;
  });
  const endDrag = () => { if (dragging) { dragging = false; root.classList.remove("is-scratching"); kick(); } };
  record.addEventListener("pointerup", endDrag);
  record.addEventListener("pointercancel", endDrag);

  // ---- vinyl crackle, synthesized (no audio files) ----
  const crackle = (() => {
    let ctx, gain, on = false, level = 0;
    function init() {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);        // soft surface hiss
        let v = b * 0.6;
        if (Math.random() < 0.0009) v += (Math.random() * 2 - 1) * 0.9;   // pops
        if (Math.random() < 0.00006) for (let k = 0; k < 40 && i + k < len; k++) d[i + k] += (Math.random() - .5) * (1 - k / 40); // clicks
        d[i] += v;
      }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 180;
      gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(hp).connect(lp).connect(gain).connect(ctx.destination); src.start();
    }
    return {
      toggle() { on = !on; if (on && !ctx) init(); if (ctx) ctx.resume(); return on; },
      update(active, speed) {
        if (!ctx) return;
        const target = on && active ? 0.05 * Math.min(1, speed / 200) : 0;
        level += (target - level) * 0.08;
        gain.gain.setTargetAtTime(level, ctx.currentTime, 0.05);
      },
      scratch(x) { if (ctx && on) gain.gain.setTargetAtTime(0.05 + x * 0.12, ctx.currentTime, 0.01); },
    };
  })();
  soundBtn.addEventListener("click", () => {
    const on = crackle.toggle();
    soundBtn.setAttribute("aria-pressed", on);
    soundBtn.textContent = on ? "Crackle: on" : "Crackle: off";
  });

  record.style.transform = "rotate(0deg)";
})();

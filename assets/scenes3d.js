// 3D scenes for the report page, drawn with three.js (assets/vendor, MIT licence):
//   1. #stage3d  — a record player in the hero. Drag to look around, grab the record to spin or
//                  scratch it, click the tonearm (or the button) to drop the needle and play music.
//   2. #skyline  — Track 1: the top 10 artists' streams month by month, built as columns rising
//                  out of a record. Each ring is a month, each slice an artist. Drag to spin.
// Both read data/report.json (built by scripts/analysis.py). If WebGL is not available the two
// stages stay hidden and the rest of the page works as before.
import * as THREE from "./vendor/three.module.min.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = matchMedia("(max-width: 700px)").matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const big = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n).toLocaleString("en-US");

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
  catch (e) { return false; }
}

// ---------- shared plumbing: renderer, soft studio lighting, orbit drag, render only while visible ----------
function makeStage(host, { az = 0.5, el = 0.62, dist = 9, target = [0, 0, 0], minEl = 0.18, maxEl = 1.25, azLimit = 1.1, groundY = 0 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // a small warm "room" baked into an environment map, so metal and vinyl get real reflections
  const pm = new THREE.PMREMGenerator(renderer), room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(14, 8, 14), new THREE.MeshBasicMaterial({ color: 0x2a1d15, side: THREE.BackSide })));
  const lamp = (w, h, pos, col, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); room.add(m); };
  lamp(6, 2.5, [0, 3.9, 0], 0xfff1dc, 3.2); lamp(3, 4, [-6.9, 1, 1], 0xffd9a8, 1.6); lamp(3, 3, [6.9, 1.5, -2], 0xbfd8ff, 1.0); lamp(8, 1, [0, 0.5, 6.9], 0xffe6c4, .8);
  scene.environment = pm.fromScene(room, 0.035).texture;

  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x3a2a1e, 0.55));
  const key = new THREE.DirectionalLight(0xffe2bd, 2.1); key.position.set(-4, 9, 5); key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); key.shadow.radius = 6; key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7); rim.position.set(6, 4, -6); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = groundY; ground.receiveShadow = true; scene.add(ground);

  const view = { az, el, dist, t: new THREE.Vector3(...target), vaz: 0, vel: 0, home: { az, el } };
  function place() {
    view.el = Math.max(minEl, Math.min(maxEl, view.el));
    view.az = Math.max(view.home.az - azLimit, Math.min(view.home.az + azLimit, view.az));
    camera.position.set(view.t.x + view.dist * Math.cos(view.el) * Math.sin(view.az), view.t.y + view.dist * Math.sin(view.el),
                        view.t.z + view.dist * Math.cos(view.el) * Math.cos(view.az));
    camera.lookAt(view.t);
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 42 : 32;           // narrow screens: widen the lens so everything fits
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize(); place();

  // pointer helpers
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e, objs) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); return ray.intersectObjects(objs, true)[0] || null;
  }
  let visible = false, running = false, frameFn = () => {}, last = 0;
  function loop(ts) {
    if (!visible || document.hidden) { running = false; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    if (!dragging) { view.az += view.vaz * dt; view.el += view.vel * dt; view.vaz *= Math.pow(0.04, dt); view.vel *= Math.pow(0.04, dt); }
    frameFn(dt, ts / 1000); place(); renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  function kick() { if (!running && visible) { running = true; last = 0; requestAnimationFrame(loop); } }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }, { rootMargin: "120px" }).observe(host);
  document.addEventListener("visibilitychange", kick);

  // orbit by dragging the background; a scene can claim a drag first (e.g. grabbing the record)
  let dragging = false, px = 0, py = 0, claim = null, onMove = null, onUp = null;
  const cv = renderer.domElement;
  cv.addEventListener("pointerdown", e => {
    const c = claim && claim(e);
    if (c) { onMove = c.move; onUp = c.up; } else { onMove = null; onUp = null; }
    dragging = true; px = e.clientX; py = e.clientY; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - px, dy = e.clientY - py; px = e.clientX; py = e.clientY;
    if (onMove) { onMove(e, dx, dy); return; }
    view.az -= dx * 0.008; view.el += dy * 0.006; view.vaz = -dx * 0.5; view.vel = dy * 0.35;
  });
  const end = e => { if (!dragging) return; dragging = false; if (onUp) onUp(e); onMove = onUp = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

  return { renderer, scene, camera, view, pick, kick, cv,
    onFrame: f => { frameFn = f; }, onClaim: f => { claim = f; }, isDragging: () => dragging };
}

// ---------- canvas textures ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function woodTex() {
  return canvasTex(1024, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, "#6b4126"); grd.addColorStop(1, "#4a2a17");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {                         // long wavy grain lines
      const y0 = Math.random() * h, a = 2 + Math.random() * 6, f = 0.004 + Math.random() * 0.01, ph = Math.random() * 6;
      g.strokeStyle = `rgba(${Math.random() < .5 ? "30,14,6" : "140,90,52"},${0.05 + Math.random() * 0.12})`;
      g.lineWidth = 0.6 + Math.random() * 1.8; g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * f + ph) * a + Math.sin(x * f * 3.1) * a * .3);
      g.stroke();
    }
  });
}
// vinyl grooves: fine rings, with 8 smooth gaps between the 8 tracks (the report's 8 findings)
function grooveTex() {
  return canvasTex(1024, 1024, (g, w) => {
    const c = w / 2, R = c, lab = R * 0.36;
    g.fillStyle = "#0b0a0a"; g.fillRect(0, 0, w, w);
    const bands = 8, inner = lab + R * 0.05, outer = R * 0.97, gap = R * 0.012;
    for (let r = inner; r < outer; r += 1.15) {
      const k = (r - inner) / (outer - inner) * bands, inGap = (k % 1) * ((outer - inner) / bands) < gap && k > 0.5;
      const v = inGap ? 34 : 14 + Math.random() * 14;
      g.strokeStyle = `rgb(${v},${v},${v + 1})`; g.lineWidth = 0.9; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = "#1c1b1b"; g.lineWidth = 6; g.beginPath(); g.arc(c, c, outer + 4, 0, Math.PI * 2); g.stroke();
  });
}
function labelTex(song) {
  return canvasTex(512, 512, (g, w) => {
    const c = w / 2;
    const grd = g.createRadialGradient(c, c, 10, c, c, c); grd.addColorStop(0, "#b8392a"); grd.addColorStop(1, "#7d2016");
    g.fillStyle = grd; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(246,232,204,.55)"; g.lineWidth = 3; g.beginPath(); g.arc(c, c, c - 14, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#f6e8cc"; g.textAlign = "center";
    g.font = "700 30px 'Playfair Display', Georgia, serif"; g.fillText("SPINNING THE NUMBERS", c, 118);
    g.font = "500 20px Lora, Georgia, serif"; g.fillStyle = "rgba(246,232,204,.85)"; g.fillText("US TOP 200 · SIDE A · 33⅓", c, 150);
    const title = song ? song.track : "Press play", artist = song ? song.artists : "Drop the needle";
    g.fillStyle = "#fff3da"; let fs = 46; g.font = `italic 700 ${fs}px 'Playfair Display', Georgia, serif`;
    while (g.measureText(title).width > w * 0.78 && fs > 22) { fs -= 2; g.font = `italic 700 ${fs}px 'Playfair Display', Georgia, serif`; }
    g.fillText(title, c, 360);
    g.font = "400 24px Lora, Georgia, serif"; g.fillStyle = "rgba(246,232,204,.9)";
    let a = artist; while (g.measureText(a).width > w * 0.7 && a.length > 4) a = a.slice(0, -2);
    g.fillText(a === artist ? a : a + "…", c, 398);
    g.fillStyle = "#151210"; g.beginPath(); g.arc(c, c, 13, 0, Math.PI * 2); g.fill();
  });
}

// ============================================================================
// 1. The record player
// ============================================================================
function turntable(host, R) {
  const st = makeStage(host.querySelector(".stage-canvas"), { az: 0.38, el: 0.72, dist: small ? 11.5 : 9.6, target: [0, 0.1, 0.1], groundY: -0.12 });
  const { scene } = st;
  const wood = woodTex(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping;

  // plinth: a rounded walnut box with a brushed-metal deck on top
  const W = 6.2, D = 4.7, Hh = 0.75;
  const shape = new THREE.Shape(), rr = 0.28;
  shape.moveTo(-W / 2 + rr, -D / 2); shape.lineTo(W / 2 - rr, -D / 2); shape.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + rr);
  shape.lineTo(W / 2, D / 2 - rr); shape.quadraticCurveTo(W / 2, D / 2, W / 2 - rr, D / 2); shape.lineTo(-W / 2 + rr, D / 2);
  shape.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - rr); shape.lineTo(-W / 2, -D / 2 + rr); shape.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + rr, -D / 2);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: Hh, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 10 }),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.5, metalness: 0 }));
  body.geometry.rotateX(-Math.PI / 2); body.geometry.translate(0, 0, 0);
  body.material.map.repeat.set(0.18, 0.3);
  body.castShadow = true; body.receiveShadow = true; scene.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.04, D - 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2b211b, roughness: 0.55, metalness: 0.3 }));
  deck.position.y = Hh + 0.07; deck.receiveShadow = true; scene.add(deck);
  const top = Hh + 0.09;
  // feet
  for (const [x, z] of [[-W / 2 + .5, -D / 2 + .5], [W / 2 - .5, -D / 2 + .5], [-W / 2 + .5, D / 2 - .5], [W / 2 - .5, D / 2 - .5]]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: .4, metalness: .6 }));
    f.position.set(x, -0.06, z); scene.add(f);
  }

  // platter + record (the record turns as one group)
  const C = new THREE.Vector3(-0.75, top, 0.05);
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.2, 96),
    new THREE.MeshStandardMaterial({ color: 0xcfcac2, metalness: 0.95, roughness: 0.28 }));
  platter.position.set(C.x, top + 0.1, C.z); platter.castShadow = true; scene.add(platter);
  const spin = new THREE.Group(); spin.position.set(C.x, top + 0.2, C.z); scene.add(spin);
  const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.045, 128),
    [new THREE.MeshStandardMaterial({ color: 0x0c0b0b, roughness: 0.35, metalness: 0.2 }),
     new THREE.MeshPhysicalMaterial({ map: grooveTex(), roughness: 0.32, metalness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
     new THREE.MeshStandardMaterial({ color: 0x0c0b0b })]);
  vinyl.position.y = 0.025; vinyl.castShadow = true; spin.add(vinyl);
  let labMat = new THREE.MeshStandardMaterial({ map: labelTex(null), roughness: 0.75 });
  const label = new THREE.Mesh(new THREE.CircleGeometry(0.72, 64), labMat);
  label.rotation.x = -Math.PI / 2; label.position.y = 0.049; spin.add(label);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 16), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1, roughness: 0.15 }));
  pin.position.set(C.x, top + 0.34, C.z); scene.add(pin);

  // tonearm: pivot post at the back right; the arm swings over the record around the post
  const P = new THREE.Vector3(2.05, top, -1.55), L = 3.45;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.35, 32), new THREE.MeshStandardMaterial({ color: 0xbdb7ad, metalness: 1, roughness: 0.25 }));
  post.position.set(P.x, top + 0.17, P.z); post.castShadow = true; scene.add(post);
  const arm = new THREE.Group(); arm.position.set(P.x, top + 0.62, P.z); scene.add(arm);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8e6e2, metalness: 1, roughness: 0.12 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, L, 16), chrome);
  tube.rotation.x = Math.PI / 2; tube.position.z = L / 2; tube.castShadow = true; arm.add(tube);
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 32), new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: .8, roughness: .3 }));
  cw.rotation.x = Math.PI / 2; cw.position.z = -0.45; cw.castShadow = true; arm.add(cw);
  const hinge = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), chrome); arm.add(hinge);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.55), new THREE.MeshStandardMaterial({ color: 0x1d1a18, metalness: .5, roughness: .35 }));
  head.position.set(-0.08, -0.06, L + 0.18); head.rotation.y = 0.35; head.castShadow = true; arm.add(head);
  const lift = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.22), chrome); lift.position.set(0.17, -0.02, L + 0.32); arm.add(lift);
  const armRest = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.48, 12), new THREE.MeshStandardMaterial({ color: 0x1a1512, metalness: .6, roughness: .4 }));
  armRest.position.set(P.x + 0.15, top + 0.24, P.z + 2.5); scene.add(armRest);
  // angle that puts the stylus at radius r from the record centre (found by bisection)
  const stylusAt = th => new THREE.Vector2(P.x + Math.sin(th) * (L + 0.2), P.z + Math.cos(th) * (L + 0.2));
  const thetaFor = r => { let a = -1.4, b = 0; for (let k = 0; k < 40; k++) { const m = (a + b) / 2, d = stylusAt(m).distanceTo(new THREE.Vector2(C.x, C.z)); (d > r) ? (b = m) : (a = m); } return (a + b) / 2; };
  const REST = 0.04, OUT = thetaFor(1.88), IN = thetaFor(0.95);

  // power lamp and 33/45 buttons on the front edge
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a0e08, emissive: 0xff3b1f, emissiveIntensity: 0 });
  const lampM = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), lampMat); lampM.position.set(W / 2 - 0.65, top + 0.03, D / 2 - 0.45); scene.add(lampM);
  for (const [k, x] of [[0, 1.2], [1, 1.75]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 24), new THREE.MeshStandardMaterial({ color: k ? 0x8b8580 : 0xd8d2c8, metalness: .9, roughness: .3 }));
    b.position.set(x, top + 0.02, D / 2 - 0.45); scene.add(b);
  }

  // ---- state: motor speed, needle, scratching ----
  const OMEGA = (33.333 / 60) * Math.PI * 2;     // 33⅓ rpm in radians per second
  let angle = 0, speed = 0, motor = false, armTh = REST, armDown = 0, sweep = 0, scratch = null, current = null, pending = false;
  const btn = host.querySelector(".stage-btn"), cap = host.querySelector(".stage-now");
  const defaultSong = R.s2_songs.top10[0];
  function setLabel(song) { const old = labMat.map; labMat.map = labelTex(song); labMat.needsUpdate = true; old.dispose(); }
  function ui() {
    btn.textContent = motor ? "❚❚ Lift the needle" : "▶ Drop the needle";
    cap.innerHTML = current ? `<span class="k">${motor ? "Now spinning" : "On the platter"}</span> <i>${esc(current.track)}</i> — ${esc(current.artists)}`
                            : `<span class="k">On the platter</span> Spotify’s most-streamed US song of the period: <i>${esc(defaultSong.track)}</i>`;
  }
  function drop() { pending = true; if (window.playSong) window.playSong(current || defaultSong); motor = true; ui(); st.kick(); }
  function liftUp() { if (window.pauseSong) window.pauseSong(); motor = false; pending = false; ui(); st.kick(); }
  btn.addEventListener("click", () => motor ? liftUp() : drop());
  document.addEventListener("music:state", e => {
    const { playing, song } = e.detail;
    if (song && (!current || song.track_id !== current.track_id)) { current = song; setLabel(song); sweep = 0; }
    if (playing) { motor = true; pending = false; } else if (!pending) motor = false;
    ui(); st.kick();
  });
  ui();

  // grab the record to spin or scratch it; click the arm to play / stop
  const onDisc = e => { const h = st.pick(e, [vinyl, label]); return h ? Math.atan2(h.point.z - C.z, h.point.x - C.x) : null; };
  st.onClaim(e => {
    if (st.pick(e, [arm, armRest])) { motor ? liftUp() : drop(); return { move() {}, up() {} }; }
    const a0 = onDisc(e); if (a0 === null) return null;
    scratch = { last: a0, v: 0, t: performance.now() };
    return {
      move(ev) { const a = onDisc(ev); if (a === null) return; let d = a - scratch.last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
        angle -= d; const now = performance.now(); scratch.v = -d / Math.max(0.008, (now - scratch.t) / 1000); scratch.t = now; scratch.last = a; },
      up() { speed = Math.max(-12, Math.min(12, scratch.v)); scratch = null; },
    };
  });
  st.cv.addEventListener("pointermove", e => {
    if (st.isDragging()) return;
    st.cv.style.cursor = st.pick(e, [arm, armRest]) ? "pointer" : st.pick(e, [vinyl, label]) ? "grab" : "move";
  });

  st.onFrame((dt, t) => {
    // record speed eases toward 33⅓ when the motor is on, coasts to a stop when off
    if (!scratch) { const goal = motor ? OMEGA : 0; speed += (goal - speed) * Math.min(1, dt * (motor ? 1.6 : 0.7)); angle -= speed * dt; }
    spin.rotation.y = angle;
    // arm: swings over the record and lowers when playing, creeping inward like a real stylus
    if (motor && !pending) sweep = Math.min(1, sweep + dt / 30);
    const goalTh = motor ? OUT + (IN - OUT) * sweep : REST;
    armTh += (goalTh - armTh) * Math.min(1, dt * 2.4);
    const near = Math.abs(armTh - goalTh) < 0.03;
    armDown += ((motor && near ? 1 : 0) - armDown) * Math.min(1, dt * 3);
    arm.rotation.y = armTh; arm.rotation.x = 0.035 + armDown * 0.052;
    lampMat.emissiveIntensity += ((motor ? 2.2 : 0) - lampMat.emissiveIntensity) * Math.min(1, dt * 4);
    if (!reduce && !st.isDragging() && !motor && Math.abs(st.view.vaz) < 0.01) st.view.az += Math.sin(t * 0.25) * 0.0009;   // gentle idle sway
  });
}

// ============================================================================
// 2. The skyline: top-10 artists by month, rising out of a record
// ============================================================================
function skyline(host, R) {
  const B = R.s1_artists.by_month, A = B.artists, M = B.months, S = B.streams, top = R.s1_artists.top10;
  const st = makeStage(host.querySelector(".stage-canvas"), { az: 0.3, el: 0.86, dist: small ? 17 : 17.5, target: [0, 0.9, 0], minEl: 0.25, maxEl: 1.35, azLimit: 9 });
  const { scene } = st;
  const read = host.querySelector(".stage-now");
  // the same shades as the record grid above: neighbours alternate dark / light reds
  const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const ramp = (stops, t) => { const k = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1))), u = t * (stops.length - 1) - k;
    const a = hex(stops[k]), b = hex(stops[k + 1]); return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * u).toString(16).padStart(2, "0")).join(""); };
  const zig = (i, n) => { const nd = Math.ceil(n / 2), nl = Math.floor(n / 2);
    return i % 2 === 0 ? (nd > 1 ? (i / 2) / (nd - 1) : 0) * .36 : .64 + (nl > 1 ? ((i - 1) / 2) / (nl - 1) : 0) * .36; };
  const colorOf = i => ramp(["#5e120c", "#9b2d20", "#cf5a3f", "#f0a086"], zig(i, A.length));

  const disc = new THREE.Group(); scene.add(disc);
  const ink = css("--ink") || "#2a1d15", inkBg = css("--surface") || "#fbf6ea";
  const R0 = 1.15, R1 = 4.6, ringW = (R1 - R0) / M.length, maxS = Math.max(...S.flat()), Hmax = 3.2;
  // base record
  const rec = new THREE.Mesh(new THREE.CylinderGeometry(R1 + 0.25, R1 + 0.25, 0.12, 128),
    [new THREE.MeshStandardMaterial({ color: 0x0c0b0b, roughness: .35, metalness: .2 }),
     new THREE.MeshPhysicalMaterial({ map: grooveTex(), roughness: .32, metalness: .25, clearcoat: .6 }),
     new THREE.MeshStandardMaterial({ color: 0x0c0b0b })]);
  rec.position.y = 0.06; rec.receiveShadow = true; rec.castShadow = true; disc.add(rec);
  const lab = new THREE.Mesh(new THREE.CircleGeometry(R0 - 0.08, 64), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w) => {
    const c = w / 2; g.fillStyle = "#9b2d20"; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.fillStyle = "#f6e8cc"; g.textAlign = "center"; g.font = "700 44px 'Playfair Display', Georgia, serif"; g.fillText("TOP 10", c, c - 40);
    g.font = "italic 400 34px Lora, Georgia, serif"; g.fillText("artists by month", c, c + 6);
    g.font = "400 28px Lora, Georgia, serif"; g.fillText("center: Jan 2025", c, c + 66); g.fillText("edge: Aug 2026", c, c + 102);
  }), roughness: .7 }));
  lab.rotation.x = -Math.PI / 2; lab.position.y = 0.125; disc.add(lab);

  // one column per artist per month: a curved block in the artist's slice, on the month's ring
  const slice = (Math.PI * 2) / A.length, gapA = 0.06;
  const cols = [];
  A.forEach((artist, ai) => {
    const mat = new THREE.MeshStandardMaterial({ color: colorOf(ai), roughness: .45, metalness: .05 });
    const a0 = ai * slice + gapA / 2, a1 = (ai + 1) * slice - gapA / 2;
    M.forEach((m, mi) => {
      const v = S[ai][mi]; if (!v) return;
      const r0 = R0 + mi * ringW + 0.015, r1 = r0 + ringW - 0.03, h = Math.max(0.02, v / maxS * Hmax);
      const sh = new THREE.Shape();
      sh.absarc(0, 0, r1, a0, a1, false); sh.absarc(0, 0, r0, a1, a0, true);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2);                     // extrude upward
      const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.12; mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { ai, mi, v }; disc.add(mesh); cols.push(mesh);
    });
    // artist name at the outer edge of the slice
    const mid = (a0 + a1) / 2;
    const tex = canvasTex(512, 96, (g, w, hh) => { g.font = "700 46px 'Playfair Display', Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round"; g.lineWidth = 10; g.strokeStyle = inkBg; g.strokeText(artist, w / 2, hh / 2); g.fillStyle = ink; g.fillText(artist, w / 2, hh / 2); });
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(2.9, 0.54, 1); spr.position.set(Math.cos(mid) * (R1 + 0.95), 0.5, -Math.sin(mid) * (R1 + 0.95)); spr.renderOrder = 10;
    disc.add(spr);
  });

  // hover highlight + readout; click plays the artist's top song
  const hi = new THREE.MeshStandardMaterial({ color: 0xd9b35c, emissive: 0x6b4a10, roughness: .3, metalness: .3 });
  let hovered = null, auto = !reduce, hoverOn = false;
  const monthName = m => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const idle = `Hover a column to see an artist's streams that month; click to play their top song. Drag to spin the record.`;
  read.innerHTML = `<span class="hint">${idle}</span>`;
  function setHover(m) {
    if (hovered === m) return;
    if (hovered) hovered.material = hovered.userData.base;
    hovered = m;
    if (m) { m.userData.base = m.userData.base || m.material; m.material = hi;
      const { ai, mi, v } = m.userData, tot = S[ai].reduce((a, b) => a + b, 0);
      read.innerHTML = `<b>${esc(A[ai])}</b> · ${monthName(M[mi])}: <b>${big(v)}</b> streams <span class="hint">(${(v / tot * 100).toFixed(1)}% of their ${big(tot)} over the 20 months)</span>`;
    } else read.innerHTML = `<span class="hint">${idle}</span>`;
  }
  st.cv.addEventListener("pointermove", e => { if (st.isDragging()) return; const h = st.pick(e, cols); setHover(h ? h.object : null);
    st.cv.style.cursor = h ? "pointer" : "grab"; hoverOn = !!h; });
  st.cv.addEventListener("pointerleave", () => { setHover(null); hoverOn = false; });
  let downAt = null;
  st.cv.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; });
  st.cv.addEventListener("click", e => {
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;      // that was a drag
    const h = st.pick(e, cols); if (!h) return; setHover(h.object);
    const t = top.find(x => x.artist === A[h.object.userData.ai]); if (t && t.top_song && window.playSong) window.playSong(t.top_song);
  });
  // dragging spins the record itself (not the camera) left-right, and tilts the view up-down
  st.onClaim(() => ({ move(e, dx, dy) { disc.rotation.y += dx * 0.01; spinV = dx * 0.6; st.view.el += dy * 0.006; auto = false; }, up() {} }));
  let spinV = 0;
  st.onFrame(dt => {
    if (!st.isDragging()) { disc.rotation.y += spinV * dt; spinV *= Math.pow(0.05, dt); if (auto && !hoverOn) disc.rotation.y += dt * 0.12; }
  });
}

// ---------- start ----------
const stage = document.getElementById("stage3d"), sky = document.getElementById("skyline");
if (webglOK() && (stage || sky)) {
  const v = new URL(import.meta.url).searchParams.get("v") || "";
  Promise.all([fetch("data/report.json?v=" + v).then(r => r.json()), document.fonts ? document.fonts.ready : null]).then(([R]) => {
    const go = (host, f) => { if (!host) return; try { f(host, R); host.hidden = false; host.classList.add("ready"); } catch (e) { console.error(e); host.hidden = true; } };
    go(stage, turntable); go(sky, skyline);
  });
}

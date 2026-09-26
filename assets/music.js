// Music: plays songs with Spotify's official embed player (iFrame API).
// Visitors hear a 30-second preview; people logged in to Spotify in the browser hear the full song.
// Any element with data-play-id (a Spotify track ID) plays that song when clicked.
// Other scripts can call window.playSong({ track_id, track, artists }).
// Broadcasts a "music:state" event ({ playing, song }) that the turntable listens to.
(function () {
  let host = document.getElementById("spotify-embed");
  let dock = null;
  if (!host) {                                   // pages without a booth get a small dock in the corner
    dock = document.createElement("div"); dock.className = "music-dock"; dock.hidden = true;
    dock.innerHTML = `<div class="music-dock-k">Listening booth <button type="button" class="music-dock-x" aria-label="Hide player">×</button></div><div id="spotify-embed"></div>`;
    document.body.appendChild(dock);
    host = dock.querySelector("#spotify-embed");
    dock.querySelector(".music-dock-x").addEventListener("click", () => { ctl && ctl.pause(); dock.hidden = true; });
  }
  const caption = document.getElementById("booth-now");
  const start = host.dataset.start || "2RkZ5LkEzeHGRsmDqKwmaJ";
  let ctl = null, current = null, wantPlay = false, playing = false;

  function announce() {
    document.dispatchEvent(new CustomEvent("music:state", { detail: { playing, song: current } }));
    document.querySelectorAll("[data-play-id]").forEach(b => b.classList.toggle("is-playing", playing && current && b.dataset.playId === current.track_id));
  }
  function setCaption(song) {
    if (!caption || !song) return;
    caption.innerHTML = `<span class="k">On the turntable</span><span class="t">${song.track}</span><span class="a">${song.artists || ""}</span>`;
  }

  window.playSong = function (song) {
    if (!song || !song.track_id) return;
    current = song; setCaption(song);
    if (dock) dock.hidden = false;
    if (!ctl) { wantPlay = true; return; }
    wantPlay = true;
    ctl.loadUri("spotify:track:" + song.track_id);
    ctl.play();
    announce();
  };

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-play-id]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    window.playSong({ track_id: b.dataset.playId, track: b.dataset.playT || "", artists: b.dataset.playA || "" });
  });

  window.onSpotifyIframeApiReady = IFrameAPI => {
    IFrameAPI.createController(host, { uri: "spotify:track:" + (current ? current.track_id : start), width: "100%", height: host.dataset.height || 152 }, c => {
      ctl = c;
      ctl.addListener("ready", () => { if (wantPlay) { ctl.play(); } });
      ctl.addListener("playback_update", e => {
        const p = !e.data.isPaused && !e.data.isBuffering;
        if (p !== playing) { playing = p; if (!p) wantPlay = false; announce(); }
      });
      if (current && wantPlay) { ctl.loadUri("spotify:track:" + current.track_id); ctl.play(); }
    });
  };
  const s = document.createElement("script"); s.src = "https://open.spotify.com/embed/iframe-api/v1"; s.async = true;
  document.head.appendChild(s);
})();

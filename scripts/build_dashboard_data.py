"""Compact data file for dashboard.html.

Reads data/spotify_us_daily.csv (built by build_data.py) and writes
data/dashboard.json in a column layout: names are stored once in lookup
lists and each chart row refers to them by number. Every row is kept, so
the dashboard's totals match the report exactly.

Row columns (parallel arrays, one entry per chart row):
  d  date index into `dates`
  r  rank
  t  song index into `tracks` ([track_name, artist_names, lead_artist index, is_collab, versions, spotify track id]);
     versions of the same song are merged (see build_data.py), named after the most-streamed version
  l  label index into `labels` (per row: versions can be on different labels)
  s  streams
  e  entry status: 0 returning, 1 debut, 2 re-entry
  c  1 if catalog (on the chart more than 365 days that date), else 0
"""
import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
df = pd.read_csv(ROOT / "data" / "spotify_us_daily.csv")

dates = sorted(df.date.unique())
artists = sorted(df.lead_artist.unique())
labels = sorted(df.label.unique())
a_ix = {a: i for i, a in enumerate(artists)}
l_ix = {l: i for i, l in enumerate(labels)}
d_ix = {d: i for i, d in enumerate(dates)}

main = (df.groupby(["song_id", "track_id"]).streams.sum().reset_index()
          .sort_values("streams", ascending=False).drop_duplicates("song_id"))
info = df.drop_duplicates("track_id").set_index("track_id")
versions = df.groupby("song_id").track_id.nunique()
t_ix = {sid: i for i, sid in enumerate(main.song_id)}
tracks = [[info.loc[r.track_id, "track_name"], info.loc[r.track_id, "artist_names"],
           a_ix[info.loc[r.track_id, "lead_artist"]], int(info.loc[r.track_id, "is_collab"]), int(versions[r.song_id]), r.track_id]
          for r in main.itertuples()]

status = {"returning": 0, "debut": 1, "re-entry": 2}
out = {
    "dates": dates, "artists": artists, "labels": labels, "tracks": tracks,
    "d": df.date.map(d_ix).tolist(), "r": df["rank"].tolist(), "t": df.song_id.map(t_ix).tolist(), "l": df.label.map(l_ix).tolist(),
    "s": df.streams.tolist(), "e": df.entry_status.map(status).tolist(),
    "c": (df.days_on_chart > 365).astype(int).tolist(),
}
p = ROOT / "data" / "dashboard.json"
p.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"wrote {p.relative_to(ROOT)}: {len(df):,} rows, {len(tracks):,} songs (versions merged), {p.stat().st_size/1e6:.1f} MB")

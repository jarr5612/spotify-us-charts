"""Compact data file for dashboard.html.

Reads data/spotify_us_daily.csv (built by build_data.py) and writes
data/dashboard.json in a column layout: names are stored once in lookup
lists and each chart row refers to them by number. Every row is kept, so
the dashboard's totals match the report exactly.

Row columns (parallel arrays, one entry per chart row):
  d  date index into `dates`
  r  rank
  t  song index into `tracks` ([track_name, artist_names, lead_artist index, label index, is_collab])
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

tr = df.drop_duplicates("track_id")[["track_id", "track_name", "artist_names", "lead_artist", "label", "is_collab"]]
t_ix = {t: i for i, t in enumerate(tr.track_id)}
tracks = [[r.track_name, r.artist_names, a_ix[r.lead_artist], l_ix[r.label], int(r.is_collab)] for r in tr.itertuples()]

status = {"returning": 0, "debut": 1, "re-entry": 2}
out = {
    "dates": dates, "artists": artists, "labels": labels, "tracks": tracks,
    "d": df.date.map(d_ix).tolist(), "r": df["rank"].tolist(), "t": df.track_id.map(t_ix).tolist(),
    "s": df.streams.tolist(), "e": df.entry_status.map(status).tolist(),
    "c": (df.days_on_chart > 365).astype(int).tolist(),
}
p = ROOT / "data" / "dashboard.json"
p.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"wrote {p.relative_to(ROOT)}: {len(df):,} rows, {len(tracks):,} songs, {p.stat().st_size/1e6:.1f} MB")

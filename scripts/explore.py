"""Exploratory numbers for choosing report findings.

Reads data/spotify_us_daily.csv (built by build_data.py) and writes
results/explore.txt. Every number in the report should trace back to
this script or to a later analysis script.

Definitions used here:
  * "song" = one track_id.
  * days charted = number of dates a song appears in this data (2025-01-01..2026-08-31).
  * "catalog" row = a song that has been on the chart more than 365 days
    (days_on_chart > 365) on that date; everything else is "current".
  * collaboration = more than one credited artist.
"""
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
df = pd.read_csv(ROOT / "data" / "spotify_us_daily.csv", parse_dates=["date"])
out = []
def p(*a): out.append(" ".join(str(x) for x in a))
def h(t): out.append("\n" + "=" * 70 + "\n" + t + "\n" + "=" * 70)

total = df.streams.sum()
songs = df.groupby("track_id").agg(
    track=("track_name", "first"), artist=("artist_names", "first"),
    lead=("lead_artist", "first"), label=("label", "first"),
    collab=("is_collab", "first"), streams=("streams", "sum"),
    days=("date", "nunique"), best=("rank", "min"),
    first=("date", "min"), last=("date", "max"))

# ---------------------------------------------------------------- 1
h("1. WHO DOMINATED: artists, labels, concentration")
a = df.groupby("lead_artist").streams.sum().sort_values(ascending=False)
p("Top 10 lead artists by total streams (share of all streams):")
for n, s in a.head(10).items(): p(f"  {n:<28} {s/1e9:6.2f} B  {s/total:6.1%}")
p(f"Top 10 artists' combined share: {a.head(10).sum()/total:.1%}; "
  f"top 1% of artists ({max(1,len(a)//100)}): {a.head(max(1,len(a)//100)).sum()/total:.1%}")
l = df.groupby("label").streams.sum().sort_values(ascending=False)
p("\nTop 10 labels by streams:")
for n, s in l.head(10).items(): p(f"  {n:<34} {s/1e9:6.2f} B  {s/total:6.1%}")
s_sorted = songs.streams.sort_values(ascending=False)
p(f"\nTop 10 songs' share of all streams: {s_sorted.head(10).sum()/total:.1%}; "
  f"top 100 songs (of {len(songs):,}): {s_sorted.head(100).sum()/total:.1%}")
p("Top 10 songs:")
for tid in s_sorted.head(10).index:
    r = songs.loc[tid]; p(f"  {r.track[:34]:<34} {r.artist[:26]:<26} {r.streams/1e9:5.2f} B  {r.days} days")
ones = df[df["rank"] == 1].groupby("track_id").size().sort_values(ascending=False)
p(f"\nSongs that reached #1: {len(ones)}. Most days at #1:")
for tid, n in ones.head(5).items(): p(f"  {songs.loc[tid].track[:34]:<34} {songs.loc[tid].artist[:26]:<26} {n} days")

# ---------------------------------------------------------------- 2
h("2. STAYING POWER")
p(f"Days charted per song: median {songs.days.median():.0f}, mean {songs.days.mean():.1f}; "
  f"{(songs.days==1).mean():.1%} charted exactly 1 day; {(songs.days>=365).mean():.1%} charted 365+ days")
p(f"Songs on the chart every one of the {df.date.nunique()} days: {(songs.days==df.date.nunique()).sum()}")
deb = df[df.entry_status == "debut"].copy()
deb = deb.merge(songs[["days"]], left_on="track_id", right_index=True)
deb["debut_band"] = pd.cut(deb["rank"], [0, 10, 50, 100, 200], labels=["1-10", "11-50", "51-100", "101-200"])
p(f"\nDebuts in the window: {len(deb):,}. Days charted by debut rank (debuts only):")
g = deb.groupby("debut_band", observed=True)["days"].agg(["count", "median", "mean"])
for b, r in g.iterrows(): p(f"  debut rank {b:<8} n={int(r['count']):<5} median {r['median']:.0f} days, mean {r['mean']:.1f}")

# ---------------------------------------------------------------- 3
h("3. SOLO vs COLLABORATION")
for c, name in [(0, "solo"), (1, "collab")]:
    s = songs[songs.collab == c]; rws = df[df.is_collab == c]
    p(f"  {name:<7} songs {len(s):>5} ({len(s)/len(songs):.1%})  rows {len(rws)/len(df):.1%}  "
      f"streams {rws.streams.sum()/total:.1%}  avg streams/row {rws.streams.mean():,.0f}  "
      f"median days charted {s.days.median():.0f}  median best rank {s.best.median():.0f}")

# ---------------------------------------------------------------- 4
h("4. WEEKDAY AND SEASONAL PATTERNS")
daily = df.groupby("date").agg(streams=("streams", "sum"), debuts=("entry_status", lambda x: (x == "debut").sum()))
daily["weekday"] = daily.index.day_name()
order = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
w = daily.groupby("weekday").agg(avg_streams=("streams", "mean"), debuts=("debuts", "sum")).reindex(order)
p("Average total Top-200 streams per day, and total debuts, by weekday:")
for d, r in w.iterrows(): p(f"  {d:<10} {r.avg_streams/1e6:7.1f} M   debuts {int(r.debuts):>4} ({r.debuts/w.debuts.sum():.0%})")
m = df.groupby("month").streams.sum() / df.groupby("month").date.nunique()
p("\nAverage daily Top-200 streams by month (M):")
p("  " + "  ".join(f"{k}:{v/1e6:.0f}" for k, v in m.items()))
dec = df[df.date.dt.month == 12]
hol = dec.groupby("track_id").size()
p("\nSongs charting ONLY in Nov-Jan (holiday songs) and their December share of Top-200 streams:")
season = df.groupby("track_id").date.apply(lambda d: d.dt.month.isin([11, 12, 1]).all())
hs = season[season].index
for y in [2025]:
    dm = df[(df.date.dt.year == y) & (df.date.dt.month == 12)]
    p(f"  Dec {y}: holiday songs = {dm[dm.track_id.isin(hs)].streams.sum()/dm.streams.sum():.1%} of streams; "
      f"peak day share {dm[dm.track_id.isin(hs)].groupby('date').streams.sum().div(dm.groupby('date').streams.sum()).max():.1%}")
p("  most-streamed holiday songs: " + "; ".join(songs.loc[hs].sort_values('streams', ascending=False).head(5).track))

# ---------------------------------------------------------------- 5
h("5. HOW NEW SONGS RISE AND FADE (debuts with a full 30 days of data)")
dd = df[df.track_id.isin(deb.track_id)].copy()
first = dd.groupby("track_id").date.transform("min")
dd["day_n"] = (dd.date - first).dt.days + 1
full = deb[deb.date <= df.date.max() - pd.Timedelta(days=29)].track_id
dd = dd[dd.track_id.isin(full) & (dd.day_n <= 30)]
d1 = dd[dd.day_n == 1].set_index("track_id").streams
# full grid: a song that has dropped off the Top 200 counts as 0 streams that day
grid = dd.pivot_table(index="track_id", columns="day_n", values="streams", aggfunc="sum").reindex(index=full, columns=range(1, 31)).fillna(0)
rel = grid.div(grid[1], axis=0)
p(f"Debuts used: {len(full)}. Streams relative to debut day (day 1 = 100%; off-chart days count as 0):")
p("  median: " + "  ".join(f"d{k}:{rel[k].median():.0%}" for k in (1, 2, 3, 7, 14, 21, 30)))
p("  mean:   " + "  ".join(f"d{k}:{rel[k].mean():.0%}" for k in (1, 2, 3, 7, 14, 21, 30)))
p(f"  total streams of these debuts, day 30 vs day 1: {grid[30].sum()/grid[1].sum():.0%}")
p(f"Share of these debuts still on the chart on day 30: "
  f"{dd[dd.day_n==30].track_id.nunique()/len(full):.1%}")
pk = df[df.track_id.isin(full)].copy(); pk["day_n"] = (pk.date - pk.groupby("track_id").date.transform("min")).dt.days + 1
peakday = pk.loc[pk.groupby("track_id").streams.idxmax(), "day_n"]
p(f"Day of peak streams (whole window): {(peakday==1).mean():.1%} peak on debut day; median peak day {peakday.median():.0f}")

# ---------------------------------------------------------------- 6
h("6. CATALOG vs CURRENT (catalog = on chart > 365 days on that date)")
df["catalog"] = df.days_on_chart > 365
p(f"Catalog share of rows {df.catalog.mean():.1%}, of streams {df.loc[df.catalog,'streams'].sum()/total:.1%}")
cm = df.groupby("month").apply(lambda x: x.loc[x.catalog, "streams"].sum() / x.streams.sum(), include_groups=False)
p("Catalog share of streams by month:")
p("  " + "  ".join(f"{k}:{v:.0%}" for k, v in cm.items()))
p(f"Avg streams per row: catalog {df[df.catalog].streams.mean():,.0f} vs current {df[~df.catalog].streams.mean():,.0f}")
p(f"Avg rank: catalog {df[df.catalog]['rank'].mean():.0f} vs current {df[~df.catalog]['rank'].mean():.0f}")

(ROOT / "results").mkdir(exist_ok=True)
(ROOT / "results" / "explore.txt").write_text("\n".join(out) + "\n", encoding="utf-8")
print("\n".join(out))

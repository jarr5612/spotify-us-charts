"""Numbers and chart data for the report page (index.html).

Reads data/spotify_us_daily.csv (built by build_data.py) and writes
data/report.json, which index.html loads. Every number shown in the
report comes from this file, so the report can be reproduced by running:

    python3 scripts/build_data.py
    python3 scripts/analysis.py

Definitions:
  song            one song_id: versions of the same song (same title and lead artist) are merged;
                  "versions" > 1 means the song was listed under several Spotify track IDs
  days charted    number of dates a song appears in this data (max 608)
  streams         US streams counted on the Top 200 only (not all US streaming)
  share           part of the total Top-200 streams in the window
  debut           first day a song ever appears on the chart (previous_rank = -1, days_on_chart = 1)
  catalog         on a given date, a song that has been on the chart more than 365 days
                  (days_on_chart > 365); everything else is "current"
  collaboration   more than one credited artist
"""
import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
df = pd.read_csv(ROOT / "data" / "spotify_us_daily.csv", parse_dates=["date"])
TOTAL = int(df.streams.sum())
N_DAYS = df.date.nunique()

# one row per song (versions merged); title/artists/collab come from the most-streamed version
main = (df.groupby(["song_id", "track_id"]).streams.sum().reset_index()
          .sort_values("streams", ascending=False).drop_duplicates("song_id").set_index("song_id").track_id)
info = df.drop_duplicates("track_id").set_index("track_id")
songs = df.groupby("song_id").agg(streams=("streams", "sum"), days=("date", "nunique"),
                                  best=("rank", "min"), versions=("track_id", "nunique"))
songs["track"] = main.map(info.track_name)
songs["artists"] = main.map(info.artist_names)
songs["collab"] = main.map(info.is_collab)


def pct(x):
    return round(float(x) * 100, 1)


R = {"meta": {"first_date": str(df.date.min().date()), "last_date": str(df.date.max().date()),
              "days": N_DAYS, "rows": len(df)}}

# ---- headline numbers -------------------------------------------------------
R["headline"] = {
    "total_streams": TOTAL,
    "unique_songs": int(df.song_id.nunique()),
    "unique_track_ids": int(df.track_id.nunique()),
    "songs_with_versions": int((songs.versions > 1).sum()),
    "unique_lead_artists": int(df.lead_artist.nunique()),
    "songs_reaching_no1": int(df.loc[df["rank"] == 1, "song_id"].nunique()),
}

# ---- 1. artist concentration ------------------------------------------------
a = df.groupby("lead_artist").streams.sum().sort_values(ascending=False)
top1pct = max(1, len(a) // 100)
R["s1_artists"] = {
    "top10": [{"artist": n, "streams": int(s), "share_pct": pct(s / TOTAL)} for n, s in a.head(10).items()],
    "top10_share_pct": pct(a.head(10).sum() / TOTAL),
    "top1pct_n": top1pct, "top1pct_share_pct": pct(a.head(top1pct).sum() / TOTAL),
    "n_artists": len(a),
}

# ---- 2. song concentration --------------------------------------------------
ss = songs.streams.sort_values(ascending=False)
cum = ss.cumsum() / TOTAL
R["s2_songs"] = {
    "n_songs": len(ss),
    "curve": [{"top_n": n, "share_pct": pct(cum.iloc[n - 1])} for n in (1, 10, 25, 50, 100, 250, 500, 1000, len(ss))],
    "top10_share_pct": pct(cum.iloc[9]), "top100_share_pct": pct(cum.iloc[99]),
    "top10": [{"track": songs.loc[t].track, "artists": songs.loc[t].artists,
               "streams": int(songs.loc[t].streams), "days": int(songs.loc[t].days),
               "versions": int(songs.loc[t].versions)} for t in ss.head(10).index],
}

# ---- 3. runs at #1 ----------------------------------------------------------
no1 = df[df["rank"] == 1].groupby("song_id").size().sort_values(ascending=False)
R["s3_no1"] = {
    "n_songs": len(no1),
    "top10": [{"track": songs.loc[t].track, "artists": songs.loc[t].artists, "days_at_1": int(n),
               "versions": int(df[(df.song_id == t) & (df["rank"] == 1)].track_id.nunique())} for t, n in no1.head(10).items()],
    "median_days_at_1": float(no1.median()),
    "one_day_only": int((no1 == 1).sum()),
}

# ---- 4. most songs don't last -----------------------------------------------
bins = [0, 1, 7, 30, 90, 180, 365, N_DAYS]
labels = ["1 day", "2-7", "8-30", "31-90", "91-180", "181-365", "366+"]
b = pd.cut(songs.days, bins, labels=labels).value_counts().reindex(labels)
R["s4_lifespan"] = {
    "histogram": [{"bucket": k, "songs": int(v), "share_pct": pct(v / len(songs))} for k, v in b.items()],
    "median_days": float(songs.days.median()), "mean_days": round(float(songs.days.mean()), 1),
    "one_day_pct": pct((songs.days == 1).mean()),
    "all_days": int((songs.days == N_DAYS).sum()),
    "all_days_songs": [f"{r.track} — {r.artists}" + (f" (across {r.versions} versions)" if r.versions > 1 else "")
                       for _, r in songs[songs.days == N_DAYS].iterrows()],
}

# ---- 5. debut rank vs run ---------------------------------------------------
deb = (df[df.entry_status == "debut"].sort_values("rank").drop_duplicates("song_id")
         .merge(songs[["days"]], left_on="song_id", right_index=True))
deb["band"] = pd.cut(deb["rank"], [0, 10, 50, 100, 200], labels=["1-10", "11-50", "51-100", "101-200"])
g = deb.groupby("band", observed=True)["days"].agg(["count", "median", "mean"])
R["s5_debut"] = {
    "n_debuts": len(deb),
    "note": "days charted counts only days through 2026-08-31, so recent debuts are cut off",
    "bands": [{"debut_rank": str(k), "songs": int(r["count"]), "median_days": float(r["median"]),
               "mean_days": round(float(r["mean"]), 1)} for k, r in g.iterrows()],
}

# ---- 6. solo vs collaboration -----------------------------------------------
rows6 = []
for c, name in [(0, "Solo"), (1, "Collaboration")]:
    s, rw = songs[songs.collab == c], df[df.is_collab == c]
    rows6.append({"type": name, "songs": len(s), "songs_share_pct": pct(len(s) / len(songs)),
                  "streams_share_pct": pct(rw.streams.sum() / TOTAL),
                  "avg_streams_per_row": int(round(rw.streams.mean())),
                  "median_days": float(s.days.median()), "median_best_rank": float(s.best.median())})
R["s6_collab"] = rows6

# ---- 7. Friday release day --------------------------------------------------
order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
daily = df.groupby("date").agg(streams=("streams", "sum"))
daily["debuts"] = deb.groupby("date").size().reindex(daily.index, fill_value=0)
daily["weekday"] = daily.index.day_name()
w = daily.groupby("weekday").agg(avg_streams=("streams", "mean"), debuts=("debuts", "sum")).reindex(order)
R["s7_weekday"] = {
    "by_weekday": [{"weekday": d, "avg_daily_streams": int(round(r.avg_streams)), "debuts": int(r.debuts),
                    "debut_share_pct": pct(r.debuts / w.debuts.sum())} for d, r in w.iterrows()],
    "friday_debut_share_pct": pct(w.loc["Friday", "debuts"] / w.debuts.sum()),
}

# ---- 8. catalog share over time ---------------------------------------------
df["catalog"] = df.days_on_chart > 365
m = df.groupby("month").apply(lambda x: x.loc[x.catalog, "streams"].sum() / x.streams.sum(), include_groups=False)
R["s8_catalog"] = {
    "by_month": [{"month": k, "catalog_share_pct": pct(v)} for k, v in m.items()],
    "overall_share_pct": pct(df.loc[df.catalog, "streams"].sum() / TOTAL),
    "rows_share_pct": pct(df.catalog.mean()),
    "first_month_pct": pct(m.iloc[0]), "last_month_pct": pct(m.iloc[-1]),
    "avg_streams_catalog": int(round(df[df.catalog].streams.mean())),
    "avg_streams_current": int(round(df[~df.catalog].streams.mean())),
}

# ============================================================================
# Extra data for the interactive visuals (same data, finer detail)
# ============================================================================

# 1 — record grid: 100 records, each 1% of streams (largest-remainder rounding so they sum to 100)
shares = [(n, s / TOTAL * 100) for n, s in a.head(10).items()]
shares.append(("Everyone else", 100 - sum(v for _, v in shares)))
floors = [int(v) for _, v in shares]
left = 100 - sum(floors)
for k in sorted(range(len(shares)), key=lambda k: shares[k][1] - floors[k], reverse=True)[:left]:
    floors[k] += 1
R["s1_artists"]["grid"] = [{"artist": n, "cells": c, "share_pct": round(v, 2)} for (n, v), c in zip(shares, floors)]

# 2 — full concentration curve: cumulative share after the top k songs, k = 1..all
R["s2_songs"]["cum_pct"] = [round(float(x) * 100, 2) for x in cum.values]
R["s2_songs"]["ranked"] = [{"track": songs.loc[t].track, "artists": songs.loc[t].artists, "versions": int(songs.loc[t].versions),
                            "share_pct": round(float(songs.loc[t].streams) / TOTAL * 100, 3)} for t in ss.head(50).index]

# 3 — #1 reigns: every unbroken run at #1, in date order
top = df[df["rank"] == 1].sort_values("date")[["date", "song_id", "track_id"]].reset_index(drop=True)
runs, start = [], 0
for k in range(1, len(top) + 1):
    if k == len(top) or top.song_id[k] != top.song_id[start] or (top.date[k] - top.date[k - 1]).days != 1:
        t = top.song_id[start]
        runs.append({"song_id": t, "track": songs.loc[t].track, "artists": songs.loc[t].artists,
                     "versions": int(top.track_id[start:k].nunique()),
                     "start": str(top.date[start].date()), "end": str(top.date[k - 1].date()), "days": k - start})
        start = k
R["s3_no1"]["runs"] = runs
R["s3_no1"]["top_ids"] = [t for t in no1.head(10).index]
R["s3_no1"]["days_total"] = int(len(top))

# 4 — survival: share of songs that charted at least d days, d = 1..N_DAYS
counts = songs.days.value_counts().reindex(range(1, N_DAYS + 1), fill_value=0)
atleast = counts[::-1].cumsum()[::-1]
R["s4_lifespan"]["atleast_pct"] = [round(float(x) / len(songs) * 100, 2) for x in atleast.values]
R["s4_lifespan"]["atleast_n"] = [int(x) for x in atleast.values]

# 5 — debut paths: daily rank for the first 60 days after debut (0 = not on the chart that day),
#     for debuts ranked 1-50 whose first 60 days fall inside the data window
H = 60
last_ok = df.date.max() - pd.Timedelta(days=H - 1)
deb50 = deb[(deb["rank"] <= 50) & (deb.date <= last_ok)]
rank_of = df.groupby(["song_id", "date"])["rank"].min()
paths = []
for r in deb50.itertuples():
    days = pd.date_range(r.date, periods=H)
    ranks = [int(rank_of.get((r.song_id, d), 0)) for d in days]
    paths.append({"track": songs.loc[r.song_id].track, "artists": songs.loc[r.song_id].artists,
                  "versions": int(songs.loc[r.song_id].versions),
                  "debut": str(r.date.date()), "debut_rank": int(r.rank), "ranks": ranks})
R["s5_debut"]["paths"] = paths
R["s5_debut"]["paths_note"] = f"debuts ranked 1-50 on or before {last_ok.date()}, so each has 60 days of data"

# 6 — collaboration: share of chart spots (rows) as well
for row in R["s6_collab"]:
    c = 1 if row["type"] == "Collaboration" else 0
    row["rows_share_pct"] = pct((df.is_collab == c).mean())

# 7 — calendar: every day's total Top-200 streams and debuts
R["s7_weekday"]["daily"] = [{"date": str(d.date()), "streams": int(r.streams), "debuts": int(r.debuts)}
                            for d, r in daily.iterrows()]

# 8 — catalog vs current: average daily streams per month for each group
mm = df.groupby(["month", "catalog"]).streams.sum().unstack(fill_value=0)
ndays = df.groupby("month").date.nunique()
R["s8_catalog"]["by_month_streams"] = [{"month": m, "catalog_per_day": int(round(mm.loc[m, True] / ndays[m])),
                                        "current_per_day": int(round(mm.loc[m, False] / ndays[m]))} for m in mm.index]

(ROOT / "data" / "report.json").write_text(json.dumps(R, indent=1, ensure_ascii=False), encoding="utf-8")
print(json.dumps(R, indent=1, ensure_ascii=False))

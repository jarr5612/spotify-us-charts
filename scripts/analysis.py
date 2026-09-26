"""Numbers and chart data for the report page (index.html).

Reads data/spotify_us_daily.csv (built by build_data.py) and writes
data/report.json, which index.html loads. Every number shown in the
report comes from this file, so the report can be reproduced by running:

    python3 scripts/build_data.py
    python3 scripts/analysis.py

Definitions:
  song            one track_id
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

songs = df.groupby("track_id").agg(
    track=("track_name", "first"), artists=("artist_names", "first"),
    collab=("is_collab", "first"), streams=("streams", "sum"),
    days=("date", "nunique"), best=("rank", "min"))


def pct(x):
    return round(float(x) * 100, 1)


R = {"meta": {"first_date": str(df.date.min().date()), "last_date": str(df.date.max().date()),
              "days": N_DAYS, "rows": len(df)}}

# ---- headline numbers -------------------------------------------------------
R["headline"] = {
    "total_streams": TOTAL,
    "unique_songs": int(df.track_id.nunique()),
    "unique_lead_artists": int(df.lead_artist.nunique()),
    "songs_reaching_no1": int(df.loc[df["rank"] == 1, "track_id"].nunique()),
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
               "streams": int(songs.loc[t].streams), "days": int(songs.loc[t].days)} for t in ss.head(10).index],
}

# ---- 3. runs at #1 ----------------------------------------------------------
no1 = df[df["rank"] == 1].groupby("track_id").size().sort_values(ascending=False)
R["s3_no1"] = {
    "n_songs": len(no1),
    "top10": [{"track": songs.loc[t].track, "artists": songs.loc[t].artists, "days_at_1": int(n)} for t, n in no1.head(10).items()],
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
    "all_days_songs": [f"{r.track} — {r.artists}" for _, r in songs[songs.days == N_DAYS].iterrows()],
}

# ---- 5. debut rank vs run ---------------------------------------------------
deb = df[df.entry_status == "debut"].merge(songs[["days"]], left_on="track_id", right_index=True)
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
daily = df.groupby("date").agg(streams=("streams", "sum"),
                               debuts=("entry_status", lambda x: int((x == "debut").sum())))
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

(ROOT / "data" / "report.json").write_text(json.dumps(R, indent=1, ensure_ascii=False), encoding="utf-8")
print(json.dumps(R, indent=1, ensure_ascii=False))

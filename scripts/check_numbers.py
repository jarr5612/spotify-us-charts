"""Independent check of the report's key numbers.

Recomputes them straight from the RAW Spotify file with separate, plain-Python code
(no pandas, none of the other scripts) and compares with data/report.json and
data/dashboard.json. Run after the build scripts:  python3 scripts/check_numbers.py
"""
import collections, csv, datetime as dt, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = json.load(open(ROOT / "data" / "report.json"))
D = json.load(open(ROOT / "data" / "dashboard.json"))
rows = list(csv.DictReader(open(ROOT / "data" / "raw" / "spotify-us-daily-2025-01-01_to_2026-08-31.csv", encoding="utf-8")))
bad = 0

def lead(a):
    for n in ["Tyler, The Creator", "Earth, Wind & Fire"]:
        if a.startswith(n):
            return n
    return a.split(", ")[0]

def key(r):  # one song = same title + same lead artist (versions merged)
    return r["track_name"].strip().lower() + "|" + lead(r["artist_names"]).strip().lower()

def check(name, mine, report):
    global bad
    same = mine == report
    bad += not same
    print(("OK   " if same else "DIFF ") + f"{name}: {mine} vs {report}")

total = sum(int(r["streams"]) for r in rows)
check("total streams", total, R["headline"]["total_streams"])
songs, days = collections.defaultdict(int), collections.defaultdict(set)
for r in rows:
    songs[key(r)] += int(r["streams"]); days[key(r)].add(r["date"])
check("songs", len(songs), R["headline"]["unique_songs"])
s = sorted(songs.values(), reverse=True)
check("top 10 songs' share %", round(sum(s[:10]) / total * 100, 1), R["s2_songs"]["top10_share_pct"])
check("top 100 songs' share %", round(sum(s[:100]) / total * 100, 1), R["s2_songs"]["top100_share_pct"])
no1 = collections.Counter(key(r) for r in rows if r["rank"] == "1")
check("songs that reached #1", len(no1), R["headline"]["songs_reaching_no1"])
check("longest total at #1 (days)", max(no1.values()), R["s3_no1"]["top10"][0]["days_at_1"])
d = [len(v) for v in days.values()]
check("share charting 7+ days %", round(sum(x >= 7 for x in d) / len(d) * 100, 2), R["s4_lifespan"]["atleast_pct"][6])
check("share charting exactly 1 day %", round(sum(x == 1 for x in d) / len(d) * 100, 1), R["s4_lifespan"]["one_day_pct"])
check("songs on the chart all 608 days", sum(x == 608 for x in d), R["s4_lifespan"]["all_days"])
first = {}
for r in sorted(rows, key=lambda r: r["date"]):
    first.setdefault(key(r), r)
deb = [r for r in first.values() if r["days_on_chart"] == "1"]
check("debuts", len(deb), R["s5_debut"]["n_debuts"])
fri = sum(dt.date.fromisoformat(r["date"]).weekday() == 4 for r in deb)
check("Friday share of debuts %", round(fri / len(deb) * 100, 1), R["s7_weekday"]["friday_debut_share_pct"])
jan = [r for r in rows if r["date"].startswith("2025-01")]
cat = sum(int(r["streams"]) for r in jan if int(r["days_on_chart"]) > 365) / sum(int(r["streams"]) for r in jan)
check("catalog share, Jan 2025 %", round(cat * 100, 1), R["s8_catalog"]["first_month_pct"])
mw = sum(int(r["streams"]) for r in rows if lead(r["artist_names"]) == "Morgan Wallen")
check("Morgan Wallen share %", round(mw / total * 100, 1), R["s1_artists"]["top10"][0]["share_pct"])
check("dashboard: total streams", sum(D["s"]), total)
check("dashboard: songs", len(set(D["t"])), R["headline"]["unique_songs"])
check("dashboard: debuts", sum(1 for e in D["e"] if e == 1), R["s5_debut"]["n_debuts"])
print("\nall numbers match" if not bad else f"\n{bad} number(s) differ")
sys.exit(1 if bad else 0)

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
# ---- claims written in the report text ----
check("share charting a week or less % (text: 51.5%)", round(sum(x <= 7 for x in d) / len(d) * 100, 1), 51.5)
by_day = collections.defaultdict(int)
for r in rows:
    by_day[r["date"]] += int(r["streams"])
big_day = max(by_day, key=by_day.get)
check("biggest day (text: Christmas Day 2025)", big_day, "2025-12-25")
check("biggest day vs average day (text: about 2.4x)", round(by_day[big_day] / (total / len(by_day)), 1), 2.4)
months_of = collections.defaultdict(set)
for r in rows:
    months_of[key(r)].add(int(r["date"][5:7]))
holiday = {k for k, m in months_of.items() if m <= {11, 12, 1}}
xmas = [r for r in rows if r["date"] == "2025-12-25"]
check("holiday songs' share of Christmas Day streams % (text: 95.6%)",
      round(sum(int(r["streams"]) for r in xmas if key(r) in holiday) / by_day["2025-12-25"] * 100, 1), 95.6)
check("holiday songs in Christmas Day top 10 (text: all ten)", sum(key(r) in holiday for r in xmas if int(r["rank"]) <= 10), 10)
song_day = collections.defaultdict(lambda: collections.defaultdict(int))
for r in rows:
    song_day[key(r)][r["date"]] += int(r["streams"])
debut_keys = [key(r) for r in deb]
peak_first = sum(max(song_day[k], key=song_day[k].get) == min(song_day[k]) for k in debut_keys)
check("debuts whose biggest day was day one % (text: 77%)", round(peak_first / len(debut_keys) * 100), 77)

runs, prev, cur, n = [], None, None, 0
for r in sorted((r for r in rows if r["rank"] == "1"), key=lambda r: r["date"]):
    k = key(r)
    if k == cur and prev and (dt.date.fromisoformat(r["date"]) - prev).days == 1:
        n += 1
    else:
        if cur: runs.append((n, cur))
        cur, n = k, 1
    prev = dt.date.fromisoformat(r["date"])
runs.append((n, cur))
longest = max(x for x, _ in runs)
check("longest unbroken run at #1 in days (text: 30)", longest, 30)
check("songs tied for the longest run (text: luther and Rockin' Around)", sorted(k.split("|")[0] for x, k in runs if x == longest),
      ["luther (with sza)", "rockin' around the christmas tree"])
check("share lasting a month or more % (text: 27.3%)", round(sum(x >= 30 for x in d) / len(d) * 100, 1), 27.3)

lead_streams = collections.defaultdict(int)
for r in rows:
    lead_streams[lead(r["artist_names"])] += int(r["streams"])
ranked = sorted(lead_streams.items(), key=lambda x: -x[1])
check("artists with at least 1% of streams (text: 25 = top 10 + fifteen more)", sum(v / total >= .01 for _, v in ranked), 25)
check("#11 artist (text: Tyler, The Creator 1.56%)", (ranked[10][0], round(ranked[10][1] / total * 100, 2)), ("Tyler, The Creator", 1.56))
check("artists under 1% (text: 583)", sum(v / total < .01 for _, v in ranked), 583)

# the #1 race (Track 3) and the 3D skyline (Track 1)
race = R["s3_no1"]["race"]
check("race: days", len(race["days"]), 608)
check("race: #1 on every day matches the raw chart",
      all(race["songs"][d[1][0][0]][2] and d[1][0][1] == 1 for d in race["days"]), True)
race_no1 = collections.Counter(race["songs"][d[1][0][0]][0] for d in race["days"])
check("race: most days at #1 at the end (text: Choosin' Texas 104)", race_no1.most_common(1)[0], ("Choosin' Texas", 104))
row1 = {r["date"]: int(r["streams"]) for r in rows if r["rank"] == "1"}
check("race: #1 streams on every day match the raw file", all(row1[d[0]] == d[1][0][2] for d in race["days"]), True)
bm = R["s1_artists"]["by_month"]
for name, monthly in zip(bm["artists"], bm["streams"]):
    check(f"skyline: {name} months add up to their total", sum(monthly), lead_streams[name])

print("\nall numbers match" if not bad else f"\n{bad} number(s) differ")
sys.exit(1 if bad else 0)

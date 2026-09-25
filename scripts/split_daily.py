"""Split the combined Spotify US daily Top 200 file into one CSV per day.

Input : data/raw/spotify-us-daily-2025-01-01_to_2026-08-31.csv  (date + Spotify's 9 columns)
Output: data/raw/daily/regional-us-daily-YYYY-MM-DD.csv       (Spotify's original 9 columns)

Source: Spotify Charts (charts.spotify.com), "Daily Top Songs USA", CSV download
for each date, collected 2026-09-24/25.
"""
import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "spotify-us-daily-2025-01-01_to_2026-08-31.csv"
OUT = ROOT / "data" / "raw" / "daily"

def main():
    OUT.mkdir(exist_ok=True)
    by_day = defaultdict(list)
    with SRC.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            by_day[row[0]].append(row[1:])
    for day, rows in sorted(by_day.items()):
        with (OUT / f"regional-us-daily-{day}.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(header[1:])
            w.writerows(rows)
    print(f"wrote {len(by_day)} daily files, {sum(map(len, by_day.values()))} rows")

if __name__ == "__main__":
    main()

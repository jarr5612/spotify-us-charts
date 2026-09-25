"""Build the analysis data set from the raw Spotify US daily Top 200 file.

Input : data/raw/spotify-us-daily-2025-01-01_to_2026-08-31.csv
Output: data/spotify_us_daily.csv   (one row = one song on the US chart on one date)

Rows are kept exactly as Spotify published them (none dropped). Added columns:
  year, month (YYYY-MM), weekday          -- from date
  track_id                                -- Spotify ID without the "spotify:track:" prefix
  lead_artist                             -- first credited artist
  n_artists, is_collab                    -- number of credited artists; 1 if more than one
  entry_status                            -- debut:     not on chart the day before, first day ever on chart
                                             re-entry:  not on chart the day before, but has charted before
                                             returning: was on the chart the day before
  rank_change                             -- previous_rank - rank (positive = moved up); blank if not on chart the day before
Dropped column: uri (replaced by the shorter track_id).
"""
import csv
import datetime as dt
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "spotify-us-daily-2025-01-01_to_2026-08-31.csv"
OUT = ROOT / "data" / "spotify_us_daily.csv"

# Artist names that themselves contain ", " and must not be split.
COMMA_NAMES = ["Tyler, The Creator", "Earth, Wind & Fire"]

COLUMNS = ["date", "year", "month", "weekday", "rank", "track_id", "track_name",
           "artist_names", "lead_artist", "n_artists", "is_collab", "label",
           "streams", "peak_rank", "previous_rank", "rank_change",
           "days_on_chart", "entry_status"]


def split_artists(names):
    protected = names
    for i, n in enumerate(COMMA_NAMES):
        protected = protected.replace(n, f"\x00{i}\x00")
    parts = [p.strip() for p in protected.split(", ")]
    for i, n in enumerate(COMMA_NAMES):
        parts = [p.replace(f"\x00{i}\x00", n) for p in parts]
    return parts


def main():
    rows = []
    with SRC.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            d = dt.date.fromisoformat(r["date"])
            artists = split_artists(r["artist_names"])
            prev, rank, days = int(r["previous_rank"]), int(r["rank"]), int(r["days_on_chart"])
            if prev != -1:
                status = "returning"
            elif days == 1:
                status = "debut"
            else:
                status = "re-entry"
            rows.append({
                "date": r["date"], "year": d.year, "month": r["date"][:7],
                "weekday": d.strftime("%A"), "rank": rank,
                "track_id": r["uri"].replace("spotify:track:", ""),
                "track_name": r["track_name"], "artist_names": r["artist_names"],
                "lead_artist": artists[0], "n_artists": len(artists),
                "is_collab": int(len(artists) > 1), "label": r["source"],
                "streams": int(r["streams"]), "peak_rank": int(r["peak_rank"]),
                "previous_rank": prev, "rank_change": (prev - rank) if prev != -1 else "",
                "days_on_chart": days, "entry_status": status,
            })

    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

    # ---- quick profile, to help choose findings ----
    dates = sorted({r["date"] for r in rows})
    total = sum(r["streams"] for r in rows)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows):,} rows, {len(COLUMNS)} columns, "
          f"{OUT.stat().st_size / 1e6:.1f} MB")
    print(f"dates: {dates[0]} to {dates[-1]} ({len(dates)} days)")
    print(f"unique songs: {len({r['track_id'] for r in rows}):,}   "
          f"lead artists: {len({r['lead_artist'] for r in rows}):,}   "
          f"labels: {len({r['label'] for r in rows}):,}")
    print(f"total streams: {total:,}   average per chart row: {total / len(rows):,.0f}")
    print("entry status:", dict(Counter(r["entry_status"] for r in rows)))
    print("share of rows that are collaborations: "
          f"{sum(r['is_collab'] for r in rows) / len(rows):.1%}")


if __name__ == "__main__":
    main()

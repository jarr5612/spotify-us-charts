# Spotify US Daily Top 200 — Data Website Project

Financial Data Analytics — Data Website Project.
Author: _[your name]_

A two-page website built on Spotify's **Daily Top Songs USA** chart from
**January 1, 2025 to August 31, 2026** (608 days):

- `index.html` — the report: findings, headline numbers and a chart for each finding *(coming)*
- `dashboard.html` — an interactive dashboard with filters, switches, charts and a table *(coming)*

Live site: _[GitHub Pages URL]_

## Data source

- **Source:** Spotify Charts, <https://charts.spotify.com>, chart "Daily Top Songs USA"
  (`regional-us-daily`).
- **How it was collected:** Spotify offers a CSV download for each day's chart to
  signed-in users. The CSV for every date from 2025-01-01 through 2026-08-31 was
  downloaded through that feature on 2026-09-24/25 (automated in the browser,
  one date at a time), then combined into one file with a `date` column added.
- **One row** = one song on the US daily chart on one date.

### Columns

| column | meaning |
|---|---|
| `date` | chart date (YYYY-MM-DD) — added from the file name of each daily CSV |
| `rank` | position on that day's chart (1–200) |
| `uri` | Spotify track ID (`spotify:track:…`) |
| `artist_names` | all credited artists, comma-separated |
| `track_name` | song title |
| `source` | record label / distributor |
| `peak_rank` | best rank the song has reached so far |
| `previous_rank` | rank the day before (`-1` = not on the chart the day before) |
| `days_on_chart` | number of days the song has been on the chart |
| `streams` | US streams that day |

### Known data notes

- 121,594 rows over 608 days. Every day has 200 rows except **2026-07-13 through
  2026-07-18**, which have 199: Spotify's own chart skips one position on each of
  those days (e.g. #22 on 2026-07-13). The rows were kept as published.

## Files

To rebuild everything from the raw data: `python3 scripts/build_data.py`


| path | what it is |
|---|---|
| `data/raw/spotify-us-daily-2025-01-01_to_2026-08-31.csv` | combined raw data (date + Spotify's 9 columns) |
| `data/raw/daily/regional-us-daily-YYYY-MM-DD.csv` | one raw file per day, Spotify's 9 columns |
| `scripts/split_daily.py` | rebuilds the daily files from the combined file |
| `scripts/build_data.py` | builds the analysis file from the raw data and prints a quick profile |
| `data/spotify_us_daily.csv` | analysis file: every raw row plus year, month, weekday, lead artist, number of artists, collaboration flag, entry status (debut / re-entry / returning) and rank change |
| `README.md` | this file |

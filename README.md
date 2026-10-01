# Spotify US Daily Top 200 — Data Website Project

Financial Data Analytics — Data Website Project.
Author: Jewlya Arrington

A two-page website built on Spotify's **Daily Top Songs USA** chart from
**January 1, 2025 to August 31, 2026** (608 days):

- `index.html` — the report: findings, headline numbers and a chart for each finding
- `dashboard.html` — an interactive dashboard with filters, switches, charts and a table

Live site: https://jarr5612.github.io/spotify-us-charts/

## Data source

- **Source:** Spotify Charts, <https://charts.spotify.com>, chart "Daily Top Songs USA"
  (`regional-us-daily`).
- **How it was collected:** Spotify offers a CSV download for each day's chart to
  signed-in users. The CSV for every date from 2025-01-01 through 2026-08-31 was
  downloaded through that feature on 2026-09-24/25 (automated in the browser,
  one date at a time), then combined into one file with a `date` column added.
- **One row** = one Spotify track (one version of a song) on the US daily chart on one date.
- **Checked against the source:** the full 200-row charts for 2025-03-17, 2025-12-25 and 2026-07-13 were compared with charts.spotify.com on 2026-09-26; every rank and stream count matched exactly.

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
| `days_on_chart` | total days this track has been on the chart, counted by Spotify since it first charted (includes days before 2025; keeps counting when a song drops off and returns) |
| `streams` | US streams that day |

### Known data notes

- Spotify lists some songs under 2-3 track IDs (re-releases, deluxe or edited versions). Versions with the same title and lead artist are merged into one song: 2,651 track IDs become 2,389 songs. The site notes "across N versions" where that matters.

- 121,594 rows over 608 days. Every day has 200 rows except **2026-07-13 through
  2026-07-18**, which have 199: Spotify's own chart skips one position on each of
  those days (e.g. #22 on 2026-07-13). The rows were kept as published.

## Files

To rebuild everything from the raw data:

```
python3 scripts/build_data.py
python3 scripts/analysis.py
python3 scripts/build_dashboard_data.py
python3 scripts/check_numbers.py   # confirms the numbers
```


| path | what it is |
|---|---|
| `data/raw/spotify-us-daily-2025-01-01_to_2026-08-31.csv` | combined raw data (date + Spotify's 9 columns) |
| `data/raw/daily/regional-us-daily-YYYY-MM-DD.csv` | one raw file per day, Spotify's 9 columns |
| `scripts/split_daily.py` | rebuilds the daily files from the combined file |
| `scripts/build_data.py` | builds the analysis file from the raw data and prints a quick profile |
| `scripts/analysis.py` | computes every number and chart on the report page; writes `data/report.json` |
| `scripts/build_dashboard_data.py` | writes the compact `data/dashboard.json` the dashboard loads |
| `data/report.json` | report numbers (loaded by `index.html`) |
| `data/dashboard.json` | all 121,594 rows in a compact column layout (loaded by `dashboard.html`) |
| `index.html` | report page |
| `dashboard.html` | dashboard page: 7 filters, 5 summary numbers, 4 charts with measure and breakdown switches, a table and a reset button |
| `assets/style.css` | shared fonts, colors and navigation for both pages |
| `assets/report.js` | draws the report charts from `data/report.json`, including the animated #1 race in Track 3 |
| `assets/scenes3d.js` | the two 3D scenes on the report, built with three.js: the record player at the top (drag to look around, spin the record, drop the needle to play music) and the Track 1 "skyline", where each top-10 artist's monthly streams rise as columns out of a record |
| `assets/vendor/three.module.min.js` | three.js r160, the 3D library (copied into the repo so the site does not depend on another server) |
| `assets/vendor/three-LICENSE.txt` | three.js's MIT licence |
| `assets/turntable.js` | the record player beside the report: each finding is a track on the record, the tonearm follows your place as you scroll, and clicking a groove or a track jumps to that finding |
| `assets/music.js` | plays songs with Spotify's official embed player (30-second previews, or full songs for visitors logged in to Spotify); any ▶ button or clickable song on the site plays in the listening booth, and the turntable spins while music plays |
| `assets/dashboard.js` | filters the data and draws the dashboard in the browser |
| `data/spotify_us_daily.csv` | analysis file: every raw row plus year, month, weekday, song ID (versions of the same song merged), number of versions, lead artist, number of artists, collaboration flag, entry status (debut / re-entry / returning) and rank change |
| `scripts/check_numbers.py` | independent check: recomputes the key numbers from the raw file with separate code and compares them with the site's data |
| `scripts/explore.py` | first exploratory pass used to choose the findings; writes `results/explore.txt` |
| `results/explore.txt` | output of `explore.py` (candidate findings, not shown on the site) |
| `.gitignore` | keeps Mac system files and local notes out of the repository |
| `README.md` | this file |

"""Build the analysis data set from the raw Spotify US daily Top 200 file.

Input : data/raw/spotify-us-daily-2025-01-01_to_2026-08-31.csv
Output: data/spotify_us_daily.csv   (one row = one Spotify track ID on the US chart on one date)

Rows are kept exactly as Spotify published them (none dropped). Added columns:
  year, month (YYYY-MM), weekday          -- from date
  track_id                                -- Spotify ID without the "spotify:track:" prefix
  song_id                                 -- one ID per song: versions of the same song (same title and
                                             same lead artist, ignoring capital letters) share a song_id.
                                             Spotify sometimes lists a song under 2-3 track IDs
                                             (re-releases, deluxe editions); all analysis counts songs by song_id.
  n_versions                              -- how many track IDs the song has in this data
  lead_artist                             -- first credited artist
  n_artists                               -- number of credited artists on this version
  is_collab                               -- 1 if the song's most-streamed version credits more than one artist
  entry_status (song level)               -- debut:     the song's first day in the data, and Spotify's
                                                        days-on-chart count is 1 (first day ever)
                                             re-entry:  no version was on the chart the day before
                                             returning: a version was on the chart the day before
  rank_change                             -- previous_rank - rank (positive = moved up); blank if the
                                             track was not on the chart the day before
Dropped column: uri (replaced by the shorter track_id).
"""
import hashlib
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "spotify-us-daily-2025-01-01_to_2026-08-31.csv"
OUT = ROOT / "data" / "spotify_us_daily.csv"

# Artist names that themselves contain ", " and must not be split.
COMMA_NAMES = ["Tyler, The Creator", "Earth, Wind & Fire"]

COLUMNS = ["date", "year", "month", "weekday", "rank", "song_id", "track_id", "n_versions",
           "track_name", "artist_names", "lead_artist", "n_artists", "is_collab", "label",
           "streams", "peak_rank", "previous_rank", "rank_change", "days_on_chart", "entry_status"]


def split_artists(names):
    protected = names
    for i, n in enumerate(COMMA_NAMES):
        protected = protected.replace(n, f"\x00{i}\x00")
    parts = [p.strip() for p in protected.split(", ")]
    for i, n in enumerate(COMMA_NAMES):
        parts = [p.replace(f"\x00{i}\x00", n) for p in parts]
    return parts


def main():
    df = pd.read_csv(SRC, dtype={"date": str})
    d = pd.to_datetime(df.date)
    df["year"], df["month"], df["weekday"] = d.dt.year, df.date.str[:7], d.dt.day_name()
    df["track_id"] = df.uri.str.replace("spotify:track:", "", regex=False)
    artists = df.artist_names.map(split_artists)
    df["lead_artist"] = artists.str[0]
    df["n_artists"] = artists.str.len()
    df["is_collab"] = (df.n_artists > 1).astype(int)
    df = df.rename(columns={"source": "label"})
    key = df.track_name.str.strip().str.lower() + "|" + df.lead_artist.str.strip().str.lower()
    df["song_id"] = key.map(lambda k: hashlib.md5(k.encode()).hexdigest()[:10])
    df["n_versions"] = df.groupby("song_id").track_id.transform("nunique")
    # a song counts as a collaboration if its most-streamed version credits more than one artist,
    # so every version of a song is classed the same way
    main = (df.groupby(["song_id", "track_id"]).streams.sum().reset_index()
              .sort_values("streams", ascending=False).drop_duplicates("song_id").set_index("song_id").track_id)
    collab_of_track = df.drop_duplicates("track_id").set_index("track_id").is_collab
    df["is_collab"] = df.song_id.map(main.map(collab_of_track)).astype(int)
    df["rank_change"] = (df.previous_rank - df["rank"]).where(df.previous_rank != -1)

    # song-level entry status
    dates = sorted(df.date.unique())
    prev_day = {dates[i]: dates[i - 1] for i in range(1, len(dates))}
    on = set(zip(df.song_id, df.date))
    first_day = df.groupby("song_id").date.transform("min")
    # on the first date there is no earlier day in the data, so use Spotify's previous_rank
    was_on = [((s, prev_day[dt]) in on) if dt in prev_day else (pr != -1)
              for s, dt, pr in zip(df.song_id, df.date, df.previous_rank)]
    status = []
    for w, dt, fd, doc in zip(was_on, df.date, first_day, df.days_on_chart):
        status.append("returning" if w else ("debut" if dt == fd and doc == 1 else "re-entry"))
    df["entry_status"] = status

    df[COLUMNS].to_csv(OUT, index=False, lineterminator="\n", float_format="%.0f")

    songs = df.song_id.nunique()
    print(f"wrote {OUT.relative_to(ROOT)}: {len(df):,} rows, {len(COLUMNS)} columns, {OUT.stat().st_size / 1e6:.1f} MB")
    print(f"track IDs: {df.track_id.nunique():,}   songs (versions merged): {songs:,}   "
          f"songs with 2+ versions: {(df.drop_duplicates('song_id').n_versions > 1).sum():,}")
    print(f"lead artists: {df.lead_artist.nunique():,}   labels: {df.label.nunique():,}   total streams: {df.streams.sum():,}")
    deb = df[df.entry_status == "debut"].song_id.nunique()
    print(f"song debuts: {deb:,}   rows by status: {df.entry_status.value_counts().to_dict()}")


if __name__ == "__main__":
    main()

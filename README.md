# NFL Scout

NFL Scout is built on [nflverse](https://github.com/nflverse) data. **Game day** is the entry point: a spotting board that gets you in sync with the broadcast in 30 seconds. It shows who gets the ball, who's out, and what the commentators are likely to talk about. From there, the **DC helper** and **OC helper** dig down into the opposing offense and defense by situation, with the queries running in your browser. It's a static SvelteKit site, with DuckDB-WASM querying parquet files. Why it works the way it does: [DESIGN.md](DESIGN.md).

## Setup

Requires Node and Python 3.9+.

```sh
npm install
npm run data:setup   # pipeline venv (duckdb, pytest)
npm run data         # download nflverse files, write static/data/
npm run dev
```

## Data pipeline

`pipeline/build.py` downloads play-by-play, NGS participation and FTN charting from the nflverse-data releases. It caches them in `pipeline/.cache`, joins them per play, and writes one slim `static/data/plays_{season}.parquet` per season, plus `fourth_{season}.parquet` with every 4th down including punts and field goals (for go-for-it rates). It also writes `teams.json`, `games.json`, `matchups.json` and `manifest.json`. Each build prints a data-health record, also stored in `manifest.json`: what triggered the build, missing nflverse files, played games whose plays aren't in yet, teams without an injury report, and how often Game day leaned on nflverse's listed QB. Look there first when a board looks off.

The derived columns (personnel grouping, defensive package, distance bucket, field zone …) are DuckDB macros in `pipeline/derive.py`, tested in `pipeline/tests/` (`npm run data:test`).

The build exits non-zero when a sanity check fails (low join rates, too few plays for a full season).

Options: `--seasons 2025 2026` builds only those seasons, and `--refresh` re-downloads cached files.

`npm run data:backtest -- 2023 2024 2025` checks whether the DC helper's tells hold up: it picks them from weeks 1–9 and compares them with weeks 10–18. It also fits `SHRINK_PLAYS` in `src/lib/tells.ts`; rerun it once a season is complete.

## Game day

`/matchup` is a spotting board for the upcoming week, for someone who tunes in with seconds to spare. Per game: the line with the implied score and win probability (from the moneylines, bookmaker's margin removed), regular-season records, and for each offense:

- **The starting QB**: last game's starter, unless a former starter is back from being ruled out. When nflverse lists someone else to start, the board names both.
- **Four targets** by share of the targets in the games they were active for, and the **backfield** by carries.
- **Role labels** ("go-to guy", "workhorse", "turnover watch" …). They're sticky: earned at one bar, kept until clearly below a lower one.
- **Who's out.** Until a team's final injury report is out, players show whether they missed the last game and how they practiced instead.

`pipeline/matchup.py` writes `static/data/matchups.json` from this season's play-by-play plus nflverse schedules, rosters, injury reports and snap counts; `src/lib/broadcast.ts` words it, with a few random variants per label. The board runs from the season opener through the Super Bowl; before the opener there's no current-season play-by-play, so there's no board. Why the rules are what they are, with the replays behind them: [DESIGN.md](DESIGN.md#game-day).

## Known data gaps

- NGS participation (personnel, formation, coverage, routes, pressure) is not published for the current season yet; those columns are NULL for 2026.
- Coverage and targeted route exist only for dropbacks (~99% of them from 2023 on, ~89% in 2022).

## Deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) rebuilds the data and deploys the site to GitHub Pages on every push to `main`, daily at 08:50 UTC, and on demand (Actions → Build and deploy → Run workflow). If the pipeline's sanity checks fail, nothing is deployed and the previous site stays up.

One-time setup: in the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

The site is served under `/<repo>/`; the workflow passes that as `BASE_PATH`. To check a production build locally:

```sh
BASE_PATH=/nfl npm run build
```

GitHub disables scheduled workflows after 60 days without repository activity; re-enable it on the Actions tab if the data stops updating.

## License / attribution

NFL Scout stands on nflverse: the data and the models behind its efficiency numbers (EPA, success rate, win probability, expected pass rate) come from [nflverse](https://github.com/nflverse) and [nflfastR](https://nflfastr.com). This app adds situational splits, league comparisons and the game-day labels.

The code is MIT-licensed ([LICENSE](LICENSE)); the license doesn't cover the data.

Most nflverse data (play-by-play, NGS participation) is CC-BY 4.0. FTN charting data is CC-BY-SA 4.0 and must be credited to "ftndata.com via nflverse"; the site footer does both. NFL data, team names and logos belong to the NFL and its teams; NFL Scout is not affiliated with or endorsed by the NFL.

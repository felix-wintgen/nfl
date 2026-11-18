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

`pipeline/build.py` downloads nflverse's play-by-play, NGS participation and FTN charting, plus schedules, rosters, injury reports, snap counts and depth charts for Game day, and caches them in `pipeline/.cache`. It writes `static/data/plays_{season}.parquet` and `fourth_{season}.parquet` (every 4th down, for go-for-it rates) per season, plus `teams.json`, `games.json`, `matchups.json` and `manifest.json`. When a board looks off, look first at the data-health record in `manifest.json` ([DESIGN.md](DESIGN.md#architecture)).

The derived columns (personnel grouping, defensive package, distance bucket, field zone …) are DuckDB macros in `pipeline/derive.py`. The pipeline's tests are in `pipeline/tests/` (`npm run data:test`); the app's are run with `npm test`, its types and Svelte checks with `npm run check`.

The build exits non-zero when a sanity check fails (low join rates, too few plays for a full season).

Options: `--seasons 2025 2026` builds only those seasons, and `--refresh` re-downloads cached files.

`npm run data:backtest -- 2023 2024 2025` checks whether the DC helper's tells hold up: it picks them from weeks 1–9 and compares them with weeks 10–18. It also fits `SHRINK_PLAYS` in `src/lib/tells.ts`; rerun it once a season is complete.

## Game day

`/matchup` is a spotting board for the coming week. Per game: the line, implied score and win chance, and records; for each offense, the starting QB, four targets, the backfield and role labels; below them, who's out for each team. `pipeline/matchup.py` builds `matchups.json`, `src/lib/broadcast.ts` words it. There's no board before the season opener. The rules and the replays behind them: [DESIGN.md](DESIGN.md#game-day).

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

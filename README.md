# NFL Scout

Opponent-scouting tools built on [nflverse](https://github.com/nflverse) data: a **DC helper** (scout the opposing offense) and an **OC helper** (scout the opposing defense). It's a static SvelteKit site, with DuckDB-WASM querying parquet files in the browser. See [PLAN.md](PLAN.md).

## Setup

Requires Node and Python 3.9+.

```sh
npm install
npm run data:setup   # pipeline venv (duckdb, pytest)
npm run data         # download nflverse files, write static/data/
npm run dev
```

## Data pipeline

`pipeline/build.py` downloads play-by-play, NGS participation and FTN charting from the nflverse-data releases. It caches them in `pipeline/.cache`, joins them per play, and writes one slim `static/data/plays_{season}.parquet` per season, plus `fourth_{season}.parquet` with every 4th down including punts and field goals (for go-for-it rates). It also writes `teams.json`, `games.json` and `manifest.json`.

The derived columns (personnel grouping, defensive package, distance bucket, field zone …) are DuckDB macros in `pipeline/derive.py`, tested in `pipeline/tests/` (`npm run data:test`).

The build exits non-zero when a sanity check fails (low join rates, too few plays for a full season).

Options: `--seasons 2025 2026` builds only those seasons, and `--refresh` re-downloads cached files.

## Known data gaps

- NGS participation (personnel, formation, coverage, routes, pressure) is not published for the current season yet; those columns are NULL for 2026.
- Coverage and targeted route exist only for dropbacks (~99% of them from 2023 on, ~89% in 2022).

## Deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) rebuilds the data and deploys the site to GitHub Pages on every push to `main`, daily at 10:00 UTC, and on demand (Actions → Build and deploy → Run workflow). If the pipeline's sanity checks fail, nothing is deployed and the previous site stays up.

One-time setup: in the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

The site is served under `/<repo>/`; the workflow passes that as `BASE_PATH`. To check a production build locally:

```sh
BASE_PATH=/nfl npm run build
```

GitHub disables scheduled workflows after 60 days without repository activity; re-enable it on the Actions tab if the data stops updating.

## License / attribution

The NFL data belongs to its respective owners. The nflverse data comes with its own terms (FTN charting requires attribution).

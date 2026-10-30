# NFL Scout — plan

Two opponent-scouting tools built on nflverse data, published as a free static site.

- **DC helper**: scout the opposing **offense**. _"What am I facing?"_ What does this offense do, in which situations, and who gets the ball?
- **OC helper**: scout the opposing **defense**. _"What am I expecting?"_ Which packages, coverages and pressure will I see, and what has worked against them?

Stack: SvelteKit (`adapter-static`) + DuckDB-WASM + Observable Plot. Hosted on GitHub Pages, with data rebuilt nightly by GitHub Actions.

---

## 1. What I verified about the data

These were checked against `nflverse/nflverse-data` releases on 2026-10-30.

| Source                                                                   | Seasons                            | Size          | Gives us                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pbp/play_by_play_{season}`                                              | 1999–2026 (2026 is through week 7) | ~20 MB/season | down, distance, yardline, score, shotgun, no_huddle, pass/run, pass_location, air_yards, run_location/gap, receiver, EPA, success, WP                                                             |
| `pbp_participation/pbp_participation_{season}`                           | through **2025**, **no 2026 file** | ~5 MB         | offense_formation (80% filled), offense_personnel and defense_personnel (100%), defenders_in_box, pass rushers, was_pressure, coverage type and man/zone (49%, 2023+), route (42%), time_to_throw |
| `ftn_charting/ftn_charting_{season}`                                     | 2022–**2026**                      | ~0.6 MB       | box count, n_blitzers, n_pass_rushers, play action, screen, RPO, motion, no huddle, QB out of pocket, drops, catchable, contested                                                                 |
| `schedules/games`, `teams/teams_colors_logos`, `rosters`, `depth_charts` | all                                | small         | opponents, logos/colors, names, current depth chart                                                                                                                                               |

Consequences for the design:

1. **CORS.** GitHub release downloads redirect without `Access-Control-Allow-Origin`, so the browser can't read them directly. We **mirror the data** into our own Pages site.
2. **There's no 2026 personnel, formation or coverage data yet.** For the current season, FTN still gives us box, blitz, rushers, play action, motion, RPO and screen. Personnel, coverage and routes come from 2025 and are **clearly labelled as last season's data**. The pipeline picks up `pbp_participation_2026` automatically if it appears.
3. **Personnel needs parsing.** It's stored as position strings (`"1 C, 2 G, 1 QB, 1 RB, 2 T, 1 TE, 3 WR"`). We derive the grouping (`11`, `12`, `21` …) and the defensive package (base/nickel/dime/quarter, counted from DBs).
4. **Licensing.** The nflverse code is MIT, but the NFL data belongs to its owners. Check the FTN charting license and show attribution in the footer.

## 2. Architecture

```
GitHub Action (nightly in season, weekly offseason)
  └─ pipeline/build.py  (Python + duckdb)
       download pbp + participation + ftn + schedules + teams
       join  pbp(game_id, play_id) ⟷ participation(nflverse_game_id, play_id)
             pbp(game_id, play_id) ⟷ ftn(nflverse_game_id, nflverse_play_id)
       derive columns (below), keep only scrimmage plays
       write  static/data/plays_{season}.parquet   (slim, ~3–5 MB each)
              static/data/teams.json, games.json, manifest.json (build date, last week per season)
       sanity checks: join match rate, row counts, null rates → fail the build if off
  └─ vite build → GitHub Pages (site + data together)

Browser
  └─ DuckDB-WASM reads plays_{season}.parquet over HTTP (cached)
     filter state (team, seasons, weeks, situation) ⇄ URL query string (shareable links)
     every view = one SQL query → table / Plot chart, always with n= and league baseline
```

**Derived columns** (computed once in the pipeline, so the frontend SQL stays simple):
`off_personnel` (`11`/`12`/…), `def_package`, `dist_bucket` (1–2 / 3–6 / 7–10 / 11+), `field_zone` (own 1–20 / own 21–50 / opp 49–21 / red zone / goal to go), `score_state` (trailing 9+ / one score / leading 9+), `two_min`, `is_pass` (incl. scrambles and sacks), `is_explosive` (pass 20+, run 12+), `is_blitz` (n_blitzers > 0), `pass_depth` (behind LOS / short / intermediate / deep), and `pass_dir`.

## 3. Product

**Shared filter bar:** opponent team, seasons (default: current + last), games window (all / last 4 / last 8), down, distance bucket, field zone, score state, quarter/two-minute, home/away. Every number shows its sample size and its delta vs. league average. Small samples are greyed out.

### DC helper: opposing offense

1. **Identity card:** pass rate over expected, EPA/play, early-down pass rate, tempo (no-huddle), and 4th-down aggressiveness, each as a league percentile.
2. **Personnel & formation:** usage share of each grouping, then pass rate / EPA / success within each, plus shotgun vs. under center vs. pistol.
3. **Situational tendency grid:** down × distance (and field zone) → pass rate, play action %, screen %, RPO %, motion %.
4. **Tells:** the auto-detected most lopsided combinations, e.g. "12 personnel, under center, 1st & 10 → run 78% (n=64)".
5. **Run game:** run direction × gap distribution, with yards and success by gap.
6. **Pass game:** a depth × direction heat grid and target share by player, overall and on 3rd down and in the red zone.

### OC helper: opposing defense

1. **Identity card:** EPA/play allowed, success allowed, pressure rate, blitz rate, explosive rate allowed, as percentiles.
2. **Package vs. my personnel:** how they match up when I'm in 11/12/21 (base/nickel/dime share, box count).
3. **Coverage mix:** Cover 0/1/2/3/4/6 and man/zone by down & distance and field zone (2023+, labelled with season).
4. **Pressure profile:** blitz rate and rusher count by situation, plus pressure and sack rate.
5. **What works against them:** EPA and success allowed by coverage, route, pass depth/direction, run gap, play action vs. non-play action, and motion vs. none.
6. **3rd down and red zone:** a dedicated breakdown, since those are what coordinators prep hardest.

**Game sheet:** a print-friendly one-pager per opponent (the top tells, the tendency grid and the coverage mix).

## 4. Milestones

| #   | Milestone                                                                                            | Done when                                                                        |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| M0  | Setup: install Node (`brew install node`), SvelteKit skeleton, git, GitHub repo                      | `npm run dev` shows an empty shell                                               |
| M1  | Data pipeline (`pipeline/build.py`, pytest for the derivations)                                      | `plays_2025/2026.parquet` built locally, join match rate ≥ 95%, tests green      |
| M2  | App shell: DuckDB-WASM loader, team picker with logos, filter bar, URL state, league-baseline helper | Pick a team and see a basic run/pass split that matches a hand-checked SQL query |
| M3  | DC helper views 1–6                                                                                  | All views render for every team, 2025 and 2026                                   |
| M4  | OC helper views 1–6                                                                                  | Same, with the "last season" labels where 2026 data is missing                   |
| M5  | Nightly Action + Pages deploy + manifest "data as of" banner                                         | The public URL updates by itself after a game week                               |
| M6  | Polish: game sheet print layout, mobile, dark mode, loading states, attribution                      | Lighthouse ≥ 90, works on phone                                                  |

M1 and M2 can run in parallel once M0 is done.

## 5. Open points

- GitHub account/repo name for the public site.
- How many seasons to ship. Proposal: 2022–current (~25 MB of data total), so FTN coverage lines up.
- Whether to run a later v2 of matchup mode (my offense vs. their defense side by side).

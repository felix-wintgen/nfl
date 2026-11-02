# NFL Scout: design notes

Why the app works the way it does. How to run it is in the [README](README.md). The app is a snapshot of the current week built on nflverse data, not an archive: no history and no past-week boards.

## Data

All data comes from the `nflverse/nflverse-data` GitHub releases:

| Source                                                            | Gives us                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pbp/play_by_play_{season}`                                       | down, distance, yardline, score, pass/run, air yards, run gap, receiver, EPA, success, win probability           |
| `pbp_participation/pbp_participation_{season}`                    | personnel, formation, box, pass rushers, pressure, coverage and man/zone (2023+), routes; no current-season file |
| `ftn_charting/ftn_charting_{season}`                              | box, blitzers, rushers, play action, screen, RPO, motion; a game or so behind                                    |
| `schedules`, `teams`, `weekly_rosters`, `injuries`, `snap_counts` | games and lines, logos and colors, jersey numbers and roster status, injury reports, offensive snap shares       |

- **We mirror the data.** GitHub release downloads have no CORS headers, so the browser can't read them; the pipeline writes slim per-season parquet files into the site.
- **No current-season participation.** nflverse publishes it after the season. Personnel, formation and coverage come from last season and are labelled that way; the pipeline picks the file up if it appears.
- **nflverse timing.** Play-by-play is refreshed daily in season (09:03 UTC) and after each game window, injuries at 07:07, rosters around 06:00. The daily build at 10:00 UTC runs after all of them. It's a volunteer project with no SLA; a failed sanity check stops the deploy and the last good site stays up.

## Architecture

```
GitHub Action (every push, daily 10:00 UTC)
  └─ pipeline/build.py (Python + DuckDB)
       download, join pbp ⟷ participation ⟷ FTN per play, derive columns
       write static/data/plays_{season}.parquet, teams.json, games.json, matchups.json, manifest.json
       sanity checks (join rates, play counts) → fail the build if off
  └─ vite build → GitHub Pages

Browser
  ├─ DC/OC helpers: DuckDB-WASM queries the parquet files; filters live in the URL
  └─ Game day: reads the precomputed matchups.json, no DuckDB
```

There is no server: queries run in the visitor's browser, so the build costs the same for one user or many. Finished seasons' nflverse files are cached between builds.

Derived columns (personnel grouping, defensive package, distance bucket, field zone, score state …) are DuckDB macros in `pipeline/derive.py`, computed once so the frontend SQL stays simple.

## Game day

A broadcast spotting board: **someone who tunes in with seconds to spare knows who matters and what the broadcast will say about them.** Offense only (defense stays in the OC helper), plain broadcast wording, built around players, not team metrics. It tells you what you'll hear, not what will happen.

**Why usage.** A player's share of targets, air yards and carries carries over to the next game (r = 0.56–0.82, 2022–2026); his EPA per touch doesn't (r ≈ 0.08). Role labels rest on usage, so they hold. The rules live in `pipeline/matchup.py`, the wording in `src/lib/broadcast.ts`.

**Sticky labels.** Each label has a bar to earn it and a lower bar to keep it, replayed week by week, so the daily rebuild only changes labels after a game.

**Active games only.** Shares count only the games a player was active for (weekly roster, or he touched the ball): a missed game is missing data, not zero targets. "On the rise" skips games missed injured but counts healthy scratches as zero, so coming back from injury isn't "rising". Replayed 2022–2026: only players who missed games change; labels fire 4–15 points more often (go-to guy in 74% of team-weeks instead of 59%) and flip less. The bars weren't raised back to the old frequencies: that would take labels from healthy players (Henry 2023, Hill 2024).

**Before the final injury report** (Friday for Sunday games, Saturday for Monday), nobody has a game status. Players show "Missed last game", "Did not practice" or "Limited in practice" instead. 2022–2025: missed last game alone is a coin flip (52% sat again: 98% if still not practicing, 3% if practicing fully); with practice status it catches 79% of the players who ended up inactive. The report counts as out once any player on the team has a game status, or from the day before kickoff. Once a game is played, only "Out" is kept.

**The starter** is last game's QB, unless a QB with real starts is back from being ruled out. That exception waits for the final report: replayed 2022–2026, it was right 28% of the time midweek and 48% after the report. The QB pick is right in 90.5% of games midweek and 91.6% after. The misses that remain are mostly coach's decisions, which the data can't see.

**Who's out** lists players with 8%+ of the targets or carries, or 40%+ of the offensive snaps (blocking tight ends and depth receivers barely show in touches). 2022–2025 the snap bar adds 0.12 players per team-week. Next in line is named only for an absent go-to guy or workhorse: for snap-listed players, the teammate with the most snaps below him gained the most snaps only 37% of the time (chance: 33%).

**Early season** (weeks 1–3): there's little usage yet, so labels are thin. A fallback to last season's usage was planned but not built.

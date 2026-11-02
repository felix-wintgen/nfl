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
- **nflverse timing.** Play-by-play is refreshed after each game window, the last at 00:30 Eastern after the night game, and again daily at 05:00 Eastern in season; injuries at 07:07, rosters around 06:00. Lines for the next week go briefly blank after Monday night (Tuesday 03:30–06:45 UTC in 2025). The daily build at 08:50 UTC (off the hour, where GitHub delays scheduled runs least) runs after the night refresh and the odds gap, and in winter before the 05:00 Eastern re-pull (10:00 UTC); GitHub can still start it hours late or skip a day, and pushes rebuild too. It's a volunteer project with no SLA; a failed sanity check stops the deploy and the last good site stays up.
- **nflverse gaps we've seen.** The schedule's starting-QB columns are the pre-game listing and often stay that way after the game (57 games 2022–2026 list a QB who didn't start). Weather and referee are filled in only after a game. Rows for a new playoff round arrive over about 12 hours after the matchups are set. Each build logs a data-health record (also in `manifest.json`): what triggered it, missing files, played games whose plays aren't in yet, teams without an injury report, and how often the board leaned on nflverse's listed QB. It changes nothing on the board; it's the record for deciding which gap needs handling.

## Architecture

```
GitHub Action (every push, daily 08:50 UTC)
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

**The starter** is last game's QB, unless a QB with real starts is back from being ruled out. That exception waits for the final report: replayed 2022–2026, it was right 28% of the time midweek and 48% after the report. It also needs the returning QB to have started the last game he played in, so a former starter who lost the job (Fields to Wilson, 2024) doesn't get it back. In the playoffs, a Week 18 game in which the season's dropback leader sat or played only a series, without being listed out for an injury, doesn't count as "last game", for the QB or for "missed last game"; nflverse marks rest as "Not injury related - resting player". Replayed 2022–2025 against the QB who threw the team's first pass: regular season 94.6% after the report (93.8% midweek), Wild Card round 95.8% (was 70.8%), later rounds 98.2%. The misses that remain are mostly coach's decisions, which the data can't see.

**nflverse's listed starter** (the schedule's QB columns, filled about two days before kickoff) is a second opinion. It names the QB when we have no dropbacks for anyone available (Week 1, a backup who hasn't played), and when it names someone else who isn't ruled out, the board shows both: "Or #6 Jaxson Dart: nflverse lists him to start." Replayed 2022–2026 with the listing as it stood before kickoff: regular season, the first name is right 95.4% after the report, two names show on 5.3% of boards and one of them is right every time, and a single wrong name is left on 1.2% (5.4% before, counting blanks). Week 1 goes from no QB to 99.4%.

**The four targets** are picked by share over the games they were active for, once they have 2 games and 8 targets; raw counts before that. A receiver back from suspension or newly traded isn't buried under season totals (Rice and Meyers, 2025). Replayed 2022–2026: the game's target leader was on the board 92.0% of the time (89.8% by count), at 0.52 changed names per board per week instead of 0.47. Backs stay sorted by carries: share moved the game's rushing leader onto the board only 0.4 points more often, not worth the extra rule.

**Records, points and ranks** are the regular season's, so a playoff team isn't 13-5. Neutral sites (Super Bowl, international games) read "vs.", not "at".

**Who's out** lists players with 8%+ of the targets or carries, or 40%+ of the offensive snaps (blocking tight ends and depth receivers barely show in touches). 2022–2025 the snap bar adds 0.12 players per team-week. Next in line is named only for an absent go-to guy or workhorse: for snap-listed players, the teammate with the most snaps below him gained the most snaps only 37% of the time (chance: 33%).

**Early season** (weeks 1–3): there's little usage yet, so labels are thin, and the board says so. A fallback to last season's usage was considered and left out: too big for what it buys.

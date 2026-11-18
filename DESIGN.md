# NFL Scout: design notes

Why the app works the way it does; how to run it is in the [README](README.md). Game day is a snapshot of the coming week, with no past-week boards; the DC and OC helpers query every season since 2022.

## Data

All data comes from the `nflverse/nflverse-data` GitHub releases:

| Source                                         | Gives us                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pbp/play_by_play_{season}`                    | down, distance, yardline, score, pass/run, air yards, run gap, receiver, EPA, success, win probability           |
| `pbp_participation/pbp_participation_{season}` | personnel, formation, box, pass rushers, pressure, coverage and man/zone (2023+), routes; no current-season file |
| `ftn_charting/ftn_charting_{season}`           | box, blitzers, rushers, play action, screen, RPO, motion; a game or so behind                                    |
| `schedules`                                    | games, lines and listed starting QBs                                                                             |
| `teams`                                        | names, logos and colors                                                                                          |
| `weekly_rosters`                               | jersey numbers, positions and roster status (active, injured reserve)                                            |
| `injuries`                                     | injury reports: game status and practice participation                                                           |
| `snap_counts` (this and last season)           | offensive and defensive snap shares: who's a regular, who's out by snaps                                         |
| `depth_charts`                                 | daily depth charts: the third opinion on the starting QB                                                         |

- **We mirror it.** GitHub release downloads have no CORS headers, so the browser can't read them; the pipeline writes slim parquet and JSON files into the site.
- **When nflverse updates.** Play-by-play after each game window (the last at 00:30 Eastern, after the night game) and daily at 05:00 Eastern in season. Injury reports, rosters and depth charts more than once a day, early morning and afternoon UTC. Next week's lines go briefly blank after Monday night (Tuesday 03:30–06:45 UTC in 2025). nflverse is a volunteer project with no SLA.
- **Gaps we've seen.** The schedule's starting-QB columns stay the pre-game listing after the game (57 games 2022–2026 list a QB who didn't start). The depth chart is slow on injuries: a hurt starter stays QB1 for days (Maye, Nov 2026). Weather and referee are filled in only after a game. A new playoff round's rows arrive over about 12 hours. The roster has no Pro Football Reference id for offensive linemen and long snappers, so their snap counts don't join to them. Participation (personnel, formation, coverage, routes, pressure) comes only after the season; coverage and targeted route exist only on dropbacks (~99% from 2023, ~89% in 2022).

## Architecture

```
GitHub Action (every push, daily 08:50 UTC)
  └─ pipeline/build.py (Python + DuckDB)
       plays:     join pbp ⟷ participation ⟷ FTN per play, derive columns
                  → plays_{season}.parquet, fourth_{season}.parquet
       Game day:  matchup.py, from this season's plays plus schedules, rosters,
                  injuries, snap counts and depth charts → matchups.json
       also:      teams.json, games.json, manifest.json (with the data-health record)
       sanity checks (join rates, play counts) → fail the build if off
  └─ vite build → GitHub Pages

Browser
  ├─ Game day: reads the precomputed matchups.json, no DuckDB
  └─ DC/OC helpers: DuckDB-WASM queries the parquet files; filters live in the URL
```

- **No server.** Queries run in the visitor's browser, so the build costs the same for one user or many. Finished seasons' play files (play-by-play, participation, FTN) are cached between builds.
- **Derived columns** (personnel grouping, defensive package, distance bucket, field zone, score state …) are DuckDB macros in `pipeline/derive.py`, computed once so the frontend SQL stays simple.
- **Build timing.** 08:50 UTC: after the night play-by-play and the Tuesday odds gap, before the winter 05:00 Eastern re-pull (10:00 UTC), and away from the top of the hour, where GitHub delays scheduled runs most. GitHub can still start it hours late or skip a day, and pushes rebuild too; the corner of every page shows when the data was built. A failed sanity check stops the deploy and the last good site stays up.
- **Data-health record.** Each build logs, also into `manifest.json`: what triggered it, missing files, played games whose plays aren't in yet, regulars whose snap counts don't join (outside the line, normally none), teams without an injury report, and how the QB was picked (two names, no dropbacks yet, none, outvoted by the listing and the depth chart). It changes nothing on the board; it's the record for deciding which nflverse gap needs handling.

## Game day

A spotting board: **someone who tunes in with seconds to spare knows who matters and what the broadcast will say about them.** Players, not team metrics; plain broadcast wording; what you'll hear, not what will happen. Rules live in `pipeline/matchup.py`, wording in `src/lib/broadcast.ts`. Numbers below are replays against past seasons.

### Principles

- **Usage, not efficiency.** Shares of targets, air yards and carries carry over to the next game (r = 0.56–0.82); EPA per touch doesn't (r ≈ 0.08). Labels rest on usage.
- **Active games only.** Shares count only games a player was active for: a missed game is missing data, not zero targets. "On the rise" counts healthy scratches as zero but skips injuries, so a comeback isn't a rise. Labels fire more often for players who missed games (go-to guy 74% of team-weeks, was 59%); the bars stayed put rather than take labels from healthy players.
- **Sticky labels.** Earned at one bar, kept until clearly below a lower one, so a player at the threshold doesn't flicker. The bars are in the tag legend below the boards (`ABOUT` in `broadcast.ts`), the user-facing reference.

### The starting QB

Three opinions, each skipped if its QB is unavailable:

1. **Ours:** last game's QB (most dropbacks), unless a former starter is back: 60+ dropbacks this season, ruled out in the last three weeks, and he started the last game he played (Fields, who lost the job to Wilson in 2024, doesn't get it back). The exception waits for the final report (right 28% midweek, 48% after). In the playoffs, a Week 18 game where the starter rested ("Not injury related - resting player") doesn't count as last game (Wild Card 71% → 96%).
2. **nflverse's listed starter**, filled about two days before kickoff.
3. **QB1 on nflverse's daily depth chart.** It catches trades first (Cousins to Minnesota, 2026).

The numbers rebuild each source as the 08:50 UTC build would have seen it: the listing from nflverse's git history (`nfldata`, a commit about every 10 minutes), the depth chart from its daily snapshots, which start in August 2025, hence 2025 and 2026 only.

**After the final report, the board names the one two of them agree on**, else the depth chart's: right 99.1% (2025) and 98.7% (2026), against 96.7% and 96.0% for ours alone. **Before the report, ours comes first** (95.0% and 94.4%): the others lag behind injuries, and a hurt starter stays QB1 on the depth chart. A dissenting name is shown second, with its source; either name is right 99–100% after the report. The depth chart can't overrule ours and the listing when they agree (that would lose 12 to 8); it breaks their ties, fills blanks, and goes first only when all three differ.

### Targets and backfield

- **Four targets** by share of the targets in the games they were active for, once they have 2 games and 8 targets; by count before that. The game's target leader is on the board 92.0% of the time (89.8% by count).
- **Backs** by carries (sorting by share gained 0.4 points). Two show, a third only with a label. The backfield is a workhorse, a lead back, or a committee when the top back has under half the carries.
- **One go-to guy per team:** a second receiver with the label steps down for the bigger share.
- **"New:"** (golden fill) marks a label earned since last week; "New starter" and "Back from injury" mark a QB change.

### Who's out

**Per team, below both boards**, offense and defense together under the team's color: viewers think in teams, not possessions. Offensive linemen aren't covered, and the page says so: their snap counts don't join (see Data), and an honest gap beats a fragile name match.

- **Offense:** players with 8%+ of the targets or carries, or 40%+ of the offensive snaps (blocking tight ends barely show in touches). Without a snap this season, a regular for this team last season (half the snaps, four games) still shows, as on defense.
- **Defense:** regulars, at half the defensive snaps in the games they played for this team, over two games (one if the team has played only one). Without a snap this season, last season's share with the same team counts, so a star out since last year (Parsons) still shows; a defender traded in isn't a regular until he's played for his new team.
- **Ordered by impact:** the QB first, then usual snap share. Snap share underrates part-time stars (a lead back, an edge rusher), but position weights would be our guess.
- **Statuses:** out, injured reserve, doubtful, questionable; before the final report, "Missed last game". "New" marks a player who played the last game. The count line counts out, injured reserve and doubtful; the rest are "in doubt".
- **Next in line** is named only for an absent go-to guy or workhorse: for anyone else, the teammate next in snaps took over only 37% of the time (chance: 33%).
- **Known gap:** a player hurt in the last game shows up only once he's on the report or injured reserve. A drop in snaps would flag him earlier, but needs a replay first.

### Timing

- **Which week:** the lowest week with a game not yet played. Played games show their score; the board moves on once all are final, usually Tuesday morning. The page opens on the next game, counting one as live for four hours after kickoff.
- **Before the final report** (the day before kickoff: Friday for Sunday games), nobody has a game status, so players show "Missed last game", "Did not practice" or "Limited in practice". Together these catch 79% of the players who end up inactive; missed last game alone is a coin flip (52%). The report counts as out once any player on the team has a status, or the day before kickoff. Once a game is played, only "Out" is kept.
- **Records, points and ranks** are the regular season's, so a playoff team isn't 13-5. Neutral sites read "vs.", not "at".
- **Early season** (weeks 1–3): little usage yet, so few labels, and the board says so. Falling back to last season's usage was left out: too big for what it buys.

## DC and OC helpers

The dig-down behind Game day: the DC helper scouts an offense (situational tendencies, personnel and formation, run game, pass game, tells), the OC helper a defense (packages against your personnel, coverage, pressure, what works against them).

- **Against the league, under the same filters.** Every number sits next to the league's in the same situation (play-weighted) and is ranked among all teams. The filters (seasons, regular season or playoffs, down, distance, field zone, score, two-minute, home/away, last 4 or 8 games) apply to the league too; "last 4 games" is each team's own last four. Filters live in the URL, so every view is a shareable link.
- **Two seasons by default**, so last season's participation data fills personnel, formation and coverage while the current season has none, and the section says so. Pistol is split from shotgun only when every selected season has formation data.
- **Colors** take the point of view the section serves: tendencies above or below the league in orange and blue, the pressure profile from the defense's side, "What works against them" from your offense's (green: it works).

**Tells** are situation combinations where an offense's run/pass mix departs from the league's:

- Combinations of personnel, alignment, down, distance and field zone, in the pairs and triples a coordinator would call out.
- A team's rate is pulled toward the league by 90 plays' worth of league average. Fitted by `pipeline/tells_backtest.py` (picked from weeks 1–9, checked on weeks 10–18): unpulled tells kept 32–44% of their gap, pulled ones 79–105% (2023–2025).
- A tell needs 12 plays and a 5-point gap after pulling; they're ranked by that gap, up to eight show, and the same tell said twice ("1st down" and "1st & 7–10", same direction) shows once.
- Rerun the backtest once a season is complete (`npm run data:backtest`).

# NFL Scout: design notes

Why the app works the way it does. How to run it is in the [README](README.md). The app is a snapshot of the current week built on nflverse data, not an archive: no history and no past-week boards.

## Data

All data comes from the `nflverse/nflverse-data` GitHub releases:

| Source                                               | Gives us                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pbp/play_by_play_{season}`                          | down, distance, yardline, score, pass/run, air yards, run gap, receiver, EPA, success, win probability           |
| `pbp_participation/pbp_participation_{season}`       | personnel, formation, box, pass rushers, pressure, coverage and man/zone (2023+), routes; no current-season file |
| `ftn_charting/ftn_charting_{season}`                 | box, blitzers, rushers, play action, screen, RPO, motion; a game or so behind                                    |
| `schedules`, `teams`, `weekly_rosters`, `injuries`   | games and lines, logos and colors, jersey numbers and roster status, injury reports                              |
| `snap_counts` (this and last season), `depth_charts` | offensive and defensive snap shares; daily depth charts, for the starting QB                                     |

- **We mirror the data.** GitHub release downloads have no CORS headers, so the browser can't read them; the pipeline writes slim per-season parquet files into the site.
- **No current-season participation.** nflverse publishes it after the season. Personnel, formation and coverage come from last season and are labelled that way; the pipeline picks the file up if it appears.
- **nflverse timing.** Play-by-play is refreshed after each game window, the last at 00:30 Eastern after the night game, and again daily at 05:00 Eastern in season; injury reports, rosters and depth charts more than once a day, in the early morning UTC and again in the afternoon (all three around 16:30 UTC on Nov 18, 2026), so a Friday report is on the board by Saturday's build. Lines for the next week go briefly blank after Monday night (Tuesday 03:30–06:45 UTC in 2025). The daily build at 08:50 UTC (off the hour, where GitHub delays scheduled runs least) runs after the night refresh and the odds gap, and in winter before the 05:00 Eastern re-pull (10:00 UTC); GitHub can still start it hours late or skip a day, and pushes rebuild too. It's a volunteer project with no SLA; a failed sanity check stops the deploy and the last good site stays up.
- **nflverse gaps we've seen.** The schedule's starting-QB columns are the pre-game listing and often stay that way after the game (57 games 2022–2026 list a QB who didn't start). Weather and referee are filled in only after a game. Rows for a new playoff round arrive over about 12 hours after the matchups are set. Each build logs a data-health record (also in `manifest.json`): what triggered it, missing files, played games whose plays aren't in yet, teams without an injury report, and how the QB was picked (two names shown, a QB with no dropbacks yet, none, outvoted by the listing and the depth chart). It changes nothing on the board; it's the record for deciding which gap needs handling.

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

## DC and OC helpers

Where Game day is the 30-second view, the helpers dig down: the DC helper scouts an offense (situational tendencies, personnel and formation, run game, pass game, tells), the OC helper a defense (packages against your personnel, coverage, pressure, what works against them).

**Everything against the league, under the same filters.** A number alone means little; every one is shown next to the league's in the same situation (play-weighted) and ranked among all teams under the same filters. The filters (seasons, regular season or playoffs, downs, distance, field zone, score, two-minute, home/away, last 4 or 8 games) apply to the league too, so "3rd & 3–6 in the red zone" compares like with like. "Last 4 games" keeps each team's own last four, not the scouted team's dates. Filters live in the URL, so every view is a shareable link.

**Two seasons by default.** The current season has no participation data (personnel, formation, coverage, routes, pressure) until nflverse publishes it after the season; with last season selected too, those sections fill from it and say so. Pistol is split out from shotgun only when every selected season has formation data; otherwise the two are shown together.

**Tells** are situation combinations (personnel, alignment, down, distance, field zone, in the pairs and triples a coordinator would call out) where an offense's run/pass mix departs from the league's in the same combination. A team's rate is pulled toward the league by 90 plays' worth of league average before comparing: fitted by `pipeline/tells_backtest.py` (tells picked from weeks 1–9, checked on weeks 10–18), unshrunk tells kept only 32–44% of their gap in the second half (2023–2025), shrunk ones 79–105%. A tell needs 12 plays and a 5-point gap after shrinking; they're ranked by that expected gap, so a big sample with a moderate gap beats a tiny extreme one, up to eight are shown, and the same tell said twice ("1st down" and "1st & 7–10", same direction) is shown once. Rerun the backtest once a season is complete (`npm run data:backtest`).

**Colors** are from the point of view the section serves: tendencies above or below the league in orange and blue, the pressure profile from the defense's side, "What works against them" from your offense's (green: it works).

## Game day

A broadcast spotting board: **someone who tunes in with seconds to spare knows who matters and what the broadcast will say about them.** Built around the offenses (the defense shows up as who's missing; its tendencies stay in the OC helper), plain broadcast wording, around players, not team metrics. It tells you what you'll hear, not what will happen.

**Why usage.** A player's share of targets, air yards and carries carries over to the next game (r = 0.56–0.82, 2022–2026); his EPA per touch doesn't (r ≈ 0.08). Role labels rest on usage, so they hold. The rules live in `pipeline/matchup.py`, the wording in `src/lib/broadcast.ts`.

**Sticky labels.** Each label has a bar to earn it and a lower bar to keep it, replayed week by week, so the daily rebuild only changes labels after a game. The bars, in plain words, are in the tag legend below the boards (`ABOUT` in `src/lib/broadcast.ts`, matching `pipeline/matchup.py`); that legend is the user-facing reference, so they aren't repeated here.

**Active games only.** Shares count only the games a player was active for (weekly roster, or he touched the ball): a missed game is missing data, not zero targets. "On the rise" skips games missed injured but counts healthy scratches as zero, so coming back from injury isn't "rising". Replayed 2022–2026: only players who missed games change; labels fire 4–15 points more often (go-to guy in 74% of team-weeks instead of 59%) and flip less. The bars weren't raised back to the old frequencies: that would take labels from healthy players (Henry 2023, Hill 2024).

**Before the final injury report** (Friday for Sunday games, Saturday for Monday), nobody has a game status. Players show "Missed last game", "Did not practice" or "Limited in practice" instead. 2022–2025: missed last game alone is a coin flip (52% sat again: 98% if still not practicing, 3% if practicing fully); with practice status it catches 79% of the players who ended up inactive. The report counts as out once any player on the team has a game status, or from the day before kickoff. Once a game is played, only "Out" is kept.

**Our starter rule**: last game's QB, unless a QB with real starts is back from being ruled out. That exception waits for the final report: replayed 2022–2026, it was right 28% of the time midweek and 48% after the report. It also needs the returning QB to have started the last game he played in, so a former starter who lost the job (Fields to Wilson, 2024) doesn't get it back. In the playoffs, a Week 18 game in which the season's dropback leader sat or played only a series, without being listed out for an injury, doesn't count as "last game", for the QB or for "missed last game"; nflverse marks rest as "Not injury related - resting player". Replayed 2022–2025 against the QB who threw the team's first pass, this rule alone: regular season 94.6% after the report (93.8% midweek), Wild Card round 95.8% (was 70.8%), later rounds 98.2%. The misses that remain are mostly coach's decisions, which the data can't see.

**Two more opinions: nflverse's listed starter and the depth chart.** The schedule's QB columns are filled about two days before kickoff; nflverse's depth charts are daily snapshots, and caught trades first (Cousins to Minnesota, 2026: QB1 on their depth chart days before his first game for them). Each is skipped if its QB is unavailable. **After the final report, the first name is the one two of the three agree on**, else the depth chart's; the other name is shown too, with where it comes from ("Or #8 Kirk Cousins: first on the depth chart."). **Before the report, ours stays first**: the listing and the depth chart lag behind injuries (a hurt starter stays QB1 on the depth chart: McCarthy, Lamar Jackson, Purdy 2025). Replayed with each source as the 08:50 UTC build would have seen it, against the QB who threw the team's first pass (2025 and 2026 through Week 10, when the depth chart is daily): after the report, the first name is right 99.1% and 98.7% (ours alone 96.7% and 96.0%; nflverse's listing first, 97.0% and 94.0%), and either name 100% and 99.3%; midweek 95.0% and 94.4%. When ours and the listing disagree, the depth chart sides with the right one 40 times out of 46. Taking the depth chart over both others is a loss (right 8 times, wrong 12), so it only ever breaks a tie or fills a blank. Most misses left are Week 18 rest, where the listing names the backup and is shown second.

**The four targets** are picked by share over the games they were active for, once they have 2 games and 8 targets; raw counts before that. A receiver back from suspension or newly traded isn't buried under season totals (Rice and Meyers, 2025). Replayed 2022–2026: the game's target leader was on the board 92.0% of the time (89.8% by count), at 0.52 changed names per board per week instead of 0.47. Backs stay sorted by carries: share moved the game's rushing leader onto the board only 0.4 points more often, not worth the extra rule.

**Smaller rules on the board.** One go-to guy per team: if a second receiver also has the label, he steps down for the one with the bigger share. The backfield is a workhorse, a lead back, or a committee when the top back has under half the carries; two backs show, a third only with a label. "New:" with a golden fill marks a label earned since last week; "New starter" and "Back from injury" mark a QB change. The QB exception for a starter back from injury needs 60+ dropbacks this season and a game ruled out in the last three weeks.

**Which week.** The board shows the lowest week with a game not yet played: a game already played that week shows its final score, and the board moves on once every game is final, usually Tuesday morning after Monday night. The page opens on the next game, counting a game as live for four hours after kickoff.

**Records, points and ranks** are the regular season's, so a playoff team isn't 13-5. Neutral sites (Super Bowl, international games) read "vs.", not "at".

**The offense's list** of who's out names players with 8%+ of the targets or carries, or 40%+ of the offensive snaps (blocking tight ends and depth receivers barely show in touches). 2022–2025 the snap bar adds 0.12 players per team-week. Next in line is named only for an absent go-to guy or workhorse: for snap-listed players, the teammate with the most snaps below him gained the most snaps only 37% of the time (chance: 33%). The list is ordered by impact, not status: the QB first, then usual share of the snaps, so a questionable star leads an out depth receiver. Snap share underrates part-time stars (a workhorse back, an edge rusher); weighting positions would be our guess, so we don't.

**Who's out is per team**, below both boards, offense and defense together under the team's color, with one count of regulars out for sure. Viewers think in teams, not possessions: a banged-up team's story belongs in one place. (Showing the defense on the opposing offense's board followed the matchup, but split one team's injuries across two cards, one in the other team's color.)

**The defense's list** names regulars (half the defensive snaps in the games they played for this team, over at least two games, or one if the team has played only one) who are out, on injured reserve, doubtful or questionable, and before the final report, who missed the last game. A player without a snap this season counts by last season's share with the same team, so a star out since last year (Parsons 2026) still shows. Only snaps for the team count: a defender traded in isn't its regular before he's played for it (Bates and Davis, Jacksonville 2026, showed as "missed last game" when they'd only just arrived). Ordered by snap share. "New", on offense and defense, marks a player who played the last game. The count counts only regulars out for sure (out, injured reserve, doubtful), offense and defense; questionable players and, before the report, those who missed the last game are "in doubt". A player hurt in the last game shows up once he's on the report or on injured reserve, not before: a big drop in snaps would flag him days earlier, but that needs a replay first.

**Early season** (weeks 1–3): there's little usage yet, so labels are thin, and the board says so. A fallback to last season's usage was considered and left out: too big for what it buys.

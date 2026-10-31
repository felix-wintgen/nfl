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

**Status (2026-10-30):** M0–M6 are done and live at https://felix-wintgen.github.io/nfl/. Lighthouse on the live site scores 95–100 for performance and 100 for accessibility, best practices and SEO. Still to confirm for M5: the first unattended daily refresh after a game week.

## 5. Resolved points

- Repo: `felix-wintgen/nfl` (public), deployed by GitHub Actions to Pages.
- Seasons: 2022–current; the whole dataset is ~4 MB.
- Matchup mode: a game-day screen of its own, offense only and built around players (section 7). The podcast mode builds on it.

## 6. Next: podcast mode

A "next week in the NFL" mode that does what podcasters do (fill airtime with confident, mostly predictable takes), except every take is a checkable claim, graded automatically after the games, with a persona leaderboard. It's purely for fun: the goal is to beat them at their own game.

### 6.1 Matchup edges

Every game is two matchups: home offense vs. away defense, and the reverse. For each pairing, compare the offense's league percentile with the defense's on matching metrics:

| Offense                                       | vs. defense                 |
| --------------------------------------------- | --------------------------- |
| Pass EPA / success                            | Pass EPA / success allowed  |
| Run EPA, yards per carry by lane              | Same, allowed, by lane      |
| Explosive rate                                | Explosive rate allowed      |
| Pressure rate faced, time to throw            | Pressure rate, blitz rate   |
| Production vs. man / zone, by coverage        | Man rate, coverage mix      |
| 3rd-down conversion                           | 3rd-down conversion allowed |
| Red-zone TD rate                              | Red-zone TD rate allowed    |
| Pass rate over expected, early-down pass rate | Pass rate faced             |

An **edge** is a large gap between the two percentiles (for example an offense in the top 5 in run EPA against a defense in the bottom 5). The biggest edges per game are what the personas talk about. The matchup page shows both pairings side by side, with the edges highlighted.

**Backtest (2026-10-31, 1,908 team-games 2022–2026, week 4 on, earlier weeks only):** paired season-to-date numbers predict a game only after heavy shrinkage (about 400 league-average plays; defense needs about four times more than offense). Even then only broad efficiency holds (EPA/play, success rate, pass EPA, early-down pass rate). Fine-grained pairings are noise: deep passes vs. deep defense held their direction in 51% of the most lopsided matchups, run lanes 59%. Strength meeting weakness adds nothing beyond offense + defense − league, opponent adjustment gains 0.3 points, and a margin built from the pairings does not beat the spread (46.6% against the spread on its biggest disagreements). So edges are for the personas' talk, not for predictions, which suits the joke.

Data: `schedules/games.parquet` already has next week's games plus `spread_line`, `total_line` and moneylines (checked: all 14 week-8 games have lines). Edges must use only plays from **before** that game's week, so backtests don't leak results.

### 6.2 Personas

A persona is a set of biases (which edges it weighs and how much) plus a voice. Proposed lineup, to be tuned:

| Persona           | Bias                                                     | Voice                     |
| ----------------- | -------------------------------------------------------- | ------------------------- |
| The Analytics Bro | EPA, pass rate over expected, 4th-down aggressiveness    | "Just go for it."         |
| Old-School Coach  | Run game, turnovers, defense, "physicality"              | "Establish the run."      |
| The Vibes Guy     | Last 4 games only, streaks, narratives                   | "They just _feel_ hot."   |
| The Contrarian    | Fades the biggest edge and the betting favorite          | "Everyone's sleeping on…" |
| The Homer         | Always picks one fixed team (team TBD)                   | Unconditional             |
| Captain Obvious   | Near-tautologies only ("the team with more points wins") | Confident                 |

Captain Obvious is the control group. He'll probably top raw accuracy, which is why there's also a boldness score.

### 6.3 Takes and grading

Every take is a structured, checkable claim with a threshold, graded from play-by-play and the final score:

- **Picks:** winner, against the spread, over/under (from the nflverse lines).
- **Claims:** for example "DET runs 30+ times", "KC allows 3+ sacks", "both teams score 24+", "PHI goes for it on 4th down at least once", "QB X throws for 250+".
- **Scores per persona:** winner accuracy, accuracy against the spread, claim accuracy, and **boldness**: claims weighted by how unlikely they were (base rate from the league). That way safe platitudes earn little.

Take wording comes from per-persona templates filled in from the edge and the claim. An optional later step has Claude rewrite the wording in each persona's voice in the nightly Action (API key as a GitHub secret, a few cents per week). Picks and grading stay deterministic either way.

### 6.4 Backtesting

Run every persona over 2022–current, week by week, using only data from before each week. That gives a full leaderboard from day one. It doubles as a test: no persona should beat the spread by much over 4+ seasons, and if one does, look for leakage first.

### 6.5 Freezing picks

Picks for the upcoming week are generated in the daily Action and **committed** to the repo (`picks/{season}_{week}.json`, which needs `contents: write`). A week's file is never changed after its first kickoff. Grading reads the frozen file, so no persona can "update" a take after the fact.

### 6.6 Milestones

| #             | Milestone                                                                    | Done when                                                                           |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P1            | Edge engine: per-team percentiles as of a given week, both pairings per game | Edges for week 8 match hand-checked SQL; no plays from week ≥ N used for week N     |
| P2            | Claim catalog + grader                                                       | Each claim type graded correctly on a few hand-checked past games                   |
| P3            | Personas + templates (no LLM)                                                | Every persona produces picks and 3–5 takes per game                                 |
| P4            | Backtest 2022–current + leaderboard page                                     | Leaderboard renders; results are sane (no persona far above 50% against the spread) |
| P5            | Matchup page for the upcoming week                                           | All games of the week, both pairings, edges, persona takes                          |
| P6            | Freezing picks in CI, weekly grading                                         | Next week's picks are committed before kickoff and graded automatically afterwards  |
| P7 (optional) | Claude-written persona voice                                                 | Takes read like the persona; grading unchanged                                      |

### 6.7 Open questions

- Final persona lineup and names.
- The Homer's team.
- Picks against the spread and over/under, or winners only? (Proposal: all three. The lines are already in the data.)
- Claude for the wording: from the start, later, or never?

## 7. Next: matchup screen ("spotting board")

TV announcers prepare with spotting boards: every player's number, name and two or three talking points. This screen is the viewer's spotting board. Goal: **someone who tunes in with 3 seconds to spare knows who matters and what the broadcast will say about them.**

Decided (2026-10-31): **offense only** (defense is for connoisseurs and stays in the OC helper), **plain, broadcast-style wording**, built around **people**, not team metrics.

Why people and usage: a player's share of targets, air yards and carries carries over to the next game (r = 0.56–0.82, 2022–2026); his EPA per touch doesn't (r ≈ 0.08). Role stories rest on usage, so they hold. The screen tells you what you'll hear, not what will happen; it makes no predictions.

### 7.1 Layout

One game per screen, two halves, read top to bottom:

```
CHI @ SEA · Mon 8:15 pm ET · Seattle by 3.5 · line says 24–21
records · division game · roof / weather · head coaches

WHEN SEATTLE HAS THE BALL
  QB     #14 Darnold         role label + one broadcast line
  Targets  3–4 cards         #number, name, role label, one line
  Backfield                  "workhorse" or "committee", with the split
WHEN CHICAGO HAS THE BALL
  (mirrored)
WHO'S OUT                    QB/WR/TE/RB on the injury report, and who steps up
```

On a phone the halves stack; printed, it's one page. A game picker lists the week's games, defaulting to the next kickoff. URL: `/matchup?game=2026_08_CHI_SEA`. No headshots (NFL/ESPN images); jersey numbers in team colors carry the identity.

### 7.2 Role labels

Each player gets at most one label, picked by simple rules from season-to-date usage, plus one supporting fact. Starting points; thresholds get calibrated on 2022–2025 so each label fires for a sensible number of players league-wide:

| Role      | Label                    | Rule (draft)                                             |
| --------- | ------------------------ | -------------------------------------------------------- |
| QB        | Gunslinger               | High aDOT / deep-throw rate                              |
| QB        | Quick game               | Low aDOT, ball out early                                 |
| QB        | Dual threat              | Scrambles + designed runs well above league              |
| QB        | Under siege              | Sack rate well above league                              |
| QB        | Turnover watch / careful | INT rate high / low (season so far)                      |
| Target    | The go-to guy            | Target share ≥ ~25%                                      |
| Target    | Deep threat              | High air-yard share and long aDOT                        |
| Target    | Security blanket         | TE or RB, short aDOT, big 3rd-down share                 |
| Target    | Red-zone target          | Large share of red-zone targets                          |
| Target    | On the rise              | Share over the last 3 games well above his earlier share |
| Target    | Rookie                   | `rookie_year` = season (combines with another label)     |
| Backfield | Workhorse                | ≥ ~65% of RB carries                                     |
| Backfield | Committee                | No back above ~50%                                       |
| Backfield | Passing-down back        | RB with a big 3rd-down target share                      |
| Backfield | Goal-line back           | Most carries inside the 5                                |

Broadcast lines are templates with 2–3 variants per label (no LLM), e.g. _"Smith-Njigba is the engine: half of Seattle's air yards go his way."_ The same labels later feed the podcast personas.

Shares count only the games a player was active for (weekly roster, or he touched the ball): a missed game is missing data, not zero targets. "On the rise" skips games he missed injured but counts healthy scratches as zero, so a player coming back from injury doesn't "rise". Replaying 2022–2026 both ways: only players who missed games change; labels fire 4–15 points more often (go-to guy for 74% of team-weeks instead of 59%), every label flips less, and the bars stay as they were. Raising them to the old frequencies would take labels from healthy players (Henry 2023, Hill 2024), so they weren't raised.

Before a team's final injury report (Friday for Sunday games, Saturday for Monday), nobody has a game status, so the board showed everyone as healthy: 2022–2025, about 0.6 board players per team-week ended up inactive. Until the report is out, players get "Missed last game", "Did not practice" or "Limited in practice". Carrying last week's status forward alone is a coin flip (52% sat again: 98% if still not practicing, 3% if practicing fully); with practice status it catches 79% of the inactive players. The report counts as out once any player on the team has a game status, or from the day before kickoff.

Who's out lists players with 8%+ of the targets or carries, or 40%+ of the offensive snaps: blocking tight ends and fullbacks barely show in touches (week 8, 2026: Kmet, Smythe, Oliver, Bates). No next in line for them: 2022–2025, the teammate with the most snaps below him gained the most snaps only 37% of the time (chance: 33%).

Early season (weeks 1–3): too little data, so fall back to last season's usage, labelled "last season".

### 7.3 Data

All from nflverse-data releases (checked 2026-10-31: 2026 files exist; rosters and injury reports are through week 8):

- `weekly_rosters/roster_weekly_{season}.parquet`: jersey number, position, status, `rookie_year`; joins to play-by-play on `gsis_id` = `receiver_player_id` / `rusher_player_id` / passer id.
- `injuries/injuries_{season}.parquet`: `report_status` (Out / Doubtful / Questionable) and practice status for the current week.
- `schedules/games.parquet` (already cached): lines, kickoff time, rest, roof, temperature, wind, coaches, QBs.

The pipeline precomputes one `matchups_{season}.json` for the upcoming week (labels, facts, injuries), so the screen loads instantly without DuckDB. Role rules live in Python with pytest, like the derivations. Injury reports are final on Friday; the 10:00 UTC daily build picks them up Saturday morning, after Thursday's game (an extra Friday-evening run is an option).

### 7.4 Milestones

| #   | Milestone                                                                 | Done when                                                                                              |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| S1  | Pipeline: rosters, injuries, extended schedule → `matchups_{season}.json` | Week-8 file has every game, both offenses, jersey numbers match the roster                             |
| S2  | Role engine + broadcast lines (Python, pytest)                            | Labels calibrated on 2022–2025; hand-checked for a few teams (e.g. Smith-Njigba = deep threat / go-to) |
| S3  | Matchup page: picker, header, two halves, who's out                       | Renders for every week-8 game, phone and print                                                         |
| S4  | Links and polish                                                          | Linked from the home page and the DC helper; Lighthouse unchanged                                      |

**Status (2026-10-31):** S1–S3 built (`pipeline/matchup.py`, `src/lib/broadcast.ts`, `/matchup`); the board prints on one page. S4 done: Game day is in the nav and on the home page, and the DC/OC headers link to the team's next game. Labels are sticky (enter/stay bars, replayed week by week), so the daily rebuild only changes them after a game; injury reports update daily. The starter is last game's QB, unless a QB with real starts is back from being ruled out (week 8: Lamar Jackson over Tyler Huntley). That exception waits for the team's final injury report: replayed 2022–2026, it was right 28% of the time midweek (not ruled out yet only means no status) and 48% after the report; gated, the QB pick is right in 90.5% of games midweek and 91.6% after.

### 7.5 Open questions

- How many targets per team: 3 or 4?
- Wording of the lines: how broadcasty before it turns into the podcast mode?
- Extra Friday-evening build for final injury statuses?

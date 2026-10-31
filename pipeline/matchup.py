"""Game-day "spotting board" data for the upcoming week.

For every game of the next unfinished week: the line, both offenses' QB,
top targets and backfield with role labels, and who's out. Writes
static/data/matchups.json; the matchup page turns labels into broadcast lines.

Labels rest on usage (targets, air yards, carries), which carries over from
game to game; efficiency per touch barely does. Shares count only the games a
player was active for: a missed game is missing data, not a game with zero targets. They are sticky: the season
is replayed week by week, and a label, once earned, stays until the player
falls clearly below the bar, so a player hovering at a threshold doesn't
flicker between weeks.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Dict, List, NamedTuple, Optional, Set, Tuple

import duckdb

Stats = Dict[str, float]
Rule = Tuple[str, Callable[[Stats], bool], Callable[[Stats], bool]]


class Availability(NamedTuple):
    """Who could play when. A player is active for a game if the weekly roster has
    him active for that team or he touched the ball in it."""
    active: Set[Tuple[str, str, int]]  # (id, team, week) on the active roster
    hurt: Set[Tuple[str, int]]         # (id, week) on the injury report or injured reserve

# (label, enter, stay). Earlier labels win when a player qualifies for several.
TARGET_RULES: List[Rule] = [
    ("go_to",
     lambda s: s["targets"] >= 15 and s["share"] >= 0.25,
     lambda s: s["share"] >= 0.21),
    ("deep_threat",
     lambda s: s["targets"] >= 12 and s["adot"] >= 13 and s["ay_share"] >= 0.15,
     lambda s: s["adot"] >= 11.5 and s["ay_share"] >= 0.12),
    ("red_zone",
     lambda s: s["rz_targets"] >= 5 and s["rz_share"] >= 0.30,
     lambda s: s["rz_targets"] >= 4 and s["rz_share"] >= 0.25),
    ("security_blanket",
     lambda s: s["pos"] in ("TE", "RB") and s["share"] >= 0.15 and s["adot"] <= 7 and s["third_share"] >= 0.18,
     lambda s: s["pos"] in ("TE", "RB") and s["share"] >= 0.12 and s["adot"] <= 8),
]

BACK_RULES: List[Rule] = [
    ("workhorse",
     lambda s: s["carries"] >= 40 and s["rb_share"] >= 0.76,
     lambda s: s["rb_share"] >= 0.70),
    ("passing_down",
     lambda s: s["targets"] >= 15 and s["rb_third_share"] >= 0.6,
     lambda s: s["targets"] >= 12 and s["rb_third_share"] >= 0.5),
    ("goal_line",
     lambda s: s["inside5"] >= 5 and s["inside5_share"] >= 0.6,
     lambda s: s["inside5"] >= 4 and s["inside5_share"] >= 0.5),
]

QB_RULES: List[Rule] = [
    ("gunslinger",
     lambda s: s["attempts"] >= 60 and s["adot"] >= 8.8,
     lambda s: s["adot"] >= 8.3),
    ("quick_game",
     lambda s: s["attempts"] >= 60 and s["adot"] <= 6.3,
     lambda s: s["adot"] <= 6.8),
    ("dual_threat",
     lambda s: s["dropbacks"] >= 60 and (s["run_rate"] >= 0.12 or s["rush_ypg"] >= 30),
     lambda s: s["run_rate"] >= 0.10 or s["rush_ypg"] >= 25),
    ("under_siege",
     lambda s: s["dropbacks"] >= 60 and s["sack_rate"] >= 0.09,
     lambda s: s["sack_rate"] >= 0.08),
    ("turnover_watch",
     lambda s: s["attempts"] >= 80 and s["int_rate"] >= 0.03,
     lambda s: s["int_rate"] >= 0.026),
    ("careful",
     lambda s: s["attempts"] >= 120 and s["int_rate"] <= 0.012,
     lambda s: s["int_rate"] <= 0.015),
]


def apply_rules(rules: List[Rule], s: Stats, held: List[str]) -> List[str]:
    """Labels for this week: newly earned ones, plus held ones the player still keeps."""
    return [name for name, enter, stay in rules if enter(s) or (name in held and stay(s))]


def on_the_rise(s: Stats) -> bool:
    """Not sticky: it is news by definition."""
    return s["games"] >= 5 and s["last3_share"] >= max(0.18, s["early_share"] + 0.08)


def implied_scores(spread: Optional[float], total: Optional[float]) -> Optional[Tuple[float, float]]:
    """(home, away) points implied by the line; nflverse spread_line > 0 means the home team is favored."""
    if spread is None or total is None:
        return None
    return round((total + spread) / 2, 1), round((total - spread) / 2, 1)


def win_prob(home_ml: Optional[float], away_ml: Optional[float]) -> Optional[float]:
    """Home win probability from American moneylines, with the bookmaker's margin removed."""
    if not home_ml or not away_ml:
        return None

    def p(ml: float) -> float:
        return -ml / (-ml + 100) if ml < 0 else 100 / (ml + 100)

    h, a = p(home_ml), p(away_ml)
    return round(h / (h + a), 3)


def record(results: List[Tuple[int, int]]) -> str:
    """'W-L' or 'W-L-T' from (points for, points against) pairs."""
    w = sum(f > a for f, a in results)
    l = sum(f < a for f, a in results)
    t = len(results) - w - l
    return f"{w}-{l}" + (f"-{t}" if t else "")


# ---------------------------------------------------------------------------
# Season-to-date usage, per week, for the replay.

PLAYER_SQL = """
WITH p AS (
    SELECT * FROM read_parquet({files}, union_by_name = true)
    WHERE season = {season} AND week < {week}
),
weeks AS (SELECT DISTINCT week AS w FROM p UNION SELECT {week}),
games AS (  -- team game number, for "last 3 games"
    SELECT posteam AS team, game_id, week,
           row_number() OVER (PARTITION BY posteam ORDER BY week DESC) AS back
    FROM (SELECT DISTINCT posteam, game_id, week FROM p)
),
tg AS (
    SELECT w.w, p.posteam AS team, p.receiver_player_id AS id,
           count(*) AS targets, sum(p.air_yards) AS ay,
           count(*) FILTER (WHERE p.field_zone IN ('red zone', 'goal to go')) AS rz_targets,
           count(*) FILTER (WHERE p.down = 3) AS third_targets,
           count(*) FILTER (WHERE p.is_complete) AS rec,
           coalesce(sum(p.yards_gained) FILTER (WHERE p.is_complete), 0) AS rec_yards,
           count(*) FILTER (WHERE p.is_td AND p.is_complete) AS rec_td,
           count(DISTINCT p.game_id) AS games
    FROM weeks w JOIN p ON p.week < w.w
    WHERE p.is_pass AND p.receiver_player_id IS NOT NULL
    GROUP BY ALL
),
ru AS (
    SELECT w.w, p.posteam AS team, p.rusher_player_id AS id,
           count(*) AS carries, sum(p.yards_gained) AS rush_yards,
           count(*) FILTER (WHERE p.yardline_100 <= 5) AS inside5,
           count(*) FILTER (WHERE p.is_td) AS rush_td
    FROM weeks w JOIN p ON p.week < w.w
    WHERE NOT p.is_pass AND p.rusher_player_id IS NOT NULL
    GROUP BY ALL
),
qb AS (  -- dropbacks: passes, sacks and scrambles
    SELECT w.w, p.posteam AS team,
           coalesce(p.passer_player_id, p.rusher_player_id) AS id,
           count(*) AS dropbacks,
           count(*) FILTER (WHERE NOT p.is_sack AND NOT p.is_scramble) AS attempts,
           count(*) FILTER (WHERE p.is_complete) AS completions,
           coalesce(sum(p.yards_gained) FILTER (WHERE NOT p.is_sack AND NOT p.is_scramble), 0) AS pass_yards,
           count(*) FILTER (WHERE p.is_td AND NOT p.is_scramble AND NOT p.is_sack) AS pass_td,
           count(*) FILTER (WHERE p.is_int) AS ints,
           count(*) FILTER (WHERE p.is_sack) AS sacks,
           count(*) FILTER (WHERE p.is_scramble) AS scrambles,
           coalesce(sum(p.yards_gained) FILTER (WHERE p.is_scramble), 0) AS scramble_yards,
           avg(p.air_yards) AS adot,
           avg((p.air_yards >= 20)::INT) FILTER (WHERE p.air_yards IS NOT NULL) AS deep_rate,
           avg(p.epa) AS epa,
           count(DISTINCT p.game_id) AS games
    FROM weeks w JOIN p ON p.week < w.w
    WHERE p.is_pass AND coalesce(p.passer_player_id, p.rusher_player_id) IS NOT NULL
    GROUP BY ALL
),
recent AS (  -- targets in the team's last 3 games before week w
    SELECT w.w, p.posteam AS team, p.receiver_player_id AS id, count(*) AS t3
    FROM weeks w JOIN p ON p.week < w.w
    JOIN (SELECT w2.w, g.team, g.game_id
          FROM weeks w2 JOIN games g ON g.week < w2.w
          QUALIFY row_number() OVER (PARTITION BY w2.w, g.team ORDER BY g.week DESC) <= 3) l
      ON l.w = w.w AND l.team = p.posteam AND l.game_id = p.game_id
    WHERE p.is_pass AND p.receiver_player_id IS NOT NULL
    GROUP BY ALL
),
per_game AS (  -- each player's usage per game: team totals for the weeks he was active
    SELECT posteam AS team, week, id, count(*) FILTER (WHERE kind = 'tg') AS targets,
           sum(ay) AS ay, sum(rz) AS rz_targets, sum(third) AS third_targets,
           count(*) FILTER (WHERE kind = 'ru') AS carries, sum(i5) AS inside5
    FROM (
        SELECT posteam, week, receiver_player_id AS id, 'tg' AS kind, air_yards AS ay,
               (field_zone IN ('red zone', 'goal to go'))::INT AS rz, (down = 3)::INT AS third, 0 AS i5
        FROM p WHERE is_pass AND receiver_player_id IS NOT NULL
        UNION ALL
        SELECT posteam, week, rusher_player_id, 'ru', 0, 0, 0, (yardline_100 <= 5)::INT
        FROM p WHERE NOT is_pass AND rusher_player_id IS NOT NULL
    )
    GROUP BY ALL
)
"""


def _rows(con: duckdb.DuckDBPyConnection, sql: str) -> List[Dict]:
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def usage(con: duckdb.DuckDBPyConnection, files: List[str], season: int, week: int) -> Dict[str, List[Dict]]:
    """Per-week season-to-date usage tables: target, rush, qb, team games, and per-game usage."""
    head = PLAYER_SQL.format(files=files, season=season, week=week)
    out = {
        "target": _rows(con, head + "SELECT tg.*, coalesce(recent.t3, 0) AS t3 FROM tg LEFT JOIN recent USING (w, team, id)"),
        "rush": _rows(con, head + "SELECT * FROM ru"),
        "qb": _rows(con, head + "SELECT * FROM qb"),
        "games": _rows(con, head + """
            SELECT w.w, p.posteam AS team, count(DISTINCT p.game_id) AS games
            FROM weeks w JOIN p ON p.week < w.w GROUP BY ALL"""),
        "per_game": _rows(con, head + "SELECT * FROM per_game"),
    }
    return out


def availability(con: duckdb.DuckDBPyConnection, roster_file: Path, injuries_file: Optional[Path]) -> Availability:
    """Season-long availability from the weekly rosters and injury reports."""
    active = {(r["gsis_id"], r["team"], r["week"]) for r in _rows(con, f"""
        SELECT gsis_id, team, week FROM read_parquet('{roster_file}') WHERE status = 'ACT'""")}
    # Any injury listing counts: a "Questionable" player ruled inactive on game day is still hurt.
    hurt = {(r["gsis_id"], r["week"]) for r in _rows(con, f"""
        SELECT gsis_id, week FROM read_parquet('{roster_file}') WHERE status = 'RES'""")}
    if injuries_file:
        hurt |= {(r["gsis_id"], r["week"]) for r in _rows(con, f"""
            SELECT gsis_id, week FROM read_parquet('{injuries_file}') WHERE report_status IS NOT NULL""")}
    return Availability(active, hurt)


def _by(rows: List[Dict], *keys: str) -> Dict:
    out: Dict = {}
    for r in rows:
        out.setdefault(tuple(r[k] for k in keys), []).append(r)
    return out


def player_stats(u: Dict[str, List[Dict]], positions: Dict[str, str],
                 avail: Optional[Availability] = None) -> Dict[Tuple[int, str], Dict[str, Dict]]:
    """{(week, team): {"targets": {id: stats}, "backs": {id: stats}, "qbs": {id: stats}}}.

    Shares divide by the team's totals in the games the player was active for
    (without `avail`: every game). "On the rise" compares windows without the
    games he missed injured; a healthy scratch still counts as a game with no targets.
    """
    out: Dict[Tuple[int, str], Dict[str, Dict]] = {}
    games = {(r["w"], r["team"]): r["games"] for r in u["games"]}

    totals: Dict[Tuple[str, int], Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    touched = set()
    for r in u["per_game"]:
        t = totals[(r["team"], r["week"])]
        touched.add((r["id"], r["team"], r["week"]))
        t["targets"] += r["targets"]
        t["ay"] += r["ay"] or 0
        t["rz"] += r["rz_targets"]
        t["third"] += r["third_targets"]
        if positions.get(r["id"]) in ("RB", "FB"):
            t["rb_carries"] += r["carries"]
            t["rb_inside5"] += r["inside5"]
            t["rb_third"] += r["third_targets"]
    team_weeks: Dict[str, List[int]] = defaultdict(list)
    for team, wk in sorted(totals):
        team_weeks[team].append(wk)

    def active(pid: str, team: str, wk: int) -> bool:
        return avail is None or (pid, team, wk) in avail.active or (pid, team, wk) in touched

    def total(team: str, weeks: List[int], key: str) -> float:
        return sum(totals[(team, wk)][key] for wk in weeks)

    def share(part: float, team: str, weeks: List[int], key: str) -> float:
        n = total(team, weeks, key)
        return (part or 0) / n if n > 0 else 0.0

    for (w, team), rows in _by(u["target"], "w", "team").items():
        weeks = [wk for wk in team_weeks[team] if wk < w]
        recent = weeks[-3:]
        d = out.setdefault((w, team), {"targets": {}, "backs": {}, "qbs": {}})
        for r in rows:
            pid = r["id"]
            on = [wk for wk in weeks if active(pid, team, wk)]
            healthy = [wk for wk in weeks if active(pid, team, wk) or avail is None or (pid, wk) not in avail.hurt]
            last3 = [wk for wk in healthy if wk in recent]
            early = [wk for wk in healthy if wk not in recent]
            last3_share = share(r["t3"], team, last3, "targets")
            d["targets"][pid] = {
                "pos": positions.get(pid, ""),
                "targets": r["targets"], "share": share(r["targets"], team, on, "targets"),
                "ay_share": share(r["ay"], team, on, "ay"),
                "adot": (r["ay"] or 0) / r["targets"],
                "rz_targets": r["rz_targets"], "rz_share": share(r["rz_targets"], team, on, "rz"),
                "third_share": share(r["third_targets"], team, on, "third"),
                "third_targets": r["third_targets"],
                "rec": r["rec"], "rec_yards": r["rec_yards"], "rec_td": r["rec_td"],
                "games": games.get((w, team), 0),
                "last3_share": last3_share,
                # No earlier games to compare with (all missed injured): no rise either.
                "early_share": share(r["targets"] - r["t3"], team, early, "targets") if early else last3_share,
            }

    for (w, team), rows in _by(u["rush"], "w", "team").items():
        weeks = [wk for wk in team_weeks[team] if wk < w]
        d = out.setdefault((w, team), {"targets": {}, "backs": {}, "qbs": {}})
        for r in rows:
            if positions.get(r["id"]) not in ("RB", "FB"):
                continue
            on = [wk for wk in weeks if active(r["id"], team, wk)]
            t = d["targets"].get(r["id"], {})
            d["backs"][r["id"]] = {
                "carries": r["carries"], "rush_yards": r["rush_yards"], "rush_td": r["rush_td"],
                "rb_share": share(r["carries"], team, on, "rb_carries"),
                "inside5": r["inside5"], "inside5_share": share(r["inside5"], team, on, "rb_inside5"),
                "targets": t.get("targets", 0), "rec_yards": t.get("rec_yards", 0),
                "rb_third_share": share(t.get("third_targets", 0), team, on, "rb_third"),
                "games": games.get((w, team), 0),
            }

    rush_by = {(r["w"], r["team"], r["id"]): r for r in u["rush"]}
    for r in u["qb"]:
        if positions.get(r["id"]) != "QB":
            continue
        d = out.setdefault((r["w"], r["team"]), {"targets": {}, "backs": {}, "qbs": {}})
        ru = rush_by.get((r["w"], r["team"], r["id"]), {"carries": 0, "rush_yards": 0, "rush_td": 0})
        runs = ru["carries"] + r["scrambles"]
        d["qbs"][r["id"]] = {
            "dropbacks": r["dropbacks"], "attempts": r["attempts"], "completions": r["completions"],
            "pass_yards": r["pass_yards"], "pass_td": r["pass_td"], "ints": r["ints"], "sacks": r["sacks"],
            "adot": r["adot"] or 0.0, "deep_rate": r["deep_rate"] or 0.0, "epa": r["epa"],
            "sack_rate": r["sacks"] / r["dropbacks"],
            "int_rate": r["ints"] / r["attempts"] if r["attempts"] else 0.0,
            "run_rate": runs / (r["dropbacks"] + ru["carries"]),
            "rush_yards": (ru["rush_yards"] or 0) + r["scramble_yards"],
            "rush_ypg": ((ru["rush_yards"] or 0) + r["scramble_yards"]) / max(r["games"], 1),
            "rush_td": ru["rush_td"], "games": r["games"],
        }
    return out


def replay(stats: Dict[Tuple[int, str], Dict[str, Dict]], week: int) -> Tuple[Dict, Dict]:
    """Sticky labels as of `week` and as of the week before (for "new this week")."""
    held: Dict[Tuple[str, str, str], List[str]] = {}  # (team, group, id) -> labels
    prev: Dict[Tuple[str, str, str], List[str]] = {}
    rules = {"targets": TARGET_RULES, "backs": BACK_RULES, "qbs": QB_RULES}
    for w in sorted({w for w, _ in stats}):
        if w > week:
            break
        if w == week:
            prev = dict(held)
        for (sw, team), groups in stats.items():
            if sw != w:
                continue
            for group, players in groups.items():
                for pid, s in players.items():
                    key = (team, group, pid)
                    held[key] = apply_rules(rules[group], s, held.get(key, []))
    return held, prev


def report_pending(has_status: bool, gameday: date, today: date) -> bool:
    """The team's final injury report isn't out yet: none of its players has a game status,
    and it's more than a day before kickoff (the report comes the day before, Friday for Sunday)."""
    return not has_status and today < gameday - timedelta(days=1)


def practice(status: Optional[str]) -> Optional[str]:
    """'dnp' / 'limited' from the injury report's practice status; None for full or no practice listed."""
    if not status:
        return None
    return "dnp" if status.startswith("Did Not") else "limited" if status.startswith("Limited") else None


# ---------------------------------------------------------------------------

OUT_STATUSES = ("Out", "Doubtful")
POSITIONS = ("QB", "RB", "FB", "WR", "TE")
# Who's out lists a player who mattered: a real share of the targets or carries,
# or (for blocking tight ends, fullbacks and depth receivers, whose job barely
# shows in touches) a big share of the offensive snaps.
OUT_TOUCH_BAR = 0.08
OUT_SNAP_BAR = 0.40


def snap_shares(con: duckdb.DuckDBPyConnection, snaps_file: Path, roster_file: Path,
                season: int, week: int) -> Dict[str, float]:
    """Season-to-date share of the offensive snaps, averaged over the games a player
    appeared in, by gsis id. PFR snap counts join through the roster's pfr_id."""
    return {r["id"]: r["share"] for r in _rows(con, f"""
        WITH ids AS (SELECT DISTINCT pfr_id, gsis_id FROM read_parquet('{roster_file}')
                     WHERE pfr_id IS NOT NULL AND gsis_id IS NOT NULL)
        SELECT ids.gsis_id AS id, avg(s.offense_pct) AS share
        FROM read_parquet('{snaps_file}') s JOIN ids ON ids.pfr_id = s.pfr_player_id
        WHERE s.season = {season} AND s.week < {week}
        GROUP BY 1""")}


def build(con: duckdb.DuckDBPyConnection, out_dir: Path, season: int,
          games_file: Path, roster_file: Optional[Path], injuries_file: Optional[Path],
          today: Optional[date] = None, snaps_file: Optional[Path] = None) -> Optional[Dict]:
    today = today or datetime.now(timezone.utc).date()
    sched = _rows(con, f"SELECT * FROM read_parquet('{games_file}') WHERE season = {season}")
    open_weeks = [g["week"] for g in sched if g["result"] is None and g["home_score"] is None]
    if not open_weeks:
        return None
    week = min(open_weeks)
    games = sorted((g for g in sched if g["week"] == week), key=lambda g: (str(g["gameday"]), g["gametime"] or "", g["game_id"]))

    files = [str(p) for p in sorted(out_dir.glob(f"plays_{season}.parquet"))]
    if not files:
        return None

    roster: Dict[str, Dict] = {}
    if roster_file:
        for r in _rows(con, f"""
            SELECT * FROM read_parquet('{roster_file}')
            WHERE week = (SELECT max(week) FROM read_parquet('{roster_file}') WHERE week <= {week})
              AND position IN {POSITIONS}"""):
            roster[r["gsis_id"]] = r
    positions = {pid: r["position"] for pid, r in roster.items()}
    # Players no longer on a roster keep their pbp position guess: none, so they drop out of groups.

    injuries: Dict[str, Dict] = {}  # this week's game statuses
    listed: Dict[str, Dict] = {}    # everyone on this week's report, with or without one
    missed: Set[Tuple[str, int]] = set()  # (id, week): ruled out, or inactive on game day
    if injuries_file:
        for r in _rows(con, f"""
            SELECT * FROM read_parquet('{injuries_file}')
            WHERE week = {week} AND position IN {POSITIONS}"""):
            listed[r["gsis_id"]] = r
            if r["report_status"] is not None:
                injuries[r["gsis_id"]] = r
        missed = {(r["gsis_id"], r["week"]) for r in _rows(con, f"""
            SELECT gsis_id, week FROM read_parquet('{injuries_file}') WHERE report_status IN {OUT_STATUSES}""")}
    if roster_file:
        missed |= {(r["gsis_id"], r["week"]) for r in _rows(con, f"""
            SELECT gsis_id, week FROM read_parquet('{roster_file}') WHERE status = 'INA'""")}
    # Until a team's final report is out, the board shows last game and practice instead.
    with_status = {r["team"] for r in injuries.values()}
    gameday = {t: date.fromisoformat(str(g["gameday"])) for g in games for t in (g["home_team"], g["away_team"])}
    pending = {t for t, d in gameday.items() if report_pending(t in with_status, d, today)}
    last_week = {t: max((g["week"] for g in sched if g["week"] < week and t in (g["home_team"], g["away_team"])), default=None)
                 for t in gameday}
    # Once a game is played, "questionable" and "doubtful" are answered: keep only who was ruled out.
    done = {t for g in games if g["home_score"] is not None for t in (g["home_team"], g["away_team"])}
    injuries = {pid: r for pid, r in injuries.items() if r["team"] not in done or r["report_status"] == "Out"}

    # Ruled out in one of the last three weeks: a QB coming back from that gets his job back.
    recently_out = set()
    if injuries_file:
        recently_out = {r["gsis_id"] for r in _rows(con, f"""
            SELECT DISTINCT gsis_id FROM read_parquet('{injuries_file}')
            WHERE week BETWEEN {week - 3} AND {week - 1} AND report_status = 'Out'""")}

    snaps = snap_shares(con, snaps_file, roster_file, season, week) if snaps_file and roster_file else {}

    u = usage(con, files, season, week)
    stats = player_stats(u, positions, availability(con, roster_file, injuries_file) if roster_file else None)
    held, prev = replay(stats, week)

    # Last game's QB, for picking the starter.
    last_qb = {r["team"]: r["id"] for r in _rows(con, f"""
        WITH p AS (SELECT * FROM read_parquet({files}) WHERE season = {season} AND week < {week} AND is_pass),
        last AS (SELECT posteam, max(week) AS week FROM p GROUP BY posteam)
        SELECT p.posteam AS team, coalesce(passer_player_id, rusher_player_id) AS id
        FROM p JOIN last USING (posteam, week)
        GROUP BY 1, 2 QUALIFY row_number() OVER (PARTITION BY team ORDER BY count(*) DESC) = 1""")}

    team_ctx = {r["team"]: r for r in _rows(con, f"""
        WITH p AS (SELECT * FROM read_parquet({files}) WHERE season = {season} AND week < {week}),
        t AS (SELECT posteam AS team, avg(epa) AS epa,
                     avg(is_pass::INT) FILTER (WHERE down <= 2 AND wp BETWEEN 0.2 AND 0.8) AS early_pass
              FROM p GROUP BY posteam)
        SELECT *, rank() OVER (ORDER BY epa DESC) AS epa_rank,
                  rank() OVER (ORDER BY early_pass DESC) AS early_pass_rank,
                  count(*) OVER () AS teams
        FROM t""")}

    played = [g for g in sched if g["week"] < week and g["home_score"] is not None]

    def team_record(team: str) -> Tuple[str, float]:
        res = [(g["home_score"], g["away_score"]) if g["home_team"] == team else (g["away_score"], g["home_score"])
               for g in played if team in (g["home_team"], g["away_team"])]
        return record(res), (sum(f for f, _ in res) / len(res) if res else 0.0)

    ppg = {t: team_record(t)[1] for t in team_ctx}
    ppg_rank = {t: 1 + sum(v > ppg[t] for v in ppg.values()) for t in ppg}

    def person(pid: str, short: Optional[str] = None) -> Dict:
        r = roster.get(pid, {})
        inj = injuries.get(pid)
        rep = listed.get(pid) or {}
        team = r.get("team")
        early = team in pending
        first = r.get("football_name") or r.get("first_name") or ""
        return {
            "id": pid,
            "name": f"{first} {r.get('last_name', '')}".strip() or short or pid,
            "last": r.get("last_name") or (short.split(".")[-1] if short else pid),
            "jersey": r.get("jersey_number"),
            "pos": r.get("position"),
            "rookie": r.get("rookie_year") == season,
            "status": inj["report_status"] if inj else None,
            "injury": rep.get("report_primary_injury") or rep.get("practice_primary_injury"),
            # Before the final report only: what the board knows instead of a game status.
            "practice": practice(rep.get("practice_status")) if early and rep.get("team") == team else None,
            "missed_last": early and (pid, last_week.get(team)) in missed,
        }

    def unavailable(pid: str, team: str) -> bool:
        """Not on the team's active roster any more (cut, traded, injured reserve) or ruled out."""
        r = roster.get(pid)
        inj = injuries.get(pid)
        if inj is not None and inj["report_status"] == "Out":
            return True
        return r is None or r.get("status") != "ACT" or r.get("team") != team

    def labels(team: str, group: str, pid: str) -> Tuple[List[str], List[str]]:
        now = held.get((team, group, pid), [])
        before = prev.get((team, group, pid), [])
        return now, [l for l in now if l not in before]

    def board(team: str) -> Dict:
        s = stats.get((week, team), {"targets": {}, "backs": {}, "qbs": {}})
        rec, pts = team_record(team)
        ctx = team_ctx.get(team, {})

        # QB: last game's passer, unless the season's main QB is back from an
        # injury or last game's passer is out; then the most-used available QB.
        # "Back" waits for the final report: before it, not ruled out only means no status yet
        # (2022-2026 midweek, the rule was right 28% of the time; after the report, 48%).
        qbs = s["qbs"]
        cands = [pid for pid in sorted(qbs, key=lambda p: -qbs[p]["dropbacks"]) if not unavailable(pid, team)]
        last = last_qb.get(team)
        back = [pid for pid in cands if pid in recently_out and pid != last and qbs[pid]["dropbacks"] >= 60
                and team not in pending]
        if back:
            starter = back[0]
        elif last in qbs and not unavailable(last, team):
            starter = last
        else:
            starter = cands[0] if cands else None
        qb = None
        if starter:
            now, new = labels(team, "qbs", starter)
            qb = {**person(starter), "stats": qbs[starter], "labels": now, "new": new,
                  "changed": starter != last, "returning": starter != last and starter in recently_out}

        targets = []
        for pid in sorted(s["targets"], key=lambda p: -s["targets"][p]["targets"]):
            st = s["targets"][pid]
            if unavailable(pid, team) or positions.get(pid) not in ("WR", "TE", "RB", "FB"):
                continue
            now, new = labels(team, "targets", pid)
            extra = ["on_the_rise"] if on_the_rise(st) and "go_to" not in now else []
            targets.append({**person(pid), "stats": st, "labels": now + extra, "new": new + extra})
            if len(targets) == 4:
                break
        # One go-to guy per team: a second one who only holds on by the stay rule steps down.
        for t in targets[1:]:
            if "go_to" in t["labels"] and "go_to" in targets[0]["labels"]:
                t["labels"] = [l for l in t["labels"] if l != "go_to"]
                t["new"] = [l for l in t["new"] if l != "go_to"]

        backs = []
        for pid in sorted(s["backs"], key=lambda p: -s["backs"][p]["carries"]):
            if unavailable(pid, team):
                continue
            now, new = labels(team, "backs", pid)
            backs.append({**person(pid), "stats": s["backs"][pid], "labels": now, "new": new})
        top_share = max((b["stats"]["rb_share"] for b in backs), default=0)
        backs = [b for i, b in enumerate(backs) if i < 2 or b["labels"]][:3]
        backfield = "workhorse" if backs and "workhorse" in backs[0]["labels"] else "committee" if top_share < 0.5 else "lead"

        # Who's out: injury report plus injured reserve, for players who matter.
        out = []
        for pid in set(injuries) | {p for p, r in roster.items() if r.get("status") == "RES"}:
            r = roster.get(pid) or {}
            inj = injuries.get(pid)
            if (inj and inj["team"] != team) or (not inj and r.get("team") != team):
                continue
            t, b, q = s["targets"].get(pid), s["backs"].get(pid), s["qbs"].get(pid)
            share = max(t["share"] if t else 0, b["rb_share"] if b else 0)
            snap = snaps.get(pid, 0.0)
            qb_role = bool(q and q["dropbacks"] >= 30)
            by_snaps = not qb_role and share < OUT_TOUCH_BAR and snap >= OUT_SNAP_BAR
            if not qb_role and share < OUT_TOUCH_BAR and not by_snaps:
                continue
            item = {**person(pid), "status": inj["report_status"] if inj else "Injured reserve",
                    "target_share": t["share"] if t else None, "carry_share": b["rb_share"] if b else None,
                    "dropbacks": q["dropbacks"] if q else None,
                    "snap_share": snap or None, "by_snaps": by_snaps,
                    "labels": [l for g in ("qbs", "targets", "backs") for l in held.get((team, g, pid), [])]}
            # Who's next in line for an absent go-to guy or workhorse.
            if item["status"] in ("Out", "Injured reserve"):
                if t and "go_to" in item["labels"] and targets:
                    item["next"] = {"name": targets[0]["name"], "share": targets[0]["stats"]["share"]}
                elif b and "workhorse" in item["labels"] and backs:
                    item["next"] = {"name": backs[0]["name"], "share": backs[0]["stats"]["rb_share"]}
            out.append(item)
        order = {"Out": 0, "Injured reserve": 1, "Doubtful": 2, "Questionable": 3}
        out.sort(key=lambda i: (order.get(i["status"], 4), -(i["target_share"] or i["carry_share"] or 0)))

        return {
            "team": team, "record": rec, "ppg": round(pts, 1), "ppg_rank": ppg_rank.get(team),
            "epa_rank": ctx.get("epa_rank"), "early_pass": ctx.get("early_pass"),
            "early_pass_rank": ctx.get("early_pass_rank"), "teams": ctx.get("teams"),
            "games": len([g for g in played if team in (g["home_team"], g["away_team"])]),
            "qb": qb, "targets": targets, "backs": backs, "backfield": backfield, "out": out,
            "report_pending": team in pending,
        }

    result = {"season": season, "week": week, "games": []}
    for g in games:
        imp = implied_scores(g["spread_line"], g["total_line"])
        result["games"].append({
            "game_id": g["game_id"], "game_type": g["game_type"], "gameday": str(g["gameday"]),
            "weekday": g["weekday"], "gametime": g["gametime"],
            "away": g["away_team"], "home": g["home_team"],
            "away_score": g["away_score"], "home_score": g["home_score"],
            "spread": g["spread_line"], "total": g["total_line"],
            "implied": {"home": imp[0], "away": imp[1]} if imp else None,
            "home_win_prob": win_prob(g["home_moneyline"], g["away_moneyline"]),
            "div_game": bool(g["div_game"]), "roof": g["roof"], "temp": g["temp"], "wind": g["wind"],
            "stadium": g["stadium"], "away_coach": g["away_coach"], "home_coach": g["home_coach"],
            "away_rest": g["away_rest"], "home_rest": g["home_rest"],
            "boards": {"away": board(g["away_team"]), "home": board(g["home_team"])},
        })
    (out_dir / "matchups.json").write_text(json.dumps(result, separators=(",", ":"), default=_num))
    return result


def _num(v):
    """JSON fallback: numpy-free DuckDB values (Decimal, dates)."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return str(v)

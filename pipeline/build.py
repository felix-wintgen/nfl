"""Build the slim scouting dataset served by the static site.

Downloads nflverse play-by-play, participation and FTN charting files, joins
them per play, derives scouting columns (see derive.py) and writes:

    static/data/plays_{season}.parquet
    static/data/teams.json
    static/data/games.json
    static/data/manifest.json

Usage:
    python pipeline/build.py                  # 2022 .. latest available season
    python pipeline/build.py --seasons 2025 2026 --refresh
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import duckdb

from derive import connect

RELEASES = "https://github.com/nflverse/nflverse-data/releases/download"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / ".cache"
OUT = ROOT / "static" / "data"
FIRST_SEASON = 2022  # first season with FTN charting

# Sanity thresholds; the build fails when a season falls below them.
MIN_PARTICIPATION_MATCH = 0.95
MIN_FTN_MATCH = 0.90
MIN_FULL_SEASON_PLAYS = 30000


def download(tag: str, name: str, refresh: bool) -> Optional[Path]:
    """Fetch one release asset into the cache; None if it doesn't exist."""
    path = CACHE / tag / name
    if path.exists() and not refresh:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    try:
        with urllib.request.urlopen(f"{RELEASES}/{tag}/{name}", timeout=120) as resp:
            tmp.write_bytes(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    tmp.replace(path)
    return path


def latest_season(refresh: bool) -> int:
    year = datetime.now(timezone.utc).year
    for season in (year, year - 1):
        if download("pbp", f"play_by_play_{season}.parquet", refresh):
            return season
    raise SystemExit("no play-by-play file found for the current or previous year")


PLAYS_SQL = """
COPY (
    SELECT
        p.game_id, CAST(p.play_id AS INTEGER) AS play_id,
        p.season, p.week, p.season_type,
        p.posteam, p.defteam, p.posteam = p.home_team AS is_home,
        CAST(p.qtr AS TINYINT) AS qtr,
        CAST(p.down AS TINYINT) AS down,
        CAST(p.ydstogo AS TINYINT) AS ydstogo,
        CAST(p.yardline_100 AS TINYINT) AS yardline_100,
        CAST(p.score_differential AS SMALLINT) AS score_differential,
        dist_bucket(p.ydstogo) AS dist_bucket,
        field_zone(p.yardline_100, p.goal_to_go) AS field_zone,
        score_state(p.score_differential) AS score_state,
        two_min(p.qtr, p.half_seconds_remaining) AS two_min,

        p.pass = 1 AS is_pass,
        p.qb_scramble = 1 AS is_scramble,
        p.sack = 1 AS is_sack,
        p.shotgun = 1 AS is_shotgun,
        coalesce(f.is_no_huddle, p.no_huddle = 1) AS is_no_huddle,
        p.pass_location AS pass_dir,
        CAST(p.air_yards AS SMALLINT) AS air_yards,
        pass_depth(p.air_yards) AS pass_depth,
        p.run_location AS run_dir,
        p.run_gap,
        p.receiver_player_id, p.receiver_player_name,
        p.rusher_player_id, p.rusher_player_name,
        p.passer_player_name,

        CAST(p.yards_gained AS SMALLINT) AS yards_gained,
        CAST(p.epa AS FLOAT) AS epa,
        p.success = 1 AS success,
        is_explosive(p.pass = 1, p.yards_gained) AS is_explosive,
        p.complete_pass = 1 AS is_complete,
        p.interception = 1 AS is_int,
        p.touchdown = 1 AS is_td,
        p.first_down = 1 AS is_first_down,
        p.qb_hit = 1 AS is_qb_hit,
        CAST(p.xpass AS FLOAT) AS xpass,
        CAST(p.wp AS FLOAT) AS wp,

        -- participation (NGS); NULL when the season has no file
        {part_cols}

        -- FTN charting
        f.is_motion, f.is_play_action, f.is_screen_pass AS is_screen, f.is_rpo,
        f.is_qb_out_of_pocket, f.is_drop, f.is_catchable_ball AS is_catchable,
        CAST(f.n_defense_box AS TINYINT) AS ftn_box,
        CAST(f.n_blitzers AS TINYINT) AS n_blitzers,
        CAST(f.n_pass_rushers AS TINYINT) AS ftn_pass_rushers,
        f.n_blitzers > 0 AS is_blitz
    FROM read_parquet('{pbp}') p
    {part_join}
    LEFT JOIN {ftn_src} f
        ON f.nflverse_game_id = p.game_id AND f.nflverse_play_id = p.play_id
    WHERE p.play_type IN ('pass', 'run')
      AND (p.pass = 1 OR p.rush = 1)
      AND coalesce(p.two_point_attempt, 0) = 0
      AND p.posteam IS NOT NULL
      AND p.down IS NOT NULL
    ORDER BY p.game_id, p.play_id
) TO '{out}' (FORMAT parquet, COMPRESSION zstd)
"""

PART_COLS = """
        r.offense_formation AS formation,
        off_personnel(r.offense_personnel) AS off_personnel,
        def_package(r.defense_personnel) AS def_package,
        CAST(def_dbs(r.defense_personnel) AS TINYINT) AS def_dbs,
        CAST(r.defenders_in_box AS TINYINT) AS box,
        CAST(r.number_of_pass_rushers AS TINYINT) AS pass_rushers,
        r.was_pressure AS is_pressure,
        r.defense_man_zone_type AS man_zone,
        r.defense_coverage_type AS coverage,
        r.route,
        CAST(r.time_to_throw AS FLOAT) AS time_to_throw,
"""

NO_PART_COLS = """
        NULL::VARCHAR AS formation, NULL::VARCHAR AS off_personnel,
        NULL::VARCHAR AS def_package, NULL::TINYINT AS def_dbs,
        NULL::TINYINT AS box, NULL::TINYINT AS pass_rushers,
        NULL::BOOLEAN AS is_pressure, NULL::VARCHAR AS man_zone,
        NULL::VARCHAR AS coverage, NULL::VARCHAR AS route,
        NULL::FLOAT AS time_to_throw,
"""

EMPTY_FTN = """(SELECT NULL::VARCHAR AS nflverse_game_id, NULL::INTEGER AS nflverse_play_id,
    NULL::BOOLEAN AS is_no_huddle, NULL::BOOLEAN AS is_motion, NULL::BOOLEAN AS is_play_action,
    NULL::BOOLEAN AS is_screen_pass, NULL::BOOLEAN AS is_rpo, NULL::BOOLEAN AS is_qb_out_of_pocket,
    NULL::BOOLEAN AS is_drop, NULL::BOOLEAN AS is_catchable_ball, NULL::INTEGER AS n_defense_box,
    NULL::INTEGER AS n_blitzers, NULL::INTEGER AS n_pass_rushers WHERE false)"""


def build_season(con: duckdb.DuckDBPyConnection, season: int, refresh: bool) -> Dict:
    pbp = download("pbp", f"play_by_play_{season}.parquet", refresh)
    if pbp is None:
        raise SystemExit(f"play-by-play for {season} not found")
    part = download("pbp_participation", f"pbp_participation_{season}.parquet", refresh)
    ftn = download("ftn_charting", f"ftn_charting_{season}.parquet", refresh)

    out = OUT / f"plays_{season}.parquet"
    con.execute(PLAYS_SQL.format(
        pbp=pbp,
        part_cols=PART_COLS if part else NO_PART_COLS,
        part_join=(f"LEFT JOIN read_parquet('{part}') r "
                   "ON r.nflverse_game_id = p.game_id AND CAST(r.play_id AS INTEGER) = CAST(p.play_id AS INTEGER)"
                   if part else ""),
        ftn_src=f"read_parquet('{ftn}')" if ftn else EMPTY_FTN,
        out=out,
    ))

    rows, last_week, part_match, ftn_match = con.execute(f"""
        SELECT count(*), max(week),
               avg((off_personnel IS NOT NULL)::INT),
               avg((n_blitzers IS NOT NULL OR is_play_action IS NOT NULL)::INT)
        FROM read_parquet('{out}')
    """).fetchone()
    info = {
        "season": season,
        "rows": rows,
        "last_week": last_week,
        "has_participation": part is not None,
        "has_ftn": ftn is not None,
        "participation_match": round(part_match, 4) if part else None,
        "ftn_match": round(ftn_match, 4) if ftn else None,
        "bytes": out.stat().st_size,
    }
    print(f"  {season}: {rows} plays, through week {last_week}, "
          f"participation {info['participation_match']}, ftn {info['ftn_match']}, "
          f"{info['bytes'] / 1e6:.1f} MB")
    return info


def check(seasons: List[Dict]) -> List[str]:
    problems = []
    for s in seasons:
        if s["has_participation"] and s["participation_match"] < MIN_PARTICIPATION_MATCH:
            problems.append(f"{s['season']}: participation match {s['participation_match']}")
        if s["has_ftn"] and s["ftn_match"] < MIN_FTN_MATCH:
            problems.append(f"{s['season']}: FTN match {s['ftn_match']}")
        if s["last_week"] >= 18 and s["rows"] < MIN_FULL_SEASON_PLAYS:
            problems.append(f"{s['season']}: only {s['rows']} plays for a full season")
    return problems


def write_json(con: duckdb.DuckDBPyConnection, sql: str, name: str) -> None:
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    (OUT / name).write_text(json.dumps(rows, separators=(",", ":"), default=str))


def build_meta(con: duckdb.DuckDBPyConnection, seasons: List[int], refresh: bool) -> None:
    teams = download("teams", "teams_colors_logos.parquet", refresh)
    games = download("schedules", "games.parquet", refresh)
    latest = OUT / f"plays_{max(seasons)}.parquet"
    write_json(con, f"""
        SELECT team_abbr AS abbr, team_name AS name, team_nick AS nick,
               team_conf AS conf, team_division AS division,
               team_color AS color, team_color2 AS color2, team_logo_espn AS logo
        FROM read_parquet('{teams}')
        WHERE team_abbr IN (SELECT DISTINCT posteam FROM read_parquet('{latest}'))
        ORDER BY team_abbr
    """, "teams.json")
    write_json(con, f"""
        SELECT game_id, season, game_type, week, gameday, home_team, away_team,
               home_score, away_score
        FROM read_parquet('{games}')
        WHERE season IN ({",".join(map(str, seasons))})
        ORDER BY season, week, game_id
    """, "games.json")


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--seasons", type=int, nargs="*", help="seasons to build (default: 2022..latest)")
    ap.add_argument("--refresh", action="store_true", help="re-download cached files")
    args = ap.parse_args(argv)

    seasons = args.seasons or list(range(FIRST_SEASON, latest_season(args.refresh) + 1))
    OUT.mkdir(parents=True, exist_ok=True)
    con = connect()
    print(f"building seasons {seasons}")
    infos = [build_season(con, s, args.refresh) for s in seasons]
    build_meta(con, seasons, args.refresh)

    manifest = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seasons": infos,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    problems = check(infos)
    for p in problems:
        print(f"SANITY CHECK FAILED: {p}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

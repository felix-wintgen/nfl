"""Replay the game-day board week by week, as the 08:50 UTC build would have seen it.

For each regular-season and playoff week: a midweek board (4 days before the week's first game,
this week's game statuses blanked) and a board after the final report (each game's day). Scores
from the replayed week on are blanked; nflverse's listed QB is taken as it stood at build time
(from qb_listing.py), or left out without --listing. Run from the repo root after `npm run data`:

    python pipeline/replay/board_replay.py OUT.json 2025 2026 [--listing listing.json]

Writes OUT.json (one row per board: our QB, the second name, the listing, the QB who threw the
team's first pass) and OUT_full.json (every board in full, for compare.py), and prints QB accuracy.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
import build  # noqa: E402
import matchup  # noqa: E402

CACHE, DATA = ROOT / "pipeline" / ".cache", ROOT / "static" / "data"
WORK = Path(__file__).resolve().parent / "work"
UTC = dt.timezone.utc


def listed_at(hist: dict, game_id: str, team: str, when: dt.datetime):
    qb = None
    for t, q in hist.get(game_id, {}).get(team, []):
        if dt.datetime.fromisoformat(t.replace("Z", "+00:00")) > when:
            break
        qb = q
    return qb


def replay(con, season: int, hist: dict | None):
    sched = CACHE / "schedules" / "games.parquet"
    roster = CACHE / "weekly_rosters" / f"roster_weekly_{season}.parquet"
    injuries = CACHE / "injuries" / f"injuries_{season}.parquet"
    snaps = CACHE / "snap_counts" / f"snap_counts_{season}.parquet"
    prev_snaps = build.download("snap_counts", f"snap_counts_{season - 1}.parquet", False)
    depth = build.download("depth_charts", f"depth_charts_{season}.parquet", False)
    plays_src = DATA / f"plays_{season}.parquet"
    truth = {(w, t): p for w, t, p in con.execute(f"""
        SELECT week, posteam, passer_player_id FROM '{plays_src}' WHERE passer_player_id IS NOT NULL
        QUALIFY row_number() OVER (PARTITION BY game_id, posteam ORDER BY play_id) = 1""").fetchall()}
    rows, boards = [], {}
    for week in range(1, 23):
        out = WORK / f"{season}_{week}"
        out.mkdir(parents=True, exist_ok=True)
        plays = out / f"plays_{season}.parquet"
        plays.unlink(missing_ok=True)
        plays.symlink_to(plays_src)
        blank = f"season = {season} AND week >= {week}"
        con.execute(f"""COPY (SELECT * REPLACE (
            CASE WHEN {blank} THEN NULL ELSE home_score END AS home_score,
            CASE WHEN {blank} THEN NULL ELSE away_score END AS away_score,
            CASE WHEN {blank} THEN NULL ELSE result END AS result)
            FROM '{sched}') TO '{out}/games.parquet' (FORMAT parquet)""")
        wk = con.execute(f"""SELECT game_id, gameday, away_team, home_team FROM '{out}/games.parquet'
                             WHERE season = {season} AND week = {week}""").fetchall()
        if not wk or not any((week, t) in truth for *_, t in wk):
            continue
        first = min(dt.date.fromisoformat(str(g[1])) for g in wk)
        last = max(dt.date.fromisoformat(str(g[1])) for g in wk)
        for snap, today in (("mid", first - dt.timedelta(days=4)), ("final", last)):
            # nflverse's listing as the build saw it: midweek on that day, after the report on game day
            nv = {}
            for gid, gday, a, h in wk:
                when = dt.datetime.combine(today if snap == "mid" else dt.date.fromisoformat(str(gday)), dt.time(8, 50), UTC)
                for t in (a, h):
                    nv[(gid, t)] = listed_at(hist, gid, t, when) if hist else None
            con.execute("CREATE OR REPLACE TABLE nv (game_id VARCHAR, team VARCHAR, qb VARCHAR)")
            con.executemany("INSERT INTO nv VALUES (?, ?, ?)", [(g, t, q) for (g, t), q in nv.items()])
            con.execute(f"""COPY (SELECT g.* REPLACE (a.qb AS away_qb_id, h.qb AS home_qb_id) FROM '{out}/games.parquet' g
                LEFT JOIN nv a ON a.game_id = g.game_id AND a.team = g.away_team
                LEFT JOIN nv h ON h.game_id = g.game_id AND h.team = g.home_team) TO '{out}/games_{snap}.parquet' (FORMAT parquet)""")
            inj = injuries
            if snap == "mid":  # this week's game statuses aren't out yet
                inj = out / "injuries_mid.parquet"
                con.execute(f"""COPY (SELECT * REPLACE (CASE WHEN week >= {week} THEN NULL ELSE report_status END AS report_status)
                    FROM '{injuries}') TO '{inj}' (FORMAT parquet)""")
            res = matchup.build(con, out, season, out / f"games_{snap}.parquet", roster, inj, today=today,
                                snaps_file=snaps, prev_snaps_file=prev_snaps, depth_file=depth)
            boards[f"{season}-{week}-{snap}"] = res
            for g in res["games"]:
                for side in ("away", "home"):
                    b = g["boards"][side]
                    t = truth.get((week, b["team"]))
                    if t is None:
                        continue
                    q, alt = b["qb"], (b["qb"] or {}).get("alt") or {}
                    rows.append({"season": season, "week": week, "snap": snap, "team": b["team"], "game": g["game_id"],
                                 "truth": t, "board": q["id"] if q else None, "alt": alt.get("id"), "why": alt.get("why"),
                                 "nv": nv.get((g["game_id"], b["team"]))})
    return rows, boards


def summary(rows: list[dict]) -> None:
    """First name right, either name right; midweek leaves out Week 1 (no board before the opener)."""
    keys = sorted({(r["season"], r["snap"]) for r in rows})
    for season, snap in keys:
        rs = [r for r in rows if r["season"] == season and r["snap"] == snap and not (snap == "mid" and r["week"] == 1)]
        first = sum(r["board"] == r["truth"] for r in rs) / len(rs)
        either = sum(r["truth"] in (r["board"], r["alt"]) for r in rs) / len(rs)
        print(f"  {season} {snap:<5} {len(rs):>4} boards: QB right {first:.1%}, either name {either:.1%}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("seasons", type=int, nargs="+")
    ap.add_argument("--listing", help="qb_listing.py output; without it, nflverse's listing is left out")
    args = ap.parse_args()
    hist = json.load(open(args.listing))["hist"] if args.listing else None
    con = duckdb.connect()
    rows, boards = [], {}
    for s in args.seasons:
        r, b = replay(con, s, hist)
        rows += r
        boards.update(b)
    Path(args.out).write_text(json.dumps(rows, default=str))
    Path(args.out.replace(".json", "_full.json")).write_text(json.dumps(boards, default=str, sort_keys=True))
    summary(rows)


if __name__ == "__main__":
    main()

"""How the DC helper's tells hold up on its default view: last season plus this one so far.

tells_backtest.py checks half a season predicting the next half. This checks what the helper
actually shows: tells from last season (weighted) and this season before a given week, compared
with the other teams, then the same situations over the next four weeks. It reads SHRINK_PLAYS
and PRIOR_WEIGHT from src/lib/tells.ts, so it tests the shipped constants. Run after `npm run data`:

    python pipeline/replay/tells_game_day.py [2023 2024 2025]

Prints, per weighting of last season: share of tells that kept their direction, and the
calibration slope (1.0: a tell's gap is the right size), pooled and per window.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
import tells_backtest as tb  # noqa: E402

DATA, WORK = ROOT / "static" / "data", Path(__file__).resolve().parent / "work"
TS = (ROOT / "src" / "lib" / "tells.ts").read_text()
K = float(re.search(r"SHRINK_PLAYS = ([\d.]+)", TS).group(1))
PRIOR = float(re.search(r"PRIOR_WEIGHT = ([\d.]+)", TS).group(1))
WINDOWS = (5, 8, 11)  # tells from the weeks before, checked on this week and the three after
COLS = """posteam, is_pass::INT AS p, off_personnel AS pers,
    CASE WHEN formation = 'PISTOL' THEN 'pistol' WHEN is_shotgun THEN 'shotgun' ELSE 'under center' END AS align,
    down::VARCHAR AS down, dist_bucket AS dist, field_zone AS zone"""


def weighted_cells(con, season: int, lo: int, prior: float) -> dict:
    """Team cells against the other teams; last season's plays weigh `prior`, this season's 1."""
    con.execute(f"""CREATE OR REPLACE TEMP VIEW src AS
        SELECT {COLS}, {prior}::DOUBLE AS w FROM '{DATA}/plays_{season - 1}.parquet' WHERE season_type = 'REG'
        UNION ALL SELECT {COLS}, 1.0::DOUBLE FROM '{DATA}/plays_{season}.parquet' WHERE season_type = 'REG' AND week < {lo}""")
    dims = ", ".join(tb.DIMS)
    sets = ", ".join(f"(posteam, {', '.join(s)})" for s in tb.SETS) + ", " + ", ".join(f"({', '.join(s)})" for s in tb.SETS)
    on = " AND ".join(f"t.{d} IS NOT DISTINCT FROM l.{d}" for d in tb.DIMS)
    out = {}
    for team, gid, *rest in con.execute(f"""
        WITH agg AS (SELECT GROUPING(posteam) gt, GROUPING({dims}) gid, posteam, {dims}, sum(w) sw, sum(w * p) swp
                     FROM src WHERE w > 0 GROUP BY GROUPING SETS ({sets}))
        SELECT t.posteam, t.gid, {", ".join("t." + d for d in tb.DIMS)}, t.sw, t.swp / t.sw, (l.swp - t.swp) / nullif(l.sw - t.sw, 0)
        FROM agg t JOIN agg l ON t.gid = l.gid AND l.gt = 1 AND {on} WHERE t.gt = 0""").fetchall():
        vals, (n, rate, lrate) = dict(zip(tb.DIMS, rest[:5])), rest[5:]
        dd = tb.dims_of(gid)
        if lrate is None or any(vals[d] is None for d in dd):
            continue
        out[(team, tuple((d, vals[d]) for d in dd))] = (float(n), float(rate), float(lrate))
    return out


def next_four(con, season: int, lo: int) -> dict:
    p = WORK / f"tells_{season}_{lo}.parquet"
    con.execute(f"""COPY (SELECT * REPLACE (1 AS week) FROM '{DATA}/plays_{season}.parquet'
                    WHERE season_type = 'REG' AND week BETWEEN {lo} AND {lo + 3}) TO '{p}' (FORMAT parquet)""")
    return tb.cells(con, p, 1, 1)


def main(seasons: list[int]) -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    variants = {"last season at full weight": 1.0, f"last season at {PRIOR:g} (the app)": PRIOR, "this season only": 0.0}
    pooled = {v: [] for v in variants}
    windows = {v: [] for v in variants}
    for season in seasons:
        for lo in WINDOWS:
            later = next_four(con, season, lo)
            for v, w in variants.items():
                h1 = weighted_cells(con, season, lo, w)
                pairs = []
                for team in sorted({t for t, _ in h1}):
                    for dims, _, shown, _ in tb.pick(h1, team, K, 0.05):
                        nxt = later.get((team, dims))
                        if nxt and nxt[0] >= tb.MIN_PLAYS:
                            pairs.append((shown, nxt[1] - nxt[2], nxt[0]))
                pooled[v] += pairs
                windows[v].append(f"{season % 100}w{lo} {sum(s * g > 0 for s, g, _ in pairs) / max(len(pairs), 1):.0%}")
    print(f"shrinkage {K:g} plays, {len(seasons)} seasons x weeks {WINDOWS}, next four weeks")
    for v, pairs in pooled.items():
        kept = sum(s * g > 0 for s, g, _ in pairs) / len(pairs)
        slope = sum(s * g * w for s, g, w in pairs) / sum(s * s * w for s, _, w in pairs)
        print(f"  {v:<32} kept direction {kept:.0%}  slope {slope:.2f}  ({len(pairs)} tells)   " + "  ".join(windows[v]))


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2023, 2024, 2025])

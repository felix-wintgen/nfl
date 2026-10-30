"""Backtest the DC helper's tells: do they hold up later in the same season?

Picks each team's tells from weeks 1-9 of a regular season (mirroring
src/lib/tells.ts), then looks up the same situations in weeks 10-18.
Compares the old raw-gap ranking with the shrunk ranking and fits the
shrinkage strength SHRINK_PLAYS.

Usage (after `npm run data`):
    python pipeline/tells_backtest.py 2023 2024 2025
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import duckdb

DATA = Path(__file__).resolve().parent.parent / "static" / "data"
DIMS = ["pers", "align", "down", "dist", "zone"]
SETS = [
    ["pers", "align"], ["pers", "down"], ["align", "down"], ["pers", "align", "down"],
    ["down", "dist"], ["pers", "down", "dist"], ["align", "down", "dist"],
    ["pers", "zone"], ["align", "zone"], ["down", "dist", "zone"],
]
MIN_PLAYS = 12
OLD_MIN_GAP = 0.12  # raw gap, the rule before shrinkage
LIMIT = 8

CELLS_SQL = """
WITH plays AS (
    SELECT posteam, is_pass::INT AS p,
           off_personnel AS pers,
           CASE WHEN formation = 'PISTOL' THEN 'pistol'
                WHEN is_shotgun THEN 'shotgun' ELSE 'under center' END AS align,
           down::VARCHAR AS down, dist_bucket AS dist, field_zone AS zone
    FROM read_parquet('{path}')
    WHERE season_type = 'REG' AND week BETWEEN {lo} AND {hi}
),
agg AS (
    SELECT GROUPING(posteam) AS gt, GROUPING({dims}) AS gid, posteam, {dims},
           count(*) AS n, avg(p) AS rate
    FROM plays
    GROUP BY GROUPING SETS ({sets})
)
SELECT t.posteam, t.gid, {tdims}, t.n, t.rate, l.rate AS lrate
FROM agg t JOIN agg l
  ON t.gid = l.gid AND l.gt = 1 AND {on}
WHERE t.gt = 0
"""


def dims_of(gid: int) -> list[str]:
    return [d for i, d in enumerate(DIMS) if not (gid >> (len(DIMS) - 1 - i)) & 1]


def cells(con: duckdb.DuckDBPyConnection, path: Path, lo: int, hi: int) -> dict:
    sets = ", ".join(
        f"(posteam, {', '.join(s)})" for s in SETS
    ) + ", " + ", ".join(f"({', '.join(s)})" for s in SETS)
    sql = CELLS_SQL.format(
        path=path, lo=lo, hi=hi, dims=", ".join(DIMS), sets=sets,
        tdims=", ".join(f"t.{d}" for d in DIMS),
        on=" AND ".join(f"t.{d} IS NOT DISTINCT FROM l.{d}" for d in DIMS),
    )
    out = {}
    for team, gid, *rest in con.execute(sql).fetchall():
        vals = dict(zip(DIMS, rest[:5]))
        n, rate, lrate = rest[5:]
        dims = dims_of(gid)
        if any(vals[d] is None for d in dims):
            continue  # missing data, not "all"
        out[(team, tuple((d, vals[d]) for d in dims))] = (n, rate, lrate)
    return out


def pick(c: dict, team: str, k: float | None, min_gap: float) -> list[tuple]:
    """k=None: old rule (raw gap >= 12 pp, sorted by z). Else shrunk gap."""
    cand = []
    for (t, dims), (n, p, lp) in c.items():
        if t != team or n < MIN_PLAYS:
            continue
        if k is None:
            if abs(p - lp) < OLD_MIN_GAP:
                continue
            score = (p - lp) / math.sqrt(max(lp * (1 - lp), 0.01) / n)
            shown = p - lp
        else:
            shown = n / (n + k) * (p - lp)
            if abs(shown) < min_gap:
                continue
            score = shown
        cand.append((dims, n, shown, score))
    cand.sort(key=lambda x: -abs(x[3]))
    chosen = []
    for c_ in cand:
        def within(a, b):
            return all(dict(b).get(k_) == v for k_, v in a)
        if any(
            (p[3] > 0) == (c_[3] > 0) and (within(p[0], c_[0]) or within(c_[0], p[0]))
            for p in chosen
        ):
            continue
        chosen.append(c_)
        if len(chosen) == LIMIT:
            break
    return chosen


def evaluate(h1: dict, h2: dict, teams: list[str], k, min_gap) -> dict:
    pairs = []  # (shown gap, later gap, later n)
    count = 0
    for team in teams:
        for dims, n, shown, _ in pick(h1, team, k, min_gap):
            count += 1
            later = h2.get((team, dims))
            if later and later[0] >= MIN_PLAYS:
                pairs.append((shown, later[1] - later[2], later[0]))
    kept = sum(s * g > 0 for s, g, _ in pairs) / len(pairs)
    # Weighted slope through the origin: 1.0 = shown gaps are the right size.
    slope = sum(s * g * w for s, g, w in pairs) / sum(s * s * w for s, _, w in pairs)
    return {"per_team": count / len(teams), "kept": kept, "slope": slope}


def fit_k(h1: dict, h2: dict) -> int:
    """Shrinkage that best predicts the later gap, over every team cell."""
    pairs = [
        (n, p - lp, h2[key][1] - h2[key][2], h2[key][0])
        for key, (n, p, lp) in h1.items()
        if n >= MIN_PLAYS and key in h2 and h2[key][0] >= MIN_PLAYS
    ]
    def sse(k):
        return sum(w * (n / (n + k) * g1 - g2) ** 2 for n, g1, g2, w in pairs)
    return min(range(0, 401, 5), key=sse)


def main(seasons: list[int]) -> None:
    con = duckdb.connect()
    for s in seasons:
        path = DATA / f"plays_{s}.parquet"
        h1, h2 = cells(con, path, 1, 9), cells(con, path, 10, 18)
        teams = sorted({t for t, _ in h1})
        print(f"\n{s}: fitted SHRINK_PLAYS = {fit_k(h1, h2)}")
        rows = [("old (raw gap, z)", None, None)] + [
            (f"shrunk k={k}, min {g:.0%}", k, g) for k in (60, 90, 120) for g in (0.05, 0.06)
        ]
        for label, k, g in rows:
            r = evaluate(h1, h2, teams, k, g)
            print(f"  {label:<24} tells/team {r['per_team']:.1f}  "
                  f"kept direction {r['kept']:.0%}  calibration slope {r['slope']:.2f}")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2025])

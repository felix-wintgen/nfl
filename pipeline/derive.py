"""DuckDB macros that derive scouting columns from raw nflverse play-by-play.

Kept separate from build.py so tests can load them into an in-memory DuckDB
and check each derivation on hand-written rows.
"""

from __future__ import annotations

import duckdb

# Personnel strings come in two formats:
#   2022 and older: "1 RB, 1 TE, 3 WR" / "4 DL, 2 LB, 5 DB"
#   2023+:          "1 C, 2 G, 1 QB, 1 RB, 2 T, 1 TE, 3 WR" / "3 CB, 2 DE, 2 DT, 1 FS, 1 MLB, 1 OLB, 1 SS"
MACROS = r"""
CREATE OR REPLACE MACRO pos_count(personnel, pos) AS
    coalesce(list_sum(list_transform(
        regexp_extract_all(personnel, '(\d+) ' || pos || '\b', 1),
        x -> CAST(x AS INTEGER))), 0);

-- Offensive grouping as RB+FB count followed by TE count: '11', '12', '21' ...
-- An extra offensive lineman (6+ OL) is marked with a trailing '+OL'.
CREATE OR REPLACE MACRO off_personnel(p) AS
    CASE WHEN p IS NULL OR p = '' THEN NULL ELSE
        CAST(least(pos_count(p, 'RB') + pos_count(p, 'FB'), 9) AS VARCHAR)
        || CAST(least(pos_count(p, 'TE'), 9) AS VARCHAR)
        || CASE WHEN pos_count(p, 'OL') + pos_count(p, 'C') + pos_count(p, 'G') + pos_count(p, 'T') >= 6
                THEN '+OL' ELSE '' END
    END;

CREATE OR REPLACE MACRO def_dbs(p) AS
    pos_count(p, 'CB') + pos_count(p, 'FS') + pos_count(p, 'SS')
    + pos_count(p, 'DB') + pos_count(p, 'S');

CREATE OR REPLACE MACRO def_package(p) AS
    CASE
        WHEN p IS NULL OR p = '' THEN NULL
        WHEN def_dbs(p) <= 3 THEN 'goal line'
        WHEN def_dbs(p) = 4 THEN 'base'
        WHEN def_dbs(p) = 5 THEN 'nickel'
        WHEN def_dbs(p) = 6 THEN 'dime'
        ELSE 'quarter'
    END;

CREATE OR REPLACE MACRO dist_bucket(ydstogo) AS
    CASE
        WHEN ydstogo IS NULL THEN NULL
        WHEN ydstogo <= 2 THEN '1-2'
        WHEN ydstogo <= 6 THEN '3-6'
        WHEN ydstogo <= 10 THEN '7-10'
        ELSE '11+'
    END;

-- yardline_100 = yards to the opponent's end zone.
CREATE OR REPLACE MACRO field_zone(yardline_100, goal_to_go) AS
    CASE
        WHEN yardline_100 IS NULL THEN NULL
        WHEN goal_to_go = 1 THEN 'goal to go'
        WHEN yardline_100 <= 20 THEN 'red zone'
        WHEN yardline_100 <= 49 THEN 'opp 49-21'
        WHEN yardline_100 <= 79 THEN 'own 21-50'
        ELSE 'own 1-20'
    END;

CREATE OR REPLACE MACRO score_state(score_differential) AS
    CASE
        WHEN score_differential IS NULL THEN NULL
        WHEN score_differential <= -9 THEN 'trailing 9+'
        WHEN score_differential >= 9 THEN 'leading 9+'
        ELSE 'one score'
    END;

CREATE OR REPLACE MACRO pass_depth(air_yards) AS
    CASE
        WHEN air_yards IS NULL THEN NULL
        WHEN air_yards < 0 THEN 'behind LOS'
        WHEN air_yards < 10 THEN 'short'
        WHEN air_yards < 20 THEN 'intermediate'
        ELSE 'deep'
    END;

CREATE OR REPLACE MACRO is_explosive(is_pass, yards_gained) AS
    CASE WHEN is_pass THEN yards_gained >= 20 ELSE yards_gained >= 12 END;

-- Last two minutes of either half.
CREATE OR REPLACE MACRO two_min(qtr, half_seconds_remaining) AS
    qtr IN (2, 4) AND half_seconds_remaining <= 120;
"""


def connect(path: str = ":memory:") -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(path)
    con.execute(MACROS)
    return con

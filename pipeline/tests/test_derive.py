from __future__ import annotations

import pytest

from derive import connect

con = connect()


def ev(expr: str):
    return con.execute(f"SELECT {expr}").fetchone()[0]


@pytest.mark.parametrize("personnel, expected", [
    ("1 RB, 1 TE, 3 WR", "11"),
    ("1 RB, 2 TE, 2 WR", "12"),
    ("2 RB, 1 TE, 2 WR", "21"),
    ("1 RB, 1 FB, 1 TE, 2 WR", "21"),
    ("0 RB, 1 TE, 4 WR", "01"),
    ("6 OL, 1 RB, 2 TE, 1 WR", "12+OL"),
    ("1 C, 2 G, 1 QB, 1 RB, 2 T, 1 TE, 3 WR", "11"),
    ("1 C, 2 G, 1 QB, 1 RB, 2 T, 2 TE, 2 WR", "12"),
    ("1 C, 2 G, 1 QB, 1 RB, 3 T, 1 TE, 2 WR", "11+OL"),
    ("1 C, 2 G, 1 QB, 1 FB, 1 RB, 2 T, 1 TE, 2 WR", "21"),
    ("1 C, 2 G, 1 QB, 1 RB, 2 T, 3 TE, 1 WR", "13"),
])
def test_off_personnel(personnel, expected):
    assert ev(f"off_personnel('{personnel}')") == expected


@pytest.mark.parametrize("personnel", [None, ""])
def test_off_personnel_missing(personnel):
    arg = "NULL" if personnel is None else f"'{personnel}'"
    assert ev(f"off_personnel({arg})") is None


@pytest.mark.parametrize("personnel, dbs, package", [
    ("4 DL, 3 LB, 4 DB", 4, "base"),
    ("4 DL, 2 LB, 5 DB", 5, "nickel"),
    ("4 DL, 1 LB, 6 DB", 6, "dime"),
    ("3 DL, 1 LB, 7 DB", 7, "quarter"),
    ("5 DL, 3 LB, 3 DB", 3, "goal line"),
    ("3 CB, 2 DE, 2 DT, 1 FS, 1 MLB, 1 OLB, 1 SS", 5, "nickel"),
    ("2 CB, 2 DE, 2 DT, 1 FS, 1 MLB, 2 OLB, 1 SS", 4, "base"),
    ("4 CB, 2 DE, 1 DT, 1 FS, 1 OLB, 2 SS", 7, "quarter"),
    ("4 CB, 1 DE, 1 DT, 1 S, 2 ILB, 1 OLB, 1 SS", 6, "dime"),
])
def test_def_package(personnel, dbs, package):
    assert ev(f"def_dbs('{personnel}')") == dbs
    assert ev(f"def_package('{personnel}')") == package


@pytest.mark.parametrize("ydstogo, bucket", [(1, "1-2"), (2, "1-2"), (3, "3-6"), (6, "3-6"),
                                             (7, "7-10"), (10, "7-10"), (11, "11+"), (25, "11+")])
def test_dist_bucket(ydstogo, bucket):
    assert ev(f"dist_bucket({ydstogo})") == bucket


@pytest.mark.parametrize("yardline_100, goal_to_go, zone", [
    (95, 0, "own 1-20"), (80, 0, "own 1-20"), (79, 0, "own 21-50"), (50, 0, "own 21-50"),
    (49, 0, "opp 49-21"), (21, 0, "opp 49-21"), (20, 0, "red zone"), (8, 0, "red zone"),
    (8, 1, "goal to go"),
])
def test_field_zone(yardline_100, goal_to_go, zone):
    assert ev(f"field_zone({yardline_100}, {goal_to_go})") == zone


@pytest.mark.parametrize("diff, state", [(-14, "trailing 9+"), (-9, "trailing 9+"), (-8, "one score"),
                                         (0, "one score"), (8, "one score"), (9, "leading 9+")])
def test_score_state(diff, state):
    assert ev(f"score_state({diff})") == state


@pytest.mark.parametrize("air, depth", [(-3, "behind LOS"), (0, "short"), (9, "short"),
                                        (10, "intermediate"), (19, "intermediate"), (20, "deep")])
def test_pass_depth(air, depth):
    assert ev(f"pass_depth({air})") == depth


@pytest.mark.parametrize("is_pass, yards, expected", [(True, 19, False), (True, 20, True),
                                                      (False, 11, False), (False, 12, True)])
def test_is_explosive(is_pass, yards, expected):
    assert ev(f"is_explosive({is_pass}, {yards})") is expected


@pytest.mark.parametrize("qtr, secs, expected", [(2, 120, True), (2, 121, False), (4, 30, True),
                                                 (1, 30, False), (3, 60, False)])
def test_two_min(qtr, secs, expected):
    assert ev(f"two_min({qtr}, {secs})") is expected

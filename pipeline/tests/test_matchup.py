from __future__ import annotations

from datetime import date

import pytest

from matchup import (
    BACK_RULES,
    Availability,
    QB_RULES,
    TARGET_RULES,
    apply_rules,
    implied_scores,
    on_the_rise,
    player_stats,
    practice,
    record,
    report_pending,
    replay,
    win_prob,
)


def target(**kw):
    s = dict(pos="WR", targets=40, share=0.1, ay_share=0.1, adot=8.0, rz_targets=0, rz_share=0.0,
             third_share=0.1, games=6, last3_share=0.1, early_share=0.1)
    s.update(kw)
    return s


def test_label_is_earned_at_the_enter_bar():
    assert apply_rules(TARGET_RULES, target(share=0.26), []) == ["go_to"]
    assert apply_rules(TARGET_RULES, target(share=0.24), []) == []


def test_held_label_stays_until_clearly_below():
    # 23%: not enough to earn it, enough to keep it.
    assert apply_rules(TARGET_RULES, target(share=0.23), ["go_to"]) == ["go_to"]
    assert apply_rules(TARGET_RULES, target(share=0.20), ["go_to"]) == []


def test_too_few_targets_earn_nothing():
    assert apply_rules(TARGET_RULES, target(targets=10, share=0.5), []) == []


def test_security_blanket_is_for_tight_ends_and_backs():
    s = dict(share=0.18, adot=5.0, third_share=0.25)
    assert "security_blanket" in apply_rules(TARGET_RULES, target(pos="TE", **s), [])
    assert "security_blanket" not in apply_rules(TARGET_RULES, target(pos="WR", **s), [])


def test_backfield_and_qb_rules():
    back = dict(carries=90, rb_share=0.8, inside5=2, inside5_share=0.3, targets=5, rb_third_share=0.2)
    assert apply_rules(BACK_RULES, back, []) == ["workhorse"]
    qb = dict(attempts=200, dropbacks=230, adot=9.5, run_rate=0.03, rush_ypg=5, sack_rate=0.05, int_rate=0.01)
    assert apply_rules(QB_RULES, qb, []) == ["gunslinger", "careful"]


def test_on_the_rise_needs_a_real_jump():
    assert on_the_rise(target(last3_share=0.24, early_share=0.12))
    assert not on_the_rise(target(last3_share=0.24, early_share=0.20))
    assert not on_the_rise(target(last3_share=0.15, early_share=0.02))
    assert not on_the_rise(target(games=3, last3_share=0.3, early_share=0.0))


def test_replay_keeps_labels_and_reports_last_weeks():
    weekly = {4: 0.27, 5: 0.23, 6: 0.22, 7: 0.19}
    stats = {(w, "SEA"): {"targets": {"p1": target(share=s)}, "backs": {}, "qbs": {}} for w, s in weekly.items()}
    held, prev = replay(stats, 6)
    assert held[("SEA", "targets", "p1")] == ["go_to"]  # earned in week 4, held through 6
    assert prev[("SEA", "targets", "p1")] == ["go_to"]
    held, prev = replay(stats, 7)
    assert held[("SEA", "targets", "p1")] == []
    assert prev[("SEA", "targets", "p1")] == ["go_to"]


def test_replay_never_holds_a_label_it_never_earned():
    stats = {(w, "SEA"): {"targets": {"p1": target(share=0.23)}, "backs": {}, "qbs": {}} for w in (4, 5)}
    held, _ = replay(stats, 5)
    assert held[("SEA", "targets", "p1")] == []


def usage_for(per_week):
    """Usage tables for one team; per_week maps week -> {player: targets}, 10 team targets a week.
    Stats are as of the week after the last."""
    w = max(per_week) + 1
    weeks = sorted(per_week)
    recent = weeks[-3:]
    per_game, season = [], {}
    for wk, players in per_week.items():
        rows = {**players, "filler": 10 - sum(players.values())}
        for pid, n in rows.items():
            per_game.append(dict(team="LA", week=wk, id=pid, targets=n, ay=8 * n, rz_targets=0,
                                 third_targets=0, carries=0, inside5=0))
            t = season.setdefault(pid, dict(targets=0, t3=0))
            t["targets"] += n
            t["t3"] += n if wk in recent else 0
    target = [dict(w=w, team="LA", id=pid, targets=t["targets"], ay=8 * t["targets"], rz_targets=0,
                   third_targets=0, rec=0, rec_yards=0, rec_td=0, games=len(weeks), t3=t["t3"])
              for pid, t in season.items() if t["targets"]]
    return dict(target=target, rush=[], qb=[], games=[dict(w=w, team="LA", games=len(weeks))],
                per_game=[r for r in per_game if r["targets"]]), w


def test_shares_count_only_games_he_was_active_for():
    # Out in weeks 2 and 3 (injured); 5 of the team's 10 targets in each game he played.
    u, w = usage_for({1: {"p": 5}, 2: {}, 3: {}, 4: {"p": 5}})
    avail = Availability(active={("p", "LA", wk) for wk in (1, 4)}, hurt={("p", 2), ("p", 3)})
    assert player_stats(u, {}, avail)[(w, "LA")]["targets"]["p"]["share"] == pytest.approx(0.5)
    assert player_stats(u, {})[(w, "LA")]["targets"]["p"]["share"] == pytest.approx(0.25)  # every game


def test_no_rise_from_coming_back_from_injury():
    # Same role all season, but out injured in weeks 2 and 3.
    u, w = usage_for({1: {"p": 3}, 2: {}, 3: {}, 4: {"p": 3}, 5: {"p": 3}, 6: {"p": 3}})
    active = {("p", "LA", wk) for wk in (1, 4, 5, 6)}
    hurt = Availability(active, hurt={("p", 2), ("p", 3)})
    assert not on_the_rise(player_stats(u, {}, hurt)[(w, "LA")]["targets"]["p"])
    # A healthy scratch is different: he wasn't in the plan, now he is.
    scratch = Availability(active, hurt=set())
    assert on_the_rise(player_stats(u, {}, scratch)[(w, "LA")]["targets"]["p"])


@pytest.mark.parametrize("has_status, today, pending", [
    (False, date(2026, 10, 30), True),   # Friday morning, Monday game: report not out
    (False, date(2026, 11, 1), False),   # Sunday: Saturday's report is out, even with no statuses
    (True, date(2026, 10, 30), False),   # a game status on the team means the report is out
])
def test_final_report_is_pending_until_the_day_before(has_status, today, pending):
    assert report_pending(has_status, date(2026, 11, 2), today) is pending


def test_practice_status():
    assert practice("Did Not Participate In Practice") == "dnp"
    assert practice("Limited Participation in Practice") == "limited"
    assert practice("Full Participation in Practice") is None
    assert practice(None) is None


@pytest.mark.parametrize("spread, total, expected", [
    (3.0, 46.5, (24.8, 21.8)),
    (-7.0, 44.0, (18.5, 25.5)),
    (None, 44.0, None),
])
def test_implied_scores(spread, total, expected):
    assert implied_scores(spread, total) == expected


def test_win_prob_removes_the_margin():
    assert win_prob(-150, 130) == pytest.approx(0.58, abs=0.01)
    assert win_prob(-110, -110) == 0.5
    assert win_prob(None, 120) is None


def test_record():
    assert record([(24, 17), (10, 13), (20, 20)]) == "1-1-1"
    assert record([(24, 17)]) == "1-0"
    assert record([]) == "0-0"

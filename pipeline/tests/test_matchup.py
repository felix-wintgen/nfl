from __future__ import annotations

import pytest

from matchup import (
    BACK_RULES,
    QB_RULES,
    TARGET_RULES,
    apply_rules,
    implied_scores,
    on_the_rise,
    record,
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

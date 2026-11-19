"""Compare two board_replay.py *_full.json outputs: identical, or what changed.

The check behind every change to pipeline/matchup.py that shouldn't change the board (a refactor),
or should change only one thing (then this shows it changed nothing else):

    python pipeline/replay/compare.py BEFORE_full.json AFTER_full.json
"""

from __future__ import annotations

import json
import sys
from collections import Counter


def main(before: str, after: str) -> int:
    a, b = json.load(open(before)), json.load(open(after))
    if a == b:
        print(f"identical: {len(a)} boards")
        return 0
    changed, examples = Counter(), []
    for key in sorted(set(a) | set(b)):
        ga, gb = (a.get(key) or {}).get("games", []), (b.get(key) or {}).get("games", [])
        if len(ga) != len(gb):
            changed["games"] += 1
            continue
        for x, y in zip(ga, gb):
            for side in ("away", "home"):
                bx, by = x["boards"][side], y["boards"][side]
                for field in sorted(set(bx) | set(by)):
                    if bx.get(field) != by.get(field):
                        changed[field] += 1
                        if len(examples) < 10:
                            examples.append(f"{key} {x['game_id']} {side} {field}")
    print("changed fields:", dict(changed))
    print("\n".join(examples))
    return 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))

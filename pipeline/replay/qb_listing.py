"""nflverse's listed starting QB per team-game as it changed over time, from the nfldata git history.

The schedule's QB columns are the pre-game listing and often stay that way after the game, so a
replay needs the listing as it stood at build time, not today's file. Clone nfldata first (a few GB;
fetch in pieces if the connection drops), then:

    python pipeline/replay/qb_listing.py PATH/TO/nfldata OUT.json [--ref FETCH_HEAD] [--since 2022]

OUT: {"hist": {game_id: {team: [[iso_time, qb_id or null], ...]}}, "kick": {game_id: kickoff UTC}},
keeping only changes.
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
from datetime import datetime
from zoneinfo import ZoneInfo


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("repo")
    ap.add_argument("out")
    ap.add_argument("--ref", default="HEAD", help="FETCH_HEAD for a clone made with git fetch")
    ap.add_argument("--since", type=int, default=2022, help="first season to keep")
    args = ap.parse_args()

    log = subprocess.run(["git", "-C", args.repo, "log", "--reverse", "--format=%H %cI", args.ref, "--", "data/games.csv"],
                         capture_output=True, text=True, check=True).stdout.split("\n")
    commits = [line.split() for line in log if line]
    cat = subprocess.Popen(["git", "-C", args.repo, "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    prefixes = tuple(f"{s}_" for s in range(args.since, datetime.now().year + 2))
    et, utc = ZoneInfo("America/New_York"), ZoneInfo("UTC")

    hist, kick = {}, {}
    for c, t in commits:
        cat.stdin.write(f"{c}:data/games.csv\n".encode())
        cat.stdin.flush()
        header = cat.stdout.readline().split()
        if header[1] == b"missing":
            continue
        blob = cat.stdout.read(int(header[2])).decode()
        cat.stdout.read(1)
        lines = blob.split("\n")
        for r in csv.DictReader([lines[0]] + [line for line in lines[1:] if line.startswith(prefixes)]):
            g = r["game_id"]
            if r["gameday"] and r["gametime"]:
                kick[g] = datetime.fromisoformat(f"{r['gameday']}T{r['gametime']}").replace(tzinfo=et).astimezone(utc).isoformat()
            for side in ("away", "home"):
                qb = r.get(f"{side}_qb_id") or None
                h = hist.setdefault(g, {}).setdefault(r[f"{side}_team"], [])
                if not h or h[-1][1] != qb:
                    h.append([t, qb])
    with open(args.out, "w") as f:
        json.dump({"hist": hist, "kick": kick}, f)
    print(f"{len(commits)} commits, {len(hist)} games")


if __name__ == "__main__":
    main()

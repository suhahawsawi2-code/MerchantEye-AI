"""
MerchantEye AI - accuracy evaluation (numbers for the poster's "Key Results" table)
===================================================================================
Compare the system's output with what YOU counted by hand.

1) People counting  -> make a CSV with columns: time_sec,true_count
   (e.g. pause the video every 5 seconds and count the people in the queue zone)

       time_sec,true_count
       0,2
       5,3
       10,5

2) Waiting time -> make a CSV with columns: person,true_wait_sec,system_wait_sec
   (time ~10 people with a stopwatch; read the system's wait from the annotated video label "wait m:ss")

       person,true_wait_sec,system_wait_sec
       1,95,88
       2,140,151

Usage:
  python evaluate.py --analysis output/queue_analysis.json --counts counts.csv
  python evaluate.py --analysis output/queue_analysis.json --counts counts.csv --waits waits.csv
  python evaluate.py --analysis output/queue_analysis.json --counts counts.csv --field visitors
"""

import argparse
import csv
import json

import numpy as np


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--analysis", required=True)
    p.add_argument("--counts", help="CSV time_sec,true_count")
    p.add_argument("--field", default="queue", choices=["queue", "customers"],
                   help="compare against queue count (default) or all customers in frame")
    p.add_argument("--waits", help="CSV person,true_wait_sec,system_wait_sec")
    a = p.parse_args()

    data = json.load(open(a.analysis, encoding="utf-8"))
    s = data["summary"]
    frames = data["frames"]
    ts = np.array([f["t"] for f in frames])

    print("=" * 60)
    print(f"Video: {s['video']}  ({s['durationSec']} s, {s['resolution']})")
    print(f"Processing speed : {s['processingFps']} FPS  (model {s['model']})")

    if a.counts:
        errs, rows = [], []
        with open(a.counts, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                t, true = float(r["time_sec"]), int(r["true_count"])
                i = int(np.argmin(np.abs(ts - t)))
                pred = frames[i][a.field]
                errs.append(abs(pred - true))
                rows.append((t, true, pred))
        errs = np.array(errs)
        print("-" * 60)
        print(f"People counting ({a.field}) on {len(rows)} checkpoints")
        for t, true, pred in rows:
            print(f"  t={t:6.1f}s  true={true:3d}  system={pred:3d}  err={pred - true:+d}")
        print(f"  MAE (mean absolute error) : ±{errs.mean():.2f} persons")
        print(f"  Exact matches             : {100 * np.mean(errs == 0):.0f}%")
        print(f"  Within ±1 person          : {100 * np.mean(errs <= 1):.0f}%")

    if a.waits:
        diffs = []
        with open(a.waits, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                diffs.append(float(r["system_wait_sec"]) - float(r["true_wait_sec"]))
        diffs = np.array(diffs)
        print("-" * 60)
        print(f"Waiting-time estimation on {len(diffs)} people")
        print(f"  MAE : ±{np.abs(diffs).mean():.1f} seconds")
        print(f"  Bias: {diffs.mean():+.1f} seconds (positive = system over-estimates)")
    print("=" * 60)


if __name__ == "__main__":
    main()

"""
Compare journey.py results with the ground truth of the simulated café video.

  python evaluate_journeys.py --truth cafe_sim_truth.json --results output/cafe_sim_journeys.json

Each true customer is matched to at most one detected journey (closest entry time, then exit time).
Prints: how many customers were found, missed, or split into extra journeys; the timing error of each
stage (enter, queue, order, served, seated, exit); served / table detection rates; and late flags.
"""

from __future__ import annotations

import argparse
import json
import statistics as st

LATE_SEC = 8 * 60  # same default as the website (entry -> served)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def late(j, end):
    if j.get("tServed") is not None:
        return j["tServed"] - j["tEnter"] >= LATE_SEC
    return j.get("tOrder") is not None and (j.get("tExit") if j.get("tExit") is not None else end) - j["tEnter"] >= LATE_SEC


def match(truth, found, max_enter_gap):
    pairs, used = [], set()
    cands = []
    for gi, g in enumerate(truth):
        for fi, f in enumerate(found):
            de = abs(f["tEnter"] - g["tEnter"])
            if de > max_enter_gap:
                continue
            dx = abs((f.get("tExit") or 0) - (g.get("tExit") or 0)) if (f.get("tExit") is None) == (g.get("tExit") is None) else 60
            cands.append((de + 0.25 * min(dx, 120), gi, fi))
    taken_g = set()
    for _, gi, fi in sorted(cands):
        if gi in taken_g or fi in used:
            continue
        taken_g.add(gi)
        used.add(fi)
        pairs.append((truth[gi], found[fi]))
    missed = [g for gi, g in enumerate(truth) if gi not in taken_g]
    extra = [f for fi, f in enumerate(found) if fi not in used]
    return pairs, missed, extra


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--truth", required=True)
    ap.add_argument("--results", required=True)
    ap.add_argument("--max-enter-gap", type=float, default=20.0, help="seconds; a detected journey further than this from a true entry cannot match it")
    ap.add_argument("--json-out", help="also write the report as JSON")
    a = ap.parse_args()

    T, R = load(a.truth), load(a.results)
    end = T.get("duration") or R.get("duration")
    truth = [j for j in T["journeys"] if j.get("tEnter") is not None]
    found = R["journeys"]
    pairs, missed, extra = match(truth, found, a.max_enter_gap)

    rep = {"trueCustomers": len(truth), "detectedJourneys": len(found), "matched": len(pairs),
           "missed": len(missed), "extraJourneys": len(extra), "source": R.get("source")}
    print(f"Model: {R.get('source')}   video {end:.0f}s")
    print(f"True customers: {len(truth)}   detected journeys: {len(found)}")
    print(f"Matched: {len(pairs)} ({100 * len(pairs) / max(1, len(truth)):.0f}%)   missed: {len(missed)}   extra journeys (split tracks / staff / ghosts): {len(extra)}")

    print("\nTiming error on matched customers (seconds):")
    print(f"  {'stage':8} {'both':>5} {'MAE':>7} {'median':>7} {'within 5s':>10} {'true only':>10} {'found only':>10}")
    rep["timing"] = {}
    for k in ("tEnter", "tQueue", "tOrder", "tServed", "tSeated", "tExit"):
        both = [(g[k], f[k]) for g, f in pairs if g.get(k) is not None and f.get(k) is not None]
        t_only = sum(1 for g, f in pairs if g.get(k) is not None and f.get(k) is None)
        f_only = sum(1 for g, f in pairs if g.get(k) is None and f.get(k) is not None)
        errs = [abs(x - y) for x, y in both]
        mae = st.mean(errs) if errs else None
        med = st.median(errs) if errs else None
        w5 = sum(e <= 5 for e in errs)
        rep["timing"][k] = {"both": len(both), "mae": mae, "median": med, "within5s": w5, "trueOnly": t_only, "foundOnly": f_only}
        print(f"  {k[1:]:8} {len(both):5d} {mae if mae is not None else float('nan'):7.1f} {med if med is not None else float('nan'):7.1f} {w5:10d} {t_only:10d} {f_only:10d}")

    print("\nBy customer type (matched / total, served detected / truly served, served mode right):")
    rep["byType"] = {}
    for typ in sorted({g["type"] for g in truth}):
        gs = [g for g in truth if g["type"] == typ]
        ps = [(g, f) for g, f in pairs if g["type"] == typ]
        sv = [(g, f) for g, f in ps if g.get("tServed") is not None]
        sv_ok = sum(1 for g, f in sv if f.get("tServed") is not None)
        mode_ok = sum(1 for g, f in sv if f.get("serveMode") == g.get("serveMode"))
        tb = [(g, f) for g, f in ps if g.get("table") is not None]
        tb_ok = sum(1 for g, f in tb if f.get("table") == g.get("table"))
        rep["byType"][typ] = {"total": len(gs), "matched": len(ps), "served": len(sv), "servedDetected": sv_ok, "modeRight": mode_ok, "seated": len(tb), "tableRight": tb_ok}
        print(f"  {typ:24} matched {len(ps):2d}/{len(gs):2d}   served {sv_ok:2d}/{len(sv):2d}   mode right {mode_ok:2d}   table right {tb_ok}/{len(tb)}")

    tl = [late(g, end) for g, _ in pairs]
    fl = [late(f, end) for _, f in pairs]
    tp = sum(1 for x, y in zip(tl, fl) if x and y)
    fp = sum(1 for x, y in zip(tl, fl) if not x and y)
    fn = sum(1 for x, y in zip(tl, fl) if x and not y)
    rep["late"] = {"trueLate": sum(late(g, end) for g in truth), "caught": tp, "falseAlarms": fp, "missedLate": fn}
    print(f"\nLate (entry -> served >= {LATE_SEC // 60} min): truly late {rep['late']['trueLate']}, caught {tp}, missed {fn}, false alarms {fp}")
    lq = [g for g in truth if g["type"] == "left_queue"]
    if lq:
        caught = sum(1 for g, f in pairs if g["type"] == "left_queue" and f.get("tQueue") is not None and f.get("tOrder") is None and f.get("tServed") is None)
        print(f"Left the queue without ordering: {len(lq)} true, {caught} detected as such")
        rep["leftQueue"] = {"true": len(lq), "detected": caught}

    if missed:
        print("\nMissed customers:", ", ".join(f"#{g['id']} ({g['type']}, in {g['tEnter']:.0f}s)" for g in missed))
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as f:
            json.dump(rep, f, indent=1)


if __name__ == "__main__":
    main()

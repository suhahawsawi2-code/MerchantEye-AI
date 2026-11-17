"""
MerchantEye AI - customer journey analysis (cloud / server side)
=================================================================
Analyzes an uploaded café video with a stronger model than the in-browser demo and writes a
results file the website opens directly (Dashboard -> "Customer journey" -> "Results file").

Pipeline:
  RF-DETR (Apache-2.0, default) or YOLO  ->  ByteTrack (one ID per person)
  -> zones (queue / pickup / tables / door / staff)  ->  one journey per customer:
     enter -> queue -> order -> served (pickup counter, or a cup/plate appears at their table) -> exit

Usage:
  pip install -r requirements-journey.txt
  # zones exported from the website (Download results JSON contains "zones"), or tables found automatically:
  python journey.py --video cafe.mp4 --zones cafe_analysis.json
  python journey.py --video cafe.mp4 --auto-tables --queue "0.30,0.40,0.55,0.95" --pickup "0.60,0.40,0.75,0.80"
  # compare with the browser model on the same clip:
  python journey.py --video cafe.mp4 --zones zones.json --model yolo

Zones are rectangles in normalized 0..1 coordinates: "x1,y1,x2,y2" (repeat the flag for several).
Privacy: no faces, no identities, no audio; only boxes, times and zone events are kept.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import dataclass, field

import numpy as np

try:
    import cv2
    import supervision as sv
except ImportError:
    sys.exit("Missing packages. Run:  pip install -r requirements-journey.txt")

ITEM_NAMES = {"cup", "wine glass", "bowl", "sandwich", "donut", "cake"}
TABLE_NAME = "dining table"


# ----------------------------------------------------------------------------- detectors

class Detector:
    """Returns (people, items, tables) as Nx5 arrays [x1, y1, x2, y2, conf] in pixels."""

    name = "detector"

    def __call__(self, frame_bgr: np.ndarray, conf: float):
        raise NotImplementedError


class RFDETRDetector(Detector):
    def __init__(self, size: str):
        try:
            import rfdetr
        except ImportError:
            sys.exit("rfdetr is not installed. Run:  pip install rfdetr   (or use --model yolo)")
        COCO_CLASSES = None
        for mod in ("rfdetr.assets.coco_classes", "rfdetr.util.coco_classes"):   # moved between versions
            try:
                COCO_CLASSES = __import__(mod, fromlist=["COCO_CLASSES"]).COCO_CLASSES
                break
            except Exception:
                continue
        if COCO_CLASSES is None:
            sys.exit("Could not find RF-DETR's COCO class names; update journey.py for this rfdetr version.")
        cls = {"nano": "RFDETRNano", "small": "RFDETRSmall", "medium": "RFDETRMedium"}[size]
        self.model = getattr(rfdetr, cls)()
        try:
            self.model.optimize_for_inference()
        except Exception:
            pass
        self.names = {int(k): v for k, v in COCO_CLASSES.items()}
        self.name = f"python-rfdetr-{size}"

    def __call__(self, frame_bgr, conf):
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        d = self.model.predict(rgb, threshold=min(conf, 0.3))
        return split_by_name(d.xyxy, d.confidence, [self.names.get(int(c), "") for c in d.class_id], conf)


class YOLODetector(Detector):
    def __init__(self, weights: str):
        try:
            from ultralytics import YOLO
        except ImportError:
            sys.exit("ultralytics is not installed. Run:  pip install ultralytics")
        self.model = YOLO(weights)
        self.names = self.model.names
        self.name = f"python-{os.path.splitext(os.path.basename(weights))[0]}"

    def __call__(self, frame_bgr, conf):
        r = self.model.predict(frame_bgr, conf=min(conf, 0.3), verbose=False)[0]
        b = r.boxes
        return split_by_name(b.xyxy.cpu().numpy(), b.conf.cpu().numpy(),
                             [self.names[int(c)] for c in b.cls.cpu().numpy()], conf)


def split_by_name(xyxy, confs, names, person_conf):
    people, items, tables = [], [], []
    for box, c, n in zip(xyxy, confs, names):
        row = [*map(float, box), float(c)]
        if n == "person" and c >= person_conf:
            people.append(row)
        elif n in ITEM_NAMES:
            items.append(row)
        elif n == TABLE_NAME:
            tables.append(row)
    as_arr = lambda rows: np.array(rows, dtype=np.float32).reshape(-1, 5)
    return as_arr(people), as_arr(items), as_arr(tables)


# ----------------------------------------------------------------------------- zones

Zone = tuple[float, float, float, float]  # normalized x1, y1, x2, y2


def parse_rect(text: str) -> Zone:
    v = [float(x) for x in text.replace(" ", "").split(",")]
    if len(v) != 4:
        raise ValueError(f"zone needs x1,y1,x2,y2: {text}")
    return (min(v[0], v[2]), min(v[1], v[3]), max(v[0], v[2]), max(v[1], v[3]))


def load_zones(path: str | None) -> dict[str, list[Zone]]:
    z = {"queue": [], "staff": [], "pickup": [], "tables": [], "door": []}
    if not path:
        return z
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data = data.get("zones", data)
    for k in z:
        for r in data.get(k, []):
            z[k].append((r["x1"], r["y1"], r["x2"], r["y2"]))
    return z


def zone_index(zones: list[Zone], x: float, y: float, W: int, H: int) -> int:
    for i, (x1, y1, x2, y2) in enumerate(zones):
        if x1 * W <= x <= x2 * W and y1 * H <= y <= y2 * H:
            return i
    return -1


def tables_to_zones(tables: np.ndarray, W: int, H: int, pad: float = 0.35) -> list[Zone]:
    out: list[Zone] = []
    for x1, y1, x2, y2, c in sorted(tables.tolist(), key=lambda r: -r[4]):
        w, h = x2 - x1, y2 - y1
        z = (max(0, (x1 - pad * w) / W), max(0, (y1 - 1.5 * pad * h) / H), min(1, (x2 + pad * w) / W), min(1, (y2 + pad * h) / H))

        def overlap(a, b):
            ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
            iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
            return ix * iy / min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))

        if all(overlap(q, z) < 0.5 for q in out):
            out.append(z)
    return out[:12]


# ----------------------------------------------------------------------------- journeys (same rules as app/lib/journeyTracker.ts)

@dataclass
class Journey:
    id: int
    tEnter: float
    tQueue: float | None = None
    tOrder: float | None = None
    tServed: float | None = None
    serveMode: str | None = None
    tSeated: float | None = None
    table: int | None = None
    tExit: float | None = None
    lastSeen: float = 0.0
    invoice: dict | None = None


@dataclass
class Live:
    j: Journey
    cx: float
    cy: float
    h: float
    queue_last_in: float | None = None
    pickup_since: float | None = None
    pickup_last_in: float | None = None
    table_cand: int | None = None
    table_since: float = 0.0
    last_in_door: bool = False


@dataclass
class TableSession:
    journey_id: int
    last_seen: float
    base_items: int
    item_frames: int = 0
    staff_since: float | None = None


@dataclass
class StaffMemo:
    hits: int = 0
    staff_hits: int = 0


class JourneyTracker:
    grace = 1.5
    min_queue = 2.0
    min_pickup = 2.0
    seat_after = 3.0
    relink_sec = 2.5
    table_hold = 30.0
    exit_sec = 3.0

    def __init__(self):
        self.live: dict[int, Live] = {}
        self.by_track: dict[int, int] = {}
        self.sessions: dict[int, TableSession] = {}
        self.done: list[Journey] = []
        self.next_id = 1
        self.staff: dict[int, StaffMemo] = {}

    def is_staff(self, tid: int, in_staff_now: bool) -> bool:
        m = self.staff.setdefault(tid, StaffMemo())
        m.hits += 1
        m.staff_hits += int(in_staff_now)
        return in_staff_now or (m.hits >= 3 and m.staff_hits / m.hits > 0.5)

    def update(self, people: list[tuple[int, np.ndarray]], items: np.ndarray, t: float, W: int, H: int, z: dict[str, list[Zone]]):
        zi = lambda zones, x, y: zone_index(zones, x, y, W, H)
        seen_now: set[int] = set()
        staff_boxes = []
        for tid, b in people:
            cx, foot, cy, h = (b[0] + b[2]) / 2, b[3], (b[1] + b[3]) / 2, b[3] - b[1]
            if self.is_staff(tid, zi(z["staff"], cx, foot) >= 0 or zi(z["staff"], cx, cy) >= 0):
                staff_boxes.append(b)
                continue
            table_at = zi(z["tables"], cx, foot)
            if table_at < 0:
                table_at = zi(z["tables"], cx, cy)

            jid = self.by_track.get(tid)
            if jid is None or jid not in self.live:
                jid = self._relink(cx, cy, h, t, table_at, seen_now)
                if jid is None:
                    jid = self.next_id
                    self.next_id += 1
                    self.live[jid] = Live(Journey(jid, t, lastSeen=t), cx, cy, h, table_since=t,
                                          last_in_door=zi(z["door"], cx, foot) >= 0)
                self.by_track[tid] = jid
            if jid in seen_now:
                continue
            seen_now.add(jid)
            L = self.live[jid]
            j = L.j
            L.cx, L.cy, L.h, j.lastSeen = cx, cy, h, t
            L.last_in_door = bool(z["door"]) and zi(z["door"], cx, foot) >= 0

            # queue -> order
            if zi(z["queue"], cx, foot) >= 0 and j.tOrder is None and j.tServed is None:
                if j.tQueue is None:
                    j.tQueue = t
                L.queue_last_in = t
            elif j.tQueue is not None and j.tOrder is None and L.queue_last_in is not None and t - L.queue_last_in > self.grace:
                if L.queue_last_in - j.tQueue >= self.min_queue:
                    j.tOrder = L.queue_last_in
                elif j.tServed is None:
                    j.tQueue = None
                L.queue_last_in = None

            # pickup -> served
            if zi(z["pickup"], cx, foot) >= 0:
                if L.pickup_since is None:
                    L.pickup_since = t
                L.pickup_last_in = t
            elif L.pickup_since is not None and L.pickup_last_in is not None and t - L.pickup_last_in > self.grace:
                if L.pickup_last_in - L.pickup_since >= self.min_pickup and j.tServed is None:
                    j.tServed, j.serveMode = L.pickup_last_in, "pickup"
                    if j.tOrder is None and j.tQueue is not None:
                        j.tOrder = min(L.pickup_since, L.queue_last_in or L.pickup_since)
                L.pickup_since = L.pickup_last_in = None

            # table -> seated
            if table_at >= 0:
                if L.table_cand != table_at:
                    L.table_cand, L.table_since = table_at, t
                elif t - L.table_since >= self.seat_after and j.table != table_at:
                    other = self.sessions.get(table_at)
                    if other is None or other.journey_id not in self.live or other.journey_id == jid or t - other.last_seen > self.table_hold:
                        j.table = table_at
                        if j.tSeated is None:
                            j.tSeated = L.table_since
                        if j.tOrder is None and j.tQueue is not None:
                            j.tOrder = L.queue_last_in if L.queue_last_in is not None else j.tQueue
                        self.sessions[table_at] = TableSession(jid, t, self._items_at(items, z["tables"][table_at], W, H))
                s = self.sessions.get(table_at)
                if s and s.journey_id == jid:
                    s.last_seen = t
            else:
                L.table_cand = None

        # table service: an item appears on the table, or staff stays at it
        for k, s in self.sessions.items():
            L = self.live.get(s.journey_id)
            if L is None or L.j.tServed is not None:
                continue
            n = self._items_at(items, z["tables"][k], W, H)
            s.item_frames = s.item_frames + 1 if n > s.base_items else 0
            s.base_items = min(s.base_items, n)
            staff_here = any(zone_index([z["tables"][k]], (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, W, H) >= 0 for b in staff_boxes)
            s.staff_since = (s.staff_since if s.staff_since is not None else t) if staff_here else None
            if s.item_frames >= 3 or (s.staff_since is not None and t - s.staff_since >= 3):
                L.j.tServed, L.j.serveMode = t, "table"

        # exits
        for jid in list(self.live):
            if jid in seen_now:
                continue
            L = self.live[jid]
            seated = L.j.table is not None and self.sessions.get(L.j.table, None) is not None and self.sessions[L.j.table].journey_id == jid
            hold = self.table_hold if seated else (10.0 if z["door"] and not L.last_in_door else self.exit_sec)
            if t - L.j.lastSeen <= hold:
                continue
            self._close(L)
            if seated:
                del self.sessions[L.j.table]
            del self.live[jid]
        for tid in [k for k, v in self.by_track.items() if v not in self.live]:
            del self.by_track[tid]

    def finish(self, t_end: float):
        for L in self.live.values():
            j = L.j
            if j.tQueue is not None and j.tOrder is None and L.queue_last_in is not None and L.queue_last_in - j.tQueue < self.min_queue:
                j.tQueue = None
            if t_end - j.lastSeen < 1:  # still in the picture at the end: not an exit
                if j.lastSeen - j.tEnter >= 2 or j.tQueue is not None or j.table is not None:
                    self.done.append(j)
                continue
            self._close(L)
        self.live.clear()

    def _close(self, L: Live):
        j = L.j
        if L.pickup_since is not None and L.pickup_last_in is not None and L.pickup_last_in - L.pickup_since >= self.min_pickup and j.tServed is None:
            j.tServed, j.serveMode = L.pickup_last_in, "pickup"
        if j.tQueue is not None and j.tOrder is None and L.queue_last_in is not None:
            if L.queue_last_in - j.tQueue < self.min_queue:
                j.tQueue = None
            elif j.tServed is not None:
                j.tOrder = L.queue_last_in
        j.tExit = j.lastSeen
        passer_by = j.tExit - j.tEnter < 2 and j.tQueue is None and j.tServed is None and j.table is None
        if not passer_by:
            self.done.append(j)

    def _relink(self, cx, cy, h, t, table_at, seen_now):
        if table_at >= 0:
            s = self.sessions.get(table_at)
            if s and s.journey_id in self.live and s.journey_id not in seen_now and t - s.last_seen <= self.table_hold:
                return s.journey_id
        best, best_d = None, math.inf
        for jid, L in self.live.items():
            if jid in seen_now or t - L.j.lastSeen > self.relink_sec or t == L.j.lastSeen:
                continue
            d = math.hypot(cx - L.cx, cy - L.cy) / max(h, L.h, 1)
            if d < 0.8 and d < best_d:
                best, best_d = jid, d
        return best

    @staticmethod
    def _items_at(items: np.ndarray, zone: Zone, W: int, H: int) -> int:
        n = 0
        for x1, y1, x2, y2, _ in items:
            x, y = (x1 + x2) / 2 / W, (y1 + y2) / 2 / H
            if zone[0] <= x <= zone[2] and zone[1] <= y <= zone[3]:
                n += 1
        return n

    def journeys(self) -> list[dict]:
        live = [L.j for L in self.live.values()]
        return [j.__dict__.copy() for j in sorted(self.done + live, key=lambda j: j.id)]


# ----------------------------------------------------------------------------- tracker

def make_tracker(analyzed_fps: float, conf: float):
    """ByteTrack: from the `trackers` package (current), or supervision's older built-in one."""
    try:
        from trackers import ByteTrackTracker
        t = ByteTrackTracker(frame_rate=analyzed_fps, lost_track_buffer=max(5, int(2 * analyzed_fps)),
                             track_activation_threshold=conf + 0.05, high_conf_det_threshold=conf + 0.05,
                             minimum_consecutive_frames=1)
        return lambda d: t.update(d)
    except ImportError:
        if hasattr(sv, "ByteTrack"):
            t = sv.ByteTrack(frame_rate=max(1, int(round(analyzed_fps))))
            return t.update_with_detections
        sys.exit("ByteTrack not found. Run:  pip install trackers")


# ----------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Customer-journey analysis of a café video")
    ap.add_argument("--video", required=True)
    ap.add_argument("--zones", help="JSON with zones (the website's results download, or {queue:[{x1,y1,x2,y2}],...})")
    ap.add_argument("--queue", action="append", default=[], help="x1,y1,x2,y2 (normalized), repeatable")
    ap.add_argument("--pickup", action="append", default=[])
    ap.add_argument("--table", action="append", default=[])
    ap.add_argument("--door", action="append", default=[])
    ap.add_argument("--staff", action="append", default=[])
    ap.add_argument("--auto-tables", action="store_true", help="detect tables in the first seconds and use them as table zones")
    ap.add_argument("--model", default="rfdetr", help="rfdetr (default) or yolo, or a path to YOLO weights")
    ap.add_argument("--size", default="small", choices=["nano", "small", "medium"], help="RF-DETR size")
    ap.add_argument("--fps", type=float, default=5.0, help="frames analyzed per second of video (5 is enough for timings)")
    ap.add_argument("--conf", type=float, default=0.4)
    ap.add_argument("--out-dir", default="output")
    ap.add_argument("--annotate", action="store_true", help="also write an annotated video")
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        sys.exit(f"Cannot open video: {args.video}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    step = max(1, round(fps / args.fps))

    zones = load_zones(args.zones)
    for k, flag in (("queue", args.queue), ("pickup", args.pickup), ("tables", args.table), ("door", args.door), ("staff", args.staff)):
        zones[k] += [parse_rect(r) for r in flag]

    if args.model == "rfdetr":
        det: Detector = RFDETRDetector(args.size)
    else:
        det = YOLODetector("yolov8n.pt" if args.model == "yolo" else args.model)
    tracker = make_tracker(fps / step, args.conf)
    jt = JourneyTracker()

    os.makedirs(args.out_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(args.video))[0]
    writer = None
    if args.annotate:
        writer = cv2.VideoWriter(os.path.join(args.out_dir, f"{base}_journey.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), fps / step, (W, H))

    print(f"Video {W}x{H} @ {fps:.1f} fps, {n_frames} frames; analyzing every {step} frame(s) with {det.name}")
    table_seen: list[np.ndarray] = []
    analyzed, t0, infer_ms = 0, time.time(), []
    idx = -1
    while True:
        ok = cap.grab()
        if not ok:
            break
        idx += 1
        if idx % step:
            continue
        ok, frame = cap.retrieve()
        if not ok:
            break
        t = idx / fps
        s = time.time()
        people, items, tables = det(frame, args.conf)
        infer_ms.append(1000 * (time.time() - s))
        analyzed += 1

        if args.auto_tables and not zones["tables"]:
            table_seen.append(tables)
            if analyzed == 12:
                zones["tables"] = tables_to_zones(np.concatenate(table_seen) if table_seen else tables, W, H)
                print(f"Auto-detected {len(zones['tables'])} table zones")

        dets = sv.Detections(xyxy=people[:, :4], confidence=people[:, 4], class_id=np.zeros(len(people), dtype=int))
        tracked = tracker(dets)
        ppl = [(int(tid), box) for tid, box in zip(tracked.tracker_id, tracked.xyxy) if tid is not None and tid >= 0]
        jt.update(ppl, items, t, W, H, zones)

        if writer is not None:
            for name, color in (("queue", (246, 130, 59)), ("pickup", (246, 92, 139)), ("tables", (129, 185, 16)), ("door", (22, 115, 249)), ("staff", (184, 163, 148))):
                for i, (x1, y1, x2, y2) in enumerate(zones[name]):
                    cv2.rectangle(frame, (int(x1 * W), int(y1 * H)), (int(x2 * W), int(y2 * H)), color, 2)
                    cv2.putText(frame, f"{name.upper()} {i + 1}", (int(x1 * W) + 4, int(y1 * H) + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
            for tid, b in ppl:
                jid = jt.by_track.get(tid)
                cv2.rectangle(frame, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), (94, 197, 34), 2)
                cv2.putText(frame, f"#{jid}" if jid else "staff", (int(b[0]), int(b[1]) - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (94, 197, 34), 1)
            for x1, y1, x2, y2, _ in items:
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (247, 85, 168), 1)
            writer.write(frame)
        if analyzed % 50 == 0:
            print(f"  {t:7.1f}s  journeys so far: {len(jt.journeys())}")

    last_t = idx / fps if idx >= 0 else 0.0
    jt.finish(last_t)
    if writer is not None:
        writer.release()
    duration = (idx + 1) / fps
    out = {
        "source": det.name,
        "video": os.path.basename(args.video),
        "duration": round(duration, 2),
        "analyzedFps": round(fps / step, 2),
        "avgInferenceMs": round(float(np.mean(infer_ms)), 1) if infer_ms else None,
        "zones": {k: [dict(zip(("x1", "y1", "x2", "y2"), map(lambda v: round(v, 4), r))) for r in v] for k, v in zones.items()},
        "journeys": jt.journeys(),
    }
    path = os.path.join(args.out_dir, f"{base}_journeys.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    js = out["journeys"]
    served = [j for j in js if j["tServed"] is not None]
    print(f"\nDone in {time.time() - t0:.0f}s. {len(js)} journeys, {len(served)} served.")
    print(f"Results: {path}  -> open it in the website: Dashboard > Customer journey > Results file")


if __name__ == "__main__":
    main()

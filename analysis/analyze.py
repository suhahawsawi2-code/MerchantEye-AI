"""
MerchantEye AI - Queue analysis engine
=======================================
Analyzes a store / checkout video with YOLOv8 + ByteTrack and produces:
  1. <name>_annotated.mp4   : the video with real detection boxes, IDs, wait times and the queue zone drawn on it
  2. <name>_analysis.json   : per-second timeline + summary, read by the website dashboard

Pipeline:
  YOLOv8 person detection -> ByteTrack multi-object tracking (one ID per person)
  -> queue zone (Region of Interest) -> waiting time = time each tracked ID stays inside the zone
  -> optional staff zone (behind the counter): people standing there are counted as staff, not customers

Usage examples:
  # 1) Preview the zones on the first frame (check they are in the right place)
  python analyze.py --video queue.mp4 --preview-zones

  # 2) Run the full analysis
  python analyze.py --video queue.mp4

  # Custom zones (normalized 0..1 coordinates, x,y pairs, clockwise):
  python analyze.py --video queue.mp4 \
      --queue-zone "0.30,0.40 0.75,0.40 0.75,0.95 0.30,0.95" \
      --staff-zone "0.78,0.30 1.0,0.30 1.0,0.90 0.78,0.90"
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field

import cv2
import numpy as np

try:
    from ultralytics import YOLO
except ImportError:
    sys.exit("ultralytics is not installed. Run:  pip install -r requirements.txt")


# ----------------------------------------------------------------------------- helpers

def parse_zone(text: str | None) -> np.ndarray | None:
    """'x,y x,y x,y ...' (normalized 0..1) -> Nx2 float array."""
    if not text:
        return None
    pts = [tuple(map(float, p.split(","))) for p in text.split()]
    if len(pts) < 3:
        raise ValueError("A zone needs at least 3 points")
    return np.array(pts, dtype=np.float32)


def to_pixels(zone: np.ndarray, w: int, h: int) -> np.ndarray:
    return (zone * np.array([w, h], dtype=np.float32)).astype(np.int32)


def inside(zone_px: np.ndarray | None, x: float, y: float) -> bool:
    if zone_px is None:
        return False
    return cv2.pointPolygonTest(zone_px, (float(x), float(y)), False) >= 0


def fmt_mmss(seconds: float) -> str:
    s = int(round(seconds))
    return f"{s // 60}:{s % 60:02d}"


# ----------------------------------------------------------------------------- tracking state

@dataclass
class Track:
    tid: int
    first_seen: float
    last_seen: float
    queue_enter: float | None = None      # time the person entered the queue zone (current visit)
    queue_last_in: float | None = None    # last time seen inside the queue zone
    staff_frames: int = 0
    frames: int = 0
    completed_waits: list[float] = field(default_factory=list)

    @property
    def is_staff(self) -> bool:
        # Staff = spends most of its visible time inside the staff zone
        return self.frames >= 5 and self.staff_frames / self.frames > 0.6

    def current_wait(self, now: float) -> float:
        return 0.0 if self.queue_enter is None else now - self.queue_enter


# ----------------------------------------------------------------------------- insights

def cx_index(avg_wait: float, queue: int, threshold: float) -> int:
    """Simple, transparent Customer-Experience index (0-100).
    Starts at 100, loses points when the average wait approaches/exceeds the target
    and when the queue gets long. Documented so it can be explained to judges."""
    wait_penalty = min(50.0, 40.0 * (avg_wait / threshold)) if threshold > 0 else 0.0
    queue_penalty = min(30.0, max(0, queue - 2) * 6.0)
    return int(round(max(0.0, 100.0 - wait_penalty - queue_penalty)))


def make_insight(queue: int, avg_wait: float, max_wait: float, threshold: float,
                 queue_limit: int) -> tuple[str, str, str]:
    """Returns (level, arabic, english)."""
    if queue >= queue_limit or max_wait >= threshold:
        return ("alert",
                f"تنبيه: {queue} أشخاص في الطابور وأطول انتظار {fmt_mmss(max_wait)}. يُنصح بفتح كاشير إضافي فوراً.",
                f"Alert: {queue} people in queue, longest wait {fmt_mmss(max_wait)}. Open an extra checkout now.")
    if queue >= max(2, queue_limit - 1) or avg_wait >= 0.6 * threshold:
        return ("warning",
                f"بدأ الطابور يتشكل ({queue} أشخاص، متوسط الانتظار {fmt_mmss(avg_wait)}). استعدوا لفتح كاشير إضافي.",
                f"Queue building up ({queue} people, avg wait {fmt_mmss(avg_wait)}). Prepare an extra checkout.")
    if queue == 0:
        return ("ok", "لا يوجد طابور حالياً. الحركة انسيابية.",
                "No queue right now. Flow is smooth.")
    return ("ok",
            f"الحركة طبيعية: {queue} في الطابور ومتوسط الانتظار {fmt_mmss(avg_wait)}.",
            f"Normal flow: {queue} in queue, avg wait {fmt_mmss(avg_wait)}.")


# ----------------------------------------------------------------------------- drawing

COL_CUSTOMER = (94, 197, 34)     # green  (BGR)
COL_QUEUE = (246, 130, 59)       # blue
COL_WARN = (11, 158, 245)        # amber
COL_ALERT = (68, 68, 239)        # red
COL_STAFF = (160, 160, 160)      # gray
COL_ZONE_Q = (246, 130, 59)
COL_ZONE_S = (180, 180, 180)


def draw_zone(img, zone_px, color, label):
    if zone_px is None:
        return
    overlay = img.copy()
    cv2.fillPoly(overlay, [zone_px], color)
    cv2.addWeighted(overlay, 0.12, img, 0.88, 0, img)
    cv2.polylines(img, [zone_px], True, color, 2, cv2.LINE_AA)
    x, y = zone_px[0]
    cv2.putText(img, label, (int(x) + 6, int(y) + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)


def draw_box(img, xyxy, color, text):
    x1, y1, x2, y2 = map(int, xyxy)
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    ty = max(y1, th + 6)
    cv2.rectangle(img, (x1, ty - th - 6), (x1 + tw + 6, ty), color, -1)
    cv2.putText(img, text, (x1 + 3, ty - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)


def draw_hud(img, now, customers, queue, avg_wait, max_wait, level):
    col = {"ok": (94, 197, 34), "warning": COL_WARN, "alert": COL_ALERT}[level]
    lines = [f"MerchantEye AI   t={now:5.1f}s",
             f"Customers: {customers}   Queue: {queue}",
             f"Avg wait: {fmt_mmss(avg_wait)}   Max wait: {fmt_mmss(max_wait)}"]
    h = 22 * len(lines) + 12
    overlay = img.copy()
    cv2.rectangle(overlay, (8, 8), (330, 8 + h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.65, img, 0.35, 0, img)
    cv2.rectangle(img, (8, 8), (14, 8 + h), col, -1)
    for i, t in enumerate(lines):
        cv2.putText(img, t, (22, 30 + 22 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)


# ----------------------------------------------------------------------------- video output

def browser_friendly(src: str, dst: str) -> str:
    """Re-encode to H.264 so every browser can play it. Falls back to the raw file."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        try:
            import imageio_ffmpeg  # type: ignore
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            ffmpeg = None
    if not ffmpeg:
        print("! ffmpeg not found - video saved as mp4v (may not play in Chrome). "
              "Install with:  pip install imageio-ffmpeg")
        shutil.move(src, dst)
        return dst
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", src, "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst], check=True)
    os.remove(src)
    return dst


# ----------------------------------------------------------------------------- main analysis

def analyze(args):
    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        sys.exit(f"Cannot open video: {args.video}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

    q_zone = to_pixels(parse_zone(args.queue_zone), W, H)
    s_zone_n = parse_zone(args.staff_zone)
    s_zone = to_pixels(s_zone_n, W, H) if s_zone_n is not None else None

    if args.preview_zones:
        ok, frame = cap.read()
        if not ok:
            sys.exit("Could not read the first frame")
        draw_zone(frame, q_zone, COL_ZONE_Q, "QUEUE ZONE")
        draw_zone(frame, s_zone, COL_ZONE_S, "STAFF ZONE")
        out = os.path.join(args.out_dir, "zones_preview.jpg")
        os.makedirs(args.out_dir, exist_ok=True)
        cv2.imwrite(out, frame)
        print(f"Zone preview saved: {out}\nOpen it and adjust --queue-zone / --staff-zone if needed.")
        return

    model = YOLO(args.model)
    os.makedirs(args.out_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(args.video))[0]
    tmp_video = os.path.join(args.out_dir, f"{base}_tmp.mp4")
    final_video = os.path.join(args.out_dir, f"{base}_annotated.mp4")
    writer = cv2.VideoWriter(tmp_video, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))

    tracks: dict[int, Track] = {}
    timeline: list[dict] = []
    per_frame_counts: list[dict] = []
    all_completed: list[float] = []
    grace = args.grace                     # seconds a person may be missed before we close their queue visit
    stride = max(1, args.stride)
    frame_idx = 0
    t_start = time.time()
    next_second = 0.0
    sec_acc: list[dict] = []
    last_draw = None

    print(f"Video: {W}x{H} @ {fps:.1f} fps, {n_frames} frames. Analyzing ...")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        now = frame_idx / fps

        if frame_idx % stride == 0:
            res = model.track(frame, persist=True, tracker=args.tracker, classes=[0],
                              conf=args.conf, iou=0.5, imgsz=args.imgsz, verbose=False)[0]
            dets = []
            if res.boxes is not None and res.boxes.id is not None:
                for xyxy, tid, conf in zip(res.boxes.xyxy.cpu().numpy(),
                                           res.boxes.id.int().cpu().tolist(),
                                           res.boxes.conf.cpu().numpy()):
                    dets.append((int(tid), xyxy, float(conf)))

            seen = set()
            for tid, xyxy, conf in dets:
                seen.add(tid)
                tr = tracks.get(tid) or Track(tid, now, now)
                tracks[tid] = tr
                tr.last_seen = now
                tr.frames += 1
                fx, fy = (xyxy[0] + xyxy[2]) / 2, xyxy[3]      # "feet" point = bottom-centre of the box
                if inside(s_zone, fx, fy):
                    tr.staff_frames += 1
                in_q = inside(q_zone, fx, fy) and not tr.is_staff
                if in_q:
                    if tr.queue_enter is None:
                        tr.queue_enter = now
                    tr.queue_last_in = now
                elif tr.queue_enter is not None and now - (tr.queue_last_in or now) > grace:
                    w = (tr.queue_last_in or now) - tr.queue_enter
                    if w >= args.min_wait:
                        tr.completed_waits.append(w)
                        all_completed.append(w)
                    tr.queue_enter = None

            # close visits of people that disappeared
            for tr in tracks.values():
                if tr.tid not in seen and tr.queue_enter is not None and now - tr.last_seen > grace:
                    w = (tr.queue_last_in or tr.last_seen) - tr.queue_enter
                    if w >= args.min_wait:
                        tr.completed_waits.append(w)
                        all_completed.append(w)
                    tr.queue_enter = None

            # current state
            customers, staff, in_queue = [], [], []
            boxes_json = []
            for tid, xyxy, conf in dets:
                tr = tracks[tid]
                if tr.is_staff:
                    staff.append(tid)
                    kind = "staff"
                else:
                    customers.append(tid)
                    kind = "queue" if tr.queue_enter is not None else "customer"
                    if kind == "queue":
                        in_queue.append(tr.current_wait(now))
                boxes_json.append({
                    "id": tid, "kind": kind, "conf": round(conf, 2),
                    "x": round(float(xyxy[0]) / W, 4), "y": round(float(xyxy[1]) / H, 4),
                    "w": round(float(xyxy[2] - xyxy[0]) / W, 4), "h": round(float(xyxy[3] - xyxy[1]) / H, 4),
                    "wait": round(tr.current_wait(now), 1) if kind == "queue" else 0.0,
                })
            avg_wait = float(np.mean(in_queue)) if in_queue else 0.0
            max_wait = float(np.max(in_queue)) if in_queue else 0.0
            level, _, _ = make_insight(len(in_queue), avg_wait, max_wait, args.wait_threshold, args.queue_limit)
            last_draw = (dets, customers, in_queue, avg_wait, max_wait, level)
            sec_acc.append({"customers": len(customers), "staff": len(staff), "queue": len(in_queue),
                            "avg_wait": avg_wait, "max_wait": max_wait, "boxes": boxes_json})
            per_frame_counts.append({"t": round(now, 2), "customers": len(customers),
                                     "queue": len(in_queue), "staff": len(staff)})

        # ---- draw (reuse last detections on skipped frames)
        if last_draw is not None:
            dets, customers, in_queue, avg_wait, max_wait, level = last_draw
            draw_zone(frame, q_zone, COL_ZONE_Q, "QUEUE ZONE")
            draw_zone(frame, s_zone, COL_ZONE_S, "STAFF ZONE")
            for tid, xyxy, conf in dets:
                tr = tracks[tid]
                if tr.is_staff:
                    draw_box(frame, xyxy, COL_STAFF, f"Staff {tid}")
                elif tr.queue_enter is not None:
                    w = tr.current_wait(now)
                    col = COL_ALERT if w >= args.wait_threshold else COL_WARN if w >= 0.6 * args.wait_threshold else COL_QUEUE
                    draw_box(frame, xyxy, col, f"ID {tid} | wait {fmt_mmss(w)} | {conf:.2f}")
                else:
                    draw_box(frame, xyxy, COL_CUSTOMER, f"ID {tid} | {conf:.2f}")
            draw_hud(frame, now, len(customers), len(in_queue), avg_wait, max_wait, level)
        writer.write(frame)

        # ---- aggregate one timeline entry per second
        if now + 1e-9 >= next_second + 1.0 or (n_frames and frame_idx == n_frames - 1):
            timeline.append(summarize_second(next_second, now, sec_acc, args))
            sec_acc = []
            next_second = float(int(now))
        frame_idx += 1
        if frame_idx % 100 == 0:
            el = time.time() - t_start
            print(f"  frame {frame_idx}/{n_frames}  ({frame_idx / el:.1f} fps)")

    if sec_acc:
        timeline.append(summarize_second(next_second, frame_idx / fps, sec_acc, args))

    # close open queue visits at the end of the video
    end_t = frame_idx / fps
    still_waiting = []
    for tr in tracks.values():
        if tr.queue_enter is not None:
            still_waiting.append((tr.queue_last_in or end_t) - tr.queue_enter)

    cap.release()
    writer.release()
    elapsed = time.time() - t_start
    final_video = browser_friendly(tmp_video, final_video)

    customers_ids = [t for t in tracks.values() if not t.is_staff and t.frames >= args.min_frames]
    staff_ids = [t for t in tracks.values() if t.is_staff]
    waits_all = all_completed + still_waiting
    summary = {
        "video": os.path.basename(args.video),
        "annotatedVideo": os.path.basename(final_video),
        "durationSec": round(end_t, 1),
        "resolution": f"{W}x{H}",
        "model": os.path.basename(args.model),
        "tracker": args.tracker,
        "processingFps": round(frame_idx / elapsed, 1) if elapsed else None,
        "uniqueCustomers": len(customers_ids),
        "uniqueStaff": len(staff_ids),
        "peakQueue": max((e["queueCount"] for e in timeline), default=0),
        "peakCustomers": max((e["visitorsNow"] for e in timeline), default=0),
        "avgWaitSec": round(float(np.mean(waits_all)), 1) if waits_all else 0.0,
        "maxWaitSec": round(float(np.max(waits_all)), 1) if waits_all else 0.0,
        "completedQueueVisits": len(all_completed),
        "alertSeconds": sum(1 for e in timeline if e["level"] == "alert"),
        "settings": {"waitThresholdSec": args.wait_threshold, "queueLimit": args.queue_limit,
                     "conf": args.conf, "queueZone": args.queue_zone, "staffZone": args.staff_zone},
    }
    out_json = os.path.join(args.out_dir, f"{base}_analysis.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "timeline": timeline, "frames": per_frame_counts},
                  f, ensure_ascii=False, indent=1)

    print("\nDone.")
    print(f"  Annotated video : {final_video}")
    print(f"  Analysis JSON   : {out_json}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def summarize_second(start: float, now: float, acc: list[dict], args) -> dict:
    if not acc:
        acc = [{"customers": 0, "staff": 0, "queue": 0, "avg_wait": 0.0, "max_wait": 0.0, "boxes": []}]
    last = acc[-1]
    visitors = int(round(np.median([a["customers"] for a in acc])))
    queue = int(round(np.median([a["queue"] for a in acc])))
    staff = int(round(np.median([a["staff"] for a in acc])))
    avg_wait = float(np.mean([a["avg_wait"] for a in acc]))
    max_wait = float(np.max([a["max_wait"] for a in acc]))
    level, ar, en = make_insight(queue, avg_wait, max_wait, args.wait_threshold, args.queue_limit)
    return {
        "startTime": round(start, 2), "endTime": round(max(now, start + 1.0), 2),
        "visitorsNow": visitors, "queueCount": queue, "staffCount": staff,
        "avgWaitSec": round(avg_wait, 1), "maxWaitSec": round(max_wait, 1),
        "cxScore": cx_index(avg_wait, queue, args.wait_threshold),
        "level": level, "insightAr": ar, "insightEn": en,
        "boxes": last["boxes"],
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser(description="MerchantEye AI queue analysis (YOLOv8 + ByteTrack)")
    p.add_argument("--video", required=True, help="input video file (mp4/mov/avi)")
    p.add_argument("--out-dir", default=os.path.join(here, "output"))
    p.add_argument("--model", default="yolov8n.pt", help="yolov8n.pt (fast) or yolov8s.pt (more accurate)")
    p.add_argument("--tracker", default="bytetrack.yaml")
    p.add_argument("--queue-zone", default="0.25,0.35 0.75,0.35 0.75,1.0 0.25,1.0",
                   help="queue area polygon, normalized 'x,y x,y ...'")
    p.add_argument("--staff-zone", default=None, help="area behind the counter (optional)")
    p.add_argument("--conf", type=float, default=0.35, help="detection confidence threshold")
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--stride", type=int, default=1, help="analyze every Nth frame (2-3 = faster)")
    p.add_argument("--wait-threshold", type=float, default=180, help="target max wait in seconds (alert above)")
    p.add_argument("--queue-limit", type=int, default=4, help="queue length that triggers an alert")
    p.add_argument("--grace", type=float, default=1.5, help="seconds a person can be missed before leaving the queue")
    p.add_argument("--min-wait", type=float, default=2.0, help="ignore queue visits shorter than this (passers-by)")
    p.add_argument("--min-frames", type=int, default=5, help="ignore tracks shorter than this (noise)")
    p.add_argument("--preview-zones", action="store_true", help="only draw the zones on the first frame")
    analyze(p.parse_args())


if __name__ == "__main__":
    main()

// MerchantEye AI — turns tracked people (+ cups / tables seen by the detector) into customer journeys.
//
// Zones (normalized 0..1 rectangles, drawn once or auto-detected):
//   queue   -> start of order (standing at / in front of the till)
//   pickup  -> "served" for counter pickup: the customer waits there, then leaves with the order
//   table   -> one zone per table: seated, and "served" when a cup/plate appears or staff stays at the table
//   door    -> optional: entry / exit
//   staff   -> behind the counter (people there are staff, not customers)
//
// Track IDs break when people are hidden for a while. Two rules keep one journey per customer:
//   1. a new track that appears where a journey was just lost (≤ 2.5 s, close by) continues that journey;
//   2. once seated, the journey belongs to the table: whoever is detected at that table continues it.

import type { Detection, TrackState, Zone } from "./visionEngine";
import type { Invoice, Journey } from "./journey";

export type CafeZones = { queue: Zone[]; staff: Zone[]; pickup: Zone[]; tables: Zone[]; door: Zone[] };

type Live = {
  j: Journey;
  trackId: number | null;
  cx: number; cy: number; h: number;      // last seen box centre / height (px)
  queueLastIn: number | null;
  pickupSince: number | null; pickupLastIn: number | null;
  tableCand: number | null; tableSince: number;
  lastInDoor: boolean;
};

type TableSession = { journeyId: number; lastSeen: number; baseItems: number; itemFrames: number; staffSince: number | null };

export class JourneyTracker {
  private live = new Map<number, Live>();       // journey id -> state
  private byTrack = new Map<number, number>();  // track id -> journey id
  private sessions = new Map<number, TableSession>();
  private done: Journey[] = [];
  private nextId = 1;
  private pending: Invoice[] = [];

  readonly grace = 1.5;          // s outside a zone before we say the person left it
  readonly minQueue = 2;         // s in the queue zone to count as queueing (not walking past)
  readonly minPickup = 2;        // s at the pickup counter to count as a pickup
  readonly seatAfter = 3;        // s inside a table zone to count as seated
  readonly relinkSec = 2.5;
  readonly tableHoldSec = 30;    // a seated customer may be hidden this long without "leaving"
  readonly exitSec = 3;          // others: unseen this long = left

  reset() {
    this.live.clear(); this.byTrack.clear(); this.sessions.clear(); this.done = []; this.nextId = 1; this.pending = [];
  }

  setInvoices(inv: Invoice[]) { this.pending = [...inv].sort((a, b) => a.t - b.t); }

  /** All journeys worth showing: finished ones + live ones that have done something. */
  journeys(): Journey[] {
    const liveJ = [...this.live.values()].map((l) => l.j).filter((j) => j.lastSeen - j.tEnter >= 1 || j.tQueue !== null);
    return [...this.done, ...liveJ].map((j) => ({ ...j }));
  }

  update(states: TrackState[], items: Detection[], t: number, vw: number, vh: number, z: CafeZones) {
    const inZ = (zones: Zone[], x: number, y: number) => zones.findIndex((q) => x >= q.x1 * vw && x <= q.x2 * vw && y >= q.y1 * vh && y <= q.y2 * vh);
    const seenNow = new Set<number>();

    // --- customers
    for (const s of states) {
      if (s.kind === "staff") continue;
      const cx = (s.box.x1 + s.box.x2) / 2, foot = s.box.y2, cy = (s.box.y1 + s.box.y2) / 2, h = s.box.y2 - s.box.y1;
      const tableAt = (() => { const a = inZ(z.tables, cx, foot); return a >= 0 ? a : inZ(z.tables, cx, cy); })();

      let jid = this.byTrack.get(s.id);
      if (jid === undefined || !this.live.has(jid)) {
        jid = this.relink(cx, cy, h, t, tableAt, seenNow);
        if (jid === undefined) {
          jid = this.nextId++;
          this.live.set(jid, {
            j: { id: jid, tEnter: t, tQueue: null, tOrder: null, tServed: null, serveMode: null, tSeated: null, table: null, tExit: null, lastSeen: t, invoice: null },
            trackId: s.id, cx, cy, h, queueLastIn: null, pickupSince: null, pickupLastIn: null, tableCand: null, tableSince: t, lastInDoor: inZ(z.door, cx, foot) >= 0,
          });
        }
        this.byTrack.set(s.id, jid);
      }
      if (seenNow.has(jid)) continue;               // two boxes on one journey (group at a table): count once
      seenNow.add(jid);
      const L = this.live.get(jid)!;
      const j = L.j;
      L.trackId = s.id; L.cx = cx; L.cy = cy; L.h = h; j.lastSeen = t;
      L.lastInDoor = z.door.length > 0 && inZ(z.door, cx, foot) >= 0;

      // queue -> order
      if (inZ(z.queue, cx, foot) >= 0 && j.tOrder === null && j.tServed === null) {
        if (j.tQueue === null) j.tQueue = t;
        L.queueLastIn = t;
      } else if (j.tQueue !== null && j.tOrder === null && L.queueLastIn !== null && t - L.queueLastIn > this.grace) {
        if (L.queueLastIn - j.tQueue >= this.minQueue) j.tOrder = L.queueLastIn;
        else if (j.tServed === null) j.tQueue = null;  // walked through the zone
        L.queueLastIn = null;
      }

      // pickup counter -> served
      if (inZ(z.pickup, cx, foot) >= 0) {
        if (L.pickupSince === null) L.pickupSince = t;
        L.pickupLastIn = t;
      } else if (L.pickupSince !== null && L.pickupLastIn !== null && t - L.pickupLastIn > this.grace) {
        if (L.pickupLastIn - L.pickupSince >= this.minPickup && j.tServed === null) {
          j.tServed = L.pickupLastIn; j.serveMode = "pickup";
          if (j.tOrder === null && j.tQueue !== null) j.tOrder = Math.min(L.pickupSince, L.queueLastIn ?? L.pickupSince);
        }
        L.pickupSince = null; L.pickupLastIn = null;
      }

      // table -> seated
      if (tableAt >= 0) {
        if (L.tableCand !== tableAt) { L.tableCand = tableAt; L.tableSince = t; }
        else if (t - L.tableSince >= this.seatAfter && j.table !== tableAt) {
          const other = this.sessions.get(tableAt);
          if (!other || !this.live.has(other.journeyId) || other.journeyId === jid || t - other.lastSeen > this.tableHoldSec) {
            j.table = tableAt; j.tSeated ??= L.tableSince;
            if (j.tOrder === null && j.tQueue !== null) j.tOrder = L.queueLastIn ?? j.tQueue;
            this.sessions.set(tableAt, { journeyId: jid, lastSeen: t, baseItems: this.itemsAt(items, z.tables[tableAt], vw, vh), itemFrames: 0, staffSince: null });
          }
        }
        const sess = this.sessions.get(tableAt);
        if (sess && sess.journeyId === jid) sess.lastSeen = t;
      } else L.tableCand = null;
    }

    // --- table service: an item appears on the table, or staff stays at the table
    for (const [k, sess] of this.sessions) {
      const L = this.live.get(sess.journeyId);
      if (!L || L.j.tServed !== null) continue;
      const n = this.itemsAt(items, z.tables[k], vw, vh);
      sess.itemFrames = n > sess.baseItems ? sess.itemFrames + 1 : 0;
      if (n < sess.baseItems) sess.baseItems = n;   // the previous customer's cup was cleared
      const staffHere = states.some((s) => s.kind === "staff" && inZ([z.tables[k]], (s.box.x1 + s.box.x2) / 2, (s.box.y1 + s.box.y2) / 2) >= 0);
      if (staffHere) sess.staffSince ??= t; else sess.staffSince = null;
      if (sess.itemFrames >= 3 || (sess.staffSince !== null && t - sess.staffSince >= 3)) {
        L.j.tServed = t; L.j.serveMode = "table";
      }
    }

    // --- invoices: bind each one to the customer at the till when it opens
    while (this.pending.length && this.pending[0].t <= t) {
      const inv = this.pending.shift()!;
      const cands = [...this.live.values()].filter((L) => !L.j.invoice && L.j.tQueue !== null && L.j.tServed === null &&
        (L.queueLastIn !== null ? inv.t - L.queueLastIn <= 3 : L.j.tOrder !== null && Math.abs(L.j.tOrder - inv.t) <= 5));
      cands.sort((a, b) => (a.j.tQueue ?? 0) - (b.j.tQueue ?? 0));   // first in line orders first
      const L = cands[0];
      if (L) { L.j.invoice = inv; if (L.j.tOrder === null || L.j.tOrder > inv.t) L.j.tOrder = Math.max(L.j.tQueue ?? inv.t, inv.t); }
    }

    // --- exits
    for (const [jid, L] of this.live) {
      if (seenNow.has(jid)) continue;
      const seated = L.j.table !== null && this.sessions.get(L.j.table)?.journeyId === jid;
      const hold = seated ? this.tableHoldSec : z.door.length && !L.lastInDoor ? 10 : this.exitSec;
      if (t - L.j.lastSeen <= hold) continue;
      // close any open zone visit
      if (L.pickupSince !== null && L.pickupLastIn !== null && L.pickupLastIn - L.pickupSince >= this.minPickup && L.j.tServed === null) {
        L.j.tServed = L.pickupLastIn; L.j.serveMode = "pickup";
      }
      if (L.j.tQueue !== null && L.j.tOrder === null && L.queueLastIn !== null) {
        if (L.queueLastIn - L.j.tQueue < this.minQueue) L.j.tQueue = null;          // only walked through
        else if (L.j.tServed !== null) L.j.tOrder = L.queueLastIn;
      }
      L.j.tExit = L.j.lastSeen;
      const passerBy = L.j.tExit - L.j.tEnter < 2 && L.j.tQueue === null && L.j.tServed === null && L.j.table === null;
      if (!passerBy) this.done.push(L.j);
      if (L.j.table !== null && this.sessions.get(L.j.table)?.journeyId === jid) this.sessions.delete(L.j.table);
      this.live.delete(jid);
    }
    for (const [tid, jid] of this.byTrack) if (!this.live.has(jid)) this.byTrack.delete(tid);
  }

  /** End of the video: everyone still inside is closed at the last time they were seen. */
  finish() {
    const tEnd = Math.max(0, ...[...this.live.values()].map((L) => L.j.lastSeen));
    for (const [, L] of this.live) {
      if (L.j.tQueue !== null && L.j.tOrder === null && L.queueLastIn !== null && L.queueLastIn - L.j.tQueue < this.minQueue) L.j.tQueue = null;
      if (tEnd - L.j.lastSeen < 1) {   // still in the picture when the video ended: not an exit
        if (L.j.tExit === null && (L.j.lastSeen - L.j.tEnter >= 2 || L.j.tQueue !== null || L.j.table !== null)) this.done.push(L.j);
        continue;
      }
      if (L.pickupSince !== null && L.pickupLastIn !== null && L.pickupLastIn - L.pickupSince >= this.minPickup && L.j.tServed === null) {
        L.j.tServed = L.pickupLastIn; L.j.serveMode = "pickup";
      }
      L.j.tExit = L.j.lastSeen;
      if (L.j.tExit - L.j.tEnter >= 2 || L.j.tQueue !== null || L.j.table !== null) this.done.push(L.j);
    }
    this.live.clear(); this.byTrack.clear(); this.sessions.clear();
  }

  private relink(cx: number, cy: number, h: number, t: number, tableAt: number, seenNow: Set<number>) {
    if (tableAt >= 0) {
      const s = this.sessions.get(tableAt);
      if (s && this.live.has(s.journeyId) && !seenNow.has(s.journeyId) && t - s.lastSeen <= this.tableHoldSec) return s.journeyId;
    }
    let best: number | undefined, bestD = Infinity;
    for (const [jid, L] of this.live) {
      if (seenNow.has(jid) || t - L.j.lastSeen > this.relinkSec || t === L.j.lastSeen) continue;
      const d = Math.hypot(cx - L.cx, cy - L.cy) / Math.max(h, L.h, 1);
      if (d < 0.8 && d < bestD) { bestD = d; best = jid; }
    }
    return best;
  }

  private itemsAt(items: Detection[], zone: Zone | undefined, vw: number, vh: number) {
    if (!zone) return 0;
    return items.filter((d) => {
      const x = (d.x1 + d.x2) / 2 / vw, y = (d.y1 + d.y2) / 2 / vh;
      return x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2;
    }).length;
  }
}

/** Table zones from detected dining tables, padded so the people sitting around them fall inside. */
export function tablesToZones(tables: Detection[], vw: number, vh: number, pad = 0.35): Zone[] {
  const zs: Zone[] = [];
  for (const d of [...tables].sort((a, b) => b.conf - a.conf)) {
    const w = d.x2 - d.x1, h = d.y2 - d.y1;
    const z = {
      x1: Math.max(0, (d.x1 - pad * w) / vw), y1: Math.max(0, (d.y1 - pad * 1.5 * h) / vh),
      x2: Math.min(1, (d.x2 + pad * w) / vw), y2: Math.min(1, (d.y2 + pad * h) / vh),
    };
    const ov = (a: Zone, b: Zone) => {
      const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)), iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
      return (ix * iy) / Math.min((a.x2 - a.x1) * (a.y2 - a.y1), (b.x2 - b.x1) * (b.y2 - b.y1));
    };
    if (zs.every((q) => ov(q, z) < 0.5)) zs.push(z);
  }
  return zs.slice(0, 12);
}

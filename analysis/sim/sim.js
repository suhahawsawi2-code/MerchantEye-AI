// Café simulation logic (no rendering). Deterministic for a given seed.
// World: metres, y up. Floor x in [-5.5, 5.5], z in [-4.5, 4.5]. Back wall at z = -4.5.

export const LAYOUT = {
  counter: { x1: -4.6, x2: 0.3, z1: -3.4, z2: -2.8, h: 1.05 },
  backBar: { x1: -4.6, x2: 0.3, z1: -4.5, z2: -4.1, h: 0.95 },
  door: { x1: 3.5, x2: 4.7, h: 2.3 },            // opening in the back wall
  register: { x: -3.4, z: -2.35 },
  queueDz: 0.9,
  queueSlots: 6,
  pickupSpots: [-1.05, -0.5, 0.05],
  expressX: 0.6,
  pickupZ: -2.3,
  overflow: { x: 1.6, z: -2.2 },
  aisleZ: -1.3,
  doorIn: { x: 4.1, z: -3.6 },
  doorOut: { x: 4.1, z: -5.3 },
  tables: [
    { x: 1.3, z: -0.1 }, { x: 3.6, z: -0.1 },
    { x: 1.3, z: 2.1 }, { x: 3.6, z: 2.1 },
    { x: -1.4, z: 1.0 }, { x: -1.4, z: 3.1 },
  ],
  chairOff: 0.62,
  staffZ: -3.75,
  handoffX: 0.15,
  gapX: 0.9,
};
const L = LAYOUT;
// column aisles used to reach a table chair from the main aisle
const COLS = [-2.55, -0.15, 2.45, 4.75];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim({ seed = 11, duration = 1200, dt = 0.1 } = {}) {
  const R = rng(seed);
  const U = (a, b) => a + (b - a) * R();
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  let t = 0;
  const agents = [];
  const cups = [];
  const orders = [];          // drink orders waiting for a barista
  const waiterTasks = [];
  const queue = [];           // customers in the order line, front first
  const pickupTaken = L.pickupSpots.map(() => null);
  let express = null;
  const overflowTaken = [];
  const freeOvf = (c) => { if (c.ovf !== undefined && c.ovf !== null) { overflowTaken[c.ovf] = null; c.ovf = null; } };
  const tables = L.tables.map((p, i) => ({ ...p, i, occupant: null, cups: [] }));
  const gt = [];

  // ---------------------------------------------------------------- helpers
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function* walk(a, pts, speed = a.speed) {
    for (const p of pts) {
      while (true) {
        const dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.02) { a.x = p.x; a.z = p.z; break; }
        const s = Math.min(d, speed * dt);
        a.x += (dx / d) * s; a.z += (dz / d) * s;
        a.targetHeading = Math.atan2(dx, dz);
        a.anim = "walk"; a.moveSpeed = speed;
        yield;
      }
    }
    a.anim = "idle";
  }
  function* idle(a, sec, heading) {
    a.anim = "idle";
    if (heading !== undefined) a.targetHeading = heading;
    const end = t + sec;
    while (t < end) yield;
  }
  function* until(a, cond, heading) {
    a.anim = "idle";
    if (heading !== undefined) a.targetHeading = heading;
    while (!cond()) yield;
  }
  const FACE_COUNTER = Math.PI;      // facing -z
  const FACE_FRONT = 0;              // facing +z (staff behind the counter looking at customers)

  function newCup(style, x, y, z) {
    const c = { id: cups.length, style, x, y, z, holder: null, visible: true };
    cups.push(c);
    return c;
  }
  const counterY = L.counter.h + 0.005;
  const tableY = 0.755;

  function chairOf(table, side) {
    return { x: table.x + side * L.chairOff, z: table.z };
  }
  function colFor(table, side) {
    const cx = table.x + side * L.chairOff;
    return COLS.reduce((b, c) => (Math.abs(c - cx) < Math.abs(b - cx) && Math.sign(c - table.x) === side ? c : b), side > 0 ? 99 : -99);
  }
  function pathToChair(from, table, side) {
    const col = colFor(table, side);
    return [{ x: from.x, z: L.aisleZ }, { x: col, z: L.aisleZ }, { x: col, z: table.z }, chairOf(table, side)];
  }
  function pathFromChair(table, side) {
    const col = colFor(table, side);
    return [{ x: col, z: table.z }, { x: col, z: L.aisleZ }, { x: L.doorIn.x, z: L.aisleZ }, L.doorIn, L.doorOut];
  }

  // ---------------------------------------------------------------- staff
  function makeAgent(kind, body, extra) {
    const a = { id: agents.length, kind, body, x: 0, z: 0, heading: 0, targetHeading: 0, anim: "idle", moveSpeed: 1.2,
      speed: 1.25, sit: 0, sitTarget: 0, visible: true, gen: null, ...extra };
    agents.push(a);
    return a;
  }
  const cashier = makeAgent("staff", 0, { role: "cashier", x: L.register.x, z: L.staffZ, heading: 0, targetHeading: 0, tint: 0x2f5d50 });
  cashier.gen = (function* () { while (true) yield* idle(cashier, 1000, FACE_FRONT); })();

  function barista(homeX) {
    const b = makeAgent("staff", 1, { role: "barista", x: homeX, z: L.staffZ, heading: 0, tint: 0x2f5d50 });
    b.gen = (function* () {
      while (true) {
        const o = orders.find((o) => !o.taken && t >= o.readyEarliest);
        if (!o) { yield* idle(b, 0.5, FACE_FRONT); continue; }
        o.taken = true;
        yield* walk(b, [{ x: homeX, z: -3.9 }], 1.0);
        yield* idle(b, o.prep, Math.PI);
        // where to put the cup: in front of the customer at pickup, or at the hand-off point for the waiter
        let px = L.handoffX;
        if (o.mode !== "table") {
          // customer may still be on the way / in overflow; place at their spot, or the first free one
          px = o.customer.pickupX ?? L.expressX;
        }
        yield* walk(b, [{ x: px, z: -3.6 }], 1.0);
        yield* idle(b, 1.0, FACE_FRONT);
        o.cup = newCup(o.mode === "takeaway" ? "paper" : "mug", px, counterY, -2.98);
        o.readyAt = t;
        if (o.mode === "table") waiterTasks.push({ type: "deliver", order: o });
        yield* walk(b, [{ x: homeX, z: L.staffZ }], 1.0);
      }
    })();
    return b;
  }
  barista(-1.9);
  barista(-1.2);

  const waiter = makeAgent("staff", 1, { role: "waiter", x: 0.0, z: L.staffZ, tint: 0x2f5d50 });
  waiter.gen = (function* () {
    while (true) {
      const k = waiterTasks.findIndex((w) => w.type === "deliver" || w.table.occupant === null);
      if (k < 0) { yield* idle(waiter, 0.5, FACE_FRONT); continue; }
      const task = waiterTasks.splice(k, 1)[0];
      const out = [{ x: L.gapX, z: L.staffZ }, { x: L.gapX, z: L.aisleZ }];
      const back = [{ x: L.gapX, z: L.aisleZ }, { x: L.gapX, z: L.staffZ }, { x: 0.0, z: L.staffZ }];
      if (task.type === "deliver") {
        const o = task.order, c = o.customer, tb = tables[c.table];
        yield* walk(waiter, [{ x: o.cup.x, z: -3.6 }], 1.1);
        yield* idle(waiter, 0.8, FACE_FRONT);
        o.cup.holder = waiter;
        const col = colFor(tb, c.side);
        const stand = { x: col, z: tb.z - 0.55 };
        yield* walk(waiter, [{ x: L.gapX, z: -3.6 }, ...out.slice(1), { x: col, z: L.aisleZ }, stand], 1.2);
        yield* idle(waiter, 0.6, Math.atan2(tb.x - stand.x, tb.z - stand.z));
        o.cup.holder = null;
        o.cup.x = tb.x + c.side * 0.2; o.cup.y = tableY; o.cup.z = tb.z + 0.08;
        tb.cups.push(o.cup);
        if (c.journey.tServed === null && c.state !== "gone") { c.journey.tServed = t; c.journey.serveMode = "table"; }
        yield* idle(waiter, 1.2);
        yield* walk(waiter, [{ x: col, z: L.aisleZ }, ...back], 1.2);
      } else {
        const tb = task.table;
        const col = tb.x < 0 ? -0.15 : (tb.x < 2.5 ? 2.45 : 4.75);
        const stand = { x: col, z: tb.z - 0.4 };
        yield* walk(waiter, [...out, { x: col, z: L.aisleZ }, stand], 1.2);
        yield* idle(waiter, 1.5, Math.atan2(tb.x - stand.x, tb.z - stand.z));
        if (tb.occupant === null) { for (const c of tb.cups) c.holder = waiter; tb.cups = []; }
        yield* walk(waiter, [{ x: col, z: L.aisleZ }, ...back], 1.2);
        for (const c of cups) if (c.holder === waiter) { c.holder = null; c.visible = false; }
      }
    }
  })();

  // ---------------------------------------------------------------- customers
  const arrivals = [];
  {
    let a = 4;
    while (a < duration - 220) {
      arrivals.push(a);
      const mean = a < 200 ? 40 : a < 500 ? 16 : a < 800 ? 34 : 45;
      a += Math.max(5, -Math.log(1 - R()) * mean);
    }
  }
  const forgotten = new Set();
  while (forgotten.size < 4) forgotten.add(3 + Math.floor(R() * (arrivals.length - 8)));

  arrivals.forEach((tArr, n) => {
    const r = R();
    let want = r < 0.42 ? "takeaway" : r < 0.66 ? "pickup" : "table";
    const c = makeAgent("customer", R() < 0.5 ? 0 : 1, {
      visible: false, x: L.doorOut.x + U(-0.3, 0.3), z: L.doorOut.z, speed: U(1.05, 1.4),
      tint: pick([0x8e2b2b, 0x2b4f8e, 0x6b6b6b, 0xd7d2c4, 0x1f1f1f, 0x7a5a2e, 0x3e7a3a, 0x9a6b9e, 0xc2a35a, 0x46586b]),
      state: "outside", tArr, want, patienceQueue: (R() < 0.12 || (tArr > 330 && tArr < 420 && !arrivals.some((x, k) => k < n && x > 330))) ? U(70, 140) : 1e9,
      forgotten: forgotten.has(n), table: null, side: 1, pickupX: null, pickupIdx: null,
      journey: { id: n + 1, type: want, tEnter: null, tQueue: null, tOrder: null, tServed: null, serveMode: null,
        tSeated: null, table: null, tExit: null, note: "" },
    });
    gt.push(c.journey);
    c.gen = customerGen(c);
  });

  function* customerGen(c) {
    const J = c.journey;
    while (t < c.tArr) yield;
    c.visible = true;
    c.state = "entering";
    yield* walk(c, [{ x: c.x, z: -4.6 }]);
    J.tEnter = t;
    yield* walk(c, [L.doorIn, { x: L.doorIn.x, z: L.aisleZ }]);

    // ---- queue
    queue.push(c);
    let joined = false;
    const tJoin = t;
    while (true) {
      const idx = queue.indexOf(c);
      const slot = { x: L.register.x, z: L.register.z + L.queueDz * Math.min(idx, L.queueSlots - 1) + (idx >= L.queueSlots ? 0.5 * (idx - L.queueSlots + 1) : 0) };
      if (!joined) {
        yield* walk(c, [{ x: -2.55, z: L.aisleZ }, { x: -2.55, z: slot.z }, slot]);
        joined = true;
        J.tQueue = t;
        continue;
      }
      if (dist(c, slot) > 0.05) { yield* walk(c, [slot], 0.9); continue; }
      if (idx === 0) break;
      if (t - J.tQueue > c.patienceQueue && idx >= 1) {
        // gives up
        queue.splice(idx, 1);
        J.note = "left the queue without ordering";
        J.type = "left_queue";
        yield* walk(c, [{ x: -2.55, z: c.z }, { x: -2.55, z: L.aisleZ }, { x: L.doorIn.x, z: L.aisleZ }, L.doorIn, { x: L.doorIn.x, z: -4.5 }]);
        J.tExit = t;
        yield* walk(c, [L.doorOut]);
        c.visible = false; c.state = "gone";
        return;
      }
      yield* idle(c, 0.3, FACE_COUNTER);
    }
    // ---- order at the till
    yield* idle(c, U(10, 20), FACE_COUNTER);
    // choose service
    let mode = c.want;
    if (mode !== "takeaway") {
      const free = tables.filter((tb) => tb.occupant === null);
      const clean = free.filter((tb) => tb.cups.length === 0);
      const tb = clean.length ? pick(clean) : free.length ? pick(free) : null;
      if (tb) { tb.occupant = c; c.table = tb.i; c.side = tb.x < 0 ? 1 : R() < 0.5 ? -1 : 1; }
      else mode = "takeaway";
    }
    J.type = mode === "takeaway" ? "takeaway" : mode === "pickup" ? "dine_in_pickup" : "dine_in_table_service";
    const order = { customer: c, mode, prep: U(32, 58), readyEarliest: t + (c.forgotten ? U(380, 470) : 0), taken: false, cup: null };
    if (c.forgotten) J.note = "order forgotten / delayed by staff";
    orders.push(order);
    queue.shift();
    yield* walk(c, [{ x: -2.75, z: L.register.z - 0.05 }]);
    J.tOrder = t;     // left the till / the queue area

    if (mode === "table") {
      yield* walk(c, [{ x: -2.3, z: L.aisleZ }, ...pathToChair({ x: -2.3, z: L.aisleZ }, tables[c.table], c.side).slice(1)]);
      yield* sitDown(c);
      const patience = c.forgotten && R() < 0.6 ? U(520, 600) : 1e9;
      while (J.tServed === null && t - J.tEnter < patience) yield;
      if (J.tServed === null) J.note = "left the table without being served";
      else yield* idle(c, U(110, 220));
      yield* leaveTable(c);
      return;
    }

    // ---- wait at pickup
    let atSpot = false;
    while (!order.cup || !atSpot) {
      if (c.pickupIdx === null) {
        const k = pickupTaken.indexOf(null);
        if (k >= 0) {
          pickupTaken[k] = c; c.pickupIdx = k; c.pickupX = L.pickupSpots[k]; freeOvf(c);
          if (order.cup && !order.cup.holder) { order.cup.x = c.pickupX; }
          yield* walk(c, [{ x: c.pickupX, z: L.pickupZ }]);
          atSpot = true;
          continue;
        } else if (order.cup && express === null) {
          express = c; c.pickupIdx = -1; c.pickupX = L.expressX; freeOvf(c); order.cup.x = c.pickupX;
          yield* walk(c, [{ x: c.pickupX, z: L.pickupZ }]);
          atSpot = true;
          continue;
        } else if (c.ovf === undefined || c.ovf === null) {
          let k = 0; while (overflowTaken[k]) k++;
          overflowTaken[k] = c; c.ovf = k;
          yield* walk(c, [{ x: -2.3, z: -1.9 }, { x: L.overflow.x + 0.6 * (k % 4), z: L.overflow.z + 0.6 * Math.floor(k / 4) }]);
          continue;
        }
      }
      yield* idle(c, 0.3, FACE_COUNTER);
    }
    if (order.cup.x !== c.pickupX) order.cup.x = c.pickupX;
    yield* idle(c, 1.0, FACE_COUNTER);
    order.cup.holder = c;
    J.tServed = t; J.serveMode = "pickup";
    yield* idle(c, 0.6);
    if (c.pickupIdx >= 0) pickupTaken[c.pickupIdx] = null; else express = null;

    if (mode === "takeaway") {
      yield* walk(c, [{ x: c.pickupX, z: L.aisleZ }, { x: L.doorIn.x, z: L.aisleZ }, L.doorIn, { x: L.doorIn.x, z: -4.5 }]);
      J.tExit = t;
      yield* walk(c, [L.doorOut]);
      order.cup.visible = false;
      c.visible = false; c.state = "gone";
      return;
    }
    const tb = tables[c.table];
    yield* walk(c, pathToChair({ x: c.pickupX, z: L.aisleZ }, tb, c.side));
    order.cup.holder = null;
    order.cup.x = tb.x + c.side * 0.2; order.cup.y = tableY; order.cup.z = tb.z + 0.08;
    tb.cups.push(order.cup);
    yield* sitDown(c);
    yield* idle(c, U(110, 220));
    yield* leaveTable(c);
  }

  function* sitDown(c) {
    const tb = tables[c.table];
    c.targetHeading = Math.atan2(tb.x - c.x, tb.z - c.z);
    yield* idle(c, 0.6);
    c.sitTarget = 1;
    yield* idle(c, 0.8);
    c.journey.tSeated = t;
    c.journey.table = c.table;
    c.state = "seated";
  }
  function* leaveTable(c) {
    const tb = tables[c.table];
    c.sitTarget = 0;
    yield* idle(c, 0.9);
    c.state = "leaving";
    tb.occupant = null;
    if (tb.cups.length) waiterTasks.push({ type: "clear", table: tb });
    const p = pathFromChair(tb, c.side);
    yield* walk(c, p.slice(0, -1));
    yield* walk(c, [{ x: L.doorIn.x, z: -4.5 }]);
    c.journey.tExit = t;
    yield* walk(c, [L.doorOut]);
    c.visible = false; c.state = "gone";
  }

  // ---------------------------------------------------------------- step
  function step() {
    t += dt;
    for (const a of agents) {
      if (a.gen) a.gen.next();
      // smooth turning
      let d = a.targetHeading - a.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.heading += Math.sign(d) * Math.min(Math.abs(d), 6 * dt);
      a.sit += Math.sign(a.sitTarget - a.sit) * Math.min(Math.abs(a.sitTarget - a.sit), dt / 0.7);
    }
  }

  return {
    agents, cups, tables, gt, step, LAYOUT,
    get t() { return t; },
    dt, duration,
  };
}

export function lateFlags(j, end, limit = 480) {
  return j.tServed !== null ? j.tServed - j.tEnter >= limit : j.tOrder !== null && (j.tExit ?? end) - j.tEnter >= limit;
}

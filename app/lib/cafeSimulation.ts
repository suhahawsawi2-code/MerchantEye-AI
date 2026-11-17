// MerchantEye AI — a simulated café day (07:00–24:00) for demos when no long café video is available.
// It produces the same Journey objects the video analysis produces, so the journey board, the alerts,
// peak time and the analyst summary all run on it unchanged. Clearly labelled "simulation" in the UI.

import type { Invoice, Journey } from "./journey";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

// customers per hour across a Saudi café day: morning coffee, lunch, and a strong evening peak
const HOURLY = [0, 0, 0, 0, 0, 0, 0, 10, 16, 12, 8, 9, 13, 14, 9, 8, 11, 14, 16, 22, 32, 36, 26, 12];
export const SIM_DAY_START = 7 * 3600;
export const SIM_DAY_END = 24 * 3600;
export const SIM_TABLES = 10;

export function simulateDay(seed = 7): Journey[] {
  const r = rng(seed);
  const exp = (mean: number) => -Math.log(1 - r()) * mean;
  const arrivals: number[] = [];
  for (let h = 7; h < 24; h++) {
    const n = HOURLY[h];
    for (let i = 0; i < n; i++) arrivals.push(h * 3600 + r() * (h === 23 ? 1800 : 3600));   // last orders 23:30
  }
  arrivals.sort((a, b) => a - b);

  let tillFree = 0;
  const baristaFree = [0, 0, 0];   // the third barista only works the evening shift
  const tableFree = Array(SIM_TABLES).fill(0);
  const out: Journey[] = [];
  let id = 1;
  for (const tEnter of arrivals) {
    const tQueue = tEnter + 5 + r() * 10;
    const startOrder = Math.max(tQueue, tillFree);
    const waitAhead = startOrder - tQueue;
    // long line -> some people give up
    if (waitAhead > 240 && r() < 0.35) {
      const tExit = tQueue + 60 + r() * 120;
      out.push({ id: id++, tEnter, tQueue, tOrder: null, tServed: null, serveMode: null, tSeated: null, table: null, tExit, lastSeen: tExit, invoice: null });
      continue;
    }
    const tOrder = startOrder + 35 + r() * 40;
    tillFree = tOrder;
    const items = 1 + Math.floor(exp(0.8));
    const onShift = tOrder >= 21 * 3600 ? 3 : 2;   // the evening rush (19–21) is short-staffed
    let b = 0;
    for (let k = 1; k < onShift; k++) if (baristaFree[k] < baristaFree[b]) b = k;
    const prep = 100 + (items - 1) * 70 + r() * 80;
    const ready = Math.max(tOrder, baristaFree[b]) + prep;
    baristaFree[b] = ready;
    const freeTable = tableFree.findIndex((f) => f <= tOrder + 30);
    const dineIn = freeTable >= 0 && r() < 0.6;   // no free table -> takes it away
    const inv: Invoice = { id: `INV-${1000 + id}`, t: tOrder - 5, type: dineIn ? "dine_in" : "takeaway", amount: Math.round(items * (14 + r() * 18)), items };

    if (!dineIn) {
      const tServed = ready + 10 + r() * 30;
      const tExit = tServed + 10 + r() * 40;
      out.push({ id: id++, tEnter, tQueue, tOrder, tServed, serveMode: "pickup", tSeated: null, table: null, tExit, lastSeen: tExit, invoice: inv });
      continue;
    }
    // dine-in: sit at a free table; order is brought to the table (sometimes slowly)
    const table = freeTable;
    const tSeated = Math.max(tOrder + 20 + r() * 40, tableFree[table]);
    const delivery = r() < 0.12 ? 120 + r() * 300 : 20 + r() * 60;   // occasionally forgotten for a while
    const tServed = Math.max(ready, tSeated) + delivery;
    const stay = 15 * 60 + r() * 50 * 60;
    const tExit = Math.max(tServed + 120, Math.min(SIM_DAY_END - 60, tServed + stay));
    tableFree[table] = tExit + 120;
    out.push({ id: id++, tEnter, tQueue, tOrder, tServed, serveMode: "table", tSeated, table, tExit, lastSeen: tExit, invoice: inv });
  }
  return out;
}

/** What the system would know at time `now`: future events are hidden. */
export function viewAt(day: Journey[], now: number): Journey[] {
  const hide = (x: number | null) => (x !== null && x <= now ? x : null);
  return day.filter((j) => j.tEnter <= now).map((j) => {
    const tExit = hide(j.tExit);
    return {
      ...j,
      tQueue: hide(j.tQueue), tOrder: hide(j.tOrder), tServed: hide(j.tServed), tSeated: hide(j.tSeated),
      serveMode: j.tServed !== null && j.tServed <= now ? j.serveMode : null,
      table: j.tSeated !== null && j.tSeated <= now ? j.table : null,
      invoice: j.invoice && j.invoice.t <= now ? j.invoice : null,
      tExit, lastSeen: tExit ?? now,
    };
  });
}

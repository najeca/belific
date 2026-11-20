// The do first order of Today's Anytime cards on the phone (PLAN_phone_stepflow section 2, decision B1.1, 3.60.0).
// Pure: NO runtime imports; see anytimeOrder.test.ts.
//
// No database change: the order is one synced user_settings row per day, key `today.order.YYYY-MM-DD`, value the
// ordered item keys as JSON. Items not in the stored order (new today) come after the ordered ones, in the usual order;
// keys of items that are gone are dropped. Rows older than ORDER_KEEP_DAYS are deleted. The desktop does not read it,
// and Now card's Next never uses it (Next is timed only).
export const ORDER_PREFIX = 'today.order.';
export const ORDER_KEEP_DAYS = 14;

export function orderKey(dayKey: string): string {
  return `${ORDER_PREFIX}${dayKey}`;
}

// A damaged value is no order.
export function parseOrder(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const v: unknown = JSON.parse(value);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// `keys` in their usual order; the stored ones first, in the stored order, then the rest as they were.
export function applyOrder(keys: string[], stored: string[]): string[] {
  const here = new Set(keys);
  const first = stored.filter((k, i) => here.has(k) && stored.indexOf(k) === i);
  const placed = new Set(first);
  return [...first, ...keys.filter((k) => !placed.has(k))];
}

export function moveKey(keys: string[], from: number, to: number): string[] {
  if (from < 0 || from >= keys.length) return keys;
  const out = [...keys];
  const [k] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, k);
  return out;
}

// Where a card held at `from` and dragged `dy` pixels lands: the number of other cards whose middle is above its new
// middle. `tops` and `heights` are the cards' places in their column.
export function dropIndex(tops: number[], heights: number[], from: number, dy: number): number {
  const mid = (tops[from] ?? 0) + (heights[from] ?? 0) / 2 + dy;
  let n = 0;
  for (let i = 0; i < tops.length; i += 1) {
    if (i === from) continue;
    if ((tops[i] ?? 0) + (heights[i] ?? 0) / 2 < mid) n += 1;
  }
  return n;
}

// The order rows to delete: those of days more than ORDER_KEEP_DAYS before today (YYYY-MM-DD compares as text).
export function staleOrderKeys(settingKeys: string[], todayKey: string): string[] {
  const t = new Date(`${todayKey}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ORDER_KEEP_DAYS);
  const cut = t.toISOString().slice(0, 10);
  return settingKeys.filter((k) => k.startsWith(ORDER_PREFIX) && k.slice(ORDER_PREFIX.length) < cut);
}

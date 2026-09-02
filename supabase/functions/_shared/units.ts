// Mirror of apps/web/features/costing/units.ts for the Deno edge runtime.
// Keep in sync — same factor table, same family rules.
const FACTORS: Record<string, { family: string; toBase: number }> = {
  mg: { family: "weight", toBase: 0.001 },
  g:  { family: "weight", toBase: 1 },
  kg: { family: "weight", toBase: 1000 },
  oz: { family: "weight", toBase: 28.3495 },
  lb: { family: "weight", toBase: 453.592 },
  ml: { family: "volume", toBase: 1 },
  l:  { family: "volume", toBase: 1000 },
  tsp:  { family: "volume", toBase: 4.92892 },
  tbsp: { family: "volume", toBase: 14.7868 },
  cup:  { family: "volume", toBase: 240 },
  floz: { family: "volume", toBase: 29.5735 },
  pcs:   { family: "count", toBase: 1 },
  each:  { family: "count", toBase: 1 },
  dozen: { family: "count", toBase: 12 },
};

export function unitFamily(u: string): string | null {
  return FACTORS[u]?.family ?? null;
}

export function convertQty(qty: number, from: string, to: string): number | null {
  const f = FACTORS[from];
  const t = FACTORS[to];
  if (!f || !t || f.family !== t.family) return null;
  return (qty * f.toBase) / t.toBase;
}

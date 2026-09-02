// Unit conversion + costing primitives.
// Pure functions, no IO — used by both the recipe costing UI (live preview)
// and the recipe edge functions (cost recompute).

export type Unit =
  // Weight
  | "mg" | "g" | "kg" | "oz" | "lb"
  // Volume
  | "ml" | "l" | "tsp" | "tbsp" | "cup" | "floz"
  // Count
  | "pcs" | "each" | "dozen";

type Family = "weight" | "volume" | "count";

// Conversion factor to each family's *base* unit.
// Weight base: gram. Volume base: millilitre. Count base: piece.
const FACTORS: Record<Unit, { family: Family; toBase: number }> = {
  // Weight (base = g)
  mg:    { family: "weight", toBase: 0.001 },
  g:     { family: "weight", toBase: 1 },
  kg:    { family: "weight", toBase: 1000 },
  oz:    { family: "weight", toBase: 28.3495 },
  lb:    { family: "weight", toBase: 453.592 },
  // Volume (base = ml)
  ml:    { family: "volume", toBase: 1 },
  l:     { family: "volume", toBase: 1000 },
  tsp:   { family: "volume", toBase: 4.92892 },
  tbsp:  { family: "volume", toBase: 14.7868 },
  cup:   { family: "volume", toBase: 240 },
  floz:  { family: "volume", toBase: 29.5735 },
  // Count (base = pcs)
  pcs:   { family: "count", toBase: 1 },
  each:  { family: "count", toBase: 1 },
  dozen: { family: "count", toBase: 12 },
};

export const UNITS = Object.keys(FACTORS) as Unit[];

export function unitFamily(u: Unit | string): Family | null {
  return (FACTORS as any)[u]?.family ?? null;
}

/** Units in the same family as `u`, suitable for an ingredient that purchases in `u`. */
export function compatibleUnits(u: Unit | string): Unit[] {
  const fam = unitFamily(u);
  if (!fam) return [];
  return UNITS.filter((x) => FACTORS[x].family === fam);
}

/**
 * Convert `qty` from `from` to `to`. Returns null if the units belong to
 * different families (e.g. g → ml). Caller decides how to surface the error.
 */
export function convertQty(qty: number, from: Unit | string, to: Unit | string): number | null {
  const f = (FACTORS as any)[from];
  const t = (FACTORS as any)[to];
  if (!f || !t || f.family !== t.family) return null;
  return (qty * f.toBase) / t.toBase;
}

/**
 * Cost of using `usageQty` of an ingredient given its purchase data.
 * `costPerUnit` is the cost of one `costUnit`. Returns null on incompatible units.
 */
export function usageCost(
  usageQty: number,
  usageUnit: Unit | string,
  costPerUnit: number,
  costUnit: Unit | string,
): number | null {
  const inCostUnit = convertQty(usageQty, usageUnit, costUnit);
  if (inCostUnit == null) return null;
  return inCostUnit * costPerUnit;
}

/**
 * Selling price suggestion for a target food-cost percentage.
 * `targetPct` is the percentage (e.g. 30 means 30% food cost).
 */
export function suggestedPrice(cost: number, targetPct: number): number {
  if (targetPct <= 0) return 0;
  return cost / (targetPct / 100);
}

/** Food cost percentage = cost / sellingPrice * 100. Returns Infinity if price = 0. */
export function foodCostPct(cost: number, sellingPrice: number): number {
  if (sellingPrice <= 0) return Infinity;
  return (cost / sellingPrice) * 100;
}

/** Markup multiplier = sellingPrice / cost. Returns Infinity if cost = 0. */
export function markup(cost: number, sellingPrice: number): number {
  if (cost <= 0) return Infinity;
  return sellingPrice / cost;
}

/** Gross profit in currency = sellingPrice - cost. */
export function grossProfit(cost: number, sellingPrice: number): number {
  return sellingPrice - cost;
}

/** Color tier for FC% — green ≤30, yellow ≤40, red >40. */
export function foodCostTier(pct: number): "ok" | "warn" | "err" {
  if (!Number.isFinite(pct)) return "err";
  if (pct <= 30) return "ok";
  if (pct <= 40) return "warn";
  return "err";
}

/** True when food cost is alarming (>45%). Used for the "underpriced" badge. */
export function isUnderpriced(pct: number): boolean {
  return Number.isFinite(pct) && pct > 45;
}

export type UnitGroup = "weight" | "volume" | "each";

export interface UnitDef {
  id: string;
  label: string;
  group: UnitGroup;
  toBase: number; // grams for weight, ml for volume, 1 for each
}

export const UNIT_DEFS: UnitDef[] = [
  { id: "mg",    label: "mg",    group: "weight", toBase: 0.001 },
  { id: "g",     label: "g",     group: "weight", toBase: 1 },
  { id: "kg",    label: "kg",    group: "weight", toBase: 1000 },
  { id: "ml",    label: "ml",    group: "volume", toBase: 1 },
  { id: "tsp",   label: "tsp",   group: "volume", toBase: 5 },
  { id: "tbsp",  label: "tbsp",  group: "volume", toBase: 15 },
  { id: "cup",   label: "cup",   group: "volume", toBase: 240 },
  { id: "L",     label: "L",     group: "volume", toBase: 1000 },
  { id: "pcs",   label: "pcs",   group: "each",   toBase: 1 },
  { id: "slice", label: "slice", group: "each",   toBase: 1 },
  { id: "pack",  label: "pack",  group: "each",   toBase: 1 },
  { id: "box",   label: "box",   group: "each",   toBase: 1 },
  { id: "bag",   label: "bag",   group: "each",   toBase: 1 },
];

const MAP = new Map(UNIT_DEFS.map((u) => [u.id, u]));

export const getUnit = (id: string) => MAP.get(id);

export function compatibleUnits(forUnit: string): UnitDef[] {
  const def = getUnit(forUnit);
  if (!def) return UNIT_DEFS;
  return UNIT_DEFS.filter((u) => u.group === def.group);
}

/** Returns null if units are incompatible (e.g. g → ml). */
export function convertQty(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  const f = getUnit(from);
  const t = getUnit(to);
  if (!f || !t) return null;
  if (f.group !== t.group) return null;
  if (f.group === "each") return qty;
  return (qty * f.toBase) / t.toBase;
}

/** Cost of using qty in entryUnit of an ingredient priced per ingredientUnit. */
export function usageCost(
  qty: number,
  entryUnit: string,
  ingredientUnit: string,
  costPerUnit: number,
): number | null {
  const converted = convertQty(qty, entryUnit, ingredientUnit);
  if (converted === null) return null;
  return converted * costPerUnit;
}

export const foodCostPct = (cost: number, price: number) =>
  price > 0 ? (cost / price) * 100 : 0;

export const suggestedPrice = (cost: number, targetFcPct = 30) =>
  cost > 0 && targetFcPct > 0 ? cost / (targetFcPct / 100) : 0;

export const markup = (price: number, cost: number) =>
  cost > 0 ? price / cost : 0;

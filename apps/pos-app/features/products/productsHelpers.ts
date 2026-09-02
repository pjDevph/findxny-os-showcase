import { useTheme } from "../theme/ThemeContext";
import type { Product, SetupStatus } from "./types";

export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export function getProductStatus(p: Product): { status: SetupStatus; label: string } {
  if (!p.active) return { status: "inactive", label: "Inactive" };
  if (!p.for_sale) return { status: "draft", label: "Not for sale" };
  if (p.price === 0) return { status: "needs_price", label: "Needs price" };
  if (!p.category_id) return { status: "needs_category", label: "Needs category" };
  if (!p.image_url) return { status: "needs_image", label: "Needs image" };
  return { status: "complete", label: "Complete" };
}

export function statusColor(status: SetupStatus, C: ReturnType<typeof useTheme>["C"]): string {
  switch (status) {
    case "inactive": return C.ink4;
    case "draft": return C.ink3;
    case "needs_price": return C.bad;
    case "needs_category": return C.warn;
    case "needs_image": return C.info;
    case "complete": return C.good;
  }
}

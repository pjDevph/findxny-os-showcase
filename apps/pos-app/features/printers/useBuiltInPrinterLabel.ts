/**
 * The built-in printer's brand varies by terminal (INSA on some devices,
 * IMIN on Swan2 and similar) — these used to be hardcoded as "INSA" across
 * Printer Management regardless of what's actually installed, which is
 * simply wrong on IMIN hardware.
 */
import { useEffect, useState } from "react";
import { isIminPrinterAvailable } from "../../modules/esc-printer";

export interface BuiltInPrinterLabel {
  /** e.g. "IMIN" or "INSA" — use for sentences like "the built-in X printer". */
  brand: string;
  /** e.g. "IMIN Built-in Printer" — use as a standalone title/badge. */
  full: string;
}

export function useBuiltInPrinterLabel(): BuiltInPrinterLabel {
  const [brand, setBrand] = useState("Built-in");
  useEffect(() => {
    let alive = true;
    isIminPrinterAvailable().then(isImin => {
      if (alive) setBrand(isImin ? "IMIN" : "INSA");
    });
    return () => { alive = false; };
  }, []);
  return { brand, full: `${brand} Built-in Printer` };
}

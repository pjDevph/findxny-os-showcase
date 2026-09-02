"use client";

import { useEffect, useState } from "react";

const CUSTOM = "__custom__";

const KNOWN: Array<{ label: string; options: { value: string; label: string }[] }> = [
  {
    label: "Count",
    options: [
      { value: "pcs",   label: "pcs" },
      { value: "each",  label: "each" },
      { value: "dozen", label: "dozen" },
    ],
  },
  {
    label: "Weight",
    options: [
      { value: "mg", label: "mg (milligram)" },
      { value: "g",  label: "g (gram)" },
      { value: "kg", label: "kg (kilo)" },
      { value: "oz", label: "oz (ounce)" },
      { value: "lb", label: "lb (pound)" },
    ],
  },
  {
    label: "Volume",
    options: [
      { value: "ml",   label: "ml (milliliter)" },
      { value: "l",    label: "L (liter)" },
      { value: "tsp",  label: "tsp" },
      { value: "tbsp", label: "tbsp" },
      { value: "cup",  label: "cup" },
      { value: "floz", label: "floz" },
    ],
  },
];

const ALL_KNOWN = KNOWN.flatMap((g) => g.options.map((o) => o.value));

/**
 * Recipe-line unit picker. Shows every known unit (so you can mix g into a
 * pcs-based recipe if you want), plus Custom for free-text labels. The
 * server still validates compatibility against the ingredient's purchase_unit
 * and surfaces a clear error when a recipe line uses an incompatible unit.
 */
export function RecipeUnitSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  // Decide whether the value is a known canonical key or a custom string.
  const isKnown = ALL_KNOWN.includes(value);
  const [pick, setPick] = useState<string>(!value ? "" : isKnown ? value : CUSTOM);
  const [custom, setCustom] = useState<string>(isKnown ? "" : value);

  // Keep parent in sync.
  useEffect(() => {
    onChange(pick === CUSTOM ? custom.trim() : pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, custom]);

  // Sync inbound value changes (e.g. when the user picks a new ingredient).
  useEffect(() => {
    if (!value) { setPick(""); setCustom(""); return; }
    if (ALL_KNOWN.includes(value)) {
      setPick(value);
    } else if (pick !== CUSTOM || custom !== value) {
      setPick(CUSTOM); setCustom(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <select
        className="input"
        id={id}
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        disabled={disabled}
      >
        {!value && <option value="">pick a component first</option>}
        {KNOWN.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {pick === CUSTOM && (
        <input
          className="input"
          placeholder="Custom unit"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

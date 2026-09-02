"use client";

import { useEffect, useState } from "react";

const CUSTOM = "__custom__";

type Option = { value: string; label: string };

export type UnitGroup = { label: string; options: Option[] };

/**
 * Dropdown with curated options + "Custom…" → reveals a free-text input.
 * Submitted value (via the hidden form input named `name`) is whatever the
 * user picks: a canonical key (e.g. 'kg') for known options, or the raw text
 * they typed for Custom. Backend stores it as-is on products.{purchase,selling}_unit.
 */
export function UnitPicker({
  name,
  defaultValue,
  groups,
  id,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  groups: UnitGroup[];
  id?: string;
  /** Optional: notified with the value that will actually be submitted (for parent-level validation). */
  onChange?: (value: string) => void;
}) {
  const allValues = groups.flatMap((g) => g.options.map((o) => o.value));
  const initiallyKnown = !!defaultValue && allValues.includes(defaultValue);

  const [pick, setPick] = useState<string>(
    initiallyKnown ? defaultValue
    : defaultValue ? CUSTOM
    : (allValues[0] ?? ""),
  );
  const [custom, setCustom] = useState<string>(initiallyKnown ? "" : (defaultValue ?? ""));

  // Whatever value gets submitted with the form.
  const submitted = pick === CUSTOM ? custom.trim() : pick;

  // If user changes pick away from Custom, clear the text so it doesn't ghost in.
  useEffect(() => { if (pick !== CUSTOM) setCustom(""); }, [pick]);

  // Let the parent track the submitted value for its own disabled-state checks.
  useEffect(() => { onChange?.(submitted); }, [submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select
        className="input"
        id={id}
        value={pick}
        onChange={(e) => setPick(e.target.value)}
      >
        {groups.map((g) => (
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
          placeholder="Enter custom unit (e.g. Container)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      )}

      <input type="hidden" name={name} value={submitted} />
    </div>
  );
}

// ---------- Curated lists ----------

export const PURCHASE_UNIT_GROUPS: UnitGroup[] = [
  {
    label: "Common",
    options: [
      { value: "pcs",     label: "Piece" },
      { value: "dozen",   label: "Dozen" },
      { value: "bottle",  label: "Bottle" },
      { value: "pack",    label: "Pack" },
    ],
  },
  {
    label: "Bulk container",
    options: [
      { value: "sack",    label: "Sack" },
      { value: "box",     label: "Box" },
      { value: "case",    label: "Case" },
      { value: "tray",    label: "Tray" },
    ],
  },
  {
    label: "Weight",
    options: [
      { value: "kg",      label: "Kilo" },
      { value: "g",       label: "Gram" },
    ],
  },
  {
    label: "Volume",
    options: [
      { value: "l",       label: "Liter" },
      { value: "ml",      label: "Milliliter" },
    ],
  },
];

export const SELLING_UNIT_GROUPS: UnitGroup[] = [
  {
    label: "Common",
    options: [
      { value: "pcs",     label: "Piece" },
      { value: "serving", label: "Serving" },
      { value: "order",   label: "Order" },
    ],
  },
  {
    label: "Container",
    options: [
      { value: "cup",     label: "Cup" },
      { value: "bottle",  label: "Bottle" },
      { value: "plate",   label: "Plate" },
      { value: "bowl",    label: "Bowl" },
      { value: "pack",    label: "Pack" },
      { value: "slice",   label: "Slice" },
    ],
  },
];

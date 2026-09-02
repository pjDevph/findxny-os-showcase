"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type IngredientOption = {
  id: string;
  name: string;
  sku?: string | null;
  cost: number;
  purchase_unit: string;
};

/**
 * Searchable ingredient picker for the Recipe tab.
 * - When nothing is selected: a search field (magnifier icon) with a dropdown
 *   list — each row shows the name and a right-aligned "unit · ₱cost/unit".
 * - When selected: an amber chip with a ✓ and an × to clear it.
 */
export function IngredientPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: IngredientOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value ? options.find((o) => o.id === value) ?? null : null;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.sku ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  function pick(o: IngredientOption) {
    onChange(o.id);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(true);
    // Focus the search field after clearing.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // ── Selected: amber chip ──
  if (selected) {
    return (
      <div ref={wrapRef}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, height: 40,
            padding: "0 10px", borderRadius: 8,
            background: "rgba(var(--tint-rgb), 0.12)",
            border: "1px solid rgba(var(--tint-rgb), 0.5)",
            color: "var(--amber-bright, var(--amber))", fontSize: 13, fontWeight: 600,
          }}
        >
          <span aria-hidden style={{ fontSize: 12 }}>✓</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected.name}
          </span>
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${selected.name}`}
              onClick={clear}
              style={{
                border: "none", background: "transparent", cursor: "pointer",
                color: "var(--amber-bright, var(--amber))", fontSize: 16, lineHeight: 1, padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Unselected: search field + dropdown ──
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          className="input"
          type="text"
          disabled={disabled}
          placeholder="Search ingredients…"
          value={query}
          style={{ paddingRight: 32 }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        <span
          aria-hidden
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            color: "var(--text-3)", fontSize: 14, pointerEvents: "none",
          }}
        >
          ⌕
        </span>
      </div>

      {open && (
        <div
          style={{
            position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0,
            maxHeight: 240, overflowY: "auto",
            background: "var(--surface-2, #1a1a1a)", border: "1px solid var(--line)",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", overflowX: "hidden",
          }}
        >
          {filtered.length === 0 ? (
            <div className="dim" style={{ padding: "10px 12px", fontSize: 13 }}>
              {query ? `No matches for “${query}”.` : "No ingredients available."}
            </div>
          ) : (
            filtered.map((o) => {
              const active = o.id === hover;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pick(o)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHover(o.id)}
                  onMouseLeave={() => setHover((h) => (h === o.id ? null : h))}
                  style={{
                    display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
                    width: "100%", textAlign: "left", padding: "9px 12px",
                    background: active ? "rgba(var(--tint-rgb), 0.14)" : "transparent",
                    border: "none", cursor: "pointer",
                    color: active ? "var(--amber-bright, var(--amber))" : "var(--text-1)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.name}
                  </span>
                  <span style={{ color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {o.purchase_unit} · ₱{Number(o.cost).toFixed(2)}/unit
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

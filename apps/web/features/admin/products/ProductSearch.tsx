"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ProductSearch({ total, filtered }: { total: number; filtered: number }) {
  const router    = useRouter();
  const pathname  = usePathname();
  const params    = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep input in sync if the user navigates back/forward
  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (v.trim()) next.set("q", v.trim());
      else next.delete("q");
      next.delete("offset"); // a new query resets to page 1
      router.replace(`${pathname}?${next.toString()}` as any, { scroll: false });
    }, 280);
  }

  function clear() {
    setValue("");
    const next = new URLSearchParams(params.toString());
    next.delete("q"); next.delete("offset");
    router.replace(`${pathname}?${next.toString()}` as any, { scroll: false });
  }

  const isFiltered = value.trim().length > 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
      {/* Search input */}
      <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
        {/* Search icon */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-3,#666)", pointerEvents: "none" }}
        >
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>

        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="Search by name, SKU or category…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "7px 32px 7px 32px",
            background: "var(--surface-3,#111)", border: "1px solid var(--border-2,#2a2a2a)",
            borderRadius: 8, color: "var(--text-1,#fff)", fontSize: 13, outline: "none",
            transition: "border-color .15s",
          }}
          onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--amber,#f59e0b)"; }}
          onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--border-2,#2a2a2a)"; }}
        />

        {/* Clear button */}
        {isFiltered && (
          <button
            onClick={clear}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-3,#666)", fontSize: 16, lineHeight: 1, padding: "2px 4px",
            }}
            title="Clear search"
          >×</button>
        )}
      </div>

      {/* Result count */}
      {isFiltered && (
        <span style={{ fontSize: 12, color: filtered === 0 ? "#ef4444" : "var(--text-3,#777)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {filtered === 0 ? "No results" : `${filtered} of ${total}`}
        </span>
      )}
    </div>
  );
}

/**
 * Pagination strip used at the bottom of admin tables. Server-rendered when
 * the page is a server component (Orders, Transactions, Bookings) — uses
 * <Link> with searchParams. For client-side pages (Audit Logs) use
 * `<PaginationClient onChange={...}/>` below instead.
 */
import Link from "next/link";

export function Pagination({
  total,
  limit,
  offset,
  hrefFor,
  align = "right",
}: {
  total: number;
  limit: number;
  offset: number;
  hrefFor: (offset: number) => string;
  align?: "left" | "right" | "center";
}) {
  if (total === 0) return null;
  const page    = Math.floor(offset / limit) + 1;
  const pages   = Math.max(1, Math.ceil(total / limit));
  const start   = offset + 1;
  const end     = Math.min(offset + limit, total);
  const prevOff = Math.max(0, offset - limit);
  const nextOff = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = end < total;

  return (
    <div style={{
      display: "flex", justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
      alignItems: "center", gap: 12,
      padding: "12px 4px",
      fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-3)",
    }}>
      <span>{start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}</span>
      <div style={{ display: "flex", gap: 6 }}>
        {hasPrev
          ? <Link href={hrefFor(prevOff) as any} className="btn-xs">‹ Prev</Link>
          : <span className="btn-xs" style={{ opacity: 0.4, pointerEvents: "none" }}>‹ Prev</span>}
        <span style={{
          display: "inline-flex", alignItems: "center", padding: "0 10px",
          fontFamily: "var(--f-mono)", color: "var(--text-2)",
        }}>Page {page} / {pages}</span>
        {hasNext
          ? <Link href={hrefFor(nextOff) as any} className="btn-xs">Next ›</Link>
          : <span className="btn-xs" style={{ opacity: 0.4, pointerEvents: "none" }}>Next ›</span>}
      </div>
    </div>
  );
}

/** Client-component variant — calls `onChange(offset)` instead of navigating. */
export function PaginationClient({
  total,
  limit,
  offset,
  onChange,
  align = "right",
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  align?: "left" | "right" | "center";
}) {
  if (total === 0) return null;
  const page    = Math.floor(offset / limit) + 1;
  const pages   = Math.max(1, Math.ceil(total / limit));
  const start   = offset + 1;
  const end     = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = end < total;

  return (
    <div style={{
      display: "flex", justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
      alignItems: "center", gap: 12,
      padding: "12px 4px",
      fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-3)",
    }}>
      <span>{start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}</span>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="btn-xs" disabled={!hasPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}>‹ Prev</button>
        <span style={{
          display: "inline-flex", alignItems: "center", padding: "0 10px",
          fontFamily: "var(--f-mono)", color: "var(--text-2)",
        }}>Page {page} / {pages}</span>
        <button type="button" className="btn-xs" disabled={!hasNext}
          onClick={() => onChange(offset + limit)}>Next ›</button>
      </div>
    </div>
  );
}

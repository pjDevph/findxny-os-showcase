"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { adminClient } from "@/lib/admin-client";
import { PaginationClient } from "@/components/ui/Pagination";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";

const PAGE_SIZE = 100;

const DATE_RANGES = [
  { label: "Today",    days: 1   },
  { label: "7 days",   days: 7   },
  { label: "30 days",  days: 30  },
  { label: "All",      days: 0   },
];

// UI key → server filter value; admin-data maps these to canonical DB entity_type column values.
const ENTITY_FILTERS: { key: string; label: string }[] = [
  { key: "all",         label: "All"          },
  { key: "order",       label: "Orders"       },
  { key: "booking",     label: "Bookings"     },
  { key: "product",     label: "Products"     },
  { key: "ingredient",  label: "Ingredients"  },
  { key: "inventory",   label: "Inventory"    },
  { key: "payment",     label: "Payments"     },
  { key: "transaction", label: "Transactions" },
  { key: "staff",       label: "Staff"        },
  { key: "prep",        label: "Prep Display" },
  { key: "workspace",   label: "Workspace"    },
];

function serializeJson(v: unknown): string {
  return v == null ? "" : JSON.stringify(v);
}

function colorFor(action: string): string {
  if (action.includes("create") || action.includes("hold") || action.includes("invite")) return "ok";
  if (action.includes("update") || action.includes("toggle") || action.includes("upsert")) return "warn";
  if (action.includes("cancel") || action.includes("void") || action.includes("refund") || action.includes("delete") || action.includes("archive")) return "err";
  return "neutral";
}

export default function AuditLogsPage() {
  const [logs, setLogs]           = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [offset, setOffset]       = useState(0);
  const [loading, setLoading]     = useState(true);
  const [loadErr, setLoadErr]     = useState<string | null>(null);
  const [days, setDays]           = useState(7);
  const [entityType, setEntityType] = useState("all");
  const wsIdRef = useRef<string | null>(null);

  const load = useCallback(async (off: number) => {
    setLoading(true);
    setLoadErr(null);
    try {
      if (!wsIdRef.current) {
        const { memberships } = await adminClient.me();
        wsIdRef.current = memberships[0]?.workspace_id ?? null;
      }
      if (!wsIdRef.current) { setLogs([]); setTotal(0); setLoading(false); return; }
      const res = await adminClient.auditLogs(wsIdRef.current, {
        days, entity_type: entityType, limit: PAGE_SIZE, offset: off,
      });
      setLogs(res.logs ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      setLogs([]); setTotal(0);
      setLoadErr(e?.message ?? "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [days, entityType]);

  // Reset to page 1 when filters change.
  useEffect(() => { setOffset(0); load(0); }, [days, entityType, load]);

  function goTo(o: number) {
    setOffset(o);
    load(o);
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Audit Logs</h1>
          <div className="sub">{loading ? "Loading…" : `${total.toLocaleString()} events`}</div>
        </div>
        <ExportCsvButton
          label="Export CSV"
          filename={`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`}
          columns={["created_at", "actor", "action", "entity_type", "entity_id", "before", "after"]}
          fetchPage={async (offset, limit) => {
            const wsId = wsIdRef.current;
            if (!wsId) return { rows: [], total: 0 };
            const res = await adminClient.auditLogs(wsId, { days, entity_type: entityType, limit, offset });
            return { rows: res.logs ?? [], total: res.total ?? 0 };
          }}
          flatten={(l: any) => ({
            created_at:  l.created_at,
            actor:       l.profiles?.full_name ?? l.actor_id ?? "system",
            action:      l.action,
            entity_type: l.entity_type,
            entity_id:   l.entity_id ?? "",
            before:      serializeJson(l.before),
            after:       serializeJson(l.after),
          })}
        />
      </div>

      <div style={{ display: "flex", gap: 16, padding: "0 24px 16px", flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>Period</span>
          {DATE_RANGES.map(r => (
            <button key={r.days} className={`chip${days === r.days ? " active" : ""}`} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>Type</span>
          {ENTITY_FILTERS.map(ef => (
            <button key={ef.key} className={`chip${entityType === ef.key ? " active" : ""}`} onClick={() => setEntityType(ef.key)}>
              {ef.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-body">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Record</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
              {!loading && loadErr && (
                <tr>
                  <td colSpan={6} className="empty" style={{ color: "var(--err)" }}>
                    {loadErr}
                    <button className="btn-xs" style={{ marginLeft: 12 }} onClick={() => load(offset)}>Retry</button>
                  </td>
                </tr>
              )}
              {!loading && !loadErr && logs.length === 0 && <tr><td colSpan={6} className="empty">No audit logs found for this period</td></tr>}
              {logs.map((l: any) => (
                <tr key={l.id}>
                  <td className="dim" style={{ whiteSpace: "nowrap" }}>
                    {new Date(l.created_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td className="dim">{l.profiles?.full_name ?? (l.actor_id ? l.actor_id.slice(0, 8) : "system")}</td>
                  <td><span className={`pill ${colorFor(l.action)}`}>{l.action}</span></td>
                  <td><span className="mono">{l.entity_type}</span></td>
                  <td>
                    <span className="mono" style={{ fontSize: 11 }}>
                      {l.entity_id ? `${l.entity_id.slice(0, 8)}…` : "—"}
                    </span>
                  </td>
                  <td>
                    {(l.after || l.before) && (
                      <details>
                        <summary style={{ cursor: "pointer", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>View diff</summary>
                        <pre style={{ margin: "8px 0 0", fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-2)", whiteSpace: "pre-wrap", maxWidth: 360, overflowX: "auto" }}>
                          {JSON.stringify({ before: l.before, after: l.after }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationClient total={total} limit={PAGE_SIZE} offset={offset} onChange={goTo} />
        </div>
      </div>
    </>
  );
}

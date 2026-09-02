import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { peso } from "@/lib/config";
import Link from "next/link";
import { cancelOrder, advanceOrder, managerCancelOrder, cancelOrderItem } from "../actions";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Pagination } from "@/components/ui/Pagination";

const PAGE_SIZE = 50;

const STATUSES = ["pending", "preparing", "ready", "completed", "cancelled"];

const STATUS_COLOR: Record<string, string> = {
  pending: "warn", preparing: "info", ready: "ok",
  completed: "neutral", cancelled: "err", draft: "neutral",
};

const PAYMENT_COLOR: Record<string, string> = {
  paid: "ok", pending_counter: "warn", cancelled: "err",
  partially_paid: "info", refunded: "err",
};

async function bindAdvance(orderId: string, status: "preparing" | "ready" | "completed") {
  "use server";
  await advanceOrder(orderId, status);
}

function SourceBadge({ source }: { source?: string | null }) {
  const src = source ?? "pos";
  const styles: Record<string, React.CSSProperties> = {
    web:   { background: "rgba(59,130,246,0.12)",  color: "#3b82f6",             border: "1px solid rgba(59,130,246,0.3)" },
    kiosk: { background: "rgba(34,197,94,0.12)",   color: "#22c55e",             border: "1px solid rgba(34,197,94,0.3)" },
    pos:   { background: "rgba(var(--tint-rgb), 0.12)",  color: "var(--amber-bright)", border: "1px solid rgba(var(--tint-rgb), 0.3)" },
  };
  const st = styles[src] ?? styles.pos;
  return (
    <span style={{ ...st, padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700, fontFamily: "var(--f-mono)" }}>
      {src.toUpperCase()}
    </span>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const dynamic = "force-dynamic";

export default async function OrderHistoryPage({
  searchParams,
}: {
  searchParams: { status?: string; source?: string; offset?: string; id?: string };
}) {
  const wsId = await resolveWorkspaceId();
  const offset = Math.max(0, Number(searchParams.offset ?? 0) || 0);
  const { orders, total, limit } = wsId
    ? await adminApi.orders(wsId, {
        status: searchParams.status,
        source: searchParams.source,
        limit: PAGE_SIZE,
        offset,
      })
    : { orders: [] as any[], total: 0, limit: PAGE_SIZE };

  const selectedId = searchParams.id ?? orders[0]?.id ?? null;
  const detail = orders.find((o: any) => o.id === selectedId) ?? null;

  const pageRevenue = orders
    .filter((o: any) => o.status !== "cancelled")
    .reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);

  function filterHref(extra: Record<string, string>) {
    const sp = new URLSearchParams();
    const base = { status: searchParams.status ?? "", source: searchParams.source ?? "", ...extra };
    Object.entries(base).forEach(([k, v]) => { if (v) sp.set(k, v); });
    const qs = sp.toString();
    return qs ? `/orders?${qs}` : "/orders";
  }

  function orderHref(id: string) {
    const sp = new URLSearchParams();
    if (searchParams.status) sp.set("status", searchParams.status);
    if (searchParams.source) sp.set("source", searchParams.source);
    if (Number(searchParams.offset)) sp.set("offset", searchParams.offset!);
    sp.set("id", id);
    return `/orders?${sp}`;
  }

  function paginationHref(o: number) {
    const sp = new URLSearchParams();
    if (searchParams.status) sp.set("status", searchParams.status);
    if (searchParams.source) sp.set("source", searchParams.source);
    if (o > 0) sp.set("offset", String(o));
    return sp.toString() ? `/orders?${sp}` : "/orders";
  }

  const isVoided = (o: any) =>
    o.status === "cancelled" && o.cancel_reason?.toLowerCase().includes("void");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="admin-header" style={{ flexShrink: 0 }}>
        <div>
          <h1>Order History</h1>
          <div className="sub">{total.toLocaleString()} records</div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: 0 }}>
        {/* ── Left panel ── */}
        <div style={{
          width: "60%", minWidth: 380, flexShrink: 0,
          display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--line)",
          overflow: "hidden",
        }}>
          {/* Filter bar */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 6 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--text-4)", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 2 }}>Status</span>
              {["", ...STATUSES].map((s) => {
                const active = searchParams.status === s || (!searchParams.status && !s);
                return (
                  <Link key={s} href={filterHref({ status: s, offset: "" }) as any} className="btn-xs"
                    style={active ? { background: "rgba(var(--tint-rgb), 0.12)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: "var(--amber-bright)" } : {}}>
                    {s || "All"}
                  </Link>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--text-4)", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 2 }}>Source</span>
              {["", "pos", "web", "kiosk"].map((src) => {
                const srcColors: Record<string, string> = { pos: "rgba(var(--tint-rgb), 0.12)", web: "rgba(59,130,246,0.12)", kiosk: "rgba(34,197,94,0.12)" };
                const srcText:   Record<string, string> = { pos: "var(--amber-bright)", web: "#3b82f6", kiosk: "#22c55e" };
                const active = searchParams.source === src || (!searchParams.source && !src);
                return (
                  <Link key={`src-${src}`} href={filterHref({ source: src, offset: "" }) as any} className="btn-xs"
                    style={active
                      ? { background: srcColors[src] ?? "rgba(var(--tint-rgb), 0.12)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: srcText[src] ?? "var(--amber-bright)" }
                      : src ? { color: srcText[src], borderColor: `${srcText[src]}44` } : {}}>
                    {src ? src.toUpperCase() : "All"}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--line)" }}>
            {[
              { label: "Total Orders", value: total.toLocaleString() },
              { label: "Page Revenue", value: peso(pageRevenue), color: "var(--amber-bright)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: "10px 12px", borderRight: "1px solid var(--line)", textAlign: "center" }}>
                <div style={{ fontSize: 9, fontFamily: "var(--f-mono)", color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: color ?? "var(--text-1)", fontFamily: "var(--f-mono)" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Order list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {orders.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>No orders found</div>
            )}
            {orders.map((o: any) => {
              const active = o.id === selectedId;
              const voided = isVoided(o);
              const label = voided ? "VOIDED" : o.status.toUpperCase();
              const color = voided ? "err" : (STATUS_COLOR[o.status] ?? "neutral");
              return (
                <Link key={o.id} href={orderHref(o.id) as any} style={{ textDecoration: "none" }}>
                  <div style={{
                    padding: "12px 14px",
                    boxShadow: "inset 0 -1px 0 var(--line)",
                    background: active ? "rgba(var(--tint-rgb), 0.07)" : "transparent",
                    borderLeft: active ? "3px solid var(--amber-bright)" : "3px solid transparent",
                    cursor: "pointer",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--f-mono)", fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>
                          #{o.order_no?.replace("ORD-", "") ?? "—"}
                        </span>
                        <SourceBadge source={o.source} />
                        <span className={`pill ${color}`} style={{ fontSize: 10 }}>{label}</span>
                        {o.payment_status === "refunded" && (
                          <span className="pill err" style={{ fontSize: 10 }}>refunded</span>
                        )}
                      </div>
                      <span style={{ fontFamily: "var(--f-mono)", fontWeight: 700, fontSize: 13, color: "var(--amber-bright)" }}>
                        {peso(o.total)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-4)" }}>
                      <span>{(o.type ?? "dine_in").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}{o.cancel_reason ? ` · ${o.cancel_reason}` : ""}</span>
                      <span>{fmt(o.created_at)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          <div style={{ borderTop: "1px solid var(--line)", flexShrink: 0 }}>
            <Pagination total={total} limit={limit} offset={offset} hrefFor={paginationHref} />
          </div>
        </div>

        {/* ── Right panel (detail) ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 32px 0" }}>
          {!detail ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-4)", fontSize: 13 }}>
              Select an order to view details
            </div>
          ) : (
            <OrderDetail order={detail} bindAdvance={bindAdvance} />
          )}
        </div>
      </div>
    </div>
  );
}

function OrderDetail({ order: o, bindAdvance }: { order: any; bindAdvance: (id: string, s: "preparing" | "ready" | "completed") => Promise<void> }) {
  const isVoided = o.status === "cancelled" && o.cancel_reason?.toLowerCase().includes("void");
  const statusLabel = isVoided ? "VOIDED" : o.status.toUpperCase();
  const statusColor = isVoided ? "err" : (STATUS_COLOR[o.status] ?? "neutral");

  const NEXT: Record<string, { label: string; next: "preparing" | "ready" | "completed" }> = {
    pending:   { label: "Start Prep", next: "preparing" },
    preparing: { label: "Mark Ready", next: "ready" },
    ready:     { label: "Complete",   next: "completed" },
  };
  const advance = NEXT[o.status] ?? null;

  return (
    <div style={{ padding: "24px 36px" }}>
      {/* Order header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-4)", marginBottom: 4 }}>{o.order_no}</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: "var(--text-1)" }}>
            #{o.order_no?.replace("ORD-", "") ?? "—"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SourceBadge source={o.source} />
          <span className={`pill ${statusColor}`}>{statusLabel}</span>
          {o.payment_status === "refunded" && (
            <span className="pill err">refunded</span>
          )}
        </div>
      </div>

      {/* Meta grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1px", background: "var(--line)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
        {[
          { label: "Date",    value: new Date(o.created_at).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
          { label: "Type",    value: (o.type ?? "dine_in").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) },
          { label: "Table",   value: o.table_no ?? "—" },
          { label: "Guest",   value: o.customers?.name ?? "—" },
          { label: "Phone",   value: o.customers?.phone ?? "—" },
          { label: "Branch",  value: o.branches?.name ?? "—" },
          { label: "Payment", value: o.payment_status ? (
            <span className={`pill ${PAYMENT_COLOR[o.payment_status] ?? "neutral"}`} style={{ fontSize: 11 }}>
              {o.payment_status.replace("_", " ")}
            </span>
          ) : "—" },
          ...(o.cancel_reason ? [{ label: "Reason", value: o.cancel_reason }] : []),
          ...(o.notes ? [{ label: "Notes", value: o.notes }] : []),
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "var(--surface-1, #111)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
            <div style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500 }}>{value as any}</div>
          </div>
        ))}
      </div>

      {/* Items */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Items</div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
          {(o.order_items ?? []).map((item: any, i: number) => {
            const ticketStatuses: string[] = (item.kitchen_ticket_items ?? [])
              .map((kti: any) => kti.kitchen_tickets?.kitchen_status)
              .filter(Boolean);
            const isCancelled = item.status === "cancelled";
            const isServed = !isCancelled && ticketStatuses.some((s) => ["served", "completed"].includes(s));
            const canCancel = !isCancelled && !isServed && o.status !== "cancelled";
            return (
              <div key={item.id ?? i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", borderBottom: i < (o.order_items?.length ?? 0) - 1 ? "1px solid var(--line)" : "none",
                background: "var(--surface-1, #111)",
                opacity: isCancelled ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-4)" }}>×{item.quantity}</span>
                  <span style={{ fontSize: 13, color: "var(--text-1)", textDecoration: isCancelled ? "line-through" : "none" }}>
                    {item.products?.name ?? "—"}
                  </span>
                  {isCancelled && <span className="pill err" style={{ fontSize: 10 }}>cancelled</span>}
                  {isServed && <span className="pill neutral" style={{ fontSize: 10 }}>served</span>}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--text-2)" }}>{peso(item.total)}</span>
                  {canCancel && (
                    <ConfirmActionButton
                      className="btn-xs danger"
                      title={`Cancel ${item.products?.name ?? "item"}?`}
                      body="If this order was already paid, a refund is recorded automatically for this item's amount. Stock/ingredients are restored since it was never served."
                      confirmLabel="Cancel item"
                      cancelLabel="Keep item"
                      action={cancelOrderItem.bind(null, o.id, item.id, "Cancelled from Order History")}
                    >
                      Cancel
                    </ConfirmActionButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      {(() => {
        const taxPct = o.subtotal > 0 ? Math.round((Number(o.tax ?? 0) / Number(o.subtotal)) * 100) : 0;
        const svcPct = o.subtotal > 0 && Number(o.service_fee) > 0
          ? Math.round((Number(o.service_fee) / Number(o.subtotal)) * 100)
          : null;
        const rows: { label: string; value: string; color?: string }[] = [
          { label: "Subtotal", value: peso(o.subtotal ?? 0) },
          { label: `Tax (${taxPct}%)`, value: peso(o.tax ?? 0) },
        ];
        if (Number(o.service_fee) > 0) {
          rows.push({ label: `Service Charge${svcPct != null ? ` (${svcPct}%)` : ""}`, value: peso(o.service_fee) });
        }
        if (Number(o.discount) > 0) {
          const discLabel = o.voucher_code ? `Voucher (${o.voucher_code})` : "Discount";
          rows.push({ label: discLabel, value: `−${peso(o.discount)}`, color: "var(--ok)" });
        }
        return (
          <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
            {rows.map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid var(--line)", background: "var(--surface-1, #111)", fontSize: 13, color: "var(--text-3)" }}>
                <span style={color ? { color } : undefined}>{label}</span>
                <span style={{ fontFamily: "var(--f-mono)", ...(color ? { color } : {}) }}>{value}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: "var(--surface-1, #111)", fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>
              <span>Total</span>
              <span style={{ fontFamily: "var(--f-mono)", color: "var(--amber-bright)" }}>{peso(o.total)}</span>
            </div>
          </div>
        );
      })()}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {advance && (
          <form action={bindAdvance.bind(null, o.id, advance.next)}>
            <ConfirmSubmitButton
              className="btn-xs primary"
              title={`${advance.label}?`}
              body={`Move order ${o.order_no} to "${advance.next}".`}
              confirmLabel={advance.label}
            >
              {advance.label}
            </ConfirmSubmitButton>
          </form>
        )}
        {o.status === "pending" && (
          <ConfirmActionButton
            className="btn-xs danger"
            title={`Cancel ${o.order_no}?`}
            body="The kitchen ticket will be voided. This can't be undone."
            confirmLabel="Cancel order"
            cancelLabel="Keep order"
            action={cancelOrder.bind(null, o.id)}
          >
            Cancel
          </ConfirmActionButton>
        )}
        {o.status === "preparing" && (
          <ConfirmActionButton
            className="btn-xs danger"
            title={`Force cancel ${o.order_no}?`}
            body="The kitchen is actively preparing this order. The restaurant absorbs the cost — not the customer."
            confirmLabel="Cancel anyway"
            cancelLabel="Keep order"
            action={managerCancelOrder.bind(null, o.id)}
          >
            Force Cancel
          </ConfirmActionButton>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { peso } from "@/lib/config";

const PAGE_ORDERS  = 10;
const PAGE_KITCHEN = 15;

const STATUS_COLOR: Record<string, string> = {
  pending: "warn", preparing: "info", ready: "ok",
  completed: "neutral", cancelled: "err", draft: "neutral",
};

function Pager({ page, total, onPrev, onNext }: { page: number; total: number; onPrev: () => void; onNext: () => void }) {
  if (total <= 1) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid var(--line)", fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--text-3)" }}>
      <span>Page {page + 1} of {total}</span>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-xs" onClick={onPrev} disabled={page === 0}>← Prev</button>
        <button className="btn-xs" onClick={onNext} disabled={page >= total - 1}>Next →</button>
      </div>
    </div>
  );
}

export function DashboardTables({ recentOrders, kitchenTickets }: { recentOrders: any[]; kitchenTickets: any[] }) {
  const [ordersPage,  setOrdersPage]  = useState(0);
  const [kitchenPage, setKitchenPage] = useState(0);

  const orderPages  = Math.ceil(recentOrders.length  / PAGE_ORDERS);
  const kitchenPages = Math.ceil(kitchenTickets.length / PAGE_KITCHEN);

  const ordersSlice  = recentOrders.slice(ordersPage  * PAGE_ORDERS,  (ordersPage  + 1) * PAGE_ORDERS);
  const kitchenSlice = kitchenTickets.slice(kitchenPage * PAGE_KITCHEN, (kitchenPage + 1) * PAGE_KITCHEN);

  return (
    <div className="grid-2col">

      {/* ── Recent Orders ── */}
      <div className="admin-table-wrap">
        <div className="admin-table-head">
          <h2>Recent Orders</h2>
          <Link href="/orders" className="btn-xs">View all →</Link>
        </div>
        <table className="admin-table">
          <thead>
            <tr><th>Order</th><th>Table</th><th>Total</th><th>Status</th><th>Time</th></tr>
          </thead>
          <tbody>
            {ordersSlice.length === 0 && <tr><td colSpan={5} className="empty">No orders yet</td></tr>}
            {ordersSlice.map((o: any) => (
              <tr key={o.id}>
                <td><span className="mono">{o.order_no}</span></td>
                <td className="dim">{o.table_no ?? "—"}</td>
                <td className="bold">{peso(o.total)}</td>
                <td><span className={`pill ${STATUS_COLOR[o.status] ?? "neutral"}`}>{o.status}</span></td>
                <td className="dim">{new Date(o.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager
          page={ordersPage} total={orderPages}
          onPrev={() => setOrdersPage((p) => p - 1)}
          onNext={() => setOrdersPage((p) => p + 1)}
        />
      </div>

      {/* ── Kitchen Queue ── */}
      <div className="admin-table-wrap">
        <div className="admin-table-head">
          <h2>Kitchen Queue</h2>
          <Link href="/kitchen" className="btn-xs">Live board →</Link>
        </div>
        <table className="admin-table">
          <thead>
            <tr><th>Order</th><th>Table</th><th>Status</th></tr>
          </thead>
          <tbody>
            {kitchenSlice.length === 0 && <tr><td colSpan={3} className="empty">Queue is clear</td></tr>}
            {kitchenSlice.map((kt: any) => {
              const ks = kt.kitchen_status ?? "new";
              return (
              <tr key={kt.id}>
                <td><span className="mono">{kt.orders?.order_no ?? "—"}</span></td>
                <td className="dim">{kt.orders?.table_no ?? "—"}</td>
                <td>
                  <span className={`pill ${ks === "new" || ks === "accepted" ? "info" : ks === "preparing" ? "warn" : "ok"}`}>
                    {ks}
                  </span>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
        <Pager
          page={kitchenPage} total={kitchenPages}
          onPrev={() => setKitchenPage((p) => p - 1)}
          onNext={() => setKitchenPage((p) => p + 1)}
        />
      </div>

    </div>
  );
}

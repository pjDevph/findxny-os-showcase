"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { peso } from "@/lib/config";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

interface Order {
  id: string;
  order_no: string;
  status: string;
  total: number;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
}

interface Booking {
  id: string;
  status: string;
  total: number;
  start_time: string;
  end_time: string;
  customers: { name: string; phone: string | null; email: string | null } | null;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "var(--text-3)",
};

export default function CustomersClient({
  customers,
  orders,
  bookings,
}: {
  customers: Customer[];
  orders: Order[];
  bookings: Booking[];
}) {
  const [query, setQuery] = useState("");

  /* Aggregate order + booking spend per customer id */
  const spendById = useMemo(() => {
    const map = new Map<string, { orderCount: number; bookingCount: number; totalSpend: number }>();

    // We match orders → customers by name+phone since orders carry customers(name, phone)
    // but not a customer FK. Build a lookup: "name|phone" → customer id.
    const keyById = new Map<string, string>(); // "name|phone" -> customer.id
    for (const c of customers) {
      const k = `${c.name.toLowerCase()}|${c.phone ?? ""}`;
      keyById.set(k, c.id);
    }

    const getOrCreate = (id: string) => {
      if (!map.has(id)) map.set(id, { orderCount: 0, bookingCount: 0, totalSpend: 0 });
      return map.get(id)!;
    };

    for (const o of orders) {
      if (!o.customers) continue;
      const k = `${o.customers.name.toLowerCase()}|${o.customers.phone ?? ""}`;
      const cid = keyById.get(k);
      if (!cid) continue;
      const agg = getOrCreate(cid);
      agg.orderCount += 1;
      if (o.status !== "cancelled") agg.totalSpend += o.total ?? 0;
    }

    for (const b of bookings) {
      if (!b.customers) continue;
      const k = `${b.customers.name.toLowerCase()}|${b.customers.phone ?? ""}`;
      const cid = keyById.get(k);
      if (!cid) continue;
      const agg = getOrCreate(cid);
      agg.bookingCount += 1;
      if (b.status !== "cancelled") agg.totalSpend += b.total ?? 0;
    }

    return map;
  }, [customers, orders, bookings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = [c.name, c.phone, c.email].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [customers, query]);

  /* Sort: highest total spend first */
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const sa = spendById.get(a.id)?.totalSpend ?? 0;
      const sb = spendById.get(b.id)?.totalSpend ?? 0;
      return sb - sa;
    });
  }, [filtered, spendById]);

  const totalSpend = useMemo(
    () => [...spendById.values()].reduce((s, v) => s + v.totalSpend, 0),
    [spendById],
  );

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Customers</h1>
          <div className="sub">{customers.length} registered · {peso(totalSpend)} lifetime spend</div>
        </div>
      </div>

      <div className="admin-body">
        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total customers", value: customers.length },
            { label: "With orders",     value: [...spendById.values()].filter(v => v.orderCount > 0).length },
            { label: "With bookings",   value: [...spendById.values()].filter(v => v.bookingCount > 0).length },
            { label: "Lifetime spend",  value: peso(totalSpend) },
          ].map((c) => (
            <div key={c.label} style={{
              padding: "12px 14px", borderRadius: 10,
              background: "rgba(var(--tint-rgb), 0.04)", border: "1px solid rgba(var(--tint-rgb), 0.1)",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>{c.value}</div>
              <div style={{ ...MONO, marginTop: 6 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <input
          className="input"
          placeholder="Search by name, phone, or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {/* Table */}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Orders</th>
                <th>Bookings</th>
                <th>Spend</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={7} className="empty">No customers found</td></tr>
              )}
              {sorted.map((c) => {
                const agg = spendById.get(c.id) ?? { orderCount: 0, bookingCount: 0, totalSpend: 0 };
                return (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/customers/${c.id}` as any}
                        style={{ color: "var(--amber)", fontWeight: 600, textDecoration: "none" }}
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="dim">{c.phone ?? "—"}</td>
                    <td className="dim">{c.email ?? "—"}</td>
                    <td>{agg.orderCount > 0 ? agg.orderCount : <span className="dim">—</span>}</td>
                    <td>{agg.bookingCount > 0 ? agg.bookingCount : <span className="dim">—</span>}</td>
                    <td className="bold">{agg.totalSpend > 0 ? peso(agg.totalSpend) : <span className="dim">—</span>}</td>
                    <td className="dim">{new Date(c.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

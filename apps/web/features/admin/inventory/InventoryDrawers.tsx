"use client";

import { useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";

type InventoryItem = {
  id: string;
  branch_id: string;
  workspace_id: string;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
  product_id?: string;
  products: { name: string; sku?: string | null } | null;
  branches: { name: string } | null;
};

type Movement = {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  unit_cost: number | null;
  supplier: string | null;
  created_at: string;
};

const REASON_TYPES = [
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "lost",    label: "Lost" },
  { value: "other",   label: "Other" },
] as const;

export function InventoryRowActions({
  item,
  stockInAction,
  stockOutAction,
  adjustAction,
  loadMovements,
}: {
  item: InventoryItem;
  stockInAction: (formData: FormData) => Promise<void>;
  stockOutAction: (formData: FormData) => Promise<void>;
  adjustAction: (formData: FormData) => Promise<void>;
  loadMovements: () => Promise<Movement[]>;
}) {
  const [drawer, setDrawer] = useState<"in" | "out" | "adjust" | "log" | null>(null);
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);

  // Each drawer's own required fields, mirroring stockInAction / stockOutAction / adjustAction.
  const [stockInQty, setStockInQty]   = useState("");
  const [stockOutQty, setStockOutQty] = useState("");
  const [adjustQty, setAdjustQty]     = useState(String(item.quantity));
  const [adjustReason, setAdjustReason] = useState("");

  const validStockInQty  = stockInQty.trim() !== ""  && Number.isFinite(Number(stockInQty));
  const validStockOutQty = stockOutQty.trim() !== "" && Number.isFinite(Number(stockOutQty));
  const validAdjust = adjustQty.trim() !== "" && Number.isFinite(Number(adjustQty)) && adjustReason.trim() !== "";

  async function openLog() {
    setDrawer("log");
    setLoadingLog(true);
    try {
      const data = await loadMovements();
      setMovements(data);
    } finally {
      setLoadingLog(false);
    }
  }

  const subtitle = `${item.products?.name ?? "—"} · ${item.branches?.name ?? "—"} · current ${item.quantity} ${item.unit}`;

  return (
    <>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn-xs primary" onClick={() => setDrawer("in")}>Stock In</button>
        <button className="btn-xs" onClick={() => setDrawer("out")}>Stock Out</button>
        <button className="btn-xs" onClick={() => setDrawer("adjust")}>Adjust</button>
        <button className="btn-xs" onClick={openLog}>Log</button>
      </div>

      {/* STOCK IN */}
      <SlideOver
        open={drawer === "in"}
        onClose={() => setDrawer(null)}
        title="Stock In"
        subtitle={subtitle}
        footer={
          <>
            <button type="button" className="btn-xs" onClick={() => setDrawer(null)}>Cancel</button>
            <ConfirmSubmitButton formId="stock-in-form" disabled={!validStockInQty} title="Record this restock?" confirmLabel="Save restock">
              Save restock
            </ConfirmSubmitButton>
          </>
        }
      >
        <form
          id="stock-in-form"
          action={async (fd) => { await stockInAction(fd); setDrawer(null); }}
          style={{ display: "grid", gap: 14 }}
        >
          <input type="hidden" name="branch_id"          value={item.branch_id} />
          <input type="hidden" name="product_id"         value={item.product_id ?? ""} />
          {/* No product_id means this is a raw material — restocked via inventory-adjust
              against its existing per-branch row instead of stock-in (which requires a product). */}
          <input type="hidden" name="inventory_item_id"  value={item.id} />
          <div className="admin-field">
            <label htmlFor="si-quantity">Quantity received</label>
            <input id="si-quantity" className="input" type="number" step="0.001" min="0" name="quantity" required value={stockInQty} onChange={e => setStockInQty(e.target.value)} />
          </div>
          <div className="admin-field">
            <label htmlFor="si-unit-cost">Unit cost (optional)</label>
            <input id="si-unit-cost" className="input" type="number" step="0.01" min="0" name="unit_cost" placeholder="₱ per unit" />
          </div>
          <div className="admin-field">
            <label htmlFor="si-supplier">Supplier (optional)</label>
            <input id="si-supplier" className="input" name="supplier" placeholder="e.g. Caltex Foods Inc." />
          </div>
          <div className="admin-field">
            <label htmlFor="si-reason">Note (optional)</label>
            <input id="si-reason" className="input" name="reason" placeholder="PO #, invoice, etc." />
          </div>
        </form>
      </SlideOver>

      {/* STOCK OUT */}
      <SlideOver
        open={drawer === "out"}
        onClose={() => setDrawer(null)}
        title="Stock Out"
        subtitle={subtitle}
        footer={
          <>
            <button type="button" className="btn-xs" onClick={() => setDrawer(null)}>Cancel</button>
            <ConfirmSubmitButton formId="stock-out-form" disabled={!validStockOutQty} title="Record this stock removal?" tone="warning" confirmLabel="Record removal">
              Record removal
            </ConfirmSubmitButton>
          </>
        }
      >
        <form
          id="stock-out-form"
          action={async (fd) => { await stockOutAction(fd); setDrawer(null); }}
          style={{ display: "grid", gap: 14 }}
        >
          <input type="hidden" name="inventory_item_id" value={item.id} />
          <div className="admin-field">
            <label htmlFor="so-quantity">Quantity removed</label>
            <input id="so-quantity" className="input" type="number" step="0.001" min="0" name="quantity" required value={stockOutQty} onChange={e => setStockOutQty(e.target.value)} />
          </div>
          <div className="admin-field">
            <label htmlFor="so-reason-type">Reason</label>
            <select id="so-reason-type" className="input" name="reason_type" defaultValue="damaged" required>
              {REASON_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="so-note">Note (optional)</label>
            <input id="so-note" className="input" name="note" placeholder="Details for the audit log" />
          </div>
        </form>
      </SlideOver>

      {/* ADJUST (set absolute) */}
      <SlideOver
        open={drawer === "adjust"}
        onClose={() => setDrawer(null)}
        title="Adjust Stock"
        subtitle={subtitle}
        footer={
          <>
            <button type="button" className="btn-xs" onClick={() => setDrawer(null)}>Cancel</button>
            <ConfirmSubmitButton formId="adjust-form" disabled={!validAdjust} title="Set the stock count?" tone="warning" confirmLabel="Set count">
              Set count
            </ConfirmSubmitButton>
          </>
        }
      >
        <form
          id="adjust-form"
          action={async (fd) => { await adjustAction(fd); setDrawer(null); }}
          style={{ display: "grid", gap: 14 }}
        >
          <input type="hidden" name="inventory_item_id" value={item.id} />
          <input type="hidden" name="branch_id"         value={item.branch_id} />
          <div className="admin-field">
            <label htmlFor="adj-quantity">New on-hand count</label>
            <input
              id="adj-quantity"
              className="input" type="number" step="0.001" name="quantity"
              required value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="adj-reason">Reason (required for the audit log)</label>
            <input
              id="adj-reason" className="input" name="reason" placeholder="e.g. Physical count 2026-05-04" required
              value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>
            Use this after a physical count. The delta is recorded as an adjustment movement.
          </p>
        </form>
      </SlideOver>

      {/* MOVEMENT LOG */}
      <SlideOver
        open={drawer === "log"}
        onClose={() => setDrawer(null)}
        title="Movement Log"
        subtitle={subtitle}
        width={640}
      >
        {loadingLog && <div className="dim">Loading…</div>}
        {!loadingLog && movements && movements.length === 0 && (
          <div className="dim">No movements yet.</div>
        )}
        {!loadingLog && movements && movements.length > 0 && (
          <table className="admin-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="dim">{new Date(m.created_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td><span className={`pill ${pillForType(m.type)}`}>{m.type}</span></td>
                  <td className="bold" style={{ color: m.quantity < 0 ? "var(--err)" : "var(--ok)" }}>
                    {m.quantity > 0 ? "+" : ""}{m.quantity}
                  </td>
                  <td className="dim">{m.unit_cost != null ? `₱${m.unit_cost}` : "—"}</td>
                  <td className="dim">{[m.supplier, m.reason].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SlideOver>
    </>
  );
}

function pillForType(t: string): string {
  switch (t) {
    case "in":            return "ok";
    case "sale":          return "info";
    case "refund_return": return "amber";
    case "damage":        return "err";
    case "adjustment":    return "warn";
    default:              return "neutral";
  }
}

"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { adminClient } from "@/lib/admin-client";

type BlockType = "maintenance" | "owner_block" | "cleaning" | "private_event";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  maintenance:   "Maintenance",
  owner_block:   "Owner block",
  cleaning:      "Cleaning",
  private_event: "Private event",
};

interface Room {
  id: string;
  name: string;
}

interface ResourceBlock {
  id: string;
  resource_id: string;
  branch_id: string | null;
  start_date: string;
  end_date: string;
  block_type: BlockType;
  reason: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  bookable_resources: { name: string; type: string } | null;
}

interface Props {
  open: boolean;
  wsId: string;
  rooms: Room[];
  onClose: () => void;
  onSuccess: (block: ResourceBlock) => void;
  onUnblock: (blockId: string) => void;
  existingBlocks: ResourceBlock[];
}

export function BlockResourceModal({
  open,
  wsId,
  rooms,
  onClose,
  onSuccess,
  onUnblock,
  existingBlocks,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [tab, setTab]               = useState<"add" | "manage">("add");
  const [resourceId, setResourceId] = useState("");
  const [startDate, setStartDate]   = useState(today);
  const [endDate, setEndDate]       = useState(today);
  const [blockType, setBlockType]   = useState<BlockType>("owner_block");
  const [reason, setReason]         = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  async function handleBlock() {
    if (!resourceId) { setError("Please select a room."); return; }
    if (!startDate || !endDate) { setError("Please set both dates."); return; }
    if (endDate <= startDate) { setError("End date must be after start date."); return; }
    setError(null);
    setSaving(true);
    try {
      const { block } = await adminClient.bookingsBlockResource({
        workspace_id: wsId,
        resource_id: resourceId,
        start_date: startDate,
        end_date: endDate,
        block_type: blockType,
        reason: reason.trim() || undefined,
      });
      onSuccess(block);
      // Reset form
      setReason("");
      setStartDate(today);
      setEndDate(today);
    } catch (e: any) {
      setError(e?.message ?? "Failed to block dates.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnblock(blockId: string) {
    setUnblocking(blockId);
    try {
      await adminClient.bookingsUnblockResource({ workspace_id: wsId, block_id: blockId });
      onUnblock(blockId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to remove block.");
    } finally {
      setUnblocking(null);
    }
  }

  const VIOLET = "#8b5cf6";
  const VIOLET_DIM = "rgba(139,92,246,0.18)";
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 7, fontSize: 13,
    border: "1px solid rgba(var(--tint-rgb), 0.14)", background: "rgba(0,0,0,0.3)",
    color: "var(--text-1)",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, color: "var(--text-3)",
    fontFamily: "var(--f-mono)", textTransform: "uppercase", letterSpacing: "0.1em",
    marginBottom: 5, marginTop: 14,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Block Resource Dates"
      subtitle="Prevent bookings on specific date ranges"
      width={520}
      footer={
        tab === "add" ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-xs" onClick={onClose}>Cancel</button>
            <button
              className="btn-xs"
              onClick={handleBlock}
              disabled={saving || !resourceId || !startDate || !endDate || endDate <= startDate}
              style={{ borderColor: "rgba(139,92,246,0.5)", color: "#a78bfa", background: "rgba(139,92,246,0.1)" }}
            >
              {saving ? "Blocking…" : "▪ Block Dates"}
            </button>
          </div>
        ) : (
          <button className="btn-xs" onClick={onClose}>Close</button>
        )
      }
    >
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid rgba(var(--tint-rgb), 0.1)", paddingBottom: 10 }}>
        {(["add", "manage"] as const).map(t => (
          <button
            key={t}
            className="btn-xs"
            onClick={() => setTab(t)}
            style={tab === t ? { background: VIOLET_DIM, borderColor: "rgba(139,92,246,0.4)", color: "#a78bfa" } : {}}
          >
            {t === "add" ? "Add Block" : `Manage (${existingBlocks.length})`}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: 12 }}>
          {error}
        </div>
      )}

      {tab === "add" && (
        <div>
          <label style={labelStyle}>Room / Resource</label>
          <select style={inputStyle} value={resourceId} onChange={e => setResourceId(e.target.value)}>
            <option value="">Select a room…</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Start date</label>
              <input
                type="date"
                style={inputStyle}
                value={startDate}
                min={today}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>End date (exclusive)</label>
              <input
                type="date"
                style={inputStyle}
                value={endDate}
                min={startDate || today}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
            End date is exclusive — the block covers up to (but not including) that day.
          </div>

          <label style={labelStyle}>Block type</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map(bt => (
              <button
                key={bt}
                className="btn-xs"
                onClick={() => setBlockType(bt)}
                style={blockType === bt ? { background: VIOLET_DIM, borderColor: "rgba(139,92,246,0.5)", color: "#a78bfa" } : {}}
              >
                {BLOCK_TYPE_LABELS[bt]}
              </button>
            ))}
          </div>

          <label style={labelStyle}>Reason (optional)</label>
          <input
            type="text"
            style={inputStyle}
            placeholder="e.g. Painting crew, deep cleaning…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={200}
          />
        </div>
      )}

      {tab === "manage" && (
        <div>
          {existingBlocks.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic", padding: "12px 0" }}>
              No active blocks. Use the &ldquo;Add Block&rdquo; tab to create one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {existingBlocks.map(bl => (
                <div
                  key={bl.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderRadius: 8,
                    background: VIOLET_DIM,
                    border: "1px solid rgba(139,92,246,0.25)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#c4b5fd" }}>
                      {bl.bookable_resources?.name ?? "—"}
                      <span style={{ marginLeft: 8, fontSize: 10, fontFamily: "var(--f-mono)", color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        {BLOCK_TYPE_LABELS[bl.block_type] ?? bl.block_type}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                      {bl.start_date} → {bl.end_date}
                      {bl.reason && <span style={{ marginLeft: 8, fontStyle: "italic" }}>{bl.reason}</span>}
                    </div>
                  </div>
                  <button
                    className="btn-xs danger"
                    disabled={unblocking === bl.id}
                    onClick={() => handleUnblock(bl.id)}
                    style={{ flexShrink: 0 }}
                  >
                    {unblocking === bl.id ? "…" : "Unblock"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

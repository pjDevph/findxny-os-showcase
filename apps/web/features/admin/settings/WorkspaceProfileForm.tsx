"use client";

import { useState } from "react";

export function WorkspaceProfileForm({
  ws,
  saveAction,
}: Readonly<{
  ws: any;
  saveAction: (formData: FormData) => Promise<void>;
}>) {
  const [name, setName] = useState(ws?.name ?? "");

  return (
    <form action={saveAction}>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label htmlFor="ws-name">Workspace Name *</label>
            <input id="ws-name" className="input" name="name"
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Mugthemug Angono" required />
          </div>
          <div className="admin-field">
            <label htmlFor="ws-phone">Phone</label>
            <input id="ws-phone" className="input" name="phone" type="tel"
              defaultValue={ws?.phone ?? ""} placeholder="+63 917 123 4567" />
          </div>
        </div>
        <div className="admin-field">
          <label htmlFor="receipt-address">Store Address</label>
          <textarea id="receipt-address" className="input" name="receipt_address" rows={2}
            defaultValue={ws?.receipt_address ?? ""}
            placeholder={"123 Main St, Brgy. Sample\nManila, NCR"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label htmlFor="receipt-tin">TIN Number</label>
            <input id="receipt-tin" className="input" name="receipt_tin"
              defaultValue={ws?.receipt_tin ?? ""} placeholder="000-000-000-000" />
          </div>
          <div className="admin-field">
            <label>Slug (read-only)</label>
            <input className="input" defaultValue={ws?.slug ?? ""} readOnly
              style={{ opacity: 0.5, cursor: "not-allowed" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label>Currency</label>
            <input className="input" defaultValue={ws?.currency ?? ""} readOnly
              style={{ opacity: 0.5, cursor: "not-allowed" }} />
          </div>
          <div className="admin-field">
            <label>Workspace ID</label>
            <input className="input" defaultValue={ws?.id ?? ""} readOnly
              style={{ opacity: 0.5, cursor: "not-allowed", fontFamily: "var(--f-mono)", fontSize: 11 }} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}
          style={{ width: "fit-content", fontSize: 13, padding: "10px 24px" }}>
          Save profile
        </button>
      </div>
    </form>
  );
}

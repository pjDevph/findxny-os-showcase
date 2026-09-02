"use client";

import { useState, useTransition, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { extractErrMsg, withFnBody } from "@/lib/errors";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";

type Resource = {
  id: string;
  name: string;
  type: "room" | "amenity";
  capacity: number | null;
  hourly_rate: number;
  nightly_rate: number | null;
  short_description: string | null;
  description: string | null;
  base_pax: number | null;
  max_pax: number | null;
  extra_pax_fee: number | null;
  security_deposit: number | null;
  cleaning_fee: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  inclusions: string[];
  photos: string[];
  cover_photo: string | null;
  house_rules: string | null;
  min_nights: number | null;
  active: boolean;
  branch_id: string | null;
  created_at: string;
  branches: { name: string } | null;
};

type Branch = { id: string; name: string };
type Filter  = "all" | "room" | "amenity";
type Tab     = "basic" | "photos" | "pricing" | "inclusions" | "rules";
type FormInputElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const PRESET_INCLUSIONS = [
  "WiFi", "Aircon", "Netflix", "Private bathroom", "Towels & linens",
  "Coffee & tea", "Free parking", "Pool access", "Breakfast included",
  "Refrigerator", "Smart TV", "Hot shower", "Complimentary water",
  "Workspace", "Iron & board", "Hair dryer", "Extra pillows",
];

const EMPTY_FORM = {
  id: "", name: "", type: "room" as "room" | "amenity",
  capacity: "", hourly_rate: "", nightly_rate: "",
  branch_id: "", active: true,
  short_description: "", description: "",
  base_pax: "2", max_pax: "4",
  extra_pax_fee: "", security_deposit: "", cleaning_fee: "",
  check_in_time: "15:00", check_out_time: "11:00",
  inclusions: [] as string[],
  photos: [] as string[],
  cover_photo: "",
  house_rules: "", min_nights: "1",
};

function peso(n: number | null | undefined) {
  if (n == null) return "—";
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

// Convert a nullable numeric column to a form string, falling back to `fallback`.
function numStr(v: number | null, fallback = "") {
  return v !== null ? String(v) : fallback;
}

function applyOptionalNumericFields(form: typeof EMPTY_FORM, body: Record<string, unknown>) {
  if (form.id)               body.id               = form.id;
  if (form.capacity)         body.capacity         = Number(form.capacity);
  if (form.branch_id)        body.branch_id        = form.branch_id;
  if (form.nightly_rate)     body.nightly_rate     = Number(form.nightly_rate);
  if (form.base_pax)         body.base_pax         = Number(form.base_pax);
  if (form.max_pax)          body.max_pax          = Number(form.max_pax);
  if (form.extra_pax_fee)    body.extra_pax_fee    = Number(form.extra_pax_fee);
  if (form.security_deposit) body.security_deposit = Number(form.security_deposit);
  if (form.cleaning_fee)     body.cleaning_fee     = Number(form.cleaning_fee);
  if (form.min_nights)       body.min_nights       = Number(form.min_nights);
}

function buildResourceBody(form: typeof EMPTY_FORM, workspaceId: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    workspace_id: workspaceId,
    name:         form.name.trim(),
    type:         form.type,
    active:       form.active,
    hourly_rate:  form.hourly_rate ? Number(form.hourly_rate) : 0,
    inclusions:   form.inclusions,
    photos:       form.photos,
    cover_photo:  form.cover_photo || null,
    short_description: form.short_description || null,
    description:       form.description || null,
    check_in_time:     form.check_in_time || null,
    check_out_time:    form.check_out_time || null,
    house_rules:       form.house_rules || null,
  };
  applyOptionalNumericFields(form, body);
  return body;
}

function resourceToForm(r: Resource): typeof EMPTY_FORM {
  return {
    id: r.id, name: r.name, type: r.type,
    capacity:    numStr(r.capacity),
    hourly_rate: String(r.hourly_rate),
    nightly_rate: numStr(r.nightly_rate),
    branch_id:   r.branch_id ?? "",
    active:      r.active,
    short_description: r.short_description ?? "",
    description:       r.description ?? "",
    base_pax:    numStr(r.base_pax, "2"),
    max_pax:     numStr(r.max_pax, "4"),
    extra_pax_fee:    numStr(r.extra_pax_fee),
    security_deposit: numStr(r.security_deposit),
    cleaning_fee:     numStr(r.cleaning_fee),
    check_in_time:  r.check_in_time ?? "15:00",
    check_out_time: r.check_out_time ?? "11:00",
    inclusions:  Array.isArray(r.inclusions) ? r.inclusions : [],
    photos:      Array.isArray(r.photos) ? r.photos : [],
    cover_photo: r.cover_photo ?? "",
    house_rules: r.house_rules ?? "",
    min_nights:  numStr(r.min_nights, "1"),
  };
}

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: "basic",      label: "Basic Info" },
  { key: "photos",     label: "Photos" },
  { key: "pricing",    label: "Pricing" },
  { key: "inclusions", label: "Inclusions" },
  { key: "rules",      label: "Rules" },
];

function renderBasicTab(
  form: typeof EMPTY_FORM,
  branches: Branch[],
  f: (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<FormInputElement>) => void,
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>,
) {
  return (
    <div className="admin-card">
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label htmlFor="res-name">Name *</label>
            <input id="res-name" className="input" value={form.name} onChange={f("name")} placeholder="e.g. Loft 01" required />
          </div>
          <div className="admin-field">
            <label htmlFor="res-type">Type</label>
            <select id="res-type" className="input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as "room" | "amenity" }))}>
              <option value="room">Room</option>
              <option value="amenity">Amenity</option>
            </select>
          </div>
        </div>
        <div className="admin-field">
          <label htmlFor="res-short_description">Tagline / Short description</label>
          <input id="res-short_description" className="input" value={form.short_description} onChange={f("short_description")} placeholder="e.g. Warm wood floors, espresso machine, blackout curtains." />
        </div>
        <div className="admin-field">
          <label htmlFor="res-description">Full description</label>
          <textarea
            id="res-description"
            className="input"
            value={form.description}
            onChange={f("description")}
            placeholder="Describe the room in detail — what makes it special, the view, the vibe, what guests love most."
            rows={5}
            style={{ resize: "vertical" }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label htmlFor="res-branch_id">Branch *</label>
            <select id="res-branch_id" className="input" value={form.branch_id} onChange={f("branch_id")}>
              <option value="" disabled>— Select a branch —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="res-capacity">Capacity</label>
            <input id="res-capacity" className="input" type="number" min="1" value={form.capacity} onChange={f("capacity")} placeholder="e.g. 4" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" id="res-active" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
          <label htmlFor="res-active" style={{ cursor: "pointer", fontSize: 13, color: "var(--text-1)" }}>Active — visible for bookings</label>
        </div>
      </div>
    </div>
  );
}

function renderPhotosTab({
  form, dragActive, uploading, fileInputRef, setDragActive, uploadPhotos, removePhoto, setForm,
}: {
  form: typeof EMPTY_FORM;
  dragActive: boolean;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  setDragActive: (v: boolean) => void;
  uploadPhotos: (files: FileList) => Promise<void>;
  removePhoto: (url: string) => void;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
}) {
  return (
    <div className="admin-card">
      <div style={{ display: "grid", gap: 20 }}>
        <button
          type="button"
          style={{
            border: `2px dashed ${dragActive ? "var(--amber)" : "rgba(var(--tint-rgb), 0.3)"}`, borderRadius: 12,
            padding: "32px 24px", textAlign: "center", cursor: "pointer", width: "100%", font: "inherit", color: "inherit",
            background: dragActive ? "rgba(var(--tint-rgb), 0.12)" : "rgba(var(--tint-rgb), 0.03)",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); if (!dragActive) setDragActive(true); }}
          onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
          onDrop={e => {
            e.preventDefault();
            setDragActive(false);
            const images = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith("image/"));
            if (images.length) {
              const dt = new DataTransfer();
              images.forEach(file => dt.items.add(file));
              uploadPhotos(dt.files);
            }
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
          <div style={{ fontSize: 14, color: "var(--text-1)", fontWeight: 600, marginBottom: 4 }}>
            {uploading ? "Uploading…" : dragActive ? "Drop photos to upload" : "Click or drag photos here"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            JPG, PNG, WebP · Multiple files supported · First photo becomes cover
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={e => { if (e.target.files?.length) uploadPhotos(e.target.files); }}
        />
        {form.photos.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
              Gallery · {form.photos.length} photo{form.photos.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {form.photos.map(url => (
                <div key={url} className="res-photo-tile" style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: form.cover_photo === url ? "2px solid var(--amber)" : "2px solid transparent" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }} />
                  <div className="res-photo-overlay">
                    <div style={{ position: "absolute", top: 6, right: 6 }}>
                      <button type="button" onClick={() => removePhoto(url)}
                        style={{ background: "rgba(255,80,80,0.9)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 12, padding: "3px 8px" }}>
                        ✕
                      </button>
                    </div>
                    <div style={{ position: "absolute", bottom: 6, left: 6 }}>
                      <button type="button" onClick={() => setForm(p => ({ ...p, cover_photo: url }))}
                        style={{ background: form.cover_photo === url ? "var(--amber)" : "rgba(0,0,0,0.7)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, padding: "3px 8px" }}>
                        {form.cover_photo === url ? "★ Cover" : "Set cover"}
                      </button>
                    </div>
                  </div>
                  {form.cover_photo === url && (
                    <div style={{ position: "absolute", top: 6, left: 6, background: "var(--amber)", borderRadius: 6, fontSize: 10, color: "#000", padding: "2px 6px", fontWeight: 700 }}>COVER</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderPricingTab(
  form: typeof EMPTY_FORM,
  f: (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<FormInputElement>) => void,
) {
  return (
    <div className="admin-card">
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ padding: "10px 14px", background: "rgba(var(--tint-rgb), 0.06)", border: "1px solid rgba(var(--tint-rgb), 0.15)", borderRadius: 10, fontSize: 13, color: "var(--text-2)" }}>
          For staycation rooms, set the <strong>Nightly Rate</strong> as your primary price. Hourly rate is optional (for coworking / day-use).
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label htmlFor="res-nightly_rate">Nightly Rate (₱) — primary</label>
            <input id="res-nightly_rate" className="input" type="number" min="0" step="0.01" value={form.nightly_rate} onChange={f("nightly_rate")} placeholder="e.g. 3800" />
          </div>
          <div className="admin-field">
            <label htmlFor="res-hourly_rate">Hourly Rate (₱) — optional</label>
            <input id="res-hourly_rate" className="input" type="number" min="0" step="0.01" value={form.hourly_rate} onChange={f("hourly_rate")} placeholder="e.g. 500" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label htmlFor="res-base_pax">Base pax (included)</label>
            <input id="res-base_pax" className="input" type="number" min="1" value={form.base_pax} onChange={f("base_pax")} placeholder="e.g. 2" />
          </div>
          <div className="admin-field">
            <label htmlFor="res-max_pax">Max pax</label>
            <input id="res-max_pax" className="input" type="number" min="1" value={form.max_pax} onChange={f("max_pax")} placeholder="e.g. 4" />
          </div>
          <div className="admin-field">
            <label htmlFor="res-extra_pax_fee">Extra pax fee (₱/person)</label>
            <input id="res-extra_pax_fee" className="input" type="number" min="0" step="0.01" value={form.extra_pax_fee} onChange={f("extra_pax_fee")} placeholder="e.g. 500" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label htmlFor="res-security_deposit">Security deposit (₱)</label>
            <input id="res-security_deposit" className="input" type="number" min="0" step="0.01" value={form.security_deposit} onChange={f("security_deposit")} placeholder="Optional" />
          </div>
          <div className="admin-field">
            <label htmlFor="res-cleaning_fee">Cleaning fee (₱)</label>
            <input id="res-cleaning_fee" className="input" type="number" min="0" step="0.01" value={form.cleaning_fee} onChange={f("cleaning_fee")} placeholder="Optional" />
          </div>
          <div className="admin-field">
            <label htmlFor="res-min_nights">Minimum nights</label>
            <input id="res-min_nights" className="input" type="number" min="1" value={form.min_nights} onChange={f("min_nights")} placeholder="1" />
          </div>
        </div>
      </div>
    </div>
  );
}

function renderInclusionsTab(
  form: typeof EMPTY_FORM,
  customInclusion: string,
  setCustomInclusion: (v: string) => void,
  toggleInclusion: (item: string) => void,
  addCustomInclusion: () => void,
) {
  return (
    <div className="admin-card">
      <div style={{ display: "grid", gap: 20 }}>
        <div>
          <div style={{ fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
            Standard inclusions — tap to toggle
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PRESET_INCLUSIONS.map(item => {
              const on = form.inclusions.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleInclusion(item)}
                  style={{
                    padding: "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: "1px solid",
                    borderColor: on ? "var(--amber)" : "rgba(var(--tint-rgb), 0.15)",
                    background: on ? "rgba(var(--tint-rgb), 0.12)" : "transparent",
                    color: on ? "var(--amber-bright)" : "var(--text-2)",
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  {on ? "✓ " : ""}{item}
                </button>
              );
            })}
          </div>
        </div>
        {form.inclusions.filter(i => !PRESET_INCLUSIONS.includes(i)).length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
              Custom inclusions
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {form.inclusions.filter(i => !PRESET_INCLUSIONS.includes(i)).map(item => (
                <span key={item} style={{
                  padding: "6px 12px", borderRadius: 20, fontSize: 13,
                  background: "rgba(var(--tint-rgb), 0.12)", border: "1px solid var(--amber)",
                  color: "var(--amber-bright)", display: "flex", gap: 8, alignItems: "center",
                }}>
                  {item}
                  <button type="button" onClick={() => toggleInclusion(item)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
            Add custom inclusion
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              value={customInclusion}
              onChange={e => setCustomInclusion(e.target.value)}
              placeholder="e.g. Private rooftop access"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomInclusion(); } }}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-primary" onClick={addCustomInclusion} style={{ fontSize: 13, padding: "10px 20px" }}>
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderRulesTab(
  form: typeof EMPTY_FORM,
  f: (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<FormInputElement>) => void,
) {
  return (
    <div className="admin-card">
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="admin-field">
            <label htmlFor="res-check_in_time">Check-in time</label>
            <input id="res-check_in_time" className="input" type="time" value={form.check_in_time} onChange={f("check_in_time")} />
          </div>
          <div className="admin-field">
            <label htmlFor="res-check_out_time">Check-out time</label>
            <input id="res-check_out_time" className="input" type="time" value={form.check_out_time} onChange={f("check_out_time")} />
          </div>
        </div>
        <div className="admin-field">
          <label htmlFor="res-house_rules">House rules</label>
          <textarea
            id="res-house_rules"
            className="input"
            value={form.house_rules}
            onChange={f("house_rules")}
            placeholder={"• No smoking inside the room\n• Quiet hours: 10 PM – 7 AM\n• No pets\n• No parties or events\n• Cancellation: 48 hours notice for full refund"}
            rows={7}
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
        <div style={{ padding: "12px 16px", background: "rgba(var(--tint-rgb), 0.05)", border: "1px solid rgba(var(--tint-rgb), 0.15)", borderRadius: 10, fontSize: 13, color: "var(--text-2)" }}>
          💡 Tip: the 48-hour cancellation policy is applied workspace-wide from Settings. Add any room-specific rules here.
        </div>
      </div>
    </div>
  );
}

function renderFilterLabel(f: Filter, resources: Resource[]): string {
  if (f === "all")     return `All (${resources.length})`;
  if (f === "room")    return `Rooms (${resources.filter(r => r.type === "room").length})`;
  return `Amenities (${resources.filter(r => r.type === "amenity").length})`;
}

async function invokeUpsertResource(
  supabase: ReturnType<typeof supabaseBrowser>,
  form: typeof EMPTY_FORM,
  workspaceId: string,
): Promise<string | null> {
  const body = buildResourceBody(form, workspaceId);
  const { error: fnErr } = await supabase.functions.invoke("resources-upsert", { body });
  if (fnErr) return extractErrMsg(await withFnBody(fnErr));
  return null;
}

async function invokeToggleResource(
  supabase: ReturnType<typeof supabaseBrowser>,
  workspaceId: string,
  resourceId: string,
  active: boolean,
): Promise<string | null> {
  const { error } = await supabase.functions.invoke("resources-toggle", {
    body: { workspace_id: workspaceId, resource_id: resourceId, active },
  });
  if (error) return extractErrMsg(error);
  return null;
}

export function ResourcesClient({
  initialResources,
  branches,
  workspaceId,
}: {
  initialResources: Resource[];
  branches: Branch[];
  workspaceId: string;
}) {
  const [resources, setResources]   = useState<Resource[]>(initialResources);
  const [filter, setFilter]         = useState<Filter>("all");
  const [editing, setEditing]       = useState<Resource | null>(null);
  const [isNew, setIsNew]           = useState(false);
  const [tab, setTab]               = useState<Tab>("basic");
  const [form, setForm]             = useState(EMPTY_FORM);
  const [error, setError]           = useState("");
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading]   = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [customInclusion, setCustomInclusion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase     = supabaseBrowser();

  async function reload() {
    const { data } = await supabase.functions.invoke("admin-data", {
      body: { workspace_id: workspaceId, resource: "resources" },
    });
    if (data?.resources) setResources(data.resources as Resource[]);
  }

  function openAdd() {
    // branch_id is required by the DB — pre-select when there's only one
    // branch so the common single-location workspace needs no extra click.
    setForm({ ...EMPTY_FORM, branch_id: branches.length === 1 ? branches[0].id : "" });
    setIsNew(true);
    setEditing(null);
    setTab("basic");
    setError("");
  }

  function openEdit(r: Resource) {
    setForm(resourceToForm(r));
    setIsNew(false);
    setEditing(r);
    setTab("basic");
    setError("");
  }

  function closeEdit() {
    setEditing(null);
    setIsNew(false);
    setError("");
  }

  function f(k: keyof typeof form) { return (e: React.ChangeEvent<FormInputElement>) => setForm(p => ({ ...p, [k]: e.target.value })); }

  async function uploadPhotos(files: FileList) {
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `${workspaceId}/${form.id || "new"}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`; // NOSONAR - non-security randomness
      const { data, error: upErr } = await supabase.storage.from("room-photos").upload(path, file, { upsert: true });
      if (upErr) { setError(extractErrMsg(upErr)); continue; }
      const { data: { publicUrl } } = supabase.storage.from("room-photos").getPublicUrl(data.path);
      urls.push(publicUrl);
    }
    setForm(p => ({
      ...p,
      photos: [...p.photos, ...urls],
      cover_photo: p.cover_photo || urls[0] || p.cover_photo,
    }));
    setUploading(false);
  }

  function removePhoto(url: string) {
    setForm(p => ({
      ...p,
      photos: p.photos.filter(u => u !== url),
      cover_photo: p.cover_photo === url ? (p.photos.find(u => u !== url) ?? "") : p.cover_photo,
    }));
  }

  function toggleInclusion(item: string) {
    setForm(p => ({
      ...p,
      inclusions: p.inclusions.includes(item)
        ? p.inclusions.filter(i => i !== item)
        : [...p.inclusions, item],
    }));
  }

  function addCustomInclusion() {
    const v = customInclusion.trim();
    if (!v || form.inclusions.includes(v)) return;
    setForm(p => ({ ...p, inclusions: [...p.inclusions, v] }));
    setCustomInclusion("");
  }

  const hasPrice = Number(form.hourly_rate) > 0 || Number(form.nightly_rate) > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); setTab("basic"); return; }
    if (!form.branch_id)   { setError("Please select a branch."); setTab("basic"); return; }
    if (!hasPrice)          { setError("Set a nightly or hourly rate."); setTab("pricing"); return; }
    startTransition(async () => {
      setError("");
      const errMsg = await invokeUpsertResource(supabase, form, workspaceId);
      if (errMsg) { setError(errMsg); return; }
      await reload();
      closeEdit();
    });
  }

  function handleToggle(r: Resource) {
    startTransition(async () => {
      const errMsg = await invokeToggleResource(supabase, workspaceId, r.id, !r.active);
      if (errMsg) { setError(errMsg); return; }
      await reload();
    });
  }

  async function handleDelete(r: Resource) {
    const errMsg = await invokeToggleResource(supabase, workspaceId, r.id, false);
    if (errMsg) { setError(errMsg); return; }
    await reload();
  }

  const filtered = filter === "all" ? resources : resources.filter(r => r.type === filter);
  const showEdit  = editing !== null || isNew;

  // ── Edit view ────────────────────────────────────────────────────────────────
  if (showEdit) {
    return (
      <>
        <div className="admin-header">
          <div>
            <h1>{isNew ? "New Resource" : form.name}</h1>
            <div className="sub">
              {!isNew && `${form.type} · ${branches.find(b => b.id === form.branch_id)?.name ?? "All branches"} · ${form.active ? "Active" : "Inactive"}`}
            </div>
          </div>
          <button className="btn" style={{ fontSize: 13, padding: "10px 20px" }} onClick={closeEdit}>
            ← Back to list
          </button>
        </div>

        <div className="admin-body">
          <form onSubmit={handleSubmit}>
            {/* Tab nav */}
            <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid var(--line)", paddingBottom: 0 }}>
              {TAB_LABELS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: "10px 18px", fontSize: 13, background: "none", border: "none",
                    borderBottom: tab === t.key ? "2px solid var(--amber)" : "2px solid transparent",
                    color: tab === t.key ? "var(--amber)" : "var(--text-3)",
                    cursor: "pointer", fontFamily: "var(--f-mono)", letterSpacing: "0.06em",
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                  {t.key === "photos" && form.photos.length > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "var(--amber-bright)", background: "rgba(var(--tint-rgb), 0.15)", padding: "1px 6px", borderRadius: 10 }}>
                      {form.photos.length}
                    </span>
                  )}
                  {t.key === "inclusions" && form.inclusions.length > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "var(--amber-bright)", background: "rgba(var(--tint-rgb), 0.15)", padding: "1px 6px", borderRadius: 10 }}>
                      {form.inclusions.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── BASIC INFO ── */}
            {tab === "basic" && renderBasicTab(form, branches, f, setForm)}

            {/* ── PHOTOS ── */}
            {tab === "photos" && renderPhotosTab({ form, dragActive, uploading, fileInputRef, setDragActive, uploadPhotos, removePhoto, setForm })}

            {/* ── PRICING ── */}
            {tab === "pricing" && renderPricingTab(form, f)}

            {/* ── INCLUSIONS ── */}
            {tab === "inclusions" && renderInclusionsTab(form, customInclusion, setCustomInclusion, toggleInclusion, addCustomInclusion)}

            {/* ── RULES ── */}
            {tab === "rules" && renderRulesTab(form, f)}

            {/* Error + Save */}
            {error && (
              <div style={{ padding: 12, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 8, fontSize: 13, color: "var(--err)", marginTop: 16 }}>
                {error}
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 16 }}>* Required</div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <ConfirmSubmitButton
                className="btn btn-primary"
                disabled={isPending || uploading || !form.name.trim() || !form.branch_id || !hasPrice}
                style={{ fontSize: 13, padding: "10px 28px" }}
                title={isNew ? "Create this resource?" : "Save changes to this resource?"}
                confirmLabel={isNew ? "Create resource" : "Save changes"}
              >
                {isPending ? "Saving…" : isNew ? "Create resource" : "Save changes"}
              </ConfirmSubmitButton>
              <button className="btn" type="button" onClick={closeEdit} style={{ fontSize: 13, padding: "10px 20px" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Bookable Resources</h1>
          <div className="sub">{resources.length} total · {resources.filter(r => r.active).length} active</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 13, padding: "10px 20px" }} onClick={openAdd}>
          + Add resource
        </button>
      </div>

      <div className="admin-body">
        <div className="admin-table-wrap">
          <div className="admin-table-head">
            <h2>All Resources</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {(["all", "room", "amenity"] as Filter[]).map(f => (
                <button key={f} className={`btn-xs ${filter === f ? "primary" : ""}`}
                  onClick={() => setFilter(f)} style={{ textTransform: "capitalize" }}>
                  {renderFilterLabel(f, resources)}
                </button>
              ))}
            </div>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Guests</th>
                <th>Nightly</th>
                <th>Hourly</th>
                <th>Branch</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="empty">No resources found</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
                  <td>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {/* Cover photo thumbnail */}
                      <div style={{
                        width: 52, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                        background: "rgba(var(--tint-rgb), 0.06)", border: "1px solid rgba(var(--tint-rgb), 0.1)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {r.cover_photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.cover_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: 18 }}>🏠</span>
                        )}
                      </div>
                      <div>
                        <div className="bold">{r.name}</div>
                        <div className="dim" style={{ fontSize: 11 }}>
                          <span className={`pill ${r.type === "room" ? "info" : "neutral"}`} style={{ fontSize: 10 }}>{r.type}</span>
                          {r.short_description && <span style={{ marginLeft: 6 }}>{r.short_description.slice(0, 40)}{r.short_description.length > 40 ? "…" : ""}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="dim">
                    {r.base_pax ? `${r.base_pax} base` : "—"}
                    {r.max_pax ? ` / ${r.max_pax} max` : ""}
                    {r.extra_pax_fee ? <div style={{ fontSize: 11, color: "var(--text-3)" }}>{peso(r.extra_pax_fee)}/extra</div> : null}
                  </td>
                  <td className="bold">{r.nightly_rate ? `${peso(r.nightly_rate)}/night` : "—"}</td>
                  <td className="dim">{r.hourly_rate ? `${peso(r.hourly_rate)}/hr` : "—"}</td>
                  <td className="dim">{r.branches?.name ?? "All"}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className={`pill ${r.active ? "ok" : "neutral"}`}>{r.active ? "Active" : "Inactive"}</span>
                      {r.photos.length > 0 && <span style={{ fontSize: 10, color: "var(--text-3)" }}>📷 {r.photos.length} photo{r.photos.length !== 1 ? "s" : ""}</span>}
                    </div>
                  </td>
                  <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button className="btn-xs" onClick={() => openEdit(r)} disabled={isPending}>Edit</button>
                    <button className={`btn-xs ${r.active ? "danger" : "primary"}`} onClick={() => handleToggle(r)} disabled={isPending}>
                      {r.active ? "Deactivate" : "Activate"}
                    </button>
                    <ConfirmActionButton
                      className="btn-xs danger"
                      tone="danger"
                      title={`Delete "${r.name}"?`}
                      body="This removes the resource from booking. This cannot be undone."
                      confirmLabel="Delete"
                      action={() => handleDelete(r)}
                    >
                      Delete
                    </ConfirmActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

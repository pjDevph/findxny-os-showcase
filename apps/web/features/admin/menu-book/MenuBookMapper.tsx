"use client";

import {
  useState, useRef, useEffect, useCallback, ChangeEvent,
} from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { extractErrMsg } from "@/lib/errors";

/* ─── Types ─────────────────────────────────────────────────────── */
export type AdminProduct = { id: string; name: string; price: number; cat: string; active?: boolean };

type MenuPage = {
  id: number;            // matches page_no on the server
  label: string;
  fileName: string;
  imageDataUrl: string;  // renderable URL (data: URL for newly uploaded; public URL for saved)
  imagePath?: string | null; // server storage path; cleared when a new image is picked
};

type ShapeType = "rect" | "square" | "ellipse" | "circle" | "freehand";

type Hotspot = {
  x: number; y: number; w: number; h: number;   // bounding box (% of image)
  shape?: ShapeType;                              // undefined = "rect" (legacy)
  points?: Array<{ x: number; y: number }>;      // freehand polygon vertices (%)
  blendColor?: string;                            // auto-sampled accent color
  name: string; price: number; cat: string;
  productId?: string;
};

type HotspotMap = Record<number, Hotspot[]>;

type DrawState = {
  sx: number; sy: number;
  box: HTMLDivElement;
  wrap: HTMLDivElement;
} | null;

/* ─── Saved (server-side) shape ──────────────────────────────────── */
export type SavedMenuBook = {
  pages: {
    page_no: number;
    label: string;
    file_name: string | null;
    image_path: string | null;
    image_url: string | null;
  }[];
  hotspots: {
    page_no: number;
    shape: ShapeType;
    x: number; y: number; w: number; h: number;
    points: { x: number; y: number }[] | null;
    blend_color: string | null;
    name: string;
    price: number;
    cat: string | null;
    product_id: string | null;
  }[];
};

type SavePayload = {
  pages:    { page_no: number; label: string; file_name?: string | null; image_path?: string | null }[];
  hotspots: {
    page_no: number;
    shape: ShapeType;
    x: number; y: number; w: number; h: number;
    points?: { x: number; y: number }[] | null;
    blend_color?: string | null;
    name: string;
    price: number;
    cat?: string | null;
    product_id?: string | null;
  }[];
};

/* ─── Helpers ────────────────────────────────────────────────────── */
const peso = (n: number) => `₱${Number(n).toLocaleString("en-PH")}`;

const DEFAULT_PAGES: Omit<MenuPage, "id" | "imageDataUrl">[] = [
  { label: "Cover",       fileName: "1.png"  },
  { label: "Frappes",     fileName: "2.png"  },
  { label: "Lattes",      fileName: "3.png"  },
  { label: "Signature",   fileName: "4.png"  },
  { label: "Milktea",     fileName: "5.png"  },
  { label: "Hot Drinks",  fileName: "6.png"  },
  { label: "Add-ons",     fileName: "7.png"  },
  { label: "Sea Salt",    fileName: "8.png"  },
  { label: "Fruity Soda", fileName: "9.png"  },
  { label: "Matcha",      fileName: "10.png" },
  { label: "City Blend",  fileName: "11.png" },
  { label: "Pure Origin", fileName: "12.png" },
];

/* ─── Inline SVG Icons ───────────────────────────────────────────── */
function IcoPages()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>; }
function IcoTarget()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>; }
function IcoEye()      { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function IcoDownload() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
function IcoSave()     { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>; }
function IcoCheck()    { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>; }
function IcoPencil()   { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function IcoPin()      { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>; }
function IcoTrash()    { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function IcoImage()    { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>; }
function IcoImageSm()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>; }
function IcoCopy()     { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>; }
function IcoDraw()     { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>; }
function IcoCursor()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>; }
function IcoLink()     { return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>; }
function IcoWarn()     { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IcoStar()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function IcoBook()     { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>; }
function IcoDragHandle()   { return <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>; }
function IcoShapeRect()    { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>; }
function IcoShapeSquare()  { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>; }
function IcoShapeEllipse() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>; }
function IcoShapeCircle()  { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>; }
function IcoShapeFree()    { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20 C4 20 6 6 12 6 S18 14 20 12"/><circle cx="4" cy="20" r="1.5" fill="currentColor"/><circle cx="20" cy="12" r="1.5" fill="currentColor"/></svg>; }

/* ─── Storage upload helper ─────────────────────────────────────── */
// Uploads a data: URL to the menu-book bucket and returns the storage path.
// The bucket's RLS policy only allows owner/admin/manager writes, matching
// the server-side guard on menu-book-upsert.
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function uploadPageImage(workspaceId: string, pageNo: number, dataUrl: string): Promise<string> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Invalid image data URL");
  const mime = m[1] || "image/jpeg";
  if (!ALLOWED_MIME.has(mime)) throw new Error("Only JPEG, PNG, or WebP images are allowed");
  const bin = atob(m[2]);
  if (bin.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds 5 MB limit");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  // Include a timestamp so old CDN caches don't serve a stale image
  const path = `${workspaceId}/${pageNo}-${Date.now()}.${ext}`;
  const sb = supabaseBrowser();
  const { error } = await sb.storage.from("menu-book").upload(path, bytes, {
    contentType: mime, upsert: true,
  });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return path;
}

/* ─── Private helpers (extracted to reduce cognitive complexity) ──── */

function buildHotspotMapFromInitial(
  initialHotspots: SavedMenuBook["hotspots"],
  allProductIds: Set<string>,
): HotspotMap {
  const map: HotspotMap = {};
  for (const h of initialHotspots) {
    if (h.product_id && allProductIds.size > 0 && !allProductIds.has(h.product_id)) continue;
    map[h.page_no] ||= [];
    map[h.page_no].push({
      x: h.x, y: h.y, w: h.w, h: h.h,
      shape: h.shape,
      points: h.points ?? undefined,
      blendColor: h.blend_color ?? undefined,
      name: h.name,
      price: h.price,
      cat: h.cat ?? "",
      productId: h.product_id ?? undefined,
    });
  }
  return map;
}

function buildSavePayloadPages(updated: MenuPage[]): SavePayload["pages"] {
  return updated.map(p => ({
    page_no:    p.id,
    label:      p.label,
    file_name:  p.fileName || null,
    image_path: p.imagePath ?? null,
  }));
}

function buildSavePayloadHotspots(hotspots: HotspotMap): SavePayload["hotspots"] {
  return Object.entries(hotspots).flatMap(([pageNo, list]) =>
    list.map(h => ({
      page_no:     Number(pageNo),
      shape:       h.shape ?? "rect",
      x: h.x, y: h.y, w: h.w, h: h.h,
      points:      h.points ?? null,
      blend_color: h.blendColor ?? null,
      name:        h.name,
      price:       h.price,
      cat:         h.cat || null,
      product_id:  h.productId ?? null,
    })),
  );
}

function offsetFreehandPoints(
  points: Array<{ x: number; y: number }>,
  ddx: number,
  ddy: number,
): Array<{ x: number; y: number }> {
  return points.map(p => ({ x: +(p.x + ddx).toFixed(2), y: +(p.y + ddy).toFixed(2) }));
}

function scaleFreehandPoints(
  points: Array<{ x: number; y: number }>,
  originX: number,
  originY: number,
  scaleX: number,
  scaleY: number,
  nx: number,
  ny: number,
): Array<{ x: number; y: number }> {
  return points.map(p => ({
    x: +(nx + (p.x - originX) * scaleX).toFixed(2),
    y: +(ny + (p.y - originY) * scaleY).toFixed(2),
  }));
}

function applyRectResizeToHotspotList(
  list: Hotspot[],
  idx: number,
  nx: number, ny: number, nw: number, nh: number,
): Hotspot[] {
  const updated = [...list];
  updated[idx] = { ...updated[idx], x: +nx.toFixed(2), y: +ny.toFixed(2), w: +nw.toFixed(2), h: +nh.toFixed(2) };
  return updated;
}

function applyFreehandOrPlainDragMove(
  prev: HotspotMap,
  pageId: number,
  idx: number,
  shape: ShapeType,
  newX: number,
  newY: number,
): HotspotMap {
  const list = [...(prev[pageId] ?? [])];
  const cur = list[idx];
  if (shape === "freehand" && cur.points) {
    const ddx = newX - cur.x;
    const ddy = newY - cur.y;
    list[idx] = { ...cur, x: +newX.toFixed(2), y: +newY.toFixed(2), points: offsetFreehandPoints(cur.points, ddx, ddy) };
  } else {
    list[idx] = { ...cur, x: +newX.toFixed(2), y: +newY.toFixed(2) };
  }
  return { ...prev, [pageId]: list };
}

type ResizeHandleKey = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

type ResizeState = {
  sx: number; sy: number; ox: number; oy: number; ow: number; oh: number;
  idx: number; handle: string; bW: number; bH: number;
};

function computeResizedBounds(
  r: ResizeState,
  hk: ResizeHandleKey,
  clientX: number,
  clientY: number,
): { nx: number; ny: number; nw: number; nh: number } {
  const ddx = (clientX - r.sx) / r.bW * 100;
  const ddy = (clientY - r.sy) / r.bH * 100;
  let nx = r.ox, ny = r.oy, nw = r.ow, nh = r.oh;
  if (hk.includes("w")) { nx = r.ox + ddx; nw = r.ow - ddx; }
  if (hk.includes("e")) { nw = r.ow + ddx; }
  if (hk.includes("n")) { ny = r.oy + ddy; nh = r.oh - ddy; }
  if (hk.includes("s")) { nh = r.oh + ddy; }
  if (nw < 2) { if (hk.includes("w")) { nx = r.ox + r.ow - 2; } nw = 2; }
  if (nh < 2) { if (hk.includes("n")) { ny = r.oy + r.oh - 2; } nh = 2; }
  nx = Math.max(0, nx); ny = Math.max(0, ny);
  nw = Math.min(100 - nx, nw); nh = Math.min(100 - ny, nh);
  return { nx, ny, nw, nh };
}

function applyFreehandResizeToHotspotList({
  prev, pageId, idx, shape, nx, ny, nw, nh,
}: {
  prev: HotspotMap;
  pageId: number;
  idx: number;
  shape: ShapeType;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}): HotspotMap {
  const list = [...(prev[pageId] ?? [])];
  const cur = list[idx];
  if (shape === "freehand" && cur.points && cur.w > 0 && cur.h > 0) {
    const scaleX = nw / cur.w;
    const scaleY = nh / cur.h;
    list[idx] = {
      ...cur,
      x: +nx.toFixed(2), y: +ny.toFixed(2), w: +nw.toFixed(2), h: +nh.toFixed(2),
      points: scaleFreehandPoints(cur.points, cur.x, cur.y, scaleX, scaleY, nx, ny),
    };
  } else {
    list[idx] = { ...cur, x: +nx.toFixed(2), y: +ny.toFixed(2), w: +nw.toFixed(2), h: +nh.toFixed(2) };
  }
  return { ...prev, [pageId]: list };
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export function MenuBookMapper({
  products,
  workspaceId,
  initial,
  saveAction,
}: {
  products: AdminProduct[];
  workspaceId: string;
  initial: SavedMenuBook;
  saveAction: (payload: SavePayload) => Promise<void>;
}) {
  const [pages,       setPages]       = useState<MenuPage[]>([]);
  const [hotspots,    setHotspots]    = useState<HotspotMap>({});
  const [selPageId,   setSelPageId]   = useState<number | null>(null);
  const [tab,         setTab]         = useState<"pages" | "hotspots" | "preview" | "export">("pages");
  const [drawMode,    setDrawMode]    = useState(false);
  const [pendingRect, setPendingRect] = useState<Omit<Hotspot,"name"|"price"|"cat"|"productId"> | null>(null);
  const [showHsModal, setShowHsModal] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);
  const [editPageId,  setEditPageId]  = useState<number | null>(null);
  const [saved,       setSaved]       = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  // Preview state
  const [prevIdx, setPrevIdx] = useState(0);

  // Drag-to-reorder + drag-to-upload state
  const [dragPageId, setDragPageId] = useState<number | null>(null); // page being dragged for reorder
  const [dragOverId, setDragOverId] = useState<number | null>(null); // drop target card
  const [fileDropId, setFileDropId] = useState<number | null>(null); // -1 = "add page" card

  // Shape drawing state
  const [shapeType,      setShapeType]      = useState<ShapeType>("rect");
  const [selHsIdx,       setSelHsIdx]       = useState<number | null>(null); // selected hotspot index
  const [freehandPts,    setFreehandPts]    = useState<Array<{ x: number; y: number }>>([]);
  const imgRef = useRef<HTMLImageElement | null>(null); // for color sampling

  // Zoom + pan state
  const [zoom,  setZoom]  = useState(1.0);
  const [panX,  setPanX]  = useState(0);
  const [panY,  setPanY]  = useState(0);
  const panRef  = useRef<{ sx: number; sy: number; ox: number; oy: number; active: boolean } | null>(null);
  // Synced refs so pointer handlers never read stale state
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  panXRef.current = panX;
  panYRef.current = panY;

  // Hotspot drag state
  const hsDragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; idx: number; moved: boolean; bW: number; bH: number } | null>(null);

  // Hotspot resize state
  const hsResizeRef = useRef<{ sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; idx: number; handle: string; bW: number; bH: number } | null>(null);

  // Modal form fields
  const [hsName,  setHsName]  = useState("");
  const [hsPrice, setHsPrice] = useState("");
  const [hsCat,   setHsCat]   = useState("");
  const [hsSel,   setHsSel]   = useState("");
  const [hsProdId,setHsProdId]= useState("");

  const [pgLabel,  setPgLabel]  = useState("");
  const [pgFile,   setPgFile]   = useState("");
  const [pgImgSrc, setPgImgSrc] = useState("");

  const nextId    = useRef(1);
  const drawRef   = useRef<DrawState>(null);
  const imgWrapRef = useRef<HTMLDivElement | null>(null);

  /* ── Load from server-provided initial config ── */
  useEffect(() => {
    const allProductIds = new Set(products.map(p => p.id));

    if (initial.pages.length === 0 && initial.hotspots.length === 0) {
      initDefaults();
      return;
    }

    const loadedPages: MenuPage[] = initial.pages.map(p => ({
      id:           p.page_no,
      label:        p.label,
      fileName:     p.file_name ?? "",
      imageDataUrl: p.image_url ?? "",
      imagePath:    p.image_path,
    }));
    loadedPages.forEach(p => { nextId.current = Math.max(nextId.current, p.id + 1); });
    setPages(loadedPages);

    const map = buildHotspotMapFromInitial(initial.hotspots, allProductIds);
    setHotspots(map);
    if (loadedPages.length) setSelPageId(loadedPages[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initDefaults() {
    const built: MenuPage[] = DEFAULT_PAGES.map(d => ({
      id: nextId.current++, label: d.label, fileName: d.fileName, imageDataUrl: "",
    }));
    setPages(built);
    const hs: HotspotMap = {};
    built.forEach(p => { hs[p.id] = []; });
    setHotspots(hs);
    setSelPageId(built[0]?.id ?? null);
  }

  /* ── Save — upload new images to Storage, then persist via server action ── */
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return;
    if (!workspaceId) {
      setSaveError("No workspace — sign in to save.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // 1. Upload any pages whose image is a fresh data: URL (no server path yet).
      const updated: MenuPage[] = [];
      for (const p of pages) {
        const isLocal = p.imageDataUrl.startsWith("data:");
        if (isLocal) {
          const path = await uploadPageImage(workspaceId, p.id, p.imageDataUrl);
          updated.push({ ...p, imagePath: path });
        } else {
          updated.push(p);
        }
      }

      // 2. Build payload and call the server action.
      const payload: SavePayload = {
        pages:    buildSavePayloadPages(updated),
        hotspots: buildSavePayloadHotspots(hotspots),
      };
      await saveAction(payload);

      // 3. Local state catches up with the server (image_path now persisted).
      setPages(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(extractErrMsg(err));
    } finally {
      setSaving(false);
    }
  }

  /* ── Derived ── */
  const selPage    = pages.find(p => p.id === selPageId) ?? null;
  const selPageIdx = pages.findIndex(p => p.id === selPageId);
  const selHs   = selPageId !== null ? (hotspots[selPageId] ?? []) : [];
  const totalHs = Object.values(hotspots).reduce((s, a) => s + a.length, 0);
  const pagesWithImg = pages.filter(p => p.imageDataUrl).length;
  const pagesWithHs  = pages.filter(p => (hotspots[p.id]?.length ?? 0) > 0).length;
  const linkedHs = Object.values(hotspots).flat().filter(h => h.productId).length;

  // Page navigation helpers
  function prevPageNav() {
    if (selPageIdx > 0) setSelPageId(pages[selPageIdx - 1].id);
  }
  function nextPageNav() {
    if (selPageIdx < pages.length - 1) setSelPageId(pages[selPageIdx + 1].id);
  }

  // Zoom helpers
  function zoomIn()    { setZoom(z => Math.min(4, +(z + 0.25).toFixed(2))); }
  function zoomOut()   { setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2))); }
  function zoomReset() { setZoom(1); }
  function resetView() { setZoom(1); setPanX(0); setPanY(0); }

  // Progress: step 1 = any images, step 2 = all images, step 3 = any tap areas, step 4 = all linked
  const step1Done = pagesWithImg > 0;
  const step2Done = pages.length > 0 && pagesWithImg === pages.length;
  const step3Done = totalHs > 0;
  const step4Done = totalHs > 0 && linkedHs === totalHs;
  const stepsComplete = [step1Done, step2Done, step3Done, step4Done].filter(Boolean).length;
  const progressPct = pages.length === 0 ? 0 : Math.round((stepsComplete / 4) * 100);

  /* ── Page reorder + direct image set ── */
  function reorderPages(fromId: number, toId: number) {
    setPages(prev => {
      const arr = [...prev];
      const fi = arr.findIndex(p => p.id === fromId);
      const ti = arr.findIndex(p => p.id === toId);
      if (fi < 0 || ti < 0 || fi === ti) return prev;
      const [item] = arr.splice(fi, 1);
      arr.splice(ti, 0, item);
      return arr;
    });
  }
  function setPageImage(pageId: number, src: string, fileName?: string) {
    setPages(prev => prev.map(p =>
      p.id === pageId ? { ...p, imageDataUrl: src, fileName: fileName || p.fileName, imagePath: null } : p
    ));
  }
  function addPageFromFile(file: File) {
    handleImageFile(file, src => {
      const id = nextId.current++;
      const label = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setPages(prev => [...prev, { id, label, fileName: file.name, imageDataUrl: src, imagePath: null }]);
      setHotspots(prev => ({ ...prev, [id]: [] }));
    });
  }

  /* ── Hotspot helpers ── */
  function updateHs(pageId: number, list: Hotspot[]) {
    setHotspots(prev => ({ ...prev, [pageId]: list }));
  }
  function deleteHs(idx: number) {
    if (selPageId === null) return;
    updateHs(selPageId, selHs.filter((_, i) => i !== idx));
  }

  /* ── Page CRUD ── */
  function openAddPage() {
    setEditPageId(null); setPgLabel(""); setPgFile(""); setPgImgSrc("");
    setShowAddPage(true);
  }
  function openEditPage(p: MenuPage) {
    setEditPageId(p.id); setPgLabel(p.label); setPgFile(p.fileName); setPgImgSrc(p.imageDataUrl);
    setShowAddPage(true);
  }
  function savePage() {
    if (!pgLabel.trim()) return;
    if (editPageId !== null) {
      setPages(prev => prev.map(p => {
        if (p.id !== editPageId) return p;
        // If the user picked a new image, drop the server path so save() re-uploads.
        const pickedNew = !!pgImgSrc && pgImgSrc !== p.imageDataUrl;
        return {
          ...p,
          label: pgLabel,
          fileName: pgFile,
          imageDataUrl: pgImgSrc || p.imageDataUrl,
          imagePath: pickedNew ? null : p.imagePath,
        };
      }));
    } else {
      const id = nextId.current++;
      setPages(prev => [...prev, { id, label: pgLabel, fileName: pgFile, imageDataUrl: pgImgSrc, imagePath: null }]);
      setHotspots(prev => ({ ...prev, [id]: [] }));
    }
    setShowAddPage(false);
  }
  function deletePage(id: number) {
    if (!confirm("Delete this page and all its tap areas?")) return;
    setPages(prev => prev.filter(p => p.id !== id));
    setHotspots(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (selPageId === id) setSelPageId(pages.find(p => p.id !== id)?.id ?? null);
  }

  /* ── File upload + auto-compress ── */
  function compressImage(dataUrl: string, maxW = 1400, quality = 0.82): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl); // fallback: use raw
      img.src = dataUrl;
    });
  }

  function handleImageFile(file: File, cb: (dataUrl: string) => void) {
    const reader = new FileReader();
    reader.onload = async e => {
      const raw = e.target?.result as string;
      const compressed = await compressImage(raw);
      cb(compressed);
    };
    reader.readAsDataURL(file);
  }

  /* ── Auto-blend: sample dominant color under region → complementary accent ── */
  function sampleBlendColor(x: number, y: number, w: number, h: number): string {
    const img = imgRef.current;
    if (!img) return "rgba(212,175,55,0.85)";
    try {
      const sw = Math.max(1, Math.min(200, Math.round(w / 100 * img.naturalWidth)));
      const sh = Math.max(1, Math.min(200, Math.round(h / 100 * img.naturalHeight)));
      const sx = Math.round(x / 100 * img.naturalWidth);
      const sy = Math.round(y / 100 * img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = sw; canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const data = ctx.getImageData(0, 0, sw, sh).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; count++; }
      if (!count) return "rgba(212,175,55,0.85)";
      r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
      // Perceived luminance
      const lum = 0.299*r + 0.587*g + 0.114*b;
      // Compute hue of average pixel
      const rn = r/255, gn = g/255, bn = b/255;
      const max = Math.max(rn,gn,bn), min = Math.min(rn,gn,bn), d = max - min;
      let hue = 0;
      if (d > 0) {
        if (max === rn)      hue = ((gn - bn) / d) % 6;
        else if (max === gn) hue = (bn - rn) / d + 2;
        else                 hue = (rn - gn) / d + 4;
        hue = Math.round(hue * 60);
        if (hue < 0) hue += 360;
      }
      // Complementary hue (+150°) at high saturation, lightness based on image lum
      const compH = (hue + 150) % 360;
      const light  = lum > 140 ? 38 : 68;
      return `hsla(${compH},88%,${light}%,0.85)`;
    } catch {
      return "rgba(212,175,55,0.85)";
    }
  }

  /* ── Draw mode ── */
  function startDraw() {
    if (!selPageId || !selPage?.imageDataUrl) return;
    setSelHsIdx(null);
    setDrawMode(true);
  }

  function cancelDraw() {
    drawRef.current?.box.remove();
    drawRef.current = null;
    setDrawMode(false);
    setFreehandPts([]);
  }

  function closeFreehand() {
    if (freehandPts.length < 3) return;
    const xs = freehandPts.map(p => p.x), ys = freehandPts.map(p => p.y);
    const x = +Math.min(...xs).toFixed(2);
    const y = +Math.min(...ys).toFixed(2);
    const w = +(Math.max(...xs) - x).toFixed(2);
    const h = +(Math.max(...ys) - y).toFixed(2);
    const blendColor = sampleBlendColor(x, y, w, h);
    setPendingRect({ x, y, w, h, shape: "freehand", points: [...freehandPts], blendColor });
    setFreehandPts([]);
    setDrawMode(false);
    setHsName(""); setHsPrice(""); setHsCat(""); setHsSel(""); setHsProdId("");
    setShowHsModal(true);
  }

  // Escape = cancel draw / deselect; Delete = remove selected hotspot
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cancelDraw();
        setSelHsIdx(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selHsIdx !== null && selPageId !== null) {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
        deleteHs(selHsIdx);
        setSelHsIdx(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, freehandPts, selHsIdx, selPageId, selHs]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Draw mode: start drawing (freehand uses onClick)
    if (drawMode && shapeType !== "freehand") {
      const wrap = imgWrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const isOval = shapeType === "ellipse" || shapeType === "circle";
      const box = document.createElement("div");
      box.style.cssText = `position:absolute;border:2px dashed #f59e0b;background:rgba(245,158,11,.15);border-radius:${isOval?"50%":"4px"};pointer-events:none;z-index:10;`;
      wrap.appendChild(box);
      drawRef.current = { sx: e.clientX, sy: e.clientY, box, wrap };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    // Select mode: pan canvas (hsDragRef / hsResizeRef handled on individual hotspot elements)
    if (!drawMode && hsDragRef.current === null && hsResizeRef.current === null) {
      panRef.current = { sx: e.clientX, sy: e.clientY, ox: panXRef.current, oy: panYRef.current, active: true };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, shapeType]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Draw mode move
    if (drawRef.current) {
      const { sx, sy, box, wrap } = drawRef.current;
      const b = wrap.getBoundingClientRect();
      let dx = e.clientX - sx, dy = e.clientY - sy;
      if (shapeType === "square" || shapeType === "circle") {
        const side = Math.min(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx) * side; dy = Math.sign(dy) * side;
      }
      const x = Math.min(sx, sx+dx) - b.left;
      const y = Math.min(sy, sy+dy) - b.top;
      Object.assign(box.style, { left: x+"px", top: y+"px", width: Math.abs(dx)+"px", height: Math.abs(dy)+"px" });
      return;
    }
    // Hotspot drag move (handled in individual hotspot handlers — skip here)
    if (hsDragRef.current) return;
    // Pan move
    if (panRef.current?.active) {
      const nx = panRef.current.ox + (e.clientX - panRef.current.sx);
      const ny = panRef.current.oy + (e.clientY - panRef.current.sy);
      setPanX(nx); setPanY(ny);
      panXRef.current = nx; panYRef.current = ny;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeType]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Draw mode end
    if (drawRef.current) {
      const { sx, sy, box, wrap } = drawRef.current;
      let dx = e.clientX - sx, dy = e.clientY - sy;
      if (shapeType === "square" || shapeType === "circle") {
        const side = Math.min(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx) * side; dy = Math.sign(dy) * side;
      }
      const pw = Math.abs(dx), ph = Math.abs(dy);
      box.remove(); drawRef.current = null; setDrawMode(false);
      if (pw >= 10 && ph >= 10) {
        const b = wrap.getBoundingClientRect();
        const rx = +((Math.min(sx, sx+dx) - b.left) / b.width  * 100).toFixed(2);
        const ry = +((Math.min(sy, sy+dy) - b.top)  / b.height * 100).toFixed(2);
        const rw = +(pw / b.width  * 100).toFixed(2);
        const rh = +(ph / b.height * 100).toFixed(2);
        const blendColor = sampleBlendColor(rx, ry, rw, rh);
        setPendingRect({ x: rx, y: ry, w: rw, h: rh, shape: shapeType, blendColor });
        setHsName(""); setHsPrice(""); setHsCat(""); setHsSel(""); setHsProdId("");
        setShowHsModal(true);
      }
      return;
    }
    // Hotspot drag end (handled on individual elements)
    if (hsDragRef.current) return;
    // Pan end: if barely moved, deselect hotspot
    if (panRef.current?.active) {
      const dx = e.clientX - panRef.current.sx;
      const dy = e.clientY - panRef.current.sy;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        setSelHsIdx(null);
      }
      panRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeType]);

  // Freehand: each click on the image adds a vertex
  const onFreehandClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawMode || shapeType !== "freehand") return;
    e.stopPropagation();
    const wrap = imgWrapRef.current;
    if (!wrap) return;
    const b = wrap.getBoundingClientRect();
    const x = +((e.clientX - b.left) / b.width  * 100).toFixed(2);
    const y = +((e.clientY - b.top)  / b.height * 100).toFixed(2);
    setFreehandPts(prev => [...prev, { x, y }]);
  }, [drawMode, shapeType]);

  /* ── Quick-pick ── */
  function onHsSelChange(val: string) {
    setHsSel(val);
    if (!val) return;
    const p = products.find(p => p.id === val);
    if (p) { setHsName(p.name); setHsPrice(String(p.price)); setHsCat(p.cat); setHsProdId(p.id); }
  }

  function saveHs() {
    if (!hsName.trim() || selPageId === null || !pendingRect) return;
    const hs: Hotspot = {
      ...pendingRect,
      name: hsName, price: +hsPrice || 0, cat: hsCat,
      productId: hsProdId || undefined,
    };
    updateHs(selPageId, [...selHs, hs]);
    setPendingRect(null); setShowHsModal(false);
  }

  /* ── Export ── */
  const exportHsJson = JSON.stringify(hotspots, null, 2);
  const exportPages  = "const PAGES = " + JSON.stringify(
    pages.map((p, i) => ({ id: p.id, label: p.label, image: p.fileName || `${i+1}.png`, items: [] })),
    null, 2
  ) + ";";
  const exportFull = JSON.stringify({ _version: 2, exportedAt: new Date().toISOString(), pages, hotspots }, null, 2);

  function dlText(text: string, fn: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
    a.download = fn; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // Reset view when page changes
  useEffect(() => {
    setZoom(1); setPanX(0); setPanY(0);
    panXRef.current = 0; panYRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPageId]);

  /* ── Preview helpers ── */
  const prevPage = pages[prevIdx] ?? null;
  const prevHs   = prevPage ? (hotspots[prevPage.id] ?? []) : [];

  /* ── Page card renderer (extracted to reduce cognitive complexity) ── */
  function renderPageCard(p: MenuPage, i: number) { // NOSONAR
    const hsN = (hotspots[p.id] ?? []).length;
    const hasImg = !!p.imageDataUrl;
    const statusColor = hasImg && hsN > 0 ? "#38d39f" : hasImg ? "#f59e0b" : "rgba(255,255,255,.12)";
    return (
      <div key={p.id}
        className="mb-page-card"
        draggable
        style={{
          background: "var(--surface-2,#1a1a1a)",
          border: fileDropId===p.id
            ? "2px dashed var(--amber,#f59e0b)"
            : dragOverId===p.id
              ? "2px solid #60a5fa"
              : `1px solid ${selPageId===p.id ? "var(--amber,#f59e0b)" : "var(--border-1,#2a2a2a)"}`,
          borderRadius: 10, overflow: "hidden", position: "relative",
          cursor: dragPageId===p.id ? "grabbing" : "grab",
          transition: "border-color .12s, opacity .15s, transform .12s",
          opacity: dragPageId===p.id ? 0.4 : 1,
          transform: dragOverId===p.id ? "scale(1.03)" : "scale(1)",
        }}
        onClick={() => { if (!dragPageId) { setSelPageId(p.id); setTab("hotspots"); } }}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !dragPageId) { e.preventDefault(); setSelPageId(p.id); setTab("hotspots"); } }}
        onDragStart={e => {
          setDragPageId(p.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.offsetWidth / 2, 20);
        }}
        onDragEnd={() => { setDragPageId(null); setDragOverId(null); }}
        onDragOver={e => {
          e.preventDefault();
          if (e.dataTransfer.types.includes("Files")) {
            setFileDropId(p.id); setDragOverId(null);
            e.dataTransfer.dropEffect = "copy";
          } else {
            setDragOverId(p.id); setFileDropId(null);
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverId(null); setFileDropId(null);
          }
        }}
        onDrop={e => {
          e.preventDefault();
          if (e.dataTransfer.files.length > 0) {
            const f = e.dataTransfer.files[0];
            if (f.type.startsWith("image/")) handleImageFile(f, src => setPageImage(p.id, src, f.name));
          } else if (dragPageId !== null && dragPageId !== p.id) {
            reorderPages(dragPageId, p.id);
          }
          setDragPageId(null); setDragOverId(null); setFileDropId(null);
        }}
      >
        <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(0,0,0,.7)", color: "#f59e0b", fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999, zIndex: 3 }}>{i+1}</div>
        <div style={{ position: "absolute", top: 5, right: 5, width: 8, height: 8, borderRadius: "50%", background: statusColor, zIndex: 3, boxShadow: hasImg ? `0 0 6px ${statusColor}` : "none" }} title={hasImg && hsN>0 ? "Image + tap areas ✓" : hasImg ? "Image uploaded, no tap areas" : "No image"} />
        {fileDropId===p.id && (
          <div style={{ position: "absolute", inset: 0, zIndex: 15, background: "rgba(245,158,11,.18)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, pointerEvents: "none", borderRadius: 10 }}>
            <div style={{ color: "var(--amber,#f59e0b)", opacity: .9 }}><IcoImageSm /></div>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--amber,#f59e0b)", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>Drop to upload</span>
          </div>
        )}
        {dragOverId===p.id && dragPageId !== null && (
          <div style={{ position: "absolute", inset: 0, zIndex: 14, background: "rgba(96,165,250,.08)", pointerEvents: "none", borderRadius: 10 }} />
        )}
        {hasImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageDataUrl} alt={p.label} style={{ width: "100%", aspectRatio: "1587/2245", objectFit: "cover", display: "block" }} loading="lazy" />
        ) : (
          <div
            onClick={e => { e.stopPropagation(); openEditPage(p); }}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openEditPage(p); } }}
            style={{ width: "100%", aspectRatio: "1587/2245", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--surface-3,#111)", color: "var(--text-3,#444)", gap: 6, fontSize: 11, cursor: "pointer" }}
          >
            <IcoImage />
            <span style={{ marginTop: 2 }}>Click to upload</span>
            <span style={{ fontSize: 10, opacity: .6 }}>{p.fileName}</span>
          </div>
        )}
        <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border-1,#222)", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</div>
            <div style={{ fontSize: 10, color: "var(--text-3,#666)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              {hasImg
                ? <span style={{ color: "#38d39f", display: "flex", alignItems: "center", gap: 3 }}><IcoCheck /> Image</span>
                : <span style={{ color: "#666", display: "flex", alignItems: "center", gap: 3 }}><IcoWarn /> No image</span>
              }
              · {hsN} area{hsN !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ color: "var(--text-3,#444)", flexShrink: 0 }} title="Drag to reorder"><IcoDragHandle /></div>
        </div>
        <div className="mb-card-actions" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top,rgba(0,0,0,.9) 60%,transparent)", padding: "28px 8px 8px", display: "flex", gap: 5, justifyContent: "center", opacity: 0, transition: "opacity .15s" }}>
          <button
            className="btn-xs"
            onClick={e => { e.stopPropagation(); openEditPage(p); }}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "4px 8px" }}
            title="Edit page"
          >
            <IcoPencil /> Edit
          </button>
          <button
            className="btn-xs"
            onClick={e => { e.stopPropagation(); setSelPageId(p.id); setTab("hotspots"); }}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "4px 8px" }}
            title="Map tap areas"
          >
            <IcoPin /> Map
          </button>
          <button
            className="btn-xs danger"
            onClick={e => { e.stopPropagation(); deletePage(p.id); }}
            style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, padding: "4px 8px" }}
            title="Delete page"
          >
            <IcoTrash />
          </button>
        </div>
      </div>
    );
  }

  /* ── Preview hotspot renderer (extracted to reduce cognitive complexity) ── */
  function renderPreviewHotspot(h: Hotspot, i: number, activeIds: Set<string>) {
    const avail = !h.productId || activeIds.has(h.productId);
    const borderC = avail ? "rgba(212,175,55,.7)" : "rgba(120,120,120,.5)";
    const bgC    = avail ? "rgba(212,175,55,.1)" : "rgba(80,80,80,.15)";
    const bgHov  = avail ? "rgba(212,175,55,.28)" : "rgba(80,80,80,.25)";
    const borderHov = avail ? "rgba(212,175,55,1)" : "rgba(150,150,150,.7)";
    return (
      <div key={i} style={{
        position: "absolute", left: h.x+"%", top: h.y+"%", width: h.w+"%", height: h.h+"%",
        border: `2px solid ${borderC}`, background: bgC,
        borderRadius: 4, zIndex: 5, cursor: "default",
        display: "flex", flexDirection: "column", alignItems: "flex-start",
        padding: "2px 5px", transition: "background .12s, border-color .12s",
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background=bgHov; (e.currentTarget as HTMLElement).style.borderColor=borderHov; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background=bgC; (e.currentTarget as HTMLElement).style.borderColor=borderC; }}
      >
        <span style={{
          fontSize: 9, fontWeight: 800, color: avail ? "#fff" : "#aaa",
          background: "rgba(0,0,0,.7)", borderRadius: 3, padding: "1px 5px",
          whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {avail ? h.name : "Unavailable"}
        </span>
        {avail
          ? <span style={{ fontSize: 9, color: "rgba(255,255,255,.75)", fontWeight: 600 }}>{peso(h.price)}</span>
          : <span style={{ fontSize: 8, color: "rgba(180,180,180,.7)", fontStyle: "italic" }}>product inactive</span>
        }
      </div>
    );
  }

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-1,#2a2a2a)", flexShrink: 0, padding: "0 20px", gap: 0 }}>
        {([
          { key: "pages",    icon: <IcoPages />,    label: `Pages (${pages.length})` },
          { key: "hotspots", icon: <IcoTarget />,   label: `Tap Areas (${totalHs})` },
          { key: "preview",  icon: <IcoEye />,      label: "Preview" },
          { key: "export",   icon: <IcoDownload />, label: "Export" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "none", border: "none",
            color: tab === t.key ? "var(--amber,#f59e0b)" : "var(--text-3,#666)",
            borderBottom: tab === t.key ? "2px solid var(--amber,#f59e0b)" : "2px solid transparent",
            fontWeight: 700, fontSize: 12, padding: "12px 16px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            transition: "color .15s", whiteSpace: "nowrap",
          }}>
            <span style={{ opacity: tab === t.key ? 1 : 0.6 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={save} disabled={saving || !workspaceId} style={{
          margin: "8px 0", padding: "6px 16px", borderRadius: 999,
          background: saved ? "rgba(56,211,159,.85)" : "var(--amber,#f59e0b)",
          color: "#fff", fontWeight: 700, fontSize: 12, border: "none",
          cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
          display: "flex", alignItems: "center", gap: 6, transition: "background .3s",
        }}>
          {saving ? <>⏳ Saving…</> : saved ? <><IcoCheck /> Saved!</> : <><IcoSave /> Save</>}
        </button>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 20px", background: "rgba(239,68,68,.1)", borderBottom: "1px solid rgba(239,68,68,.3)", color: "#fca5a5", fontSize: 12, lineHeight: 1.6 }}>
          <span style={{ flexShrink: 0, marginTop: 1, color: "#ef4444" }}><IcoWarn /></span>
          <span style={{ flex: 1 }}>{saveError}</span>
          <button onClick={() => setSaveError(null)} style={{ flexShrink: 0, background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>
      )}

      {/* ══════════════ PAGES TAB ══════════════ */}
      {tab === "pages" && (
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

          {/* Setup steps */}
          <div style={{ marginBottom: 20 }}>
            {/* Progress bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,.06)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 999, transition: "width .6s ease",
                  width: `${progressPct}%`,
                  background: progressPct === 100 ? "#38d39f" : "var(--amber,#f59e0b)",
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: progressPct === 100 ? "#38d39f" : "var(--amber,#f59e0b)", flexShrink: 0 }}>
                {progressPct}% complete
              </span>
            </div>

            {/* Step cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {([
                {
                  n: 1, done: step1Done,
                  title: "Upload Images",
                  sub: `${pagesWithImg}/${pages.length} pages`,
                  cta: "Go to a page →",
                  action: () => { if(pages[0]) openEditPage(pages[0]); },
                },
                {
                  n: 2, done: step2Done,
                  title: "All Pages Ready",
                  sub: step2Done ? "All pages have images" : `${pages.length - pagesWithImg} still missing`,
                  cta: null, action: null,
                },
                {
                  n: 3, done: step3Done,
                  title: "Draw Tap Areas",
                  sub: `${totalHs} area${totalHs !== 1 ? "s" : ""} drawn`,
                  cta: "Go to Tap Areas →",
                  action: () => setTab("hotspots"),
                },
                {
                  n: 4, done: step4Done,
                  title: "Link to Products",
                  sub: step4Done ? "All areas linked" : `${linkedHs}/${totalHs} linked`,
                  cta: totalHs > 0 ? "Go to Tap Areas →" : null,
                  action: () => setTab("hotspots"),
                },
              ]).map(step => (
                <div key={step.n} style={{
                  background: step.done ? "rgba(56,211,159,.06)" : "var(--surface-2,#1a1a1a)",
                  border: `1px solid ${step.done ? "rgba(56,211,159,.25)" : "var(--border-1,#2a2a2a)"}`,
                  borderRadius: 12, padding: "14px 14px 12px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                      background: step.done ? "rgba(56,211,159,.2)" : "rgba(255,255,255,.05)",
                      border: step.done ? "1.5px solid rgba(56,211,159,.5)" : "1.5px solid var(--border-1,#333)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800,
                      color: step.done ? "#38d39f" : "var(--text-3,#555)",
                    }}>
                      {step.done ? <IcoCheck /> : step.n}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: step.done ? "#38d39f" : "var(--text-1,#eee)" }}>{step.title}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3,#666)", marginBottom: step.cta && !step.done ? 8 : 0 }}>{step.sub}</div>
                  {step.cta && !step.done && step.action && (
                    <button onClick={step.action} style={{ background: "none", border: "none", color: "var(--amber,#f59e0b)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                      {step.cta}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Page grid header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "var(--text-3,#666)" }}>
              {pagesWithImg}/{pages.length} pages have images · {totalHs} tap areas mapped
              <span style={{ marginLeft: 10, opacity: .55 }}>· drag cards to reorder · drop images to upload</span>
            </span>
            <button className="btn-xs primary" onClick={openAddPage}>+ Add Page</button>
          </div>

          {/* Page grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
            {pages.map((p, i) => renderPageCard(p, i))}

            {/* Add page card — also accepts file drops to create a new page */}
            <div
              onClick={openAddPage}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAddPage(); } }}
              className="mb-add-card"
              onDragOver={e => {
                e.preventDefault();
                if (e.dataTransfer.types.includes("Files")) {
                  setFileDropId(-1); e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDropId(null);
              }}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f?.type.startsWith("image/")) addPageFromFile(f);
                setFileDropId(null);
              }}
              style={{
                background: fileDropId===-1 ? "rgba(245,158,11,.07)" : "transparent",
                border: fileDropId===-1 ? "2px dashed var(--amber,#f59e0b)" : "2px dashed var(--border-1,#2a2a2a)",
                borderRadius: 10,
                aspectRatio: "1587/2245", display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", cursor: "pointer",
                color: fileDropId===-1 ? "var(--amber,#f59e0b)" : "var(--text-3,#555)",
                gap: 8, fontSize: 12,
                transition: "border-color .15s, color .15s, background .15s",
              }}
            >
              {fileDropId===-1 ? (
                <>
                  <div style={{ opacity: .9 }}><IcoImageSm /></div>
                  <span style={{ fontWeight: 700 }}>Drop to create page</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 26, lineHeight: 1 }}>＋</span>
                  <span>Add Page</span>
                  <span style={{ fontSize: 10, opacity: .5, marginTop: -4 }}>or drop image here</span>
                </>
              )}
            </div>
          </div>

          <style>{`
            .mb-page-card:hover { border-color: rgba(245,158,11,.5) !important; }
            .mb-page-card:hover .mb-card-actions { opacity: 1 !important; }
            .mb-card-actions:hover, .mb-card-actions:focus-within { opacity: 1 !important; }
            .mb-add-card:hover { border-color: var(--amber,#f59e0b) !important; color: var(--amber,#f59e0b) !important; }
          `}</style>
        </div>
      )}

      {/* ══════════════ TAP AREAS TAB ══════════════ */}
      {tab === "hotspots" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Top row: canvas + right panel */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* Canvas */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* Toolbar row 1: page info + draw button */}
              <div style={{ flexShrink: 0, display: "flex", gap: 8, alignItems: "center", padding: "8px 14px 0", borderBottom: "none" }}>
                {/* Prev/Next page navigation */}
                <button className="btn-xs" onClick={prevPageNav} disabled={selPageIdx <= 0}>← Prev</button>
                <span style={{ fontSize: 11, color: "var(--text-3,#666)", whiteSpace: "nowrap" }}>Page {selPageIdx >= 0 ? selPageIdx+1 : "—"} / {pages.length}</span>
                <button className="btn-xs" onClick={nextPageNav} disabled={selPageIdx < 0 || selPageIdx >= pages.length-1}>Next →</button>
                <div style={{ width: 1, height: 16, background: "var(--border-1,#333)", margin: "0 4px" }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>{selPage ? selPage.label : "Select a page"}</span>
                <span style={{ fontSize: 11, color: "var(--text-3,#666)" }}>
                  {selPage?.imageDataUrl ? `${selHs.length} tap area${selHs.length!==1?"s":""}` : "— upload image first"}
                </span>
                <div style={{ flex: 1 }} />
                {selPage && !selPage.imageDataUrl && (
                  <button className="btn-xs primary" onClick={() => { setTab("pages"); openEditPage(selPage); }}>Upload Image →</button>
                )}
                {selPage?.imageDataUrl && !drawMode && (
                  <button className="btn-xs primary" onClick={startDraw} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <IcoDraw /> Draw Tap Area
                  </button>
                )}
                {drawMode && (
                  <button className="btn-xs danger" onClick={cancelDraw} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    × Cancel
                  </button>
                )}
                {/* Zoom controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
                  <button className="btn-xs" onClick={zoomOut} title="Zoom out" disabled={zoom <= 0.25}>−</button>
                  <button onClick={zoomReset} title="Reset zoom to 100%" style={{ fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,.06)", border: "1px solid var(--border-2,#333)", borderRadius: 6, color: "var(--text-1,#eee)", padding: "3px 8px", cursor: "pointer", minWidth: 42, textAlign: "center" }}>{Math.round(zoom*100)}%</button>
                  <button className="btn-xs" onClick={zoomIn} title="Zoom in" disabled={zoom >= 4}>+</button>
                  <button className="btn-xs" onClick={resetView} title="Reset pan and zoom" style={{ fontSize: 10 }}>↺ Reset</button>
                </div>
              </div>

              {/* Toolbar row 2: shape picker + draw status */}
              <div style={{ flexShrink: 0, display: "flex", gap: 6, alignItems: "center", padding: "6px 14px 8px", borderBottom: "1px solid var(--border-1,#2a2a2a)", flexWrap: "wrap" }}>
                {/* Shape picker — only visible when image exists */}
                {selPage?.imageDataUrl && (
                  <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "3px 5px" }}>
                    {([
                      { key: "rect",     icon: <IcoShapeRect />,    label: "Rect"    },
                      { key: "square",   icon: <IcoShapeSquare />,  label: "Square"  },
                      { key: "ellipse",  icon: <IcoShapeEllipse />, label: "Ellipse" },
                      { key: "circle",   icon: <IcoShapeCircle />,  label: "Circle"  },
                      { key: "freehand", icon: <IcoShapeFree />,    label: "Freehand"},
                    ] as { key: ShapeType; icon: React.ReactNode; label: string }[]).map(s => (
                      <button
                        key={s.key}
                        title={s.label}
                        onClick={() => { setShapeType(s.key); if (!drawMode) startDraw(); }}
                        style={{
                          background: shapeType === s.key && drawMode ? "var(--amber,#f59e0b)" : shapeType===s.key ? "rgba(245,158,11,.18)" : "none",
                          border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                          color: shapeType === s.key ? "var(--amber,#f59e0b)" : "var(--text-3,#666)",
                          display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
                          transition: "background .12s, color .12s",
                        }}
                      >
                        <span style={{ color: shapeType===s.key&&drawMode ? "#fff" : "inherit" }}>{s.icon}</span>
                        <span style={{ color: shapeType===s.key&&drawMode ? "#fff" : "inherit" }}>{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Freehand active controls */}
                {drawMode && shapeType === "freehand" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4, fontSize: 12 }}>
                    <span style={{ color: "var(--amber,#f59e0b)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                      <IcoCursor /> Click image to add points ({freehandPts.length})
                    </span>
                    {freehandPts.length >= 3 && (
                      <button className="btn-xs primary" onClick={closeFreehand} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <IcoCheck /> Close Shape
                      </button>
                    )}
                  </div>
                )}

                {/* Non-freehand draw hint */}
                {drawMode && shapeType !== "freehand" && (
                  <span style={{ fontSize: 11, color: "var(--amber,#f59e0b)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                    <IcoCursor /> Drag on the image to draw
                  </span>
                )}

                <div style={{ flex: 1 }} />

                {/* Selected hotspot actions */}
                {selHsIdx !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text-3,#666)" }}>
                      Selected: <strong style={{ color: "var(--text-1,#eee)" }}>{selHs[selHsIdx]?.name}</strong>
                    </span>
                    <button className="btn-xs danger" onClick={() => { deleteHs(selHsIdx); setSelHsIdx(null); }} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                      <IcoTrash /> Delete
                    </button>
                    <button className="btn-xs" onClick={() => setSelHsIdx(null)} style={{ fontSize: 11 }}>
                      Deselect
                    </button>
                  </div>
                )}

                {/* Clear all — only when no selection */}
                {selHsIdx === null && selHs.length > 0 && !drawMode && (
                  <button className="btn-xs danger" onClick={() => {
                    if (!selPageId) return;
                    if (confirm(`Clear all ${selHs.length} tap area(s)?`)) { updateHs(selPageId, []); setSelHsIdx(null); }
                  }} style={{ fontSize: 11 }}>Clear all ({selHs.length})</button>
                )}
              </div>

              {/* Image + overlays */}
              <div
                style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-3,#0e0e0e)", cursor: drawMode ? "crosshair" : panRef.current?.active ? "grabbing" : "grab" }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                onWheel={e => {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.25 : 0.25;
                  setZoom(z => Math.min(4, Math.max(0.25, +(z + delta).toFixed(2))));
                }}
              >
                {!selPage ? (
                  <div style={{ textAlign: "center", color: "var(--text-3,#555)" }}>
                    <div style={{ marginBottom: 12, opacity: .4 }}><IcoBook /></div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Select a page below</div>
                  </div>
                ) : !selPage.imageDataUrl ? (
                  <div style={{ textAlign: "center", color: "var(--text-3,#555)", maxWidth: 260 }}>
                    <div style={{ marginBottom: 16, opacity: .35, display: "flex", justifyContent: "center" }}><IcoImage /></div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2,#bbb)", marginBottom: 6 }}>No image for {selPage.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3,#555)", marginBottom: 16, lineHeight: 1.6 }}>Upload a menu page image before drawing tap areas.</div>
                    <button className="btn-xs primary" onClick={() => { setTab("pages"); openEditPage(selPage); }}>Upload Image →</button>
                  </div>
                ) : (
                  <div // NOSONAR - freehand vertex placement is pointer-coordinate-based (like a canvas); no meaningful keyboard equivalent for "click at this pixel"
                    ref={imgWrapRef}
                    style={{ position: "relative", display: "inline-block", lineHeight: 0, maxWidth: "100%", maxHeight: "100%", transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: "center center" }}
                    onClick={onFreehandClick}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={imgRef} src={selPage.imageDataUrl} alt={selPage.label}
                      style={{ maxWidth: "100%", maxHeight: "calc(100dvh - 330px)", objectFit: "contain", display: "block", userSelect: "none", pointerEvents: "none" }}
                      draggable={false}
                    />

                    {/* SVG layer — ellipse, circle, freehand overlays + in-progress freehand */}
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
                    >
                      {/* In-progress freehand polygon */}
                      {freehandPts.length > 0 && (
                        <>
                          <polyline
                            points={freehandPts.map(p => `${p.x},${p.y}`).join(" ")}
                            fill="rgba(245,158,11,.1)" stroke="#f59e0b" strokeWidth="0.6" strokeDasharray="1.5 0.8" strokeLinejoin="round"
                          />
                          {freehandPts.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="0.9" fill="#f59e0b" />
                          ))}
                          {/* Close-line preview */}
                          {freehandPts.length >= 2 && (
                            <line x1={freehandPts[freehandPts.length-1].x} y1={freehandPts[freehandPts.length-1].y}
                              x2={freehandPts[0].x} y2={freehandPts[0].y}
                              stroke="#f59e0b" strokeWidth="0.4" strokeDasharray="1 1" opacity="0.5"
                            />
                          )}
                        </>
                      )}

                      {/* Rendered hotspot shapes: ellipse, circle, freehand */}
                      {selHs.map((h, i) => {
                        const sh = h.shape ?? "rect";
                        if (sh !== "ellipse" && sh !== "circle" && sh !== "freehand") return null;
                        const isSel = selHsIdx === i;
                        const color = h.blendColor ?? "rgba(16,185,129,0.85)";
                        const fillA = isSel ? "0.22" : "0.12";
                        // derive fill from blendColor
                        const fillColor = color.replace(/[\d.]+\)$/, `${fillA})`); // NOSONAR - applied to controlled internal data
                        const labelBg  = "rgba(0,0,0,0.7)";
                        const commonSvgProps = {
                          stroke: color, strokeWidth: isSel ? "0.9" : "0.55",
                          fill: fillColor,
                          style: { pointerEvents: drawMode ? "all" as const : "none" as const, cursor: "pointer" },
                          onClick: (e: React.MouseEvent) => { if (drawMode) { e.stopPropagation(); setSelHsIdx(selHsIdx === i ? null : i); } },
                        };
                        if (sh === "freehand" && h.points) {
                          const pts = h.points.map(p => `${p.x},${p.y}`).join(" ");
                          return (
                            <g key={i}>
                              <polygon points={pts} {...commonSvgProps} />
                              {isSel && <polygon points={pts} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.35" strokeDasharray="1.5 0.8" style={{ pointerEvents: "none" }} />}
                              {/* Label */}
                              <foreignObject x={h.x} y={h.y} width={h.w} height={Math.min(h.h, 8)} style={{ pointerEvents: "none" }}>
                                <div style={{ fontSize: 7, fontWeight: 700, color: "#fff", background: labelBg, borderRadius: 2, padding: "1px 3px", width: "fit-content", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {h.name}
                                </div>
                              </foreignObject>
                            </g>
                          );
                        }
                        // ellipse / circle
                        const cx = h.x + h.w/2, cy = h.y + h.h/2, rx = h.w/2, ry = h.h/2;
                        return (
                          <g key={i}>
                            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...commonSvgProps} />
                            {isSel && <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.35" strokeDasharray="1.5 0.8" style={{ pointerEvents: "none" }} />}
                            <foreignObject x={h.x} y={h.y} width={h.w} height={Math.min(h.h, 8)} style={{ pointerEvents: "none" }}>
                              <div style={{ fontSize: 7, fontWeight: 700, color: "#fff", background: labelBg, borderRadius: 2, padding: "1px 3px", width: "fit-content", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {h.name}
                              </div>
                            </foreignObject>
                          </g>
                        );
                      })}
                    </svg>

                    {/* Drag overlays for SVG hotspots (ellipse, circle, freehand) */}
                    {!drawMode && selHs.map((h, i) => {
                      const sh = h.shape ?? "rect";
                      if (sh !== "ellipse" && sh !== "circle" && sh !== "freehand") return null;
                      return (
                        <div key={`drag-${i}`} style={{
                          position: "absolute",
                          left: h.x+"%", top: h.y+"%", width: h.w+"%", height: h.h+"%",
                          zIndex: 6, cursor: "move", background: "transparent",
                        }}
                          onPointerDown={e => {
                            e.stopPropagation();
                            const wrap = imgWrapRef.current;
                            if (!wrap) return;
                            const b = wrap.getBoundingClientRect();
                            hsDragRef.current = { sx: e.clientX, sy: e.clientY, ox: h.x, oy: h.y, idx: i, moved: false, bW: b.width, bH: b.height };
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={e => {
                            if (!hsDragRef.current || hsDragRef.current.idx !== i) return;
                            const dr = hsDragRef.current;
                            const dx = e.clientX - dr.sx;
                            const dy = e.clientY - dr.sy;
                            if (!dr.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                            dr.moved = true;
                            const newX = Math.max(0, Math.min(100 - h.w, dr.ox + dx / dr.bW * 100));
                            const newY = Math.max(0, Math.min(100 - h.h, dr.oy + dy / dr.bH * 100));
                            if (selPageId !== null) {
                              setHotspots(prev => applyFreehandOrPlainDragMove(prev, selPageId, i, sh, newX, newY));
                            }
                          }}
                          onPointerUp={e => {
                            if (!hsDragRef.current || hsDragRef.current.idx !== i) return;
                            const moved = hsDragRef.current.moved;
                            hsDragRef.current = null;
                            if (!moved) {
                              e.stopPropagation();
                              setSelHsIdx(selHsIdx === i ? null : i);
                            }
                          }}
                          onClick={e => { if (hsDragRef.current === null) { e.stopPropagation(); setSelHsIdx(selHsIdx === i ? null : i); } }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && hsDragRef.current === null) { e.preventDefault(); e.stopPropagation(); setSelHsIdx(selHsIdx === i ? null : i); } }}
                          title={`${h.name} · ${peso(h.price)} — click to select, drag to move`}
                        >
                          {/* Resize handles for SVG shapes (shown when selected) */}
                          {selHsIdx === i && !drawMode && (
                            [
                              { hk: "nw", s: { top: -5,  left: -5,  cursor: "nwse-resize" as const } },
                              { hk: "n",  s: { top: -5,  left: "50%" as const, transform: "translateX(-50%)", cursor: "ns-resize" as const } },
                              { hk: "ne", s: { top: -5,  right: -5, cursor: "nesw-resize" as const } },
                              { hk: "w",  s: { top: "50%" as const, left: -5,  transform: "translateY(-50%)", cursor: "ew-resize" as const } },
                              { hk: "e",  s: { top: "50%" as const, right: -5, transform: "translateY(-50%)", cursor: "ew-resize" as const } },
                              { hk: "sw", s: { bottom: -5, left: -5,  cursor: "nesw-resize" as const } },
                              { hk: "s",  s: { bottom: -5, left: "50%" as const, transform: "translateX(-50%)", cursor: "ns-resize" as const } },
                              { hk: "se", s: { bottom: -5, right: -5, cursor: "nwse-resize" as const } },
                            ].map(({ hk, s }) => (
                              <div
                                key={hk}
                                style={{
                                  position: "absolute", width: 9, height: 9,
                                  background: "#1a1a1a", border: "1.5px solid #f59e0b",
                                  borderRadius: 2, zIndex: 12, boxSizing: "border-box",
                                  ...s,
                                }}
                                onPointerDown={e => {
                                  e.stopPropagation();
                                  const wrap = imgWrapRef.current;
                                  if (!wrap) return;
                                  const b = wrap.getBoundingClientRect();
                                  hsResizeRef.current = {
                                    sx: e.clientX, sy: e.clientY,
                                    ox: h.x, oy: h.y, ow: h.w, oh: h.h,
                                    idx: i, handle: hk, bW: b.width, bH: b.height,
                                  };
                                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                }}
                                onPointerMove={e => { // NOSONAR
                                  if (!hsResizeRef.current || hsResizeRef.current.handle !== hk || hsResizeRef.current.idx !== i) return;
                                  const { nx, ny, nw, nh } = computeResizedBounds(hsResizeRef.current, hk as ResizeHandleKey, e.clientX, e.clientY);
                                  if (selPageId !== null) {
                                    setHotspots(prev => applyFreehandResizeToHotspotList({ prev, pageId: selPageId, idx: i, shape: sh, nx, ny, nw, nh })); // NOSONAR
                                  }
                                }}
                                onPointerUp={() => { hsResizeRef.current = null; }}
                              />
                            ))
                          )}
                        </div>
                      );
                    })}

                    {/* Div overlays for rect + square hotspots */}
                    {selHs.map((h, i) => {
                      const sh = h.shape ?? "rect";
                      if (sh === "ellipse" || sh === "circle" || sh === "freehand") return null;
                      const isSel = selHsIdx === i;
                      const color = h.blendColor ?? "rgba(16,185,129,0.85)";
                      const fillColor = color.replace(/[\d.]+\)$/, isSel ? "0.22)" : "0.12)"); // NOSONAR - applied to controlled internal data
                      return (
                        <div key={i} style={{
                          position: "absolute",
                          left: h.x+"%", top: h.y+"%", width: h.w+"%", height: h.h+"%",
                          border: `2px solid ${color}`,
                          background: fillColor,
                          borderRadius: sh === "square" ? 2 : 4,
                          outline: isSel ? "2px solid rgba(255,255,255,0.65)" : "none",
                          outlineOffset: "2px",
                          zIndex: 5, cursor: drawMode ? "crosshair" : "move",
                          display: "flex", alignItems: "flex-start", padding: "2px 4px",
                          transition: "background .12s, outline .1s",
                          boxSizing: "border-box",
                        }}
                          onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = color.replace(/[\d.]+\)$/, "0.26)"); }} // NOSONAR - applied to controlled internal data
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = fillColor; }}
                          onPointerDown={e => {
                            if (drawMode) return;
                            e.stopPropagation();
                            const wrap = imgWrapRef.current;
                            if (!wrap) return;
                            const b = wrap.getBoundingClientRect();
                            hsDragRef.current = { sx: e.clientX, sy: e.clientY, ox: h.x, oy: h.y, idx: i, moved: false, bW: b.width, bH: b.height };
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={e => {
                            if (!hsDragRef.current || hsDragRef.current.idx !== i) return;
                            const dr = hsDragRef.current;
                            const dx = e.clientX - dr.sx;
                            const dy = e.clientY - dr.sy;
                            if (!dr.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                            dr.moved = true;
                            const newX = Math.max(0, Math.min(100 - h.w, dr.ox + dx / dr.bW * 100));
                            const newY = Math.max(0, Math.min(100 - h.h, dr.oy + dy / dr.bH * 100));
                            if (selPageId !== null) {
                              setHotspots(prev => {
                                const list = [...(prev[selPageId] ?? [])];
                                list[i] = { ...list[i], x: +newX.toFixed(2), y: +newY.toFixed(2) };
                                return { ...prev, [selPageId]: list };
                              });
                            }
                          }}
                          onPointerUp={e => {
                            if (!hsDragRef.current || hsDragRef.current.idx !== i) return;
                            const moved = hsDragRef.current.moved;
                            hsDragRef.current = null;
                            if (!moved) {
                              e.stopPropagation();
                              setSelHsIdx(selHsIdx === i ? null : i);
                            }
                          }}
                          title={`${h.name} · ${peso(h.price)} — click to select, drag to move`}
                        >
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,.7)", borderRadius: 3, padding: "1px 4px", whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
                            {h.name}
                          </span>

                          {/* ── Resize handles (selected only) ── */}
                          {isSel && !drawMode && (
                            [
                              { hk: "nw", s: { top: -5,  left: -5,  cursor: "nwse-resize" as const } },
                              { hk: "n",  s: { top: -5,  left: "50%" as const, transform: "translateX(-50%)", cursor: "ns-resize" as const } },
                              { hk: "ne", s: { top: -5,  right: -5, cursor: "nesw-resize" as const } },
                              { hk: "w",  s: { top: "50%" as const, left: -5,  transform: "translateY(-50%)", cursor: "ew-resize" as const } },
                              { hk: "e",  s: { top: "50%" as const, right: -5, transform: "translateY(-50%)", cursor: "ew-resize" as const } },
                              { hk: "sw", s: { bottom: -5, left: -5,  cursor: "nesw-resize" as const } },
                              { hk: "s",  s: { bottom: -5, left: "50%" as const, transform: "translateX(-50%)", cursor: "ns-resize" as const } },
                              { hk: "se", s: { bottom: -5, right: -5, cursor: "nwse-resize" as const } },
                            ].map(({ hk, s }) => (
                              <div
                                key={hk}
                                style={{
                                  position: "absolute", width: 9, height: 9,
                                  background: "#1a1a1a", border: "1.5px solid #f59e0b",
                                  borderRadius: 2, zIndex: 12, boxSizing: "border-box",
                                  ...s,
                                }}
                                onPointerDown={e => {
                                  e.stopPropagation();
                                  const wrap = imgWrapRef.current;
                                  if (!wrap) return;
                                  const b = wrap.getBoundingClientRect();
                                  hsResizeRef.current = {
                                    sx: e.clientX, sy: e.clientY,
                                    ox: h.x, oy: h.y, ow: h.w, oh: h.h,
                                    idx: i, handle: hk, bW: b.width, bH: b.height,
                                  };
                                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                }}
                                onPointerMove={e => { // NOSONAR
                                  if (!hsResizeRef.current || hsResizeRef.current.handle !== hk || hsResizeRef.current.idx !== i) return;
                                  const { nx, ny, nw, nh } = computeResizedBounds(hsResizeRef.current, hk as ResizeHandleKey, e.clientX, e.clientY);
                                  if (selPageId !== null) {
                                    setHotspots(prev => ({ // NOSONAR
                                      ...prev,
                                      [selPageId]: applyRectResizeToHotspotList(prev[selPageId] ?? [], i, nx, ny, nw, nh),
                                    }));
                                  }
                                }}
                                onPointerUp={() => { hsResizeRef.current = null; }}
                              />
                            ))
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: tap area list */}
            <div style={{ width: 230, flexShrink: 0, borderLeft: "1px solid var(--border-1,#2a2a2a)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "11px 14px 8px", borderBottom: "1px solid var(--border-1,#2a2a2a)", flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Tap Areas</div>
                <div style={{ fontSize: 11, color: "var(--text-3,#666)", marginTop: 1 }}>{selHs.length} on this page · {totalHs} total</div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                {selHs.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-3,#555)", padding: "32px 16px", fontSize: 12 }}>
                    <div style={{ marginBottom: 10, opacity: .35, display: "flex", justifyContent: "center" }}><IcoTarget /></div>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-3,#666)" }}>No tap areas yet</div>
                    {selPage?.imageDataUrl
                      ? <div style={{ lineHeight: 1.65 }}>Pick a shape above then draw over a product on the image.</div>
                      : <div style={{ lineHeight: 1.65 }}>Upload an image for this page first.</div>
                    }
                  </div>
                ) : (
                  selHs.map((h, i) => {
                    const isSel = selHsIdx === i;
                    const color = h.blendColor ?? "rgba(16,185,129,0.85)";
                    const shapeLabel = h.shape === "freehand" ? "free" : h.shape === "ellipse" ? "oval" : h.shape === "circle" ? "○" : h.shape === "square" ? "■" : "▭";
                    return (
                      <div key={i}
                        onClick={() => setSelHsIdx(isSel ? null : i)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelHsIdx(isSel ? null : i); } }}
                        style={{
                          background: isSel ? "rgba(245,158,11,.08)" : "var(--surface-2,#1a1a1a)",
                          border: isSel ? "1px solid rgba(245,158,11,.5)" : "1px solid var(--border-1,#2a2a2a)",
                          borderLeft: `3px solid ${color}`,
                          borderRadius: 8, padding: "7px 10px", marginBottom: 5,
                          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                          transition: "background .12s, border-color .12s",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isSel ? "var(--amber,#f59e0b)" : "var(--text-1,#eee)" }}>{h.name}</div>
                          <div style={{ fontSize: 10, color: "var(--text-3,#666)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ color, fontWeight: 700 }}>{shapeLabel}</span>
                            {h.cat && <span>{h.cat}</span>}
                            {h.productId
                              ? <span style={{ color: "#38d39f", display: "flex", alignItems: "center", gap: 3 }}><IcoLink /> linked</span>
                              : <span style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: 3 }}><IcoWarn /> custom</span>
                            }
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--amber,#f59e0b)", flexShrink: 0 }}>{peso(h.price)}</div>
                        <button
                          className="btn-xs danger"
                          onClick={e => { e.stopPropagation(); deleteHs(i); if (selHsIdx === i) setSelHsIdx(null); }}
                          style={{ fontSize: 10, padding: "2px 7px", flexShrink: 0, display: "flex", alignItems: "center" }}
                          title="Delete this tap area"
                        >
                          <IcoTrash />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-1,#2a2a2a)", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text-3,#555)", lineHeight: 1.8 }}>
                  <span style={{ color: "#38d39f", display: "inline-flex", alignItems: "center", gap: 3 }}><IcoLink /> linked</span> — adds to cart on customer tap<br />
                  <span style={{ color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: 3 }}><IcoWarn /> custom</span> — name/price only, no cart link
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: Figma-style horizontal page strip */}
          <div style={{ flexShrink: 0, height: 126, borderTop: "1px solid var(--border-1,#2a2a2a)", background: "var(--surface-2,#111)", display: "flex", alignItems: "center", gap: 8, overflowX: "auto", overflowY: "hidden", padding: "8px 12px" }}>
            {pages.map((p, i) => {
              const active = selPageId === p.id;
              const hsN = (hotspots[p.id] ?? []).length;
              const hsSuffix = hsN > 0 ? ` · ${hsN} areas` : "";
              return (
                <div
                  key={p.id}
                  onClick={() => setSelPageId(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelPageId(p.id); } }}
                  title={`${i+1}. ${p.label}${hsSuffix}`}
                  style={{
                    flexShrink: 0, width: 64, cursor: "pointer",
                    border: active ? "2px solid var(--amber,#f59e0b)" : "1px solid var(--border-1,#2a2a2a)",
                    borderRadius: 6, overflow: "hidden",
                    opacity: active ? 1 : 0.55,
                    transition: "opacity .15s, border-color .15s, transform .12s",
                    transform: active ? "translateY(-2px)" : "none",
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.opacity="1"; (e.currentTarget as HTMLElement).style.borderColor="rgba(245,158,11,.5)"; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.opacity="0.55"; (e.currentTarget as HTMLElement).style.borderColor="var(--border-1,#2a2a2a)"; } }}
                >
                  {p.imageDataUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.imageDataUrl} alt={p.label} style={{ width: "100%", aspectRatio: "1587/2245", objectFit: "cover", display: "block" }} loading="lazy" />
                    : <div style={{ width: "100%", aspectRatio: "1587/2245", background: "#0e0e0e", display: "flex", alignItems: "center", justifyContent: "center", color: "#333" }}><IcoImageSm /></div>
                  }
                  <div style={{ padding: "3px 5px", background: active ? "rgba(245,158,11,.12)" : "transparent" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: active ? "var(--amber,#f59e0b)" : "var(--text-3,#666)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i+1}. {p.label}</div>
                    {hsN > 0 && <div style={{ fontSize: 8, color: "#38d39f", display: "flex", alignItems: "center", gap: 2 }}><IcoCheck /> {hsN}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════ PREVIEW TAB ══════════════ */}
      {tab === "preview" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Preview canvas area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Preview header */}
            <div style={{ flexShrink: 0, padding: "10px 16px", borderBottom: "1px solid var(--border-1,#2a2a2a)", display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{prevPage?.label ?? "—"}</span>
                <span style={{ fontSize: 11, color: "var(--text-3,#666)", marginLeft: 10 }}>
                  Page {prevIdx+1} of {pages.length} · {prevHs.length} tap area{prevHs.length!==1?"s":""}
                </span>
              </div>
              <div style={{ flex: 1 }} />
              <button className="btn-xs" onClick={() => setPrevIdx(Math.max(0, prevIdx-1))} disabled={prevIdx===0}>← Prev</button>
              <button className="btn-xs" onClick={() => setPrevIdx(Math.min(pages.length-1, prevIdx+1))} disabled={prevIdx>=pages.length-1}>Next →</button>
            </div>

            {/* Customer view banner */}
            <div style={{ flexShrink: 0, padding: "8px 16px", background: "rgba(245,158,11,.07)", borderBottom: "1px solid rgba(245,158,11,.12)", fontSize: 12, color: "var(--text-3,#888)", display: "flex", alignItems: "center", gap: 8 }}>
              <IcoEye />
              <span><strong style={{ color: "var(--amber,#f59e0b)" }}>Customer view</strong> — gold areas are clickable and add to cart. Hover to see labels.</span>
              {pagesWithImg < pages.length && (
                <span style={{ marginLeft: "auto", color: "#f59e0b", display: "flex", alignItems: "center", gap: 5 }}>
                  <IcoWarn /> {pages.length - pagesWithImg} page{pages.length - pagesWithImg !== 1 ? "s" : ""} need images
                </span>
              )}
            </div>

            {/* Page image */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e0e0e" }}>
              {!prevPage?.imageDataUrl ? (
                <div style={{ textAlign: "center", color: "var(--text-3,#555)", maxWidth: 280 }}>
                  <div style={{ marginBottom: 18, opacity: .3, display: "flex", justifyContent: "center" }}><IcoImage /></div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2,#bbb)", marginBottom: 8 }}>
                    {prevPage?.label} needs an image
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 18 }}>
                    Upload your menu page image so customers see the real design with interactive tap areas on top.
                  </div>
                  <button className="btn-xs primary" onClick={() => { setTab("pages"); if(prevPage) openEditPage(prevPage); }}>
                    Upload Image →
                  </button>
                </div>
              ) : (
                <div style={{ position: "relative", display: "inline-block", lineHeight: 0, maxWidth: "100%", maxHeight: "100%" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={prevPage.imageDataUrl} alt={prevPage.label}
                    style={{ maxWidth: "100%", maxHeight: "calc(100dvh - 280px)", objectFit: "contain", display: "block" }}
                  />
                  {prevHs.map((h, i) => renderPreviewHotspot(h, i, new Set(products.filter(p => p.active !== false).map(p => p.id))))}
                </div>
              )}
            </div>

            {/* Status bar */}
            <div style={{ flexShrink: 0, padding: "7px 16px", borderTop: "1px solid var(--border-1,#2a2a2a)", display: "flex", gap: 16, fontSize: 11, color: "var(--text-3,#666)", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#38d39f", display: "inline-block" }} />
                {pagesWithImg}/{pages.length} images
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber,#f59e0b)", display: "inline-block" }} />
                {pagesWithHs}/{pages.length} with tap areas
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#38d39f", display: "inline-block" }} />
                {totalHs} total tap areas
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                {pagesWithImg===pages.length && totalHs>0
                  ? <><IcoCheck /><span style={{ color: "#38d39f" }}>Ready — hit Save to publish</span></>
                  : <><IcoWarn /><span style={{ color: "#f59e0b" }}>Upload images and draw tap areas to complete</span></>
                }
              </span>
            </div>
          </div>

          {/* Bottom: Figma-style horizontal page strip */}
          <div style={{ flexShrink: 0, height: 126, borderTop: "1px solid var(--border-1,#2a2a2a)", background: "var(--surface-2,#111)", display: "flex", alignItems: "center", gap: 8, overflowX: "auto", overflowY: "hidden", padding: "8px 12px" }}>
            {pages.map((p, i) => {
              const active = prevIdx === i;
              const hsN = (hotspots[p.id] ?? []).length;
              const hsSuffix = hsN > 0 ? ` · ${hsN} tap areas` : "";
              return (
                <div
                  key={p.id}
                  onClick={() => setPrevIdx(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrevIdx(i); } }}
                  title={`${i+1}. ${p.label}${hsSuffix}`}
                  style={{
                    flexShrink: 0, width: 64, cursor: "pointer",
                    border: active ? "2px solid var(--amber,#f59e0b)" : "1px solid var(--border-1,#2a2a2a)",
                    borderRadius: 6, overflow: "hidden",
                    opacity: active ? 1 : 0.55,
                    transition: "opacity .15s, border-color .15s, transform .12s",
                    transform: active ? "translateY(-2px)" : "none",
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.opacity="1"; (e.currentTarget as HTMLElement).style.borderColor="rgba(245,158,11,.5)"; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.opacity="0.55"; (e.currentTarget as HTMLElement).style.borderColor="var(--border-1,#2a2a2a)"; } }}
                >
                  {p.imageDataUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.imageDataUrl} alt={p.label} style={{ width: "100%", aspectRatio: "1587/2245", objectFit: "cover", display: "block" }} loading="lazy" />
                    : <div style={{ width: "100%", aspectRatio: "1587/2245", background: "#0e0e0e", display: "flex", alignItems: "center", justifyContent: "center", color: "#333" }}><IcoImageSm /></div>
                  }
                  <div style={{ padding: "3px 5px", background: active ? "rgba(245,158,11,.12)" : "transparent" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: active ? "var(--amber,#f59e0b)" : "var(--text-3,#666)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i+1}. {p.label}</div>
                    {hsN > 0 && <div style={{ fontSize: 8, color: "#38d39f", display: "flex", alignItems: "center", gap: 2 }}><IcoCheck /> {hsN}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════ EXPORT TAB ══════════════ */}
      {tab === "export" && (
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--text-3,#888)", marginBottom: 14, lineHeight: 1.7 }}>
            <strong style={{ color: "var(--amber,#f59e0b)" }}>Publish to /menu:</strong> Hit Save above — page images upload to Supabase Storage and the layout publishes to every device.<br />
            <strong style={{ color: "var(--amber,#f59e0b)" }}>For standalone menu-book.html:</strong> Download <strong>tap-areas.json</strong> and place it next to <code style={{ background: "rgba(255,255,255,.08)", padding: "1px 5px", borderRadius: 3 }}>menu-book.html</code>.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <ExportCard title="tap-areas.json" desc="Tap areas for standalone menu-book.html" text={exportHsJson} onDl={() => dlText(exportHsJson, "tap-areas.json")} />
            <ExportCard title="pages-data.js" desc="Replace PAGES constant in menu-book.html" text={exportPages} onDl={() => dlText(exportPages, "pages-data.js")} />
          </div>
          <ExportCard title="menu-config.json — full backup" desc="Import back via this admin page anytime" text={exportFull} onDl={() => dlText(exportFull, "menu-config.json")} tall />
        </div>
      )}

      {/* ══════════════ MODALS ══════════════ */}

      {/* Add/Edit Page */}
      {showAddPage && (
        <Modal onClose={() => setShowAddPage(false)}>
          <h3 style={{ fontWeight: 800, marginBottom: 4 }}>{editPageId !== null ? "Edit Page" : "Add Menu Page"}</h3>
          <p style={{ fontSize: 12, color: "var(--text-3,#666)", marginBottom: 14 }}>Upload the image and set the label for this menu page.</p>

          <FormField label="Page Image">
            <div
              style={{ border: `2px dashed ${pgImgSrc?"var(--amber,#f59e0b)":"var(--border-1,#333)"}`, borderRadius: 10, padding: "18px 14px", textAlign: "center", cursor: "pointer", marginBottom: 4, transition: "border-color .2s" }}
              onClick={() => document.getElementById("mbImgInput")?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.getElementById("mbImgInput")?.click(); } }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f?.type.startsWith("image/")) handleImageFile(f, src=>{setPgImgSrc(src);if(!pgFile)setPgFile(f.name);}); }}
            >
              {pgImgSrc
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={pgImgSrc} alt="" style={{ maxWidth: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 6 }} />
                : <>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, color: "var(--text-3,#555)" }}><IcoImageSm /></div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2,#bbb)", marginBottom: 4 }}>Drop image here or click to upload</div>
                    <div style={{ fontSize: 11, color: "var(--text-3,#555)" }}>PNG, JPG · Ideal: 1587 × 2245 px</div>
                  </>
              }
            </div>
          </FormField>
          <input id="mbImgInput" type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(f) handleImageFile(f, src=>{setPgImgSrc(src);if(!pgFile)setPgFile(f.name);}); }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Page Label *">
              <input value={pgLabel} onChange={e=>setPgLabel(e.target.value)} placeholder="e.g. Frappes" style={inputSt} />
            </FormField>
            <FormField label="File Name">
              <input value={pgFile} onChange={e=>setPgFile(e.target.value)} placeholder="e.g. 2.png" style={inputSt} />
            </FormField>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="btn-xs" onClick={() => setShowAddPage(false)}>Cancel</button>
            <button className="btn-xs primary" onClick={savePage} disabled={!pgLabel.trim()}>Save Page</button>
          </div>
        </Modal>
      )}

      {/* Tap Area picker */}
      {showHsModal && (
        <Modal onClose={() => { setShowHsModal(false); setPendingRect(null); }}>
          <h3 style={{ fontWeight: 800, marginBottom: 4 }}>Link Tap Area to Product</h3>
          <p style={{ fontSize: 12, color: "var(--text-3,#666)", marginBottom: 14 }}>
            Link this area to a product so customers can tap it to add to cart.
          </p>

          <FormField label="Quick-pick from your catalog (recommended)">
            <ProductPicker products={products} value={hsSel} onChange={onHsSelChange} />
          </FormField>

          {hsSel && (
            <div style={{ background: "rgba(56,211,159,.08)", border: "1px solid rgba(56,211,159,.25)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#38d39f", display: "flex", alignItems: "center", gap: 6 }}>
              <IcoCheck /> Linked to catalog — customers can add this to cart from the menu
            </div>
          )}

          <FormField label={hsSel ? "Product Name (auto-filled)" : "Product Name *"}>
            <input value={hsName} onChange={e=>setHsName(e.target.value)} placeholder="e.g. Caramel Frappe" style={inputSt} />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Price (₱)">
              <input type="number" min={0} value={hsPrice} onChange={e=>setHsPrice(e.target.value)} placeholder="175" style={inputSt} />
            </FormField>
            <FormField label="Category">
              <input value={hsCat} onChange={e=>setHsCat(e.target.value)} placeholder="Frappes" style={inputSt} />
            </FormField>
          </div>
          {!hsSel && (
            <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 4, fontSize: 11, color: "#f59e0b", display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}><IcoWarn /></span>{" "}
              No product selected — this area will show name/price but won&apos;t add to cart. Pick from the dropdown above to enable ordering.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="btn-xs" onClick={() => { setShowHsModal(false); setPendingRect(null); }}>Cancel</button>
            <button className="btn-xs primary" onClick={saveHs} disabled={!hsName.trim()}>Save Tap Area</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 400, backdropFilter: "blur(5px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="button"
      tabIndex={0}
      aria-label="Close dialog"
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClose(); } }}
    >
      <div style={{ width: "min(490px,100%)", background: "var(--surface-2,#1a1a1a)", border: "1px solid var(--border-2,#333)", borderRadius: 18, padding: 22, boxShadow: "0 24px 80px rgba(0,0,0,.6)", maxHeight: "92vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-3,#666)", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</label>
      {children}
    </div>
  );
}

function ExportCard({ title, desc, text, onDl, tall }: { title: string; desc: string; text: string; onDl: () => void; tall?: boolean }) {
  return (
    <div style={{ background: "var(--surface-2,#1a1a1a)", border: "1px solid var(--border-1,#2a2a2a)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-xs" onClick={() => navigator.clipboard.writeText(text).catch(()=>{})} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <IcoCopy /> Copy
          </button>
          <button className="btn-xs primary" onClick={onDl} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <IcoDownload /> Download
          </button>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-3,#666)", marginBottom: 8 }}>{desc}</p>
      <textarea readOnly value={text} style={{ width: "100%", height: tall ? 150 : 180, background: "rgba(0,0,0,.4)", color: "#ffe8c7", border: "1px solid var(--border-1,#2a2a2a)", borderRadius: 8, padding: 10, fontFamily: "ui-monospace,monospace", fontSize: 11, resize: "none", outline: "none", lineHeight: 1.5 }} />
    </div>
  );
}

/* ─── Custom product picker (replaces native <select> for styling control) ─── */
function ProductPicker({
  products, value, onChange,
}: { products: AdminProduct[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const selected  = products.find(p => p.id === value);
  const filtered  = query
    ? products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.cat.toLowerCase().includes(query.toLowerCase()))
    : products;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: "rgba(255,255,255,.06)", border: `1px solid ${open ? "var(--amber,#f59e0b)" : "var(--border-2,#333)"}`, borderRadius: 9, color: "var(--text-1,#eee)", padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, transition: "border-color .15s" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {selected ? <><strong>{selected.name}</strong> &nbsp;·&nbsp; <span style={{ color: "var(--amber,#f59e0b)" }}>{peso(selected.price)}</span></> : <span style={{ color: "var(--text-3,#555)" }}>— choose a product —</span>}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 600, background: "#1c1c1c", border: "1px solid var(--border-2,#333)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 270, boxShadow: "0 16px 48px rgba(0,0,0,.75)" }}>
          {/* Search box */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-1,#2a2a2a)", flexShrink: 0 }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search products…"
              style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid var(--border-2,#333)", borderRadius: 7, color: "var(--text-1,#eee)", padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* None option */}
            <div
              onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(""); setOpen(false); setQuery(""); } }}
              style={{ padding: "9px 14px", fontSize: 12, color: "var(--text-3,#555)", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.04)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              — none —
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: "16px 14px", fontSize: 12, color: "var(--text-3,#555)", textAlign: "center" }}>
                No products match &quot;{query}&quot;
              </div>
            )}

            {filtered.map(p => {
              const isSel = p.id === value;
              return (
                <div
                  key={p.id}
                  onClick={() => { onChange(p.id); setOpen(false); setQuery(""); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(p.id); setOpen(false); setQuery(""); } }}
                  style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: isSel ? "rgba(245,158,11,.1)" : "transparent", borderLeft: isSel ? "2px solid var(--amber,#f59e0b)" : "2px solid transparent", transition: "background .1s" }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.05)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSel ? "rgba(245,158,11,.1)" : "transparent"; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: isSel ? 700 : 400, color: "var(--text-1,#eee)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3,#666)", marginTop: 1 }}>{p.cat}</div>
                  </div>
                  <div style={{ flexShrink: 0, fontWeight: 800, fontSize: 13, color: "var(--amber,#f59e0b)" }}>{peso(p.price)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared input style ─────────────────────────────────────────── */
const inputSt: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid var(--border-2,#333)",
  borderRadius: 9, color: "var(--text-1,#eee)", padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: "inherit",
};

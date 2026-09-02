// POST /menu-book-upsert
// Replaces the workspace's menu-book pages + hotspots in one atomic-ish write.
// Page images are uploaded directly to the `menu-book` storage bucket by the
// client (using its JWT under the bucket's RLS policy); this function just
// persists the metadata + hotspots.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

// Coordinates are 0–100 percentages — the editor and the public menu both use a
// 0–100 system (SVG viewBox 0 0 100 100, CSS left:`${x}%`), not 0–1 fractions.
const Point = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) });

const PageIn = z.object({
  page_no:    z.number().int().nonnegative().max(1000),
  label:      z.string().min(1).max(200),
  file_name:  z.string().max(200).nullable().optional(),
  image_path: z.string().max(500).nullable().optional(),
});

const HotspotIn = z.object({
  page_no:     z.number().int().nonnegative().max(1000),
  shape:       z.enum(["rect", "square", "ellipse", "circle", "freehand"]).default("rect"),
  x:           z.number().min(0).max(100),
  y:           z.number().min(0).max(100),
  w:           z.number().min(0).max(100),
  h:           z.number().min(0).max(100),
  points:      z.array(Point).max(500).nullable().optional(),
  blend_color: z.string().max(32).nullable().optional(),
  name:        z.string().max(200),
  price:       z.number().min(0).max(1_000_000),
  cat:         z.string().max(100).nullable().optional(),
  product_id:  z.string().uuid().nullable().optional(),
});

const Body = z.object({
  workspace_id: z.string().uuid(),
  pages:        z.array(PageIn).max(500),
  hotspots:     z.array(HotspotIn).max(5000),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    // image_path must live under this workspace's bucket prefix.
    const prefix = `${body.workspace_id}/`;
    for (const pg of body.pages) {
      if (pg.image_path && !pg.image_path.startsWith(prefix)) {
        throw BadRequest("image_path must be scoped to this workspace");
      }
    }

    // Replace strategy: wipe and re-insert. Pages + hotspots are small data
    // sets (dozens of rows max), and a full replace keeps the API simple.
    const { error: delHsErr } = await admin
      .from("menu_book_hotspots")
      .delete()
      .eq("workspace_id", body.workspace_id);
    if (delHsErr) throw BadRequest(delHsErr.message);

    const { error: delPgErr } = await admin
      .from("menu_book_pages")
      .delete()
      .eq("workspace_id", body.workspace_id);
    if (delPgErr) throw BadRequest(delPgErr.message);

    if (body.pages.length > 0) {
      const pageRows = body.pages.map((p, i) => ({
        workspace_id: body.workspace_id,
        page_no:      p.page_no,
        label:        p.label,
        file_name:    p.file_name ?? null,
        image_path:   p.image_path ?? null,
        sort_order:   i,
      }));
      const { error } = await admin.from("menu_book_pages").insert(pageRows);
      if (error) throw BadRequest(error.message);
    }

    if (body.hotspots.length > 0) {
      const hsRows = body.hotspots.map((h, i) => ({
        workspace_id: body.workspace_id,
        page_no:      h.page_no,
        shape:        h.shape,
        x:            h.x,
        y:            h.y,
        w:            h.w,
        h:            h.h,
        points:       h.points ?? null,
        blend_color:  h.blend_color ?? null,
        name:         h.name,
        price:        h.price,
        cat:          h.cat ?? null,
        product_id:   h.product_id ?? null,
        sort_order:   i,
      }));
      const { error } = await admin.from("menu_book_hotspots").insert(hsRows);
      if (error) throw BadRequest(error.message);
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "menu_book.upsert", entityType: "menu_book", entityId: body.workspace_id,
      after: { pages: body.pages.length, hotspots: body.hotspots.length },
    }));

    return json({ ok: true, pages: body.pages.length, hotspots: body.hotspots.length });
  } catch (err) { return handleError(err); }
});

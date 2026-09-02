// GET-style POST /public-menu { slug }
// Returns workspace + branches + active products grouped by category.
// No auth required; uses service role internally.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

const Body = z.object({ slug: z.string().min(1) });

function enrichProducts(products: any[], categories: any[]) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  return (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: Number(p.price),
    kitchen_required: p.kitchen_required,
    image_url: p.image_url,
    category: p.category_id ? catMap.get(p.category_id) ?? null : null,
    featured: !!p.featured,
    featured_tag: p.featured_tag ?? null,
    featured_blurb: p.featured_blurb ?? null,
    featured_sort: p.featured_sort ?? null,
  }));
}

function buildMenuBookPages(pages: any[], bucket: any) {
  return (pages ?? []).map((p) => ({
    page_no:   p.page_no as number,
    label:     p.label as string,
    file_name: (p.file_name as string | null) ?? null,
    image_url: p.image_path
      ? bucket.getPublicUrl(p.image_path as string).data.publicUrl
      : null,
  }));
}

function buildMenuBookHotspots(hotspots: any[]): Record<number, unknown[]> {
  const result: Record<number, unknown[]> = {};
  for (const h of (hotspots ?? [])) {
    const k = h.page_no as number;
    if (!result[k]) { result[k] = []; }
    result[k].push({
      shape:       h.shape,
      x:           Number(h.x),
      y:           Number(h.y),
      w:           Number(h.w),
      h:           Number(h.h),
      points:      h.points ?? null,
      blend_color: h.blend_color ?? null,
      name:        h.name,
      price:       Number(h.price),
      cat:         h.cat ?? null,
      product_id:  h.product_id ?? null,
    });
  }
  return result;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    await rateLimit(req, { scope: "public-menu", max: 120, windowSec: 60 });
    const { slug } = await parseBody(req, Body);
    const admin = adminClient();

    // Single server-side call returns the whole menu (workspace + branches +
    // categories + products + menu-book) in one round-trip — see public_menu_v1.
    const { data: menu, error: menuErr } = await admin.rpc("public_menu_v1", { p_slug: slug });
    if (menuErr) throw BadRequest(menuErr.message);
    if (!menu) throw NotFound("Workspace not found");

    const workspace = menu.workspace;
    const bucket = admin.storage.from("menu-book");

    const enrichedProducts = enrichProducts(menu.products ?? [], menu.categories ?? []);
    const featured = enrichedProducts
      .filter((x) => x.featured)
      .sort((a, b) => (a.featured_sort ?? 999) - (b.featured_sort ?? 999));
    const menuBookPages = buildMenuBookPages(menu.menu_book_pages ?? [], bucket);
    const menuBookHotspots = buildMenuBookHotspots(menu.menu_book_hotspots ?? []);

    return json({
      workspace: {
        ...workspace,
        tax_rate: Number(workspace.tax_rate ?? 0),
        service_rate: Number(workspace.service_rate ?? 0),
      },
      branches: menu.branches ?? [],
      products: enrichedProducts,
      featured,
      menu_book: { pages: menuBookPages, hotspots: menuBookHotspots },
    }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" });
  } catch (err) { return handleError(err); }
});

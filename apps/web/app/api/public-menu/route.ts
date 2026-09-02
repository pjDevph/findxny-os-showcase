// Same-origin cached proxy for the public-menu edge function.
// Client components hit this instead of Supabase directly so the menu is served
// from Next's shared Data Cache (unstable_cache) — 1 upstream call per ~60s
// across ALL visitors, instead of one per page load. POST-backed, so we use
// unstable_cache (Next's fetch cache only covers GET).
import { unstable_cache } from "next/cache";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

const getMenu = unstable_cache(
  async (slug: string) => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/public-menu`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ slug }),
      cache: "no-store", // unstable_cache owns the caching; don't double-cache the fetch
    });
    if (!r.ok) throw new Error(`public-menu upstream ${r.status}`);
    return r.json();
  },
  ["public-menu"],
  { revalidate: 60, tags: ["public-menu"] },
);

export async function POST(req: Request) {
  try {
    const { slug } = await req.json().catch(() => ({}));
    if (!slug || typeof slug !== "string") {
      return Response.json({ error: "slug required" }, { status: 400 });
    }
    const data = await getMenu(slug);
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch {
    return Response.json({ error: "menu temporarily unavailable" }, { status: 502 });
  }
}

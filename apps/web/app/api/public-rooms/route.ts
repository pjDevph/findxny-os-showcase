// Same-origin cached proxy for public-rooms. The rooms LIST is cached (shared,
// 60s); per-resource AVAILABILITY (resource_id present) is live booking data so
// it passes through uncached.
import { unstable_cache } from "next/cache";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

const FN = `${SUPABASE_URL}/functions/v1/public-rooms`;
const authHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "content-type": "application/json",
};

const getRooms = unstable_cache(
  async (slug: string, type: string) => {
    const r = await fetch(FN, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ slug, type }),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`public-rooms upstream ${r.status}`);
    return r.json();
  },
  ["public-rooms"],
  { revalidate: 60, tags: ["public-rooms"] },
);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.slug || typeof body.slug !== "string") {
      return Response.json({ error: "slug required" }, { status: 400 });
    }

    // Live availability — never cache (booking state changes in real time).
    if (body.resource_id) {
      const r = await fetch(FN, { method: "POST", headers: authHeaders, body: JSON.stringify(body), cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      return Response.json(j, { status: r.status, headers: { "Cache-Control": "no-store" } });
    }

    const data = await getRooms(body.slug, body.type ?? "room");
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch {
    return Response.json({ error: "rooms temporarily unavailable" }, { status: 502 });
  }
}

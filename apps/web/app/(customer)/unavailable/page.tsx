// Landing page for the ordering / booking routes while they're switched off.
// Middleware redirects the blocked routes here with ?f=order|booking so a
// direct URL, a bookmark, or a stale link all land somewhere that explains
// itself instead of 404-ing.
import { CommerceDisabled } from "@/components/CommerceDisabled";
import { api } from "@/lib/api";
import { WORKSPACE_SLUG } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function UnavailablePage({
  searchParams,
}: {
  searchParams: { f?: string };
}) {
  const f = searchParams.f;
  const menu = await api.menu(WORKSPACE_SLUG).catch(() => null);
  return (
    <CommerceDisabled
      kind={f === "order" ? "order" : "booking"}
      phone={menu?.workspace?.phone ?? null}
    />
  );
}

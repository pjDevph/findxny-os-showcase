import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import BookingsClient from "./BookingsClient";
import { Pagination } from "@/components/ui/Pagination";
import { ExportBookingsButton } from "./ExportBookingsButton";

const PAGE_SIZE = 50;

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { offset?: string; status?: string };
}) {
  const wsId = await resolveWorkspaceId();
  const offset = Math.max(0, Number(searchParams.offset ?? 0) || 0);
  const [bookingsResult, blocksResult] = wsId
    ? await Promise.all([
        adminApi.bookings(wsId, { limit: PAGE_SIZE, offset, status: searchParams.status }),
        adminApi.resourceBlocks(wsId),
      ])
    : [{ bookings: [] as any[], total: 0, limit: PAGE_SIZE }, { blocks: [] as any[] }];
  const { bookings, total, limit } = bookingsResult;
  const { blocks: initialBlocks } = blocksResult;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 24px 0" }}>
        <ExportBookingsButton status={searchParams.status} />
      </div>
      <BookingsClient bookings={bookings} initialBlocks={initialBlocks} wsId={wsId ?? ""} />
      <div style={{ padding: "0 24px 24px" }}>
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          hrefFor={(o) => {
            const sp = new URLSearchParams();
            if (searchParams.status) sp.set("status", searchParams.status);
            if (o > 0) sp.set("offset", String(o));
            const qs = sp.toString();
            return qs ? `/bookings?${qs}` : "/bookings";
          }}
        />
      </div>
    </>
  );
}

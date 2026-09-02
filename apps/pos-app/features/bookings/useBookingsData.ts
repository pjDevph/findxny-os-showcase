import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { invokeFn } from "../../services/supabase";
import { isExpired, rawBookingToBooking, rawResourceToResource } from "./bookingsHelpers";
import type { Booking, RawBookingRow, RawResourceRow, Resource } from "./types";

// Staleness window for focus-triggered refetches — a quick tab-away-and-back
// shouldn't re-fetch the entire workspace's bookings every time.
const LOAD_STALE_MS = 45_000;

export function useBookingsData(activeWorkspaceId: string | null | undefined) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const lastLoadedAtRef = useRef(0);
  // Bumped after every forced (mutation-triggered) reload — passed to
  // RoomCalendar as `refreshKey` so its per-room/month cache gets dropped
  // whenever a booking is confirmed/cancelled/checked-in/etc. from this screen.
  const [dataVersion, setDataVersion] = useState(0);

  const load = useCallback(async (force = false) => {
    if (!activeWorkspaceId) return;
    if (!force && Date.now() - lastLoadedAtRef.current < LOAD_STALE_MS) return;
    setLoading(true);
    invokeFn("bookings-expire-holds", {}).catch(() => {});
    const { data: payload } = await invokeFn<{
      "booking-room-load": { resources: RawResourceRow[]; bookings: RawBookingRow[] };
    }>("pos-data", { workspace_id: activeWorkspaceId, resource: "booking-room-load" });
    const res = payload?.["booking-room-load"]?.resources ?? [];
    const bks = payload?.["booking-room-load"]?.bookings ?? [];
    setResources((res ?? []).map(rawResourceToResource));
    setBookings((bks ?? []).map(rawBookingToBooking).filter((b) => !(b.status === "hold" && isExpired(b.hold_expires_at))));
    lastLoadedAtRef.current = Date.now();
    if (force) setDataVersion((v) => v + 1);
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => { load(true); }, [load]);
  // Re-fetch when screen comes back into focus (e.g. after paying via Orders tab) —
  // but only if the data is stale, so a quick tab-away-and-back doesn't refetch everything.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { resources, bookings, loading, load, dataVersion };
}

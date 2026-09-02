"use client";

/**
 * Shared manual-refresh affordance for admin pages — drop into any page
 * header wherever data can go stale while the user stays on the page
 * (server components refetch on navigation, but not while sitting still).
 * Consolidates what the dashboard used to hand-roll on its own.
 *
 * Default usage (`onRefresh` omitted) re-runs this route's server
 * components via `router.refresh()`. Pass `onRefresh` instead for pages
 * that fetch client-side (e.g. Kitchen's own polling `fetchTickets`).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton({
  onRefresh,
  label = "Refresh",
  className = "btn-xs primary",
}: {
  onRefresh?: () => void | Promise<void>;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // startTransition's pending flag only tracks router.refresh() correctly —
  // an arbitrary async onRefresh callback needs its own state, since React 18
  // (no async transitions yet) marks a transition done as soon as the
  // callback returns synchronously, not when a Promise inside it settles.
  const [manualPending, setManualPending] = useState(false);

  async function handleClick() {
    if (onRefresh) {
      setManualPending(true);
      try { await onRefresh(); } finally { setManualPending(false); }
    } else {
      startTransition(() => router.refresh());
    }
  }

  const pending = isPending || manualPending;
  return (
    <button className={className} onClick={handleClick} disabled={pending}>
      {pending ? "Refreshing…" : `↺ ${label}`}
    </button>
  );
}

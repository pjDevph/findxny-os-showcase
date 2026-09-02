"use client";
import { useEffect } from "react";
import { reportError } from "../lib/errorReporter";

// Per-segment error boundary. Catches errors inside any (auth)/(admin)/(customer)
// route — the global-error.tsx only fires when the root layout itself throws.
export default function RouteError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { endpoint: "route-error", tags: { digest: error.digest ?? "" } });
  }, [error]);

  return (
    <div style={{ padding: 48, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>This page hit an error</h2>
      <p style={{ color: "#57534e", marginBottom: 24, fontSize: 14 }}>
        Try again, or go back and reload.
      </p>
      <button
        onClick={reset}
        style={{
          padding: "8px 16px", borderRadius: 6, border: "1px solid #d6d3d1",
          background: "#fafaf9", cursor: "pointer", fontSize: 14,
        }}>
        Try again
      </button>
    </div>
  );
}

"use client";
import { useEffect } from "react";
import { reportError } from "../lib/errorReporter";

// Next.js App Router top-level error boundary. Renders its own <html>/<body>
// because the root layout has already failed by the time we get here.
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { endpoint: "global-error", tags: { digest: error.digest ?? "" } });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 48, color: "#1c1917" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: "#57534e", marginBottom: 24 }}>
          The page hit an unexpected error. Try again, or refresh the browser.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "10px 20px", borderRadius: 6, border: "1px solid #d6d3d1",
            background: "#fafaf9", cursor: "pointer", fontSize: 14,
          }}>
          Try again
        </button>
      </body>
    </html>
  );
}

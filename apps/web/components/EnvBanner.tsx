import { ENV_BANNER_LABEL } from "@/lib/env";

// Sticky top strip shown on non-production deploys (dev/staging), so staff
// testing on the same device/browser as the live site never mistake one for
// the other.
export function EnvBanner() {
  if (!ENV_BANNER_LABEL) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        background: "rgba(192,56,56,0.16)",
        borderBottom: "1px solid rgba(192,56,56,0.4)",
        color: "#c03838",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textAlign: "center",
        padding: "4px 8px",
      }}
    >
      {ENV_BANNER_LABEL} — not the live site
    </div>
  );
}

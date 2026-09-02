// Standalone maintenance page — lives outside all route groups so it is
// always reachable (no nav wrapper, no auth checks). The customer layout
// redirects here when maintenance_mode is ON for non-staff visitors.
import { MaintenancePage } from "@/components/MaintenancePage";
import { api } from "@/lib/api";
import { WORKSPACE_SLUG } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function MaintenanceRoute() {
  const menu = await api.menu(WORKSPACE_SLUG).catch(() => null);
  return (
    <MaintenancePage
      name={menu?.workspace.name}
      message={menu?.workspace.maintenance_message}
      phone={menu?.workspace.phone}
    />
  );
}

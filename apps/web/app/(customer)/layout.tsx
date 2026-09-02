import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import Toaster from "@/components/Toaster";
import { MaintenancePage } from "@/components/MaintenancePage";
import { api } from "@/lib/api";
import { WORKSPACE_SLUG } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const menu = await api.menu(WORKSPACE_SLUG).catch(() => null);
  const ws = menu?.workspace ?? null;

  // Maintenance mode: render the maintenance page for non-staff visitors.
  // Staff (any workspace_member) always see the live site.
  if (ws?.maintenance_mode === true) {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    let isStaff = false;
    if (user) {
      // auth-context read — documented exception, see admin-api.ts
      const { data: m } = await supabase
        .from("workspace_members").select("id").eq("user_id", user.id).limit(1);
      isStaff = (m?.length ?? 0) > 0;
    }
    if (!isStaff) {
      return (
        <MaintenancePage
          name={ws.name}
          message={ws.maintenance_message}
          phone={ws.phone}
        />
      );
    }
  }

  const workspace = ws ? { name: ws.name, phone: ws.phone } : null;

  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer workspace={workspace} />
      <Toaster />
    </>
  );
}

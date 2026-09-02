import "./admin.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ADMIN_ROLES, canAccessPath, type WorkspaceRole } from "@/lib/auth-routing";
import { SidebarCollapseToggle } from "@/components/SidebarCollapseToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import Toaster from "@/components/Toaster";

const COLLAPSE_INIT_SCRIPT = `try{if(localStorage.getItem("admin-sidebar-collapsed")==="1")document.documentElement.classList.add("admin-sidebar-collapsed")}catch(e){}`;

const NAV = [
  {
    section: "Overview",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: <GridIco /> },
    ],
  },
  {
    section: "Operations",
    links: [
      { href: "/orders",    label: "Order History", icon: <BagIco />    },
      { href: "/kitchen",   label: "Prep Display", icon: <FlameIco />  },
      { href: "/bookings",  label: "Bookings",     icon: <CalIco />    },
      { href: "/tasks",     label: "Tasks",        icon: <TasksIco />  },
      { href: "/customers", label: "Customers",    icon: <PersonIco /> },
    ],
  },
  {
    section: "Sales & Cash",
    links: [
      { href: "/transactions", label: "Transactions",       icon: <ReceiptIco /> },
      { href: "/reports",      label: "Reports",            icon: <ChartIco />   },
      { href: "/z-reports",    label: "Z Reports",          icon: <ZReportIco /> },
      { href: "/costing",      label: "Costing",            icon: <CostIco />    },
      { href: "/cash-drawer",  label: "Shift & Cash",       icon: <CashIco />    },
      { href: "/expenses",     label: "Expenses",           icon: <CostIco />    },
      { href: "/refunds",      label: "Refunds",            icon: <RefundIco />  },
      { href: "/vouchers",     label: "Vouchers & Discounts", icon: <TagIco />   },
    ],
  },
  {
    section: "Catalog",
    links: [
      { href: "/products",    label: "Products",    icon: <BoxIco />      },
      { href: "/suppliers",   label: "Suppliers",   icon: <SupplierIco /> },
      { href: "/inventory",   label: "Inventory",   icon: <LayersIco />   },
      { href: "/menu-book",   label: "Menu Book",   icon: <BookIco />     },
      { href: "/home-editor", label: "Home Editor", icon: <GridIco />     },
    ],
  },
  {
    section: "Workspace",
    links: [
      { href: "/resources",  label: "Resources",  icon: <ResourceIco /> },
      { href: "/branches",   label: "Branches",   icon: <PinIco />      },
      { href: "/employees",  label: "Staff",      icon: <TeamIco />     },
      { href: "/audit-logs", label: "Audit Logs", icon: <LogIco />      },
      { href: "/settings",   label: "Settings",   icon: <GearIco />     },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // auth-context read — documented exception, see admin-api.ts
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/");

  // Pick the strongest role this user holds (owner > admin > manager > kitchen > cashier).
  const ranked: WorkspaceRole[] = ["owner", "admin", "manager", "kitchen", "cashier"];
  const userRole = ranked.find((r) => memberships.some((m) => m.role === r)) as WorkspaceRole;
  const isAdmin = ADMIN_ROLES.has(userRole);

  const initial = (user.email?.[0] ?? "?").toUpperCase();

  // Check if maintenance mode is active so we can show a global warning banner.
  // auth-context read — documented exception, see admin-api.ts
  const wsId = memberships[0]?.workspace_id;
  const { data: wsStatus } = wsId
    ? await supabase.from("workspaces").select("maintenance_mode").eq("id", wsId).single()
    : { data: null };
  const isMaintenanceOn = !!wsStatus?.maintenance_mode;

  return (
    <div className="admin-shell">
      <script dangerouslySetInnerHTML={{ __html: COLLAPSE_INIT_SCRIPT }} />
      {/* CSS-only mobile drawer toggle (no client component needed) */}
      <input id="admin-nav-toggle" type="checkbox" className="admin-nav-toggle" />
      <label htmlFor="admin-nav-toggle" className="admin-nav-backdrop" aria-label="Close menu" />

      <header className="admin-topbar">
        <label htmlFor="admin-nav-toggle" className="admin-burger" aria-label="Toggle menu">
          <span /><span /><span />
        </label>
        <span className="admin-topbar-brand">MUGTHEMUG · Admin</span>
        <div className="admin-topbar-actions">
          <ThemeToggle />
        </div>
      </header>

      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="logo">M</div>
          <div className="brand-text">
            <div className="name">MUGTHEMUG</div>
            <div className="badge">{isAdmin ? "Admin" : userRole}</div>
          </div>
          <ThemeToggle />
          <SidebarCollapseToggle />
        </div>

        <nav className="admin-nav">
          {NAV
            .map((section) => ({
              ...section,
              links: section.links.filter((l) => canAccessPath(userRole, l.href)),
            }))
            .filter((section) => section.links.length > 0)
            .map((section) => (
              <div key={section.section}>
                <div className="admin-nav-section">{section.section}</div>
                {section.links.map((l) => (
                  <Link key={l.href} href={l.href as any} title={l.label}>
                    <span className="ico">{l.icon}</span>
                    <span className="lbl">{l.label}</span>
                  </Link>
                ))}
              </div>
            ))}
        </nav>

        <div className="admin-user">
          <div className="av">{initial}</div>
          <div className="admin-user-info">
            <span className="email">{user.email}</span>
            <span className="role-badge">{userRole}</span>
          </div>
          <form action="/logout" method="post" style={{ marginLeft: "auto", flexShrink: 0 }}>
            <button type="submit" className="signout-btn" title="Sign out">
              <SignOutIco />
            </button>
          </form>
        </div>
      </aside>

      <main className="admin-main">
        {isMaintenanceOn && (
          <div style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            borderRadius: 0,
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 13,
            color: "var(--err, #ff5050)",
            flexWrap: "wrap",
          }}>
            <span>
              <strong>⚠ Maintenance mode is ON</strong> — customers see the maintenance page.
              Staff can still browse normally.
            </span>
            <Link
              href="/settings"
              style={{
                color: "var(--err, #ff5050)",
                fontWeight: 600,
                textDecoration: "underline",
                whiteSpace: "nowrap",
                fontSize: 12,
              }}
            >
              Turn off in Settings →
            </Link>
          </div>
        )}
        {children}
      </main>
      <Toaster />
    </div>
  );
}

/* ---- Inline SVG icons (no dep) ---- */
function GridIco()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>; }
function BagIco()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>; }
function FlameIco()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>; }
function CalIco()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function BoxIco()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>; }
function LayersIco()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>; }
function ReceiptIco() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="6" x2="10" y2="6"/></svg>; }
function ChartIco()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>; }
function ZReportIco() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/><polyline points="8 9 9 9 10 9"/></svg>; }
function PinIco()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function TeamIco()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function LogIco()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>; }
function GearIco()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2a10 10 0 0 1 7.07 17.07"/><path d="M12 2a10 10 0 0 0-7.07 17.07"/></svg>; }
function SignOutIco()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function CostIco()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function CashIco()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>; }
function ResourceIco() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>; }
function BookIco()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>; }
function PersonIco()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.58-7 8-7s8 3 8 7"/></svg>; }
function RefundIco()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l4-4-4-4"/><path d="M7 5H16a5 5 0 0 1 0 10H4"/><path d="M4 19l-1-4 4 1"/></svg>; }
function SupplierIco() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>; }
function TasksIco()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>; }
function TagIco()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>; }

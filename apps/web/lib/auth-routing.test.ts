import { describe, it, expect } from "vitest";
import { canAccessPath, landingPath, ADMIN_ROLES, type WorkspaceRole } from "./auth-routing";

const ALL_ROLES: WorkspaceRole[] = ["owner", "admin", "manager", "cashier", "kitchen"];

describe("landingPath", () => {
  it("sends kitchen to /kitchen", () => {
    expect(landingPath("kitchen")).toBe("/kitchen");
  });

  it("sends cashier to /orders", () => {
    expect(landingPath("cashier")).toBe("/orders");
  });

  it("sends owner/admin/manager to /dashboard", () => {
    expect(landingPath("owner")).toBe("/dashboard");
    expect(landingPath("admin")).toBe("/dashboard");
    expect(landingPath("manager")).toBe("/dashboard");
  });

  it("sends null/undefined to root", () => {
    expect(landingPath(null)).toBe("/");
    expect(landingPath(undefined)).toBe("/");
  });
});

describe("canAccessPath: admin-only paths", () => {
  const adminPaths = [
    "/dashboard", "/branches", "/products", "/inventory", "/ingredients",
    "/transactions", "/reports", "/audit-logs", "/settings",
    "/employees", "/resources", "/costing", "/menu-book",
  ];

  for (const path of adminPaths) {
    it(`${path} is allowed for admin trio, denied for kitchen/cashier`, () => {
      expect(canAccessPath("owner", path)).toBe(true);
      expect(canAccessPath("admin", path)).toBe(true);
      expect(canAccessPath("manager", path)).toBe(true);
      expect(canAccessPath("kitchen", path)).toBe(false);
      expect(canAccessPath("cashier", path)).toBe(false);
    });

    it(`${path}/sub also enforces admin-only`, () => {
      expect(canAccessPath("admin", `${path}/sub`)).toBe(true);
      expect(canAccessPath("kitchen", `${path}/sub`)).toBe(false);
    });
  }
});

describe("canAccessPath: shared paths", () => {
  it("/kitchen allows kitchen + admin trio", () => {
    expect(canAccessPath("kitchen", "/kitchen")).toBe(true);
    expect(canAccessPath("owner", "/kitchen")).toBe(true);
    expect(canAccessPath("admin", "/kitchen")).toBe(true);
    expect(canAccessPath("manager", "/kitchen")).toBe(true);
    expect(canAccessPath("cashier", "/kitchen")).toBe(false);
  });

  it("/orders allows cashier + admin trio, denies kitchen", () => {
    expect(canAccessPath("cashier", "/orders")).toBe(true);
    expect(canAccessPath("owner", "/orders")).toBe(true);
    expect(canAccessPath("admin", "/orders")).toBe(true);
    expect(canAccessPath("manager", "/orders")).toBe(true);
    expect(canAccessPath("kitchen", "/orders")).toBe(false);
  });

  it("/bookings allows only admin trio", () => {
    expect(canAccessPath("owner", "/bookings")).toBe(true);
    expect(canAccessPath("admin", "/bookings")).toBe(true);
    expect(canAccessPath("manager", "/bookings")).toBe(true);
    expect(canAccessPath("kitchen", "/bookings")).toBe(false);
    expect(canAccessPath("cashier", "/bookings")).toBe(false);
  });
});

describe("canAccessPath: unknown paths default to allow", () => {
  // The middleware separately decides which paths even hit this function,
  // so for any path not classified above the default is "allow" — every role
  // should pass.
  it("unknown path allowed for all roles", () => {
    for (const role of ALL_ROLES) {
      expect(canAccessPath(role, "/profile")).toBe(true);
      expect(canAccessPath(role, "/")).toBe(true);
    }
  });
});

describe("ADMIN_ROLES set", () => {
  it("contains exactly owner/admin/manager", () => {
    expect(ADMIN_ROLES.has("owner")).toBe(true);
    expect(ADMIN_ROLES.has("admin")).toBe(true);
    expect(ADMIN_ROLES.has("manager")).toBe(true);
    expect(ADMIN_ROLES.has("cashier")).toBe(false);
    expect(ADMIN_ROLES.has("kitchen")).toBe(false);
  });
});

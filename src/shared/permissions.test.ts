import { describe, it, expect } from "vitest";
import { Modules } from "./modules";
import type { CurrentUser, CurrentUserModule } from "../types/api";
import { hasModulePermission } from "./permissions";

function makeModule(
  name: string,
  perms: Partial<CurrentUserModule> = {},
): CurrentUserModule {
  return {
    public_id: `mod-${name}`,
    name,
    route: null,
    can_create: false,
    can_read: false,
    can_update: false,
    can_delete: false,
    can_submit: false,
    can_approve: false,
    can_complete: false,
    can_view_team: false,
    ...perms,
  };
}

function makeUser(opts: {
  is_admin?: boolean;
  modules?: CurrentUserModule[];
}): CurrentUser {
  return {
    auth: { public_id: "auth-id", username: "test" },
    user: {
      id: 1,
      public_id: "user-id",
      firstname: "Test",
      lastname: "User",
    },
    role: null,
    is_admin: opts.is_admin ?? false,
    modules: opts.modules ?? [],
    accessible_project_ids: [],
  };
}

describe("hasModulePermission", () => {
  it("returns false when me is undefined or null", () => {
    expect(hasModulePermission(undefined, Modules.BILLS, "can_read")).toBe(false);
    expect(hasModulePermission(null, Modules.BILLS, "can_complete")).toBe(false);
  });

  it("returns true for is_admin with empty modules", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(hasModulePermission(me, Modules.BILLS, "can_delete")).toBe(true);
    expect(hasModulePermission(me, Modules.VENDORS, "can_read")).toBe(true);
  });

  it("is_admin overrides a false flag on the module row", () => {
    const me = makeUser({
      is_admin: true,
      modules: [
        makeModule(Modules.BILLS, {
          can_complete: false,
          can_delete: false,
        }),
      ],
    });
    expect(hasModulePermission(me, Modules.BILLS, "can_complete")).toBe(true);
    expect(hasModulePermission(me, Modules.BILLS, "can_delete")).toBe(true);
  });

  it("honors the requested flag on a matching module row", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.BILLS, {
          can_complete: true,
          can_delete: false,
        }),
      ],
    });
    expect(hasModulePermission(me, Modules.BILLS, "can_complete")).toBe(true);
    expect(hasModulePermission(me, Modules.BILLS, "can_delete")).toBe(false);
  });

  it("returns false when modules has no row for the requested module", () => {
    const me = makeUser({
      modules: [makeModule(Modules.VENDORS, { can_read: true, can_delete: true })],
    });
    expect(hasModulePermission(me, Modules.BILLS, "can_read")).toBe(false);
    expect(hasModulePermission(me, Modules.BILLS, "can_delete")).toBe(false);
  });

  it("does not grant permissions from a different module row", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.EXPENSES, {
          can_create: true,
          can_read: true,
          can_update: true,
          can_delete: true,
          can_submit: true,
          can_approve: true,
          can_complete: true,
          can_view_team: true,
        }),
      ],
    });
    expect(hasModulePermission(me, Modules.BILLS, "can_complete")).toBe(false);
    expect(hasModulePermission(me, Modules.BILLS, "can_delete")).toBe(false);
    expect(hasModulePermission(me, Modules.BILLS, "can_update")).toBe(false);
  });
});

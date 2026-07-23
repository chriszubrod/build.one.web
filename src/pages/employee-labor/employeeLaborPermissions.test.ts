import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import { hasEmployeeLaborPermission } from "./employeeLaborPermissions";

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

describe("hasEmployeeLaborPermission", () => {
  it("returns false when me is undefined or null", () => {
    expect(hasEmployeeLaborPermission(undefined, "can_read")).toBe(false);
    expect(hasEmployeeLaborPermission(null, "can_update")).toBe(false);
  });

  it("returns true for is_admin regardless of modules or permission flag", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(hasEmployeeLaborPermission(me, "can_delete")).toBe(true);
    expect(hasEmployeeLaborPermission(me, "can_create")).toBe(true);
  });

  it("grants exactly the flags set on the Employee Labor module row", () => {
    const me = makeUser({
      modules: [makeModule(Modules.EMPLOYEE_LABOR, { can_update: true })],
    });
    expect(hasEmployeeLaborPermission(me, "can_update")).toBe(true);
    expect(hasEmployeeLaborPermission(me, "can_delete")).toBe(false);
    expect(hasEmployeeLaborPermission(me, "can_create")).toBe(false);
  });

  it("grants delete when the Employee Labor row has can_delete", () => {
    const me = makeUser({
      modules: [makeModule(Modules.EMPLOYEE_LABOR, { can_delete: true })],
    });
    expect(hasEmployeeLaborPermission(me, "can_delete")).toBe(true);
    expect(hasEmployeeLaborPermission(me, "can_update")).toBe(false);
  });

  it("ignores grants on other modules", () => {
    const me = makeUser({
      modules: [makeModule("Contract Labor", { can_update: true, can_delete: true })],
    });
    expect(hasEmployeeLaborPermission(me, "can_update")).toBe(false);
    expect(hasEmployeeLaborPermission(me, "can_delete")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import { hasCostCodePermission } from "./costCodePermissions";

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

describe("hasCostCodePermission", () => {
  it("returns false when me is undefined or null", () => {
    expect(hasCostCodePermission(undefined, "can_read")).toBe(false);
    expect(hasCostCodePermission(null, "can_create")).toBe(false);
  });

  it("returns true for is_admin regardless of modules or permission flag", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(hasCostCodePermission(me, "can_delete")).toBe(true);
    expect(hasCostCodePermission(me, "can_create")).toBe(true);
  });

  it("returns true when the Cost Codes module row carries the requested permission", () => {
    const me = makeUser({
      modules: [makeModule(Modules.COST_CODES, { can_update: true })],
    });
    expect(hasCostCodePermission(me, "can_update")).toBe(true);
  });

  it("returns false when the Cost Codes module is absent", () => {
    const me = makeUser({ modules: [] });
    expect(hasCostCodePermission(me, "can_read")).toBe(false);
  });

  it("returns false when the Cost Codes module row has the permission flag false", () => {
    const me = makeUser({
      modules: [makeModule(Modules.COST_CODES, { can_create: false })],
    });
    expect(hasCostCodePermission(me, "can_create")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import { hasBillCreditPermission, resolveBillCreditEditActions } from "./billCreditPermissions";

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

describe("hasBillCreditPermission", () => {
  it("returns false when me is undefined or null", () => {
    expect(hasBillCreditPermission(undefined, "can_read")).toBe(false);
    expect(hasBillCreditPermission(null, "can_complete")).toBe(false);
  });

  it("returns true for is_admin regardless of modules or permission flag", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(hasBillCreditPermission(me, "can_delete")).toBe(true);
    expect(hasBillCreditPermission(me, "can_complete")).toBe(true);
  });
});

describe("resolveBillCreditEditActions", () => {
  it("grants edit only when Bill Credits row has can_update", () => {
    const me = makeUser({
      modules: [makeModule(Modules.BILL_CREDITS, { can_update: true })],
    });
    expect(resolveBillCreditEditActions(me)).toEqual({
      canEdit: true,
      canComplete: false,
    });
  });

  it("grants complete when Bill Credits row has can_update and can_complete", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.BILL_CREDITS, { can_update: true, can_complete: true }),
      ],
    });
    expect(resolveBillCreditEditActions(me)).toEqual({
      canEdit: true,
      canComplete: true,
    });
  });

  it("does not grant edit or complete when can_complete is true but can_update is false", () => {
    const me = makeUser({
      modules: [makeModule(Modules.BILL_CREDITS, { can_complete: true, can_update: false })],
    });
    expect(resolveBillCreditEditActions(me)).toEqual({
      canEdit: false,
      canComplete: false,
    });
  });

  it("grants all actions for is_admin with empty modules", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(resolveBillCreditEditActions(me)).toEqual({
      canEdit: true,
      canComplete: true,
    });
  });

  it("returns all false when me is undefined", () => {
    expect(resolveBillCreditEditActions(undefined)).toEqual({
      canEdit: false,
      canComplete: false,
    });
  });
});

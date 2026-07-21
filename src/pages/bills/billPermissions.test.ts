import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import { hasBillPermission, resolveBillEditActions } from "./billPermissions";

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

describe("hasBillPermission", () => {
  it("returns false when me is undefined or null", () => {
    expect(hasBillPermission(undefined, "can_read")).toBe(false);
    expect(hasBillPermission(null, "can_complete")).toBe(false);
  });

  it("returns true for is_admin regardless of modules or permission flag", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(hasBillPermission(me, "can_delete")).toBe(true);
    expect(hasBillPermission(me, "can_complete")).toBe(true);

    const meWithFalseModule = makeUser({
      is_admin: true,
      modules: [
        makeModule(Modules.BILLS, {
          can_complete: false,
          can_delete: false,
        }),
      ],
    });
    expect(hasBillPermission(meWithFalseModule, "can_complete")).toBe(true);
    expect(hasBillPermission(meWithFalseModule, "can_delete")).toBe(true);
  });

  it("honors Bills module row flags", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.BILLS, {
          can_complete: true,
          can_delete: false,
        }),
      ],
    });
    expect(hasBillPermission(me, "can_complete")).toBe(true);
    expect(hasBillPermission(me, "can_delete")).toBe(false);
  });

  it("returns false when modules has no Bills row", () => {
    const me = makeUser({
      modules: [makeModule(Modules.VENDORS, { can_read: true, can_delete: true })],
    });
    expect(hasBillPermission(me, "can_read")).toBe(false);
    expect(hasBillPermission(me, "can_delete")).toBe(false);
  });

  it("does not grant Bills permissions from a different module row", () => {
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
    expect(hasBillPermission(me, "can_complete")).toBe(false);
    expect(hasBillPermission(me, "can_delete")).toBe(false);
    expect(hasBillPermission(me, "can_update")).toBe(false);
  });
});

describe("resolveBillEditActions", () => {
  it("grants edit and submit-for-review when Bills row has can_update only", () => {
    const me = makeUser({
      modules: [makeModule(Modules.BILLS, { can_update: true })],
    });
    expect(resolveBillEditActions(me)).toEqual({
      canEdit: true,
      canDelete: false,
      canSubmitForReview: true,
      canComplete: false,
    });
  });

  it("does not grant complete (or edit/submit) when can_complete is true but can_update is false", () => {
    const me = makeUser({
      modules: [makeModule(Modules.BILLS, { can_complete: true, can_update: false })],
    });
    expect(resolveBillEditActions(me)).toEqual({
      canEdit: false,
      canDelete: false,
      canSubmitForReview: false,
      canComplete: false,
    });
  });

  it("grants complete when Bills row has can_update and can_complete", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.BILLS, { can_update: true, can_complete: true }),
      ],
    });
    expect(resolveBillEditActions(me).canComplete).toBe(true);
  });

  it("grants delete when Bills row has can_update and can_delete", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.BILLS, { can_update: true, can_delete: true }),
      ],
    });
    expect(resolveBillEditActions(me).canDelete).toBe(true);
  });

  it("grants all actions for is_admin with empty modules", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(resolveBillEditActions(me)).toEqual({
      canEdit: true,
      canDelete: true,
      canSubmitForReview: true,
      canComplete: true,
    });
  });

  it("returns all false when me is undefined", () => {
    expect(resolveBillEditActions(undefined)).toEqual({
      canEdit: false,
      canDelete: false,
      canSubmitForReview: false,
      canComplete: false,
    });
  });
});

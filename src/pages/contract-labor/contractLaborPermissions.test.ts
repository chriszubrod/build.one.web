import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import {
  hasContractLaborPermission,
  resolveContractLaborEditActions,
} from "./contractLaborPermissions";

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

describe("hasContractLaborPermission", () => {
  it("returns false when me is undefined or null", () => {
    expect(hasContractLaborPermission(undefined, "can_read")).toBe(false);
    expect(hasContractLaborPermission(null, "can_update")).toBe(false);
  });

  it("returns true for is_admin regardless of modules or permission flag", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(hasContractLaborPermission(me, "can_delete")).toBe(true);
    expect(hasContractLaborPermission(me, "can_create")).toBe(true);
  });
});

describe("resolveContractLaborEditActions", () => {
  it("grants edit — but NOT submit — with Contract Labor can_update alone", () => {
    // Submit's headline route POST /submit/review/contract-labor/{id} is gated
    // on Modules.TIME_TRACKING can_update; CL can_update only covers the pre-save.
    const me = makeUser({
      modules: [makeModule(Modules.CONTRACT_LABOR, { can_update: true })],
    });
    expect(resolveContractLaborEditActions(me)).toEqual({
      canEdit: true,
      canDelete: false,
      canSubmit: false,
    });
  });

  it("grants submit only with Contract Labor can_update AND Time Tracking can_update", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.CONTRACT_LABOR, { can_update: true }),
        makeModule(Modules.TIME_TRACKING, { can_update: true }),
      ],
    });
    expect(resolveContractLaborEditActions(me)).toEqual({
      canEdit: true,
      canDelete: false,
      canSubmit: true,
    });
  });

  it("does not grant submit with Time Tracking can_update alone (no CL can_update for the pre-save)", () => {
    const me = makeUser({
      modules: [makeModule(Modules.TIME_TRACKING, { can_update: true })],
    });
    expect(resolveContractLaborEditActions(me)).toEqual({
      canEdit: false,
      canDelete: false,
      canSubmit: false,
    });
  });

  it("grants delete when Contract Labor row has can_delete", () => {
    const me = makeUser({
      modules: [makeModule(Modules.CONTRACT_LABOR, { can_delete: true })],
    });
    expect(resolveContractLaborEditActions(me)).toEqual({
      canEdit: false,
      canDelete: true,
      canSubmit: false,
    });
  });

  it("does not grant submit when can_update is false", () => {
    const me = makeUser({
      modules: [makeModule(Modules.CONTRACT_LABOR, { can_delete: true, can_update: false })],
    });
    expect(resolveContractLaborEditActions(me)).toEqual({
      canEdit: false,
      canDelete: true,
      canSubmit: false,
    });
  });

  it("grants all actions for is_admin with empty modules", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(resolveContractLaborEditActions(me)).toEqual({
      canEdit: true,
      canDelete: true,
      canSubmit: true,
    });
  });

  it("returns all false when me is undefined", () => {
    expect(resolveContractLaborEditActions(undefined)).toEqual({
      canEdit: false,
      canDelete: false,
      canSubmit: false,
    });
  });

  it("returns all false when me is null", () => {
    expect(resolveContractLaborEditActions(null)).toEqual({
      canEdit: false,
      canDelete: false,
      canSubmit: false,
    });
  });
});

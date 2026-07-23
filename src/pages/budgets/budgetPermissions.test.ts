import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import { resolveBudgetEditActions } from "./budgetPermissions";

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

describe("resolveBudgetEditActions", () => {
  it("HEADLINE: does not grant activate or approve-revision when can_approve is true but can_update is false", () => {
    const me = makeUser({
      modules: [makeModule(Modules.BUDGETS, { can_approve: true, can_update: false })],
    });
    expect(resolveBudgetEditActions(me)).toEqual({
      canEdit: false,
      canActivate: false,
      canApproveRevision: false,
    });
  });

  it("grants canEdit only when Budgets row has can_update without can_approve", () => {
    const me = makeUser({
      modules: [makeModule(Modules.BUDGETS, { can_update: true })],
    });
    expect(resolveBudgetEditActions(me)).toEqual({
      canEdit: true,
      canActivate: false,
      canApproveRevision: false,
    });
  });

  it("grants all actions when Budgets row has can_update and can_approve", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.BUDGETS, { can_update: true, can_approve: true }),
      ],
    });
    expect(resolveBudgetEditActions(me)).toEqual({
      canEdit: true,
      canActivate: true,
      canApproveRevision: true,
    });
  });

  it("grants all actions for is_admin with empty modules", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(resolveBudgetEditActions(me)).toEqual({
      canEdit: true,
      canActivate: true,
      canApproveRevision: true,
    });
  });

  it("returns all false when me is undefined or null", () => {
    const allFalse = {
      canEdit: false,
      canActivate: false,
      canApproveRevision: false,
    };
    expect(resolveBudgetEditActions(undefined)).toEqual(allFalse);
    expect(resolveBudgetEditActions(null)).toEqual(allFalse);
  });

  it("does not grant Budget actions from a different module row", () => {
    const me = makeUser({
      modules: [
        makeModule(Modules.BILLS, {
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
    expect(resolveBudgetEditActions(me)).toEqual({
      canEdit: false,
      canActivate: false,
      canApproveRevision: false,
    });
  });
});

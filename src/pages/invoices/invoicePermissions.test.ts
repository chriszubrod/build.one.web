import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import { hasInvoicePermission, resolveInvoiceEditActions } from "./invoicePermissions";

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

describe("hasInvoicePermission", () => {
  it("returns false when me is undefined or null", () => {
    expect(hasInvoicePermission(undefined, "can_read")).toBe(false);
    expect(hasInvoicePermission(null, "can_delete")).toBe(false);
  });

  it("returns true for is_admin regardless of modules or permission flag", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(hasInvoicePermission(me, "can_delete")).toBe(true);
  });
});

describe("resolveInvoiceEditActions", () => {
  it("grants delete when Invoices row has can_delete", () => {
    const me = makeUser({
      modules: [makeModule(Modules.INVOICES, { can_delete: true })],
    });
    expect(resolveInvoiceEditActions(me)).toEqual({ canDelete: true });
  });

  it("does not grant delete without can_delete", () => {
    const me = makeUser({
      modules: [makeModule(Modules.INVOICES, { can_read: true, can_update: true })],
    });
    expect(resolveInvoiceEditActions(me)).toEqual({ canDelete: false });
  });

  it("grants delete for is_admin with empty modules", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(resolveInvoiceEditActions(me)).toEqual({ canDelete: true });
  });

  it("returns canDelete false when me is undefined", () => {
    expect(resolveInvoiceEditActions(undefined)).toEqual({ canDelete: false });
  });
});

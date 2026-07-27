import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import { hasReviewStatusPermission } from "./reviewStatusPermissions";

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

describe("hasReviewStatusPermission", () => {
  it("returns false when me is undefined or null", () => {
    expect(hasReviewStatusPermission(undefined, "can_read")).toBe(false);
    expect(hasReviewStatusPermission(null, "can_create")).toBe(false);
  });

  it("returns true for is_admin regardless of modules or permission flag", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(hasReviewStatusPermission(me, "can_delete")).toBe(true);
    expect(hasReviewStatusPermission(me, "can_create")).toBe(true);
  });

  it("returns true when the Review Statuses module row carries the requested permission", () => {
    const me = makeUser({
      modules: [makeModule(Modules.REVIEW_STATUSES, { can_update: true })],
    });
    expect(hasReviewStatusPermission(me, "can_update")).toBe(true);
  });

  it("returns false when the Review Statuses module is absent", () => {
    const me = makeUser({ modules: [] });
    expect(hasReviewStatusPermission(me, "can_read")).toBe(false);
  });

  it("returns false when the Review Statuses module row has the permission flag false", () => {
    const me = makeUser({
      modules: [makeModule(Modules.REVIEW_STATUSES, { can_create: false })],
    });
    expect(hasReviewStatusPermission(me, "can_create")).toBe(false);
  });
});

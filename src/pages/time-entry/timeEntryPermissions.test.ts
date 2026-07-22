import { describe, it, expect } from "vitest";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";
import { canApproveTimeEntry, canViewTeamTimeEntries } from "./timeEntryPermissions";

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

function describeHelper(
  name: "canViewTeamTimeEntries" | "canApproveTimeEntry",
  fn: (me: CurrentUser | undefined | null) => boolean,
  grantKey: "can_view_team" | "can_approve",
) {
  describe(name, () => {
    it("returns false when me is undefined or null", () => {
      expect(fn(undefined)).toBe(false);
      expect(fn(null)).toBe(false);
    });

    it("returns true for is_admin with no Time Tracking module row", () => {
      const me = makeUser({ is_admin: true, modules: [] });
      expect(fn(me)).toBe(true);
    });

    it("returns true for is_admin when Time Tracking row has every flag false", () => {
      const me = makeUser({
        is_admin: true,
        modules: [
          makeModule(Modules.TIME_TRACKING, {
            can_view_team: false,
            can_approve: false,
            can_update: false,
            can_read: false,
          }),
        ],
      });
      expect(fn(me)).toBe(true);
    });

    it(`returns true for non-admin with Time Tracking ${grantKey}`, () => {
      const me = makeUser({
        modules: [makeModule(Modules.TIME_TRACKING, { [grantKey]: true })],
      });
      expect(fn(me)).toBe(true);
    });

    it(`returns false for non-admin with Time Tracking row but ${grantKey} false`, () => {
      const me = makeUser({
        modules: [
          makeModule(Modules.TIME_TRACKING, {
            can_view_team: grantKey !== "can_view_team",
            can_approve: grantKey !== "can_approve",
            can_update: true,
            can_read: true,
          }),
        ],
      });
      expect(fn(me)).toBe(false);
    });

    it("returns false for non-admin with no Time Tracking row", () => {
      const me = makeUser({
        modules: [makeModule(Modules.VENDORS, { can_read: true })],
      });
      expect(fn(me)).toBe(false);
    });
  });
}

describeHelper("canViewTeamTimeEntries", canViewTeamTimeEntries, "can_view_team");
describeHelper("canApproveTimeEntry", canApproveTimeEntry, "can_approve");

describe("canApproveTimeEntry", () => {
  it("gates Approve/Reject on can_approve, never can_update", () => {
    const updateOnly = makeUser({
      modules: [
        makeModule(Modules.TIME_TRACKING, {
          can_update: true,
          can_approve: false,
        }),
      ],
    });
    expect(canApproveTimeEntry(updateOnly)).toBe(false);

    const approveOnly = makeUser({
      modules: [
        makeModule(Modules.TIME_TRACKING, {
          can_update: false,
          can_approve: true,
        }),
      ],
    });
    expect(canApproveTimeEntry(approveOnly)).toBe(true);
  });
});

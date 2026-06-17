import { describe, it, expect } from "vitest";
import {
  primarySlotsForUser,
  entriesInSection,
  canSeeEntry,
  findMenuEntry,
} from "./menuConfig";
import type { CurrentUser, CurrentUserModule } from "../types/api";

/**
 * Test fixtures. A CurrentUser is a discriminated bag; we only build the
 * fields the menuConfig logic reads (auth.username, user.firstname,
 * role.name, is_admin, modules[]).
 */
function makeModule(
  name: string,
  perms: Partial<CurrentUserModule> = {},
): CurrentUserModule {
  return {
    public_id: `mod-${name}`,
    name,
    route: null,
    can_read: false,
    can_create: false,
    can_update: false,
    can_delete: false,
    can_submit: false,
    can_approve: false,
    can_complete: false,
    can_view_team: false,
    ...perms,
  } as CurrentUserModule;
}

function makeUser(opts: {
  role?: string | null;
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
    role: opts.role !== null && opts.role !== undefined ? { public_id: "role-id", name: opts.role } : null,
    is_admin: opts.is_admin ?? false,
    modules: opts.modules ?? [],
    accessible_project_ids: [],
  };
}

describe("primarySlotsForUser — curated per-role mapping", () => {
  it("Field Crew sees Time + Profile only (no Labor)", () => {
    const me = makeUser({
      role: "Field Crew",
      modules: [makeModule("Time Tracking", { can_read: true })],
    });
    const slots = primarySlotsForUser(me);
    expect(slots.map((s) => s.id)).toEqual(["time", "profile"]);
  });

  it("Intern uses the same slot set as Field Crew", () => {
    const me = makeUser({
      role: "Intern",
      modules: [makeModule("Time Tracking", { can_read: true })],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual(["time", "profile"]);
  });

  it("Project Manager sees Time + Labor + Profile when fully permissioned", () => {
    const me = makeUser({
      role: "Project Manager",
      modules: [
        makeModule("Time Tracking", { can_read: true }),
        makeModule("Contract Labor", { can_read: true }),
      ],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "labor",
      "profile",
    ]);
  });

  it("Project Manager without Labor permission drops the Labor slot", () => {
    const me = makeUser({
      role: "Project Manager",
      modules: [makeModule("Time Tracking", { can_read: true })],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual(["time", "profile"]);
  });

  it("Project Manager without ANY granted modules sees only unconditional Profile", () => {
    const me = makeUser({ role: "Project Manager", modules: [] });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual(["profile"]);
  });
});

describe("primarySlotsForUser — system admin", () => {
  it("System admin bypasses module gating and uses DEFAULT_PRIMARY_SLOTS", () => {
    const me = makeUser({
      role: null,
      is_admin: true,
      modules: [], // no module grants needed
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "labor",
      "profile",
    ]);
  });

  it("System admin with a role still uses DEFAULT_PRIMARY_SLOTS (admin takes precedence)", () => {
    // Christopher (id=17, IsSystemAdmin=1) holds Tenant Admin role too —
    // verify the admin bypass kicks in regardless.
    const me = makeUser({
      role: "Tenant Admin",
      is_admin: true,
      modules: [],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "labor",
      "profile",
    ]);
  });
});

describe("primarySlotsForUser — fallback behavior", () => {
  it("Unknown role falls back to DEFAULT_PRIMARY_SLOTS", () => {
    const me = makeUser({
      role: "Some Future Role We Haven't Mapped",
      modules: [
        makeModule("Time Tracking", { can_read: true }),
        makeModule("Contract Labor", { can_read: true }),
      ],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "labor",
      "profile",
    ]);
  });

  it("Null role + non-admin falls back to DEFAULT_PRIMARY_SLOTS filtered by permissions", () => {
    const me = makeUser({
      role: null,
      is_admin: false,
      modules: [makeModule("Time Tracking", { can_read: true })],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual(["time", "profile"]);
  });

  it("Returns empty array when me is undefined (pre-/auth/me load)", () => {
    expect(primarySlotsForUser(undefined)).toEqual([]);
  });
});

describe("canSeeEntry — RBAC gating", () => {
  it("Unconditional entry (module === null) is visible without modules", () => {
    const me = makeUser({ role: "Field Crew", modules: [] });
    const profile = findMenuEntry("profile")!;
    expect(canSeeEntry(profile, me)).toBe(true);
  });

  it("System admin bypass shows every module-gated entry", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    const time = findMenuEntry("time")!;
    const labor = findMenuEntry("labor")!;
    expect(canSeeEntry(time, me)).toBe(true);
    expect(canSeeEntry(labor, me)).toBe(true);
  });

  it("Module-gated entry hidden when the user lacks the module", () => {
    const me = makeUser({ role: "Field Crew", modules: [] });
    const labor = findMenuEntry("labor")!;
    expect(canSeeEntry(labor, me)).toBe(false);
  });

  it("Module-gated entry hidden when the user has the module but lacks can_read", () => {
    const me = makeUser({
      role: "Field Crew",
      modules: [makeModule("Contract Labor", { can_create: true })], // create but not read — unusual
    });
    const labor = findMenuEntry("labor")!;
    expect(canSeeEntry(labor, me)).toBe(false);
  });
});

describe("entriesInSection", () => {
  it("Returns ordered entries within a section", () => {
    const me = makeUser({ is_admin: true });
    const primary = entriesInSection("primary", me).map((e) => e.id);
    expect(primary).toEqual(["time", "labor"]); // priorities 10, 20
  });

  it("Returns empty array for a section with no entries (yet)", () => {
    const me = makeUser({ is_admin: true });
    expect(entriesInSection("financials", me)).toEqual([]);
    expect(entriesInSection("contacts", me)).toEqual([]);
    expect(entriesInSection("admin", me)).toEqual([]);
  });

  it("Account section contains Profile", () => {
    const me = makeUser({ role: "Field Crew" });
    expect(entriesInSection("account", me).map((e) => e.id)).toEqual(["profile"]);
  });
});

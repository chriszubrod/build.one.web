import { describe, it, expect } from "vitest";
import {
  MENU_ENTRIES,
  PRIMARY_SLOTS_BY_ROLE,
  DEFAULT_PRIMARY_SLOTS,
  MAX_PRIMARY_SLOTS,
  primarySlotsForUser,
  secondarySectionsForUser,
  SECONDARY_SECTION_SPECS,
  entriesInSection,
  canSeeEntry,
  findMenuEntry,
  isEntryRouteActive,
} from "./menuConfig";
import { Modules } from "../shared/modules";
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

function expectNoDoubleListing(me: CurrentUser) {
  const primaryIds = new Set(primarySlotsForUser(me).map((e) => e.id));
  const overlap = secondarySectionsForUser(me)
    .flatMap((s) => s.entries.map((e) => e.id))
    .filter((id) => primaryIds.has(id));
  expect(overlap).toEqual([]);
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

  it("Project Manager sees Time + Labor + Projects + Profile when fully permissioned", () => {
    const me = makeUser({
      role: "Project Manager",
      modules: [
        makeModule("Time Tracking", { can_read: true }),
        makeModule("Contract Labor", { can_read: true }),
        makeModule("Projects", { can_read: true }),
      ],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "labor",
      "projects",
      "profile",
    ]);
  });

  it("Project Manager without Labor permission drops the Labor slot but keeps Projects", () => {
    const me = makeUser({
      role: "Project Manager",
      modules: [
        makeModule("Time Tracking", { can_read: true }),
        makeModule("Projects", { can_read: true }),
      ],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "projects",
      "profile",
    ]);
  });

  it("Project Manager without ANY granted modules sees only unconditional Profile", () => {
    const me = makeUser({ role: "Project Manager", modules: [] });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual(["profile"]);
  });

  // The Projects grant is load-bearing: with it granted, the exact toEqual
  // proves bills REPLACED projects in the curated row rather than projects
  // merely being permission-filtered out.
  it.each(["AP Specialist", "Controller"])(
    "%s sees Time + Labor + Bills + Profile when fully permissioned",
    (role) => {
      const me = makeUser({
        role,
        modules: [
          makeModule("Time Tracking", { can_read: true }),
          makeModule("Contract Labor", { can_read: true }),
          makeModule("Projects", { can_read: true }),
          makeModule("Bills", { can_read: true }),
        ],
      });
      expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
        "time",
        "labor",
        "bills",
        "profile",
      ]);
    },
  );

  it.each(["AP Specialist", "Controller"])(
    "%s without Bills permission drops the Bills slot",
    (role) => {
      const me = makeUser({
        role,
        modules: [
          makeModule("Time Tracking", { can_read: true }),
          makeModule("Contract Labor", { can_read: true }),
          makeModule("Projects", { can_read: true }),
        ],
      });
      expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
        "time",
        "labor",
        "profile",
      ]);
    },
  );
});

describe("primarySlotsForUser — system admin", () => {
  it("System admin bypasses module gating and uses DEFAULT_PRIMARY_SLOTS", () => {
    const me = makeUser({
      role: null, // system admins get role: null on /auth/me
      is_admin: true,
      modules: [], // no module grants needed
    });
    // Docs is NOT a primary slot — it lives in the reference section.
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "labor",
      "projects",
      "profile",
    ]);
  });

  it("System admin with a role uses the role's curated mapping (admin only bypasses module gating, not the slot map)", () => {
    // Christopher (id=17, IsSystemAdmin=1) holds Tenant Admin role too.
    // Tenant Admin's curated slots = ["time", "labor", "projects", "profile"]
    // which currently matches DEFAULT_PRIMARY_SLOTS — they're independent.
    const me = makeUser({
      role: "Tenant Admin",
      is_admin: true,
      modules: [],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "labor",
      "projects",
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
        makeModule("Projects", { can_read: true }),
      ],
    });
    expect(primarySlotsForUser(me).map((s) => s.id)).toEqual([
      "time",
      "labor",
      "projects",
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

  it("requiresAdmin entry (Docs) is visible to system admins", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(canSeeEntry(findMenuEntry("docs")!, me)).toBe(true);
  });

  it("requiresAdmin entry (Docs) is hidden from non-admins despite module === null", () => {
    const me = makeUser({ role: "Field Crew", is_admin: false, modules: [] });
    expect(canSeeEntry(findMenuEntry("docs")!, me)).toBe(false);
  });

  it("requiresAdmin entry (Docs) is hidden on unauth boots (me undefined)", () => {
    // Guards the canSeeEntry ordering: requiresAdmin is checked before the
    // `!me → module === null` shortcut, so an admin entry never leaks pre-auth.
    expect(canSeeEntry(findMenuEntry("docs")!, undefined)).toBe(false);
  });

  // Per-entity RBAC triad, one row per module-gated entry (TODO.md rule-of-three,
  // collapsed at the 4th entity — U-094). Raw module-name literals on purpose:
  // they pin the real wire value the nav constant must match.
  const ENTRY_MODULE_ROWS: Array<[entryId: string, moduleName: string]> = [
    ["vendors", "Vendors"],
    ["customers", "Customers"],
    ["budgets", "Budgets"],
    ["bills", "Bills"],
    ["bill-credits", "Bill Credits"],
  ];

  it.each(ENTRY_MODULE_ROWS)("%s entry visible to a user with %s can_read", (entryId, moduleName) => {
    const me = makeUser({ modules: [makeModule(moduleName, { can_read: true })] });
    expect(canSeeEntry(findMenuEntry(entryId)!, me)).toBe(true);
  });

  it.each(ENTRY_MODULE_ROWS)("%s entry hidden from a non-admin without the %s module", (entryId) => {
    const me = makeUser({ modules: [] });
    expect(canSeeEntry(findMenuEntry(entryId)!, me)).toBe(false);
  });

  it.each(ENTRY_MODULE_ROWS)("%s entry visible to system admin via bypass", (entryId) => {
    const me = makeUser({ is_admin: true, modules: [] });
    expect(canSeeEntry(findMenuEntry(entryId)!, me)).toBe(true);
  });
});

describe("entriesInSection", () => {
  it("Returns ordered entries within a section", () => {
    const me = makeUser({ is_admin: true });
    const primary = entriesInSection("primary", me).map((e) => e.id);
    expect(primary).toEqual(["time", "labor"]); // priorities 10, 20
  });

  it("Returns every financials entry ordered by priority", () => {
    const me = makeUser({ is_admin: true });
    expect(entriesInSection("financials", me).map((e) => e.id)).toEqual([
      "projects",
      "budgets",
      "bills",
      "bill-credits",
      "expenses",
      "expense-coding",
    ]);
  });

  it("Returns empty array for sections without entries yet (admin)", () => {
    const me = makeUser({ is_admin: true });
    expect(entriesInSection("admin", me)).toEqual([]);
  });

  it("Returns Vendors and Customers under contacts (Phase 1B)", () => {
    const me = makeUser({ is_admin: true });
    expect(entriesInSection("contacts", me).map((e) => e.id)).toEqual(["vendors", "vendor-compliance", "customers"]);
  });

  it("Account section contains Profile", () => {
    const me = makeUser({ role: "Field Crew" });
    expect(entriesInSection("account", me).map((e) => e.id)).toEqual(["profile"]);
  });

  it("Reference section surfaces Docs for system admins only", () => {
    const admin = makeUser({ is_admin: true });
    expect(entriesInSection("reference", admin).map((e) => e.id)).toEqual(["docs"]);
    const nonAdmin = makeUser({ role: "Field Crew" });
    expect(entriesInSection("reference", nonAdmin)).toEqual([]);
  });
});

describe("secondarySectionsForUser", () => {
  it("Field Crew with only Time Tracking can_read returns [] (no More button)", () => {
    const me = makeUser({
      role: "Field Crew",
      modules: [makeModule(Modules.TIME_TRACKING, { can_read: true })],
    });
    expect(secondarySectionsForUser(me)).toEqual([]);
  });

  it("system admin returns a contacts section with vendors and customers", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    const contacts = secondarySectionsForUser(me).find((s) => s.section === "contacts");
    expect(contacts).toBeDefined();
    expect(contacts!.entries.map((e) => e.id)).toEqual(["vendors", "vendor-compliance", "customers"]);
  });

  // U-055's actual promise: Budgets was routed but had no menu entry, so it was
  // reachable only by typing the URL. This pins the composed path both surfaces
  // call (AppSidebar + MoreDrawer/BottomTabBar), for a NON-admin who holds the
  // grant — the canSeeEntry tests above only cover the helper in isolation, and
  // the entriesInSection ordering test uses an admin, who bypasses module gating.
  it("Budgets is reachable via the financials section for a non-admin with the grant", () => {
    const me = makeUser({
      role: "Project Manager",
      modules: [makeModule("Budgets", { can_read: true })],
    });
    const financials = secondarySectionsForUser(me).find((s) => s.section === "financials");
    expect(financials?.entries.map((e) => e.id)).toEqual(["budgets"]);
  });

  it("Budgets is absent from every section for a non-admin without the grant", () => {
    const me = makeUser({ role: "Project Manager", modules: [] });
    const allIds = secondarySectionsForUser(me).flatMap((s) => s.entries.map((e) => e.id));
    expect(allIds).not.toContain("budgets");
  });

  it("AP Specialist with Bills on the primary pill lists Budgets in financials but not Bills", () => {
    const me = makeUser({
      role: "AP Specialist",
      modules: [
        makeModule("Time Tracking", { can_read: true }),
        makeModule("Contract Labor", { can_read: true }),
        makeModule("Bills", { can_read: true }),
        makeModule("Budgets", { can_read: true }),
      ],
    });
    expect(primarySlotsForUser(me).map((e) => e.id)).toContain("bills");
    const financials = secondarySectionsForUser(me).find((s) => s.section === "financials");
    expect(financials?.entries.map((e) => e.id)).toEqual(["budgets"]);
  });

  it("system admin result never contains profile or projects in any section", () => {
    const me = makeUser({ is_admin: true, modules: [] });
    const allIds = secondarySectionsForUser(me).flatMap((s) => s.entries.map((e) => e.id));
    expect(allIds).not.toContain("profile");
    expect(allIds).not.toContain("projects");
  });

  it("no primary slot id appears in secondary sections (system admin)", () => {
    expectNoDoubleListing(makeUser({ is_admin: true, modules: [] }));
  });

  it("no primary slot id appears in secondary sections (Project Manager)", () => {
    expectNoDoubleListing(
      makeUser({
        role: "Project Manager",
        modules: [
          makeModule(Modules.TIME_TRACKING, { can_read: true }),
          makeModule(Modules.CONTRACT_LABOR, { can_read: true }),
          makeModule(Modules.PROJECTS, { can_read: true }),
        ],
      }),
    );
  });

  // Tripwire for the exact bug U-046 fixed: contacts was missing from both
  // surfaces' hand-maintained lists, so a section in MENU_ENTRIES but absent
  // from SECONDARY_SECTION_SPECS renders on no surface.
  it("every non-primary MENU_ENTRIES section is listed in SECONDARY_SECTION_SPECS", () => {
    const specSections = new Set(SECONDARY_SECTION_SPECS.map((s) => s.section));
    const nonPrimarySections = new Set(
      MENU_ENTRIES.filter((e) => e.section !== "primary").map((e) => e.section),
    );
    for (const section of nonPrimarySections) {
      expect(specSections.has(section)).toBe(true);
    }
  });

  it("undefined me returns []", () => {
    expect(secondarySectionsForUser(undefined)).toEqual([]);
  });

  it("omits empty sections (admin section absent for non-admin)", () => {
    const me = makeUser({
      role: "Field Crew",
      modules: [makeModule(Modules.VENDORS, { can_read: true })],
    });
    const sections = secondarySectionsForUser(me);
    expect(sections.find((s) => s.section === "admin")).toBeUndefined();
    expect(sections.find((s) => s.section === "reference")).toBeUndefined();
    expect(sections.find((s) => s.section === "contacts")?.entries.map((e) => e.id)).toEqual([
      "vendors",
      "vendor-compliance",
    ]);
  });
});

describe("isEntryRouteActive — base-matching", () => {
  const time = findMenuEntry("time")!;

  it("findMenuEntry('time') lights on detail, list, create, and past routes", () => {
    expect(isEntryRouteActive(time, "/time-entry/123")).toBe(true);
    expect(isEntryRouteActive(time, "/time-entry/list")).toBe(true);
    expect(isEntryRouteActive(time, "/time-entry/create")).toBe(true);
    expect(isEntryRouteActive(time, "/time-entry/past/2026-07-18")).toBe(true);
  });

  it("findMenuEntry('time') is false on unrelated routes", () => {
    expect(isEntryRouteActive(time, "/labor/list")).toBe(false);
    expect(isEntryRouteActive(time, "/")).toBe(false);
  });

  it("findMenuEntry('projects') is false on /projects (plural) — segment boundary", () => {
    const projects = findMenuEntry("projects")!;
    expect(isEntryRouteActive(projects, "/projects")).toBe(false);
  });

  it("findMenuEntry('vendors') matches vendor detail but not customer detail", () => {
    const vendors = findMenuEntry("vendors")!;
    expect(isEntryRouteActive(vendors, "/vendor/456")).toBe(true);
    expect(isEntryRouteActive(vendors, "/customer/456")).toBe(false);
  });
});

describe("MENU_ENTRIES base uniqueness", () => {
  it("no two entries share the same first-segment base", () => {
    const bases = MENU_ENTRIES.map((e) => "/" + e.route.split("/")[1]);
    expect(new Set(bases).size).toBe(MENU_ENTRIES.length);
  });
});

describe("PRIMARY_SLOTS_BY_ROLE invariants (U-094 tripwire)", () => {
  const allSlotLists: Array<[name: string, ids: string[]]> = [
    ...Object.entries(PRIMARY_SLOTS_BY_ROLE),
    ["DEFAULT_PRIMARY_SLOTS", DEFAULT_PRIMARY_SLOTS],
  ];

  // BottomTabBar appends a More slot whenever the user has any secondary
  // section (realistically always), so a curated list may hold at most
  // MAX_PRIMARY_SLOTS - 1 ids or the pill exceeds its ergonomic cap.
  it.each(allSlotLists)("%s curated list leaves room for the More slot", (_name, ids) => {
    expect(ids.length).toBeLessThanOrEqual(MAX_PRIMARY_SLOTS - 1);
  });

  // primarySlotsForUser silently skips unknown ids (`if (!entry) continue`),
  // so a typo'd slot id ships a missing tab with a green suite unless pinned here.
  it.each(allSlotLists)("every slot id in %s resolves to a real menu entry", (_name, ids) => {
    for (const id of ids) {
      expect(findMenuEntry(id), `unknown slot id "${id}"`).toBeDefined();
    }
  });
});

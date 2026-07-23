import { describe, it, expect } from "vitest";
import type { ComponentType, ReactElement } from "react";
import {
  createRoutesFromElements,
  matchRoutes,
  Navigate,
  type RouteObject,
} from "react-router-dom";
import { appRouteTree } from "./routes";
import { MENU_ENTRIES } from "./layout/menuConfig";
import AppLayout from "./layout/AppLayout";

const routes = createRoutesFromElements(appRouteTree);

function branchFor(path: string) {
  return matchRoutes(routes, path);
}

function branchHasLayout(
  branch: ReturnType<typeof matchRoutes>,
  layout: ComponentType,
): boolean {
  return branch!.some(
    (m) => (m.route.element as ReactElement | undefined)?.type === layout,
  );
}

/** Every route path in the flattened tree, sorted. */
function routePaths(): string[] {
  const out: string[] = [];
  const walk = (list: RouteObject[]) => {
    for (const r of list) {
      if (r.path !== undefined) out.push(r.path);
      if (r.children) walk(r.children);
    }
  };
  walk(routes);
  return out.sort();
}

const budgetPaths = [
  "/budget/list",
  "/budget/create",
  "/budget/abc123",
  "/budget/abc123/edit",
] as const;

const billPaths = [
  "/bill/list",
  "/bill/create",
  "/bill/abc123",
  "/bill/abc123/edit",
] as const;

const expensePaths = [
  "/expense/list",
  "/expense/create",
  "/expense/abc123",
  "/expense/abc123/edit",
] as const;

describe("appRouteTree — real route tree (U-066)", () => {
  // Route-inventory tripwire. U-066 hand-moved every <Route> from App.tsx into
  // routes.tsx; dropping one during that move would otherwise stay green, since
  // the tests below only exercise /budget/* and /bill/list. Pinning every path
  // (not a count, and not just the namespace set — that stays green when a
  // namespace keeps any sibling route) means adding or removing a route fails
  // here once, deliberately, and this list is updated as a conscious edit.
  it("exposes exactly the expected route paths", () => {
    expect(routePaths()).toEqual([
      "*",
      "/",
      "/bill/*",
      "/bill/:publicId",
      "/bill/:publicId/edit",
      "/bill/create",
      "/bill/list",
      "/budget/*",
      "/budget/:publicId",
      "/budget/:publicId/edit",
      "/budget/create",
      "/budget/list",
      "/customer/:publicId",
      "/customer/:publicId/edit",
      "/customer/create",
      "/customer/list",
      "/docs",
      "/docs/:section",
      "/expense-coding",
      "/expense/*",
      "/expense/:publicId",
      "/expense/:publicId/edit",
      "/expense/create",
      "/expense/list",
      "/labor/:public_id",
      "/labor/list",
      "/login",
      "/profile",
      "/profile/appearance",
      "/profile/details",
      "/profile/details/:fieldKey",
      "/profile/security",
      "/project/:publicId",
      "/project/list",
      "/time-entry/:entryPublicId/log/:logPublicId",
      "/time-entry/:id",
      "/time-entry/create",
      "/time-entry/list",
      "/time-entry/log/new",
      "/time-entry/past/:date",
      "/user/:id",
      "/user/:id/edit",
      "/vendor-compliance",
      "/vendor-compliance/required-coverages",
      "/vendor/:publicId",
      "/vendor/:publicId/edit",
      "/vendor/create",
      "/vendor/list",
    ]);
  });

  it.each(budgetPaths)("%s matches under AppLayout", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, AppLayout)).toBe(true);
  });

  it("/budget/abc123/edit resolves to the BudgetEdit page route, not the /budget/* splat", () => {
    const branch = branchFor("/budget/abc123/edit");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/budget/:publicId/edit");
  });

  it("/budget/abc123 resolves to the BudgetView page route", () => {
    const branch = branchFor("/budget/abc123");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/budget/:publicId");
  });

  describe("/budget/* redirect catches unknown budget children", () => {
    it("/budget last match is /budget/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/budget");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/budget/*");
    });

    // React Router ranks :publicId above /* for a single segment, so
    // /budget/nonsense binds to BudgetView rather than the redirect splat.
    // The sibling /budget/* route still outranks AppLayout's * for paths
    // it owns (bare /budget and multi-segment unknowns).
    it("/budget/nonsense last match is /budget/:publicId (not AppLayout's * splat)", () => {
      const branch = branchFor("/budget/nonsense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/budget/:publicId");
    });

    it("/budget/nonsense/extra last match is /budget/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/budget/nonsense/extra");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/budget/*");
    });
  });

  it.each(billPaths)("%s matches under AppLayout", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, AppLayout)).toBe(true);
  });

  it("/bill/abc123/edit resolves to the BillEdit page route, not the /bill/* splat", () => {
    const branch = branchFor("/bill/abc123/edit");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/bill/:publicId/edit");
  });

  it("/bill/abc123 resolves to the BillView page route", () => {
    const branch = branchFor("/bill/abc123");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/bill/:publicId");
  });

  describe("/bill/* redirect catches unknown bill children", () => {
    it("/bill last match is /bill/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/bill");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/bill/*");
    });

    it("/bill/nonsense last match is /bill/:publicId (not AppLayout's * splat)", () => {
      const branch = branchFor("/bill/nonsense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/bill/:publicId");
    });

    it("/bill/nonsense/extra last match is /bill/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/bill/nonsense/extra");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/bill/*");
    });
  });

  it.each(expensePaths)("%s matches under AppLayout", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, AppLayout)).toBe(true);
  });

  it("/expense/abc123/edit resolves to the ExpenseEdit page route, not the /expense/* splat", () => {
    const branch = branchFor("/expense/abc123/edit");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/expense/:publicId/edit");
  });

  it("/expense/abc123 resolves to the ExpenseView page route", () => {
    const branch = branchFor("/expense/abc123");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/expense/:publicId");
  });

  describe("/expense/* redirect catches unknown expense children", () => {
    it("/expense last match is /expense/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/expense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/expense/*");
    });

    it("/expense/nonsense last match is /expense/:publicId (not AppLayout's * splat)", () => {
      const branch = branchFor("/expense/nonsense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/expense/:publicId");
    });

    it("/expense/nonsense/extra last match is /expense/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/expense/nonsense/extra");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/expense/*");
    });
  });
});

/**
 * Drill-down sub-screens whose BASE route is the actual nav target — excluded
 * from the nav-reachable set because users reach them from /profile or
 * /time-entry/list, not from a standalone menu slot.
 */
const INTENTIONAL_NON_NAV_ROUTES = new Set<string>([
  "/profile/details", // base: /profile
  "/profile/security", // base: /profile
  "/profile/appearance", // base: /profile
  "/time-entry/log/new", // base: /time-entry/list
  "/vendor-compliance/required-coverages", // base: /vendor-compliance (admin-only editor, dashboard header link)
]);

// Structural rules below are future-proof: a NEW entity's /entity/:id and
// /entity/create auto-exclude, but its /entity/list survives and must be
// added to MENU_ENTRIES (or INTENTIONAL_NON_NAV_ROUTES if deliberate).
function isNavExcluded(path: string): boolean {
  if (path.includes(":")) return true;
  if (path.includes("*")) return true;
  if (path.split("/").at(-1) === "create") return true;
  if (path === "/" || path === "/login") return true;
  if (INTENTIONAL_NON_NAV_ROUTES.has(path)) return true;
  return false;
}

function navReachableRoutes(): string[] {
  return routePaths().filter((p) => !isNavExcluded(p));
}

describe("routed <-> nav reconciliation (U-077)", () => {
  // Fails the day an entity ships routed but absent from menuConfig (exactly
  // U-055) — fix is EITHER add the MENU_ENTRIES entry OR, if the route is
  // intentionally not nav-reachable, add it to INTENTIONAL_NON_NAV_ROUTES
  // with a reason.
  it("every nav-reachable entity route has a MENU_ENTRIES entry (routed => nav)", () => {
    const menuRoutes = new Set(MENU_ENTRIES.map((e) => e.route));
    const missing = navReachableRoutes().filter((p) => !menuRoutes.has(p));
    expect(missing).toEqual([]);
  });

  // Nav-reachable inventory pin — mirrors "exposes exactly the expected route
  // paths" above. Fails on purpose when the derived nav-reachable set changes,
  // so adding a new entity is a conscious update here. Also guards isNavExcluded
  // from silently OVER-excluding a real landing route (a filter regression that
  // Direction A cannot catch).
  it("nav-reachable route set is exactly the expected entity landing routes", () => {
    // Hand-sorted to match navReachableRoutes()'s already-sorted output (it
    // derives from routePaths(), which sorts), same as the route-inventory pin.
    expect(navReachableRoutes()).toEqual([
      "/bill/list",
      "/budget/list",
      "/customer/list",
      "/docs",
      "/expense-coding",
      "/expense/list",
      "/labor/list",
      "/profile",
      "/project/list",
      "/time-entry/list",
      "/vendor-compliance",
      "/vendor/list",
    ]);
  });

  // Catches a menu entry pointing at a renamed/removed route, a redirect stub
  // (a 404/bounce nav link), or a route that is not an exact declared route
  // path (e.g. a typo that coincidentally matches a :param or splat).
  it("every MENU_ENTRIES route resolves to a real (non-redirect) leaf (nav => routed)", () => {
    const declaredPaths = new Set(routePaths());
    const dead = MENU_ENTRIES.filter((entry) => {
      const branch = branchFor(entry.route);
      const last = branch?.at(-1);
      const elementType = (last?.route.element as ReactElement | undefined)?.type;
      return (
        !declaredPaths.has(entry.route) ||
        branch === null ||
        last?.route.path === "*" ||
        elementType === Navigate
      );
    });
    expect(dead).toEqual([]);
  });
});

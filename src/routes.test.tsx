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

const billCreditPaths = [
  "/bill-credit/list",
  "/bill-credit/create",
  "/bill-credit/abc123",
  "/bill-credit/abc123/edit",
] as const;

const contractLaborPaths = [
  "/contract-labor/list",
  "/contract-labor/abc123",
  "/contract-labor/abc123/edit",
] as const;

const employeeLaborPaths = [
  "/employee-labor/list",
  "/employee-labor/abc123",
  "/employee-labor/abc123/edit",
] as const;

const vendorTypePaths = [
  "/vendor-type/list",
  "/vendor-type/create",
  "/vendor-type/abc123",
  "/vendor-type/abc123/edit",
] as const;

const invoicePaths = [
  "/invoice/list",
  "/invoice/abc123",
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
      "/bill-credit/*",
      "/bill-credit/:publicId",
      "/bill-credit/:publicId/edit",
      "/bill-credit/create",
      "/bill-credit/list",
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
      "/contract-labor/*",
      "/contract-labor/:publicId",
      "/contract-labor/:publicId/edit",
      "/contract-labor/bills",
      "/contract-labor/create",
      "/contract-labor/import",
      "/contract-labor/list",
      "/customer/:publicId",
      "/customer/:publicId/edit",
      "/customer/create",
      "/customer/list",
      "/docs",
      "/docs/:section",
      "/employee-labor/*",
      "/employee-labor/:publicId",
      "/employee-labor/:publicId/edit",
      "/employee-labor/create",
      "/employee-labor/list",
      "/expense-coding",
      "/expense/*",
      "/expense/:publicId",
      "/expense/:publicId/edit",
      "/expense/create",
      "/expense/list",
      "/invoice/*",
      "/invoice/:publicId",
      "/invoice/list",
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
      "/vendor-type/*",
      "/vendor-type/:publicId",
      "/vendor-type/:publicId/edit",
      "/vendor-type/create",
      "/vendor-type/list",
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

  it.each(billCreditPaths)("%s matches under AppLayout", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, AppLayout)).toBe(true);
  });

  it("/bill-credit/abc123/edit resolves to the BillCreditEdit page route, not the /bill-credit/* splat", () => {
    const branch = branchFor("/bill-credit/abc123/edit");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/bill-credit/:publicId/edit");
  });

  it("/bill-credit/abc123 resolves to the BillCreditView page route", () => {
    const branch = branchFor("/bill-credit/abc123");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/bill-credit/:publicId");
  });

  describe("/bill-credit/* redirect catches unknown bill credit children", () => {
    it("/bill-credit last match is /bill-credit/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/bill-credit");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/bill-credit/*");
    });

    it("/bill-credit/nonsense last match is /bill-credit/:publicId (not AppLayout's * splat)", () => {
      const branch = branchFor("/bill-credit/nonsense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/bill-credit/:publicId");
    });

    it("/bill-credit/nonsense/extra last match is /bill-credit/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/bill-credit/nonsense/extra");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/bill-credit/*");
    });
  });

  it.each(contractLaborPaths)("%s matches under AppLayout", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, AppLayout)).toBe(true);
  });

  it("/contract-labor/abc123/edit resolves to the ContractLaborEdit page route, not the /contract-labor/* splat", () => {
    const branch = branchFor("/contract-labor/abc123/edit");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/contract-labor/:publicId/edit");
  });

  it("/contract-labor/abc123 resolves to the ContractLaborView page route", () => {
    const branch = branchFor("/contract-labor/abc123");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/contract-labor/:publicId");
  });

  // Bills / Import / Create are deliberately parked (U-134): the API
  // generate-bills path cannibalizes already-billed records on re-run, so the
  // billing/import surfaces stay unrouted. Their literal paths redirect to the
  // list (ahead of :publicId) so stale bookmarks degrade gracefully. Routing
  // any of these to a real page again is a conscious product decision — update
  // these pins when that happens.
  it.each([
    "/contract-labor/bills",
    "/contract-labor/import",
    "/contract-labor/create",
  ] as const)("%s is a parked-surface redirect to the list, not a page (U-134)", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe(path);
    expect((last.route.element as ReactElement | undefined)?.type).toBe(Navigate);
  });

  describe("/contract-labor/* redirect catches unknown contract labor children", () => {
    it("/contract-labor last match is /contract-labor/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/contract-labor");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/contract-labor/*");
    });

    it("/contract-labor/nonsense last match is /contract-labor/:publicId (not AppLayout's * splat)", () => {
      const branch = branchFor("/contract-labor/nonsense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/contract-labor/:publicId");
    });

    it("/contract-labor/nonsense/extra last match is /contract-labor/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/contract-labor/nonsense/extra");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/contract-labor/*");
    });
  });

  it.each(employeeLaborPaths)("%s matches under AppLayout", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, AppLayout)).toBe(true);
  });

  it("/employee-labor/abc123/edit resolves to the EmployeeLaborEdit page route, not the /employee-labor/* splat", () => {
    const branch = branchFor("/employee-labor/abc123/edit");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/employee-labor/:publicId/edit");
  });

  it("/employee-labor/abc123 resolves to the EmployeeLaborView page route", () => {
    const branch = branchFor("/employee-labor/abc123");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/employee-labor/:publicId");
  });

  // Create is deliberately parked (U-136): manual-row billing footgun; EL rows are
  // auto-aggregated from TimeEntry submit. The literal path redirects to the list
  // (ahead of :publicId) so stale bookmarks degrade gracefully. Routing this to a
  // real page again is a conscious product decision — update these pins when that happens.
  it("/employee-labor/create is a parked-surface redirect to the list, not a page (U-136)", () => {
    const branch = branchFor("/employee-labor/create");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/employee-labor/create");
    expect((last.route.element as ReactElement | undefined)?.type).toBe(Navigate);
  });

  describe("/employee-labor/* redirect catches unknown employee labor children", () => {
    it("/employee-labor last match is /employee-labor/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/employee-labor");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/employee-labor/*");
    });

    it("/employee-labor/nonsense last match is /employee-labor/:publicId (not AppLayout's * splat)", () => {
      const branch = branchFor("/employee-labor/nonsense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/employee-labor/:publicId");
    });

    it("/employee-labor/nonsense/extra last match is /employee-labor/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/employee-labor/nonsense/extra");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/employee-labor/*");
    });
  });

  it.each(vendorTypePaths)("%s matches under AppLayout", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, AppLayout)).toBe(true);
  });

  it("/vendor-type/abc123/edit resolves to the VendorTypeEdit page route, not the /vendor-type/* splat", () => {
    const branch = branchFor("/vendor-type/abc123/edit");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/vendor-type/:publicId/edit");
  });

  it("/vendor-type/abc123 resolves to the VendorTypeView page route", () => {
    const branch = branchFor("/vendor-type/abc123");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/vendor-type/:publicId");
  });

  describe("/vendor-type/* redirect catches unknown vendor type children", () => {
    it("/vendor-type last match is /vendor-type/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/vendor-type");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/vendor-type/*");
    });

    it("/vendor-type/nonsense last match is /vendor-type/:publicId (not AppLayout's * splat)", () => {
      const branch = branchFor("/vendor-type/nonsense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/vendor-type/:publicId");
    });

    it("/vendor-type/nonsense/extra last match is /vendor-type/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/vendor-type/nonsense/extra");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/vendor-type/*");
    });
  });

  it.each(invoicePaths)("%s matches under AppLayout", (path) => {
    const branch = branchFor(path);
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, AppLayout)).toBe(true);
  });

  it("/invoice/abc123 resolves to the InvoiceView page route", () => {
    const branch = branchFor("/invoice/abc123");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/invoice/:publicId");
  });

  describe("/invoice/* redirect catches unknown invoice children", () => {
    it("/invoice last match is /invoice/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/invoice");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/invoice/*");
    });

    it("/invoice/nonsense last match is /invoice/:publicId (not AppLayout's * splat)", () => {
      const branch = branchFor("/invoice/nonsense");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/invoice/:publicId");
    });

    it("/invoice/nonsense/extra last match is /invoice/* (not AppLayout's * splat)", () => {
      const branch = branchFor("/invoice/nonsense/extra");
      expect(branch).not.toBeNull();
      const last = branch!.at(-1)!;
      expect(last.route.path).toBe("/invoice/*");
    });
  });

  it("/invoice/abc123/edit falls to the /invoice/* splat — edit is deliberately unrouted (QBO-first, U-128)", () => {
    const branch = branchFor("/invoice/abc123/edit");
    expect(branch).not.toBeNull();
    const last = branch!.at(-1)!;
    expect(last.route.path).toBe("/invoice/*");
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
  "/contract-labor/bills", // parked-surface redirect → /contract-labor/list (U-134)
  "/contract-labor/import", // parked-surface redirect → /contract-labor/list (U-134)
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
      "/bill-credit/list",
      "/bill/list",
      "/budget/list",
      "/contract-labor/list",
      "/customer/list",
      "/docs",
      "/employee-labor/list",
      "/expense-coding",
      "/expense/list",
      "/invoice/list",
      "/labor/list",
      "/profile",
      "/project/list",
      "/time-entry/list",
      "/vendor-compliance",
      "/vendor-type/list",
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

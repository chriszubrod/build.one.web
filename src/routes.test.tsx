import { describe, it, expect } from "vitest";
import type { ComponentType, ReactElement } from "react";
import {
  createRoutesFromElements,
  matchRoutes,
  type RouteObject,
} from "react-router-dom";
import { appRouteTree } from "./routes";
import AppLayout from "./layout/AppLayout";
import BillLayout from "./layout/BillLayout";

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
      "/vendor/:publicId",
      "/vendor/:publicId/edit",
      "/vendor/create",
      "/vendor/list",
    ]);
  });

  it.each(budgetPaths)(
    "%s matches under AppLayout, not BillLayout",
    (path) => {
      const branch = branchFor(path);
      expect(branch).not.toBeNull();
      expect(branchHasLayout(branch, AppLayout)).toBe(true);
      expect(branchHasLayout(branch, BillLayout)).toBe(false);
    },
  );

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

  it("/bill/list is still under BillLayout, not AppLayout", () => {
    const branch = branchFor("/bill/list");
    expect(branch).not.toBeNull();
    expect(branchHasLayout(branch, BillLayout)).toBe(true);
    expect(branchHasLayout(branch, AppLayout)).toBe(false);
  });
});

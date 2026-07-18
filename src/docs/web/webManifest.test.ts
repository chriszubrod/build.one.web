import { describe, it, expect } from "vitest";
import { createRoutesFromElements, type RouteObject } from "react-router-dom";
import { appRouteTree } from "../../routes";
import { MENU_ENTRIES } from "../../layout/menuConfig";
import { webManifest } from "../../pages/docs/webManifest";

const routes = createRoutesFromElements(appRouteTree);

/** Every route path in the flattened tree. */
function routePaths(): string[] {
  const out: string[] = [];
  const walk = (list: RouteObject[]) => {
    for (const r of list) {
      if (r.path !== undefined) out.push(r.path);
      if (r.children) walk(r.children);
    }
  };
  walk(routes);
  return out;
}

function menuBaseSegments(): Set<string> {
  return new Set(MENU_ENTRIES.map((e) => "/" + e.route.split("/")[1]));
}

describe("web-manifest freshness tripwire (U-085)", () => {
  // Index routes have no path — they are guarded by gen-web-docs-manifest.mjs loud-fail, not this set equality.
  it("route path set matches the live appRouteTree", () => {
    const live = new Set(routePaths());
    const manifest = new Set(webManifest.routes.map((r) => r.path));
    expect(manifest).toEqual(live);
  });

  it("every manifest route with nav_group has a real MENU_ENTRIES base segment", () => {
    const menuBases = menuBaseSegments();
    const orphans = webManifest.routes.filter(
      (r) => r.nav_group != null && !menuBases.has("/" + r.path.split("/")[1]),
    );
    expect(orphans).toEqual([]);
  });

  it("counts.routes equals routes.length", () => {
    expect(webManifest.counts.routes).toBe(webManifest.routes.length);
  });

  it("freshness.class is derived", () => {
    expect(webManifest.freshness.class).toBe("derived");
  });
});

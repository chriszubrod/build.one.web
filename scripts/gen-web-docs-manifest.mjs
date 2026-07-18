#!/usr/bin/env node
/**
 * Build-time introspection of the web app's route tree + nav config. Produces
 * src/docs/web/web-manifest.json for the admin /docs "Web" section. Does NOT
 * import or execute React — parses source with the TypeScript compiler API only.
 *
 *   npm run docs:sync:web
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function readSource(relativePath) {
  const text = readFileSync(join(repoRoot, relativePath), "utf8");
  return ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findVariableInitializer(sourceFile, name) {
  /** @type {ts.Expression | undefined} */
  let result;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      result = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}

function unwrapParen(node) {
  let n = node;
  while (n && ts.isParenthesizedExpression(n)) {
    n = n.expression;
  }
  return n;
}

function jsxTagName(tagName, sourceFile) {
  if (ts.isIdentifier(tagName)) return tagName.text;
  return tagName.getText(sourceFile);
}

/** @param {ts.JsxOpeningElement | ts.JsxSelfClosingElement} opening */
function getJsxAttributes(opening) {
  /** @type {Record<string, string | ts.Expression | true>} */
  const attrs = {};
  for (const attr of opening.attributes.properties) {
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
      const name = attr.name.text;
      if (!attr.initializer) {
        attrs[name] = true;
      } else if (ts.isStringLiteral(attr.initializer)) {
        attrs[name] = attr.initializer.text;
      } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        attrs[name] = attr.initializer.expression;
      }
    }
  }
  return attrs;
}

/** @param {ts.Expression | undefined} expr */
function unwrapJsxElement(expr) {
  if (!expr) return null;
  if (ts.isParenthesizedExpression(expr)) return unwrapJsxElement(expr.expression);
  if (ts.isJsxSelfClosingElement(expr) || ts.isJsxElement(expr)) return expr;
  return null;
}

/** @param {ts.JsxElement | ts.JsxSelfClosingElement} jsxEl */
function getJsxTag(jsxEl, sourceFile) {
  const opening = ts.isJsxElement(jsxEl) ? jsxEl.openingElement : jsxEl;
  return jsxTagName(opening.tagName, sourceFile);
}

/** @param {ts.JsxElement | ts.JsxSelfClosingElement} child */
function hasRouteChildren(child, sourceFile) {
  if (!ts.isJsxElement(child)) return false;
  for (const c of child.children) {
    if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) {
      if (getJsxTag(c, sourceFile) === "Route") return true;
    }
  }
  return false;
}

/** @param {ts.JsxElement | ts.JsxSelfClosingElement} jsxEl */
function unwrapSuspense(jsxEl, sourceFile) {
  const tag = getJsxTag(jsxEl, sourceFile);
  if (tag === "Suspense" && ts.isJsxElement(jsxEl)) {
    for (const child of jsxEl.children) {
      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        return child;
      }
    }
  }
  return jsxEl;
}

function parseStringLiteral(text) {
  if (!text) return null;
  const m = text.match(/^["'`](.*)["'`]$/s);
  return m ? m[1] : null;
}

/** @param {Record<string, string>} modules */
function resolveModule(exprText, modules) {
  if (exprText === "null") return null;
  const m = exprText.match(/^Modules\.(\w+)$/);
  if (m) return modules[m[1]] ?? m[1];
  return null;
}

function parseModules(sourceFile) {
  /** @type {Record<string, string>} */
  const modules = {};
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "Modules" &&
      node.initializer
    ) {
      let init = node.initializer;
      if (ts.isAsExpression(init)) init = init.expression;
      if (!ts.isObjectLiteralExpression(init)) return;
      for (const prop of init.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ts.isStringLiteral(prop.initializer)) {
          modules[prop.name.text] = prop.initializer.text;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return modules;
}

function getPropText(objLit, propName, sourceFile) {
  for (const prop of objLit.properties) {
    if (ts.isPropertyAssignment(prop)) {
      let key = null;
      if (ts.isIdentifier(prop.name)) key = prop.name.text;
      else if (ts.isStringLiteral(prop.name)) key = prop.name.text;
      if (key === propName) {
        return prop.initializer.getText(sourceFile);
      }
    }
  }
  return null;
}

/** @param {Record<string, string>} modules */
function parseMenuEntries(sourceFile, modules) {
  const init = findVariableInitializer(sourceFile, "MENU_ENTRIES");
  if (!init || !ts.isArrayLiteralExpression(init)) {
    return null;
  }

  /** @type {Record<string, { navGroup: string; navLabel: string; module: string | null; permission: string | null; requiresAdmin: boolean }>} */
  const menuByBase = {};

  for (const el of init.elements) {
    if (!ts.isObjectLiteralExpression(el)) continue;

    const routeRaw = getPropText(el, "route", sourceFile);
    const route = parseStringLiteral(routeRaw);
    if (!route) continue;

    const label = parseStringLiteral(getPropText(el, "label", sourceFile)) ?? "";
    const section = parseStringLiteral(getPropText(el, "section", sourceFile)) ?? "";
    const moduleText = getPropText(el, "module", sourceFile);
    const module = resolveModule(moduleText ?? "null", modules);
    const permissionRaw = getPropText(el, "permission", sourceFile);
    const permission = module ? (parseStringLiteral(permissionRaw) ?? "can_read") : null;
    const requiresAdmin = getPropText(el, "requiresAdmin", sourceFile) === "true";

    // Key nav entries by first path segment — the same "which entry owns this
    // URL" model the live app uses in menuConfig.ts `isEntryRouteActive`.
    const base = "/" + route.split("/")[1];
    menuByBase[base] = {
      navGroup: section,
      navLabel: label,
      module,
      permission,
      requiresAdmin,
    };
  }

  return menuByBase;
}

/**
 * @param {ts.NodeArray<ts.JsxChild>} children
 * @param {{ auth: "public" | "protected"; layout: "none" | "AppLayout" }} context
 * @param {Record<string, unknown>[]} routes
 * @param {Record<string, { navGroup: string; navLabel: string; module: string | null; permission: string | null; requiresAdmin: boolean }>} menuByBase
 * @param {ts.SourceFile} sourceFile
 */
function walkJsxChildren(children, context, routes, menuByBase, sourceFile) {
  for (const child of children) {
    if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) continue;

    const opening = ts.isJsxElement(child) ? child.openingElement : child;
    const tag = jsxTagName(opening.tagName, sourceFile);
    if (tag !== "Route") continue;

    const attrs = getJsxAttributes(opening);
    const path = typeof attrs.path === "string" ? attrs.path : null;

    if (path) {
      const elementExpr = attrs.element;
      let jsxEl = elementExpr ? unwrapJsxElement(/** @type {ts.Expression} */ (elementExpr)) : null;
      if (jsxEl) jsxEl = unwrapSuspense(jsxEl, sourceFile);

      let kind = "page";
      let component = "Unknown";
      /** @type {string | undefined} */
      let redirect_to;

      if (jsxEl) {
        const elTag = getJsxTag(jsxEl, sourceFile);
        if (elTag === "Navigate") {
          kind = "redirect";
          component = "Navigate";
          const navOpening = ts.isJsxElement(jsxEl) ? jsxEl.openingElement : jsxEl;
          const to = getJsxAttributes(navOpening).to;
          redirect_to = typeof to === "string" ? to : undefined;
        } else {
          component = elTag;
        }
      }

      const seg = path.split("/")[1];
      const base = seg !== undefined ? "/" + seg : path;
      const nav = menuByBase[base] ?? {
        navGroup: null,
        navLabel: null,
        module: null,
        permission: null,
        requiresAdmin: false,
      };

      /** @type {Record<string, unknown>} */
      const row = {
        path,
        component,
        kind,
        auth: context.auth,
        layout: context.layout,
        nav_group: nav.navGroup,
        nav_label: nav.navLabel,
        module: nav.module,
        permission: nav.permission,
        requires_admin: nav.requiresAdmin,
      };
      if (kind === "redirect" && redirect_to !== undefined) {
        row.redirect_to = redirect_to;
      }
      routes.push(row);
    } else if (hasRouteChildren(child, sourceFile)) {
      /** @type {{ auth: "public" | "protected"; layout: "none" | "AppLayout" }} */
      const newContext = { ...context };
      const elementExpr = attrs.element;
      if (elementExpr) {
        const jsxEl = unwrapJsxElement(/** @type {ts.Expression} */ (elementExpr));
        if (jsxEl) {
          const elTag = getJsxTag(jsxEl, sourceFile);
          if (elTag === "ProtectedRoute") newContext.auth = "protected";
          if (elTag === "AppLayout") newContext.layout = "AppLayout";
        }
      }
      if (ts.isJsxElement(child)) {
        walkJsxChildren(child.children, newContext, routes, menuByBase, sourceFile);
      }
    } else {
      const snippet = child.getText(sourceFile).slice(0, 120);
      console.error(
        `Unrecognized <Route> shape (no path, not a layout wrapper): ${snippet}\n` +
          "gen-web-docs-manifest.mjs only understands path routes and layout-wrapper routes. Extend it to represent this route (e.g. an index route) so the /docs Web table cannot silently drift.",
      );
      process.exit(1);
    }
  }
}

function parseRoutes(routesSource, menuByBase) {
  const init = findVariableInitializer(routesSource, "appRouteTree");
  if (!init) return null;

  const root = unwrapParen(init);
  if (!root || !ts.isJsxFragment(root)) return null;

  /** @type {Record<string, unknown>[]} */
  const routes = [];
  walkJsxChildren(
    root.children,
    { auth: "public", layout: "none" },
    routes,
    menuByBase,
    routesSource,
  );

  routes.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return routes;
}

// --- main ---

const modulesSource = readSource("src/shared/modules.ts");
const menuSource = readSource("src/layout/menuConfig.ts");
const routesSource = readSource("src/routes.tsx");

const MODULES = parseModules(modulesSource);
const menuByBase = parseMenuEntries(menuSource, MODULES);
if (!menuByBase) {
  console.error("✗ Could not find MENU_ENTRIES array in src/layout/menuConfig.ts");
  process.exit(1);
}

const routes = parseRoutes(routesSource, menuByBase);
if (!routes) {
  console.error("✗ Could not find appRouteTree JSX fragment in src/routes.tsx");
  process.exit(1);
}

const counts = {
  routes: routes.length,
  nav_reachable: routes.filter((r) => r.nav_group != null && r.kind === "page").length,
  protected: routes.filter((r) => r.auth === "protected").length,
  public: routes.filter((r) => r.auth === "public").length,
  admin_only: routes.filter((r) => r.requires_admin === true).length,
  redirects: routes.filter((r) => r.kind === "redirect").length,
};

const manifest = {
  repo: "build.one.web",
  freshness: {
    class: "derived",
    live: false,
    source_commit: git(["rev-parse", "--short", "HEAD"]),
    source_commit_date: git(["log", "-1", "--format=%cI"]),
    source_branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    generated_at: new Date().toISOString(),
    note: "Introspected at build time from src/routes.tsx (the app's route tree) + src/layout/menuConfig.ts (nav + RBAC gating). Regenerated by `npm run docs:sync:web` on every build, so the shipped route table cannot drift from the routed app.",
  },
  app: {
    name: "build.one.web",
    framework: "React 19 · Vite · react-router-dom 7",
    landing: "LandingRedirect — Time Tracking or Profile by RBAC",
  },
  counts,
  routes,
};

const outDir = join(repoRoot, "src", "docs", "web");
const outPath = join(outDir, "web-manifest.json");
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");

const commit = manifest.freshness.source_commit ?? "?";
console.log(
  `Wrote src/docs/web/web-manifest.json — ${counts.routes} routes, ${counts.nav_reachable} nav-reachable @ ${commit}`,
);

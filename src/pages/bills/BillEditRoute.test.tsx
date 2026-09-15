import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import BillEditRoute from "./BillEditRoute";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U-462 — a different bill gets a different BillEdit instance.
 *
 * `/bill/:publicId/edit` is ONE Route, so React reconciles the same BillEdit
 * instance when only the param changes. BillEdit seeds its header form exactly
 * once — `if (item && !form …)` — and nothing resets it, so navigating from one
 * bill's edit page to another left the PREVIOUS bill's vendor, dates, number and
 * memo on screen above the NEW bill's line items (those reload, because their
 * effect keys on `item`).
 *
 * Today that is confusing rather than corrupting: `rowVersion` reads
 * `form?.row_version`, so a save carries the old bill's token and 409s. The
 * existing `useEffect(…, [publicId])` that cancels the debounce says exactly
 * that — "the stale PUT could not land anyway (RowVersion WHERE-guard)". That is
 * the entire safety argument, and it rests on the token staying stale. U-460
 * (reverted) made the token fresh and turned this into silent cross-bill
 * corruption: bill B's valid token carrying bill A's field values, verified by
 * probe. The landmine is the frozen form.
 *
 * BillEdit is mocked to a state-holding probe. The unit under test is the
 * WRAPPER — "does a param change produce a fresh instance" — and rendering the
 * real BillEdit would drag in its whole fixture harness to observe one bit.
 */

let mountCount = 0;
let lastSeenPublicId: string | null = null;

/** Stand-in for BillEdit: holds state exactly as the real form does, so a
 *  reused instance is observable as state that survived the navigation. */
function BillEditProbe() {
  const [seededWith] = useState(() => {
    mountCount += 1;
    return lastSeenPublicId;
  });
  return createElement("div", { "data-testid": "probe" }, `seeded:${seededWith ?? "none"}`);
}

vi.mock("./BillEdit", () => ({ default: () => createElement(BillEditProbe) }));

let container: HTMLDivElement;
let root: Root;
/** Navigation is driven by CLICKING a link rendered inside the router.
 *
 *  Two earlier drafts got this wrong. Re-rendering
 *  `<MemoryRouter initialEntries={[…]}>` does not navigate at all —
 *  `initialEntries` only seeds the initial history — so the param never moved
 *  and "no remount" passed as correct behaviour rather than the defect.
 *  Capturing `useNavigate()` into an outer variable then tripped the React
 *  Compiler's "cannot reassign/modify a value declared outside the component".
 *  Clicking a link is what a user does anyway. */
function NavLinks() {
  const navigate = useNavigate();
  return createElement(
    "div",
    null,
    createElement("button", {
      "data-nav": "bill-1",
      onClick: () => navigate("/bill/bill-1/edit"),
    }),
    createElement("button", {
      "data-nav": "bill-2",
      onClick: () => navigate("/bill/bill-2/edit"),
    }),
  );
}

function renderAt(path: string) {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(NavLinks),
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/bill/:publicId/edit",
            element: createElement(BillEditRoute),
          }),
        ),
      ),
    );
  });
}

function goTo(bill: "bill-1" | "bill-2") {
  const btn = container.querySelector(`[data-nav="${bill}"]`) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  act(() => {
    btn.click();
  });
}

beforeEach(() => {
  mountCount = 0;
  lastSeenPublicId = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("BillEditRoute — U-462", () => {
  it("remounts BillEdit when the bill changes", () => {
    lastSeenPublicId = "bill-1";
    renderAt("/bill/bill-1/edit");
    expect(mountCount).toBe(1);
    expect(container.textContent).toContain("seeded:bill-1");

    // Same Route, different param — React would reconcile without the key.
    lastSeenPublicId = "bill-2";
    goTo("bill-2");

    expect(mountCount).toBe(2);
    expect(container.textContent).toContain("seeded:bill-2");
  });

  it("state does NOT survive the navigation — the actual defect", () => {
    /* The probe's `useState` initialiser runs once per instance, exactly like
       BillEdit's `if (item && !form)` seed. If the instance were reused, the
       page would still be showing what it seeded from bill-1. */
    lastSeenPublicId = "bill-1";
    renderAt("/bill/bill-1/edit");
    expect(container.textContent).toContain("seeded:bill-1");

    lastSeenPublicId = "bill-2";
    goTo("bill-2");

    expect(container.textContent).not.toContain("seeded:bill-1");
  });

  it("does NOT remount on a re-render of the same bill", () => {
    /* The key must be the bill, not something that churns. Remounting on every
       render would discard in-progress edits and refetch the line items on each
       keystroke — a cure worse than the disease. */
    lastSeenPublicId = "bill-1";
    renderAt("/bill/bill-1/edit");
    goTo("bill-1");
    goTo("bill-1");

    expect(mountCount).toBe(1);
  });
});

describe("routes.tsx wiring", () => {
  it("the edit route renders the keyed wrapper, not BillEdit directly", async () => {
    /* The wrapper is inert unless the route actually uses it — the U-457 lesson
       (helpers everything tested, nothing asserting the routes called them). */
    const src = await import("../../routes.tsx?raw").then((m) => m.default as string);
    const executable = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");

    expect(executable).toMatch(/path="\/bill\/:publicId\/edit"\s+element=\{<BillEditRoute \/>\}/);
    expect(executable).not.toMatch(/path="\/bill\/:publicId\/edit"\s+element=\{<BillEdit \/>\}/);
  });
});

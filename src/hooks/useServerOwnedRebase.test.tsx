import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerOwnedRebase } from "./useServerOwnedRebase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U-471 — the shared rebase primitive.
 *
 * A token rebase is safe if and only if the freshly-arrived record differs
 * from the last-in-sync baseline ONLY in server-owned fields. These specs
 * pin that gate, `acceptBaseline`, the same-entity guard, and the U-464
 * review-transition case that must keep working.
 */

type Item = { public_id: string; row_version: string; is_draft: boolean; memo?: string };

const ITEM: Item = { public_id: "bill-1", row_version: "rv-1", is_draft: true, memo: "" };
const OWNED = ["row_version", "is_draft"] as const;

function seedFrom(i: Item) {
  return {
    memo: i.memo ?? "",
    is_draft: i.is_draft,
    row_version: i.row_version,
  };
}

let container: HTMLDivElement;
let root: Root;
let snapshot: {
  form: Record<string, unknown> | null;
  diverged: boolean;
  acceptBaseline: (i: Item) => void;
};

function Harness({
  item,
  seedId,
}: {
  item: Item | null;
  seedId: string | null;
}) {
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const seededFor = useRef<string | null>(null);
  const { diverged, acceptBaseline } = useServerOwnedRebase({
    item,
    seededFor,
    setForm,
    seedFrom,
    owned: OWNED,
  });
  // Capture the baseline WHERE we seed, the same way the pages do. A lazy
  // capture inside the hook's [item] effect misses this when the seed is
  // gated on a later render with the same item identity.
  if (item && !form && seedId && item.public_id === seedId) {
    seededFor.current = item.public_id;
    acceptBaseline(item);
    setForm(seedFrom(item));
  }
  snapshot = { form, diverged, acceptBaseline };
  return createElement("div", {
    "data-diverged": diverged ? "true" : "false",
    "data-rv": form ? String(form.row_version) : "",
    "data-memo": form ? String(form.memo ?? "") : "",
  });
}

function render(props: { item: Item | null; seedId: string | null }) {
  act(() => {
    root.render(createElement(Harness, props));
  });
}

beforeEach(() => {
  snapshot = { form: null, diverged: false, acceptBaseline: () => {} };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useServerOwnedRebase", () => {
  it("rebases the token when non-owned fields are unchanged, and is not diverged", () => {
    render({ item: ITEM, seedId: "bill-1" });
    expect(snapshot.form?.row_version).toBe("rv-1");
    render({ item: { ...ITEM, row_version: "rv-2" }, seedId: "bill-1" });
    expect(snapshot.form?.row_version).toBe("rv-2");
    expect(snapshot.form?.memo).toBe("");
    expect(snapshot.diverged).toBe(false);
  });

  it("does NOT rebase when a non-owned field changed — diverged, form untouched", () => {
    render({ item: ITEM, seedId: "bill-1" });
    const seeded = snapshot.form;
    expect(seeded).not.toBeNull();
    render({
      item: { ...ITEM, row_version: "rv-2", memo: "SERVER MEMO" },
      seedId: "bill-1",
    });
    expect(snapshot.form).toBe(seeded);
    expect(snapshot.form?.row_version).toBe("rv-1");
    expect(snapshot.form?.memo).toBe("");
    expect(snapshot.diverged).toBe(true);
  });

  it("clears diverged when a later arrival matches the baseline again", () => {
    render({ item: ITEM, seedId: "bill-1" });
    render({
      item: { ...ITEM, row_version: "rv-2", memo: "SERVER MEMO" },
      seedId: "bill-1",
    });
    expect(snapshot.diverged).toBe(true);
    expect(snapshot.form?.row_version).toBe("rv-1");

    render({ item: { ...ITEM, row_version: "rv-3" }, seedId: "bill-1" });
    expect(snapshot.diverged).toBe(false);
    expect(snapshot.form?.row_version).toBe("rv-3");
  });

  it("acceptBaseline moves the baseline: save, then an arrival carrying the saved values is not diverged", () => {
    render({ item: ITEM, seedId: "bill-1" });
    const saved: Item = { ...ITEM, memo: "typed-then-saved", row_version: "rv-2" };
    act(() => {
      snapshot.acceptBaseline(saved);
    });
    render({ item: { ...saved, row_version: "rv-3" }, seedId: "bill-1" });
    expect(snapshot.diverged).toBe(false);
    expect(snapshot.form?.row_version).toBe("rv-3");
  });

  it("REFUSES a value from a different entity — no rebase and no diverged", () => {
    render({ item: ITEM, seedId: "bill-1" });
    const seeded = snapshot.form;
    render({
      item: { public_id: "a-different-bill", row_version: "someone-elses-token", is_draft: false, memo: "nope" },
      seedId: "bill-1",
    });
    expect(snapshot.form).toBe(seeded);
    expect(snapshot.form?.row_version).toBe("rv-1");
    expect(snapshot.diverged).toBe(false);
  });

  it("owned-only change (a review transition) rebases and is not diverged", () => {
    /* The case U-464 existed for: CreateReview writes the parent row and
       bumps ROWVERSION (and may flip is_draft). The next save must not 409. */
    render({ item: ITEM, seedId: "bill-1" });
    render({
      item: { ...ITEM, row_version: "rv-after-approval", is_draft: false },
      seedId: "bill-1",
    });
    expect(snapshot.form?.row_version).toBe("rv-after-approval");
    expect(snapshot.form?.is_draft).toBe(false);
    expect(snapshot.form?.memo).toBe("");
    expect(snapshot.diverged).toBe(false);
  });

  it("does nothing before the form has been seeded", () => {
    render({ item: ITEM, seedId: null });
    expect(snapshot.form).toBeNull();
    expect(snapshot.diverged).toBe(false);
  });

  it("returns the SAME form object when nothing moved, so it cannot loop", () => {
    render({ item: ITEM, seedId: "bill-1" });
    const seeded = snapshot.form;
    render({ item: { ...ITEM }, seedId: "bill-1" });
    expect(snapshot.form).toBe(seeded);
  });

  it("handles a null item without throwing", () => {
    render({ item: ITEM, seedId: "bill-1" });
    render({ item: null, seedId: "bill-1" });
    expect(snapshot.form?.row_version).toBe("rv-1");
    expect(snapshot.diverged).toBe(false);
  });
});

/**
 * P0 — BillEdit's real shape. The seed waits on lookups that often arrive
 * AFTER the first `item`. A lazy `[item]` capture then either never runs
 * (same identity when the lists land) or captures a later co-editor as
 * "in sync" and rebases a fresh token onto a stale body.
 *
 * Two halves of the same fix, both required:
 *   - acceptBaseline at the seed site makes `diverged` true (banner).
 *   - the hook's fail-safe (no baseline → no rebase) stops a later arrival
 *     from becoming the baseline even if a page forgets acceptBaseline.
 * Restoring the lazy capture must turn the fail-safe spec RED.
 */
function DeferredHarness({
  item,
  lookupsReady,
  captureBaseline,
}: {
  item: Item | null;
  lookupsReady: boolean;
  captureBaseline: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const seededFor = useRef<string | null>(null);
  const { diverged, acceptBaseline } = useServerOwnedRebase({
    item,
    seededFor,
    setForm,
    seedFrom,
    owned: OWNED,
  });
  if (item && !form && lookupsReady) {
    seededFor.current = item.public_id;
    if (captureBaseline) acceptBaseline(item);
    setForm(seedFrom(item));
  }
  snapshot = { form, diverged, acceptBaseline };
  return null;
}

function renderDeferred(props: {
  item: Item | null;
  lookupsReady: boolean;
  captureBaseline: boolean;
}) {
  act(() => {
    root.render(createElement(DeferredHarness, props));
  });
}

describe("useServerOwnedRebase — deferred seed (P0)", () => {
  const v1: Item = { public_id: "bill-1", row_version: "v1", is_draft: true, memo: "A" };
  const v2: Item = { public_id: "bill-1", row_version: "v2", is_draft: true, memo: "B" };

  it("acceptBaseline at the gated seed: co-editor is diverged and the token stays", () => {
    renderDeferred({ item: v1, lookupsReady: false, captureBaseline: true });
    expect(snapshot.form).toBeNull();

    // Lookups arrive. Seed fires from v1. `item` identity UNCHANGED.
    renderDeferred({ item: v1, lookupsReady: true, captureBaseline: true });
    expect(snapshot.form).toEqual({ memo: "A", is_draft: true, row_version: "v1" });

    renderDeferred({ item: v2, lookupsReady: true, captureBaseline: true });
    expect(snapshot.form?.memo).toBe("A");
    expect(snapshot.diverged).toBe(true);
    expect(snapshot.form?.row_version).toBe("v1");
  });

  it("fail-safe: no baseline means no rebase even when a later item arrives", () => {
    /* The probe that reproduced the ship: seed gated off, then on with the
       SAME item identity, never calling acceptBaseline. Pre-fix the lazy
       capture treated v2 as "in sync" and wrote v2 onto A's body. */
    renderDeferred({ item: v1, lookupsReady: false, captureBaseline: false });
    expect(snapshot.form).toBeNull();

    renderDeferred({ item: v1, lookupsReady: true, captureBaseline: false });
    expect(snapshot.form).toEqual({ memo: "A", is_draft: true, row_version: "v1" });

    renderDeferred({ item: v2, lookupsReady: true, captureBaseline: false });
    expect(snapshot.form?.memo).toBe("A");
    expect(snapshot.form?.row_version).toBe("v1");
    expect(snapshot.form?.row_version).not.toBe("v2");
  });
});

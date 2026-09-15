import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useServerOwnedRebase } from "./useServerOwnedRebase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U-465 — the shared rebase primitive.
 *
 * Extracted from BillEdit (U-464) once Expense and BillCredit needed the same
 * thing. All three render `ReviewTimeline`, and a review transition writes the
 * parent row and bumps ROWVERSION — so a seed-once form keeps the pre-action
 * token and the next save returns 409. Reported live on Bill on 2026-09-15
 * (approve, then Complete, every time).
 *
 * The two properties that make this safe — and whose absence killed U-460 — are
 * what this file exists to pin:
 *   1. it rebases ONLY what `pick` returns, never what the user typed;
 *   2. it refuses a value from a DIFFERENT entity.
 */

type Item = { public_id: string; row_version: string; is_draft: boolean; memo?: string };

const ITEM: Item = { public_id: "bill-1", row_version: "rv-1", is_draft: true };

let container: HTMLDivElement;
let root: Root;

/** Drives the hook through a real render, since the repo has no
 *  @testing-library/react — the codebase's own pattern is createRoot + act. */
function Harness({
  item, seededFor, form, onForm,
}: {
  item: Item | null;
  seededFor: string | null;
  form: Record<string, unknown> | null;
  onForm: (f: Record<string, unknown> | null) => void;
}) {
  const ref = { current: seededFor };
  useServerOwnedRebase(
    item,
    ref,
    ((updater: unknown) => {
      onForm(
        typeof updater === "function"
          ? (updater as (p: Record<string, unknown> | null) => Record<string, unknown> | null)(form)
          : (updater as Record<string, unknown> | null),
      );
    }) as never,
    (i: Item) => ({ row_version: i.row_version, is_draft: i.is_draft }),
  );
  return null;
}

function render(props: Parameters<typeof Harness>[0]) {
  act(() => {
    root.render(createElement(Harness, props));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useServerOwnedRebase", () => {
  it("rebases the picked fields when the server's values move", () => {
    const seen: (Record<string, unknown> | null)[] = [];
    render({ item: { ...ITEM, row_version: "rv-2" }, seededFor: "bill-1",
             form: { memo: "typed", row_version: "rv-1", is_draft: true },
             onForm: (f) => seen.push(f) });
    expect(seen.at(-1)).toEqual({ memo: "typed", row_version: "rv-2", is_draft: true });
  });

  it("NEVER touches a field `pick` did not return", () => {
    /* The property U-460 lacked: it replayed a whole page-load-era body with a
       fresh token, silently reverting a concurrent editor's changes. */
    const seen: (Record<string, unknown> | null)[] = [];
    render({ item: { ...ITEM, row_version: "rv-2", memo: "SERVER MEMO" }, seededFor: "bill-1",
             form: { memo: "typed by the user", row_version: "rv-1", is_draft: true },
             onForm: (f) => seen.push(f) });
    expect(seen.at(-1)!.memo).toBe("typed by the user");
  });

  it("REFUSES a value from a different entity", () => {
    /* One Route per entity means React reconciles the same instance across a
       param change and the form keeps the previous entity's values. Taking the
       new entity's valid token under them is cross-entity corruption, verified
       by probe during the U-460 review. */
    const seen: (Record<string, unknown> | null)[] = [];
    render({ item: { public_id: "a-different-bill", row_version: "someone-elses-token", is_draft: false },
             seededFor: "bill-1", form: { row_version: "rv-1", is_draft: true },
             onForm: (f) => seen.push(f) });
    expect(seen).toHaveLength(0);
  });

  it("does nothing before the form has been seeded", () => {
    const seen: (Record<string, unknown> | null)[] = [];
    render({ item: ITEM, seededFor: null, form: null, onForm: (f) => seen.push(f) });
    expect(seen).toHaveLength(0);
  });

  it("returns the SAME form object when nothing moved, so it cannot loop", () => {
    /* setForm with a fresh object on every render of `item` would re-render
       forever. */
    const form = { row_version: "rv-1", is_draft: true };
    const seen: (Record<string, unknown> | null)[] = [];
    render({ item: { ...ITEM }, seededFor: "bill-1", form, onForm: (f) => seen.push(f) });
    expect(seen.at(-1)).toBe(form);
  });

  it("handles a null item without throwing", () => {
    const seen: (Record<string, unknown> | null)[] = [];
    render({ item: null, seededFor: "bill-1", form: { row_version: "rv-1", is_draft: true },
             onForm: (f) => seen.push(f) });
    expect(seen).toHaveLength(0);
  });
});

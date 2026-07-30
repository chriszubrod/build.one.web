import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import InlineLineItems, { type LineItemFieldDef } from "./InlineLineItems";
import { setInputValue } from "../__testutils__/domEvents";
import { flushUntil } from "../__testutils__/flush";
import {
  inlineLineItemInput,
  inlineLineItemInputForValue,
  inlineLineItemRows,
} from "../__testutils__/lineItemsDom";
import { newLineItemUid } from "../shared/lineItemUid";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestRow = { uid: string; description: string };

const fields: LineItemFieldDef[] = [{ key: "description", label: "Description" }];

function ControlledHarness({ initial }: { initial: TestRow[] }) {
  const [items, setItems] = useState(initial);
  return createElement(InlineLineItems<TestRow>, {
    fields,
    items,
    onChange: setItems,
    newItem: () => ({ uid: newLineItemUid(), description: "" }),
  });
}

describe("InlineLineItems row keys", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it("keeps focus and typed value on the same logical row after removing the first row", async () => {
    const seed: TestRow[] = [
      { uid: "uid-a", description: "Row-A" },
      { uid: "uid-b", description: "Row-B" },
      { uid: "uid-c", description: "Row-C" },
      { uid: "uid-d", description: "Row-D" },
    ];

    act(() => {
      root.render(createElement(ControlledHarness, { initial: seed }));
    });

    let rows = inlineLineItemRows(container);
    expect(rows).toHaveLength(4);

    const inputRowB = inlineLineItemInput(rows[1]!);
    const inputRowC = inlineLineItemInput(rows[2]!);
    const inputRowD = inlineLineItemInput(rows[3]!);

    setInputValue(inputRowD, "TRANSIENT-TYPED");
    inputRowD.focus();

    const firstRemove = rows[0]!.querySelector('button[title="Remove"]') as HTMLButtonElement;
    await act(async () => {
      firstRemove.click();
    });

    await flushUntil(() => inlineLineItemRows(container).length === 3);
    rows = inlineLineItemRows(container);
    expect(rows).toHaveLength(3);

    const descriptions = rows.map((r) => inlineLineItemInput(r).value);
    expect(descriptions).not.toContain("Row-A");
    expect(descriptions).toEqual(["Row-B", "Row-C", "TRANSIENT-TYPED"]);

    // Controlled inputs always re-sync `.value` from props — that cannot detect
    // index-key DOM reuse. Same logical row must keep the same input element.
    expect(inlineLineItemInputForValue(container, "Row-B")).toBe(inputRowB);
    expect(inlineLineItemInputForValue(container, "Row-C")).toBe(inputRowC);
    expect(inlineLineItemInputForValue(container, "TRANSIENT-TYPED")).toBe(inputRowD);

    expect(document.activeElement).toBe(inlineLineItemInputForValue(container, "TRANSIENT-TYPED"));
  });

  it("keeps remaining row values aligned after removing a middle row", async () => {
    const seed: TestRow[] = [
      { uid: "uid-1", description: "Alpha" },
      { uid: "uid-2", description: "Beta" },
      { uid: "uid-3", description: "Gamma" },
    ];

    act(() => {
      root.render(createElement(ControlledHarness, { initial: seed }));
    });

    let rows = inlineLineItemRows(container);
    expect(rows).toHaveLength(3);

    const inputAlpha = inlineLineItemInput(rows[0]!);
    const inputBeta = inlineLineItemInput(rows[1]!);
    const inputGamma = inlineLineItemInput(rows[2]!);
    setInputValue(inputBeta, "Beta-edited");

    const middleRemove = rows[1]!.querySelector('button[title="Remove"]') as HTMLButtonElement;
    await act(async () => {
      middleRemove.click();
    });

    await flushUntil(() => inlineLineItemRows(container).length === 2);
    rows = inlineLineItemRows(container);
    expect(rows).toHaveLength(2);

    const descriptions = rows.map((r) => inlineLineItemInput(r).value);
    expect(descriptions).toEqual(["Alpha", "Gamma"]);
    expect(descriptions).not.toContain("Beta");
    expect(descriptions).not.toContain("Beta-edited");

    // `.value` alone is vacuous on controlled fields; index keys reuse Beta's node for Gamma.
    expect(inlineLineItemInputForValue(container, "Alpha")).toBe(inputAlpha);
    expect(inlineLineItemInputForValue(container, "Gamma")).toBe(inputGamma);
    expect(container.contains(inputBeta)).toBe(false);
  });
});

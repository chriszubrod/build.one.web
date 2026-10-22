import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import InlineLineItems, { type LineItemFieldDef } from "./InlineLineItems";
import { setInputValue } from "../__testutils__/domEvents";
import { flushUntil, flushUntilHard } from "../__testutils__/flush";
import {
  clearCombobox,
  getComboboxValue,
  pickComboboxOptionByValue,
  tabAwayFromCombobox,
  typeInCombobox,
  waitForCombobox,
} from "../test/combobox";
import {
  inlineLineItemInput,
  inlineLineItemInputForValue,
  inlineLineItemRows,
} from "../__testutils__/lineItemsDom";
import { newLineItemUid } from "../shared/lineItemUid";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestRow = { uid: string; description: string };

const fields: LineItemFieldDef[] = [{ key: "description", label: "Description" }];

type DefaultContractRow = {
  uid: string;
  description: string;
  qty: string;
  status: string;
  billable: boolean;
  amount: string;
};

const defaultContractFields: LineItemFieldDef<DefaultContractRow>[] = [
  { key: "description", label: "Description", type: "text" },
  { key: "qty", label: "Qty", type: "number", align: "right", width: "80px" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [{ value: "open", label: "Open" }],
  },
  {
    key: "billable",
    label: "Billable",
    type: "checkbox",
    hint: () => "Bill if reimbursable",
  },
  { key: "amount", label: "Amount", type: "computed", align: "right" },
];

const defaultContractRow: DefaultContractRow = {
  uid: "snapshot-uid-1",
  description: "Line A",
  qty: "2",
  status: "open",
  billable: true,
  amount: "12.5",
};

const defaultContractExtraColumn = {
  label: "Attach",
  width: "120px",
  render: () => createElement("span", { className: "extra-col" }, "—"),
};

/** Captured from origin/main InlineLineItems for defaultContractFields + row + extraColumn. */
const EXPECTED_DEFAULT_LAYOUT_WITH_ROWS =
  '<div class="inline-line-items"><div class="inline-li-header"><h3 class="line-items-heading">Line Items (1)</h3><button type="button" class="btn btn-secondary btn-sm">+ Add Row</button></div><div class="inline-li-table-wrap"><table class="data-table inline-li-table"><thead><tr><th style="text-align:left">Description</th><th style="width:80px;text-align:right">Qty</th><th style="text-align:left">Status</th><th style="text-align:left">Billable</th><th style="text-align:right">Amount</th><th style="width:120px">Attach</th><th style="width:40px"></th></tr></thead><tbody><tr><td style="text-align:left"><input class="inline-li-input" type="text" value="Line A"/></td><td style="text-align:right"><input class="inline-li-input" type="number" step="any" value="2"/></td><td style="text-align:left"><select class="inline-li-input"><option value="">—</option><option value="open" selected="">Open</option></select></td><td style="text-align:left"><input type="checkbox" checked=""/><span class="inline-li-hint text-muted" style="display:block;font-size:11px">Bill if reimbursable</span></td><td style="text-align:right"><span class="inline-li-computed">$12.50</span></td><td><span class="extra-col">—</span></td><td><button type="button" class="inline-li-remove" title="Remove">×</button></td></tr></tbody></table></div></div>';

const EXPECTED_DEFAULT_LAYOUT_EMPTY =
  '<div class="inline-line-items"><div class="inline-li-header"><h3 class="line-items-heading">Line Items (0)</h3><button type="button" class="btn btn-secondary btn-sm">+ Add Row</button></div><div class="inline-li-table-wrap"><table class="data-table inline-li-table"><thead><tr><th style="text-align:left">Description</th><th style="width:80px;text-align:right">Qty</th><th style="text-align:left">Status</th><th style="text-align:left">Billable</th><th style="text-align:right">Amount</th><th style="width:120px">Attach</th><th style="width:40px"></th></tr></thead><tbody><tr><td colSpan="7" class="empty-state">No line items. Click &quot;+ Add Row&quot; to start.</td></tr></tbody></table></div></div>';

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

    expect(inlineLineItemInputForValue(container, "Alpha")).toBe(inputAlpha);
    expect(inlineLineItemInputForValue(container, "Gamma")).toBe(inputGamma);
    expect(container.contains(inputBeta)).toBe(false);
  });
});

describe("InlineLineItems default layout contract", () => {
  it("matches origin/main static markup with rows (field types + extra column)", () => {
    const markup = renderToStaticMarkup(
      createElement(InlineLineItems<DefaultContractRow>, {
        fields: defaultContractFields,
        items: [defaultContractRow],
        onChange: () => {},
        newItem: () => ({ ...defaultContractRow, uid: "snapshot-uid-new" }),
        extraColumn: defaultContractExtraColumn,
      }),
    );
    expect(markup).toBe(EXPECTED_DEFAULT_LAYOUT_WITH_ROWS);
  });

  it("matches origin/main static markup for empty state", () => {
    const markup = renderToStaticMarkup(
      createElement(InlineLineItems<DefaultContractRow>, {
        fields: defaultContractFields,
        items: [],
        onChange: () => {},
        newItem: () => ({ ...defaultContractRow, uid: "snapshot-uid-new" }),
        extraColumn: defaultContractExtraColumn,
      }),
    );
    expect(markup).toBe(EXPECTED_DEFAULT_LAYOUT_EMPTY);
  });

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("renders legacy table classes and remove title without measured cells", () => {
    act(() => {
      root.render(
        createElement(ControlledHarness, {
          initial: [{ uid: "u1", description: "A" }],
        }),
      );
    });
    expect(container.querySelector(".inline-li-table")).toBeTruthy();
    expect(container.querySelector(".line-items-edit-table")).toBeNull();
    expect(container.querySelector(".line-item-cell")).toBeNull();
    expect(container.querySelector('button[title="Remove"]')).toBeTruthy();
    expect(container.querySelector(".inline-li-header .line-items-heading")?.textContent).toBe(
      "Line Items (1)",
    );
    expect(container.querySelector(".inline-li-header-actions")).toBeNull();
  });
});

type MeasuredRow = { uid: string; description: string; amount: string };

describe("InlineLineItems measured layout", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onEdit = vi.fn();
  const onAdd = vi.fn();
  const onRemove = vi.fn();

  const measuredFields: LineItemFieldDef<MeasuredRow>[] = [
    {
      key: "description",
      label: "Description",
      col: { className: "bill-line-col-desc", contract: "24%" },
      render: (item, _i, update) =>
        createElement("input", {
          className: "inline-li-input custom-desc",
          value: item.description,
          onChange: (e: { target: HTMLInputElement }) => update(e.target.value),
        }),
      adornment: () => createElement("span", { className: "test-adornment" }, "badge"),
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      readOnly: true,
      col: { className: "bill-line-col-amount", contract: "5.5rem" },
      format: (v) => `$${v}`,
    },
  ];

  beforeEach(() => {
    onEdit.mockReset();
    onAdd.mockReset();
    onRemove.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  function renderMeasured(
    items: MeasuredRow[] = [{ uid: "r1", description: "X", amount: "10" }],
    extra: Record<string, unknown> = {},
  ) {
    act(() => {
      root.render(
        createElement(InlineLineItems<MeasuredRow>, {
          layout: "measured",
          actionsCol: { className: "bill-line-col-actions", contract: "2rem" },
          fields: measuredFields,
          items,
          onEdit,
          onAdd,
          onRemove,
          minRows: 1,
          removeLabel: (i) => `Remove line ${i + 1}`,
          addPlacement: "below",
          addLabel: "+ Add Line",
          footer: createElement("div", { className: "test-footer" }, "footer"),
          headerActions: createElement("span", { className: "test-header-actions" }, "chip"),
          ...extra,
        }),
      );
    });
  }

  it("renders colgroup without inline styles and measured cells with badge slots", () => {
    renderMeasured();
    const table = container.querySelector(".line-items-measured");
    expect(table).toBeTruthy();
    for (const col of table!.querySelectorAll("colgroup col")) {
      expect(col.getAttribute("style")).toBeNull();
    }
    const tds = table!.querySelectorAll("tbody tr td");
    expect(tds.length).toBeGreaterThan(0);
    for (const td of tds) {
      expect(td.classList.contains("line-item-cell")).toBe(true);
      expect(td.querySelector(".line-item-badge-slot")).toBeTruthy();
    }
    expect(container.querySelector(".test-adornment")).toBeTruthy();
    expect(container.querySelector(".custom-desc")).toBeTruthy();
    expect(container.querySelector(".line-item-readonly")?.textContent).toBe("$10");
    expect(container.querySelector(".inline-li-header-actions")).toBeTruthy();
    expect(container.querySelector('th[aria-label="Actions"]')).toBeTruthy();
  });

  it("routes onAdd, onRemove, removeLabel aria-label, headerActions, footer, add below", async () => {
    renderMeasured([
      { uid: "r1", description: "X", amount: "10" },
      { uid: "r2", description: "Y", amount: "20" },
    ]);
    expect(container.querySelector(".test-header-actions")).toBeTruthy();
    expect(container.querySelector(".test-footer")).toBeTruthy();
    expect(container.querySelector('button[aria-label="Remove line 1"]')).toBeTruthy();
    await act(async () => {
      findButton(container, "+ Add Line").click();
    });
    expect(onAdd).toHaveBeenCalled();
    await act(async () => {
      (
        container.querySelector('button[aria-label="Remove line 2"]') as HTMLButtonElement
      ).click();
    });
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("routes onEdit when render prop updates a field", async () => {
    renderMeasured();
    setInputValue(container.querySelector(".custom-desc") as HTMLInputElement, "edited");
    expect(onEdit).toHaveBeenCalledWith(0, "description", "edited");
  });

  it("hides remove when only minRows remain", () => {
    renderMeasured([{ uid: "r1", description: "X", amount: "10" }]);
    expect(container.querySelector('button[aria-label="Remove line 1"]')).toBeNull();
  });
});

function findButton(scope: HTMLElement, label: string): HTMLButtonElement {
  const btn = Array.from(scope.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!btn) throw new Error(`button ${label} not found`);
  return btn;
}

type ComboboxRow = { uid: string; description: string; status: string };

describe("InlineLineItems combobox field type", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onEdit = vi.fn();

  const comboboxOptions = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ];

  const comboboxFields: LineItemFieldDef<ComboboxRow>[] = [
    { key: "description", label: "Description", type: "text" },
    {
      key: "status",
      label: "Status",
      type: "combobox",
      options: comboboxOptions,
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    onEdit.mockReset();
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

  function ComboboxHarness({
    initialStatus = "",
    fieldExtra,
  }: {
    initialStatus?: string;
    fieldExtra?: Partial<LineItemFieldDef<ComboboxRow>>;
  }) {
    const [items, setItems] = useState<ComboboxRow[]>([
      { uid: "r1", description: "Line", status: initialStatus },
    ]);
    const fields: LineItemFieldDef<ComboboxRow>[] = [
      comboboxFields[0]!,
      { ...comboboxFields[1]!, ...fieldExtra },
    ];
    return createElement(InlineLineItems<ComboboxRow>, {
      fields,
      items,
      onEdit: (index, key, value) => {
        onEdit(index, key, value);
        setItems((prev) =>
          prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
        );
      },
      onAdd: vi.fn(),
      onRemove: vi.fn(),
    });
  }

  async function renderComboboxRow(extra?: Partial<LineItemFieldDef<ComboboxRow>>) {
    await act(async () => {
      root.render(createElement(ComboboxHarness, { fieldExtra: extra }));
    });
    await waitForCombobox(container);
  }

  function statusCombobox(): Element {
    const row = inlineLineItemRows(container)[0]!;
    const box = row.querySelectorAll("td")[1]?.querySelector(".bo-combobox");
    if (!box) throw new Error("expected combobox in column 2");
    return box;
  }

  it("renders a combobox and routes picks through onEdit like select", async () => {
    await renderComboboxRow();
    expect(statusCombobox().classList.contains("bo-combobox--inline")).toBe(true);

    await act(async () => {
      pickComboboxOptionByValue(statusCombobox(), "b");
    });
    expect(onEdit).toHaveBeenCalledWith(0, "status", "b");
  });

  it("clearing a non-required combobox emits empty string", async () => {
    await renderComboboxRow();
    await act(async () => {
      pickComboboxOptionByValue(statusCombobox(), "a");
    });
    await flushUntilHard(
      () => getComboboxValue(statusCombobox()) === "a",
      "combobox value committed",
    );
    onEdit.mockClear();
    await act(async () => {
      clearCombobox(statusCombobox());
    });
    expect(onEdit).toHaveBeenCalledWith(0, "status", "");
  });

  it("tabbing away without changing value does not call onEdit", async () => {
    await renderComboboxRow();
    await act(async () => {
      pickComboboxOptionByValue(statusCombobox(), "a");
    });
    await flushUntilHard(
      () => getComboboxValue(statusCombobox()) === "a",
      "combobox value committed",
    );
    onEdit.mockClear();
    await act(async () => {
      tabAwayFromCombobox(statusCombobox());
    });
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("honours maxResults on the inline combobox", async () => {
    const manyOptions = Array.from({ length: 10 }, (_, i) => ({
      value: String(i),
      label: `Option ${i}`,
    }));
    await act(async () => {
      root.render(
        createElement(InlineLineItems<ComboboxRow>, {
          fields: [
            comboboxFields[0]!,
            {
              key: "status",
              label: "Status",
              type: "combobox",
              options: manyOptions,
              maxResults: 3,
            },
          ],
          items: [{ uid: "r1", description: "Line", status: "" }],
          onEdit,
          onAdd: vi.fn(),
          onRemove: vi.fn(),
        }),
      );
    });
    await waitForCombobox(container);

    await act(async () => {
      typeInCombobox(statusCombobox(), "Option");
    });
    await flushUntilHard(
      () => document.querySelector(".bo-combobox-truncated-hint") !== null,
      "truncation hint visible",
    );
    expect(document.querySelector(".bo-combobox-truncated-hint")?.textContent).toMatch(
      /Keep typing/,
    );
  });

  it("keeps select behaviour unchanged", () => {
    act(() => {
      root.render(
        createElement(InlineLineItems<ComboboxRow>, {
          fields: [
            comboboxFields[0]!,
            {
              key: "status",
              label: "Status",
              type: "select",
              options: comboboxOptions,
            },
          ],
          items: [{ uid: "r1", description: "Line", status: "a" }],
          onEdit,
          onAdd: vi.fn(),
          onRemove: vi.fn(),
        }),
      );
    });
    const row = inlineLineItemRows(container)[0]!;
    const select = row.querySelector("select");
    expect(select).toBeTruthy();
    expect(select!.value).toBe("a");
    expect(row.querySelector(".bo-combobox")).toBeNull();
  });
});

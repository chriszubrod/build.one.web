import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import BillHeaderFields from "./BillHeaderFields";
import { typeInCombobox } from "../../test/combobox";
import {
  BILL_LINE_COL,
  buildBillLineFields,
  fmtBillLineMoney,
  projectOptionLabel,
  sccComboboxOptions,
  vendorComboboxOptions,
} from "./billLineFields";
import type { BillLineRow } from "./billLineFields";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function visibleRealOptionCount(): number {
  return Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).filter(
    (o) => !o.querySelector(".bo-combobox-truncated-hint"),
  ).length;
}

describe("billLineFields", () => {
  it("fmtBillLineMoney shows $0.00 for empty", () => {
    expect(fmtBillLineMoney("")).toBe("$0.00");
    expect(fmtBillLineMoney("12.5")).toBe("$12.50");
  });

  it("projectOptionLabel de-duplicates abbreviation prefix", () => {
    expect(projectOptionLabel("HP2", "HP2 - 4406 Harding")).toBe("HP2 - 4406 Harding");
    expect(projectOptionLabel("HP2", "Harding Place")).toBe("HP2 — Harding Place");
  });

  it("buildBillLineFields pins width contracts on every column", () => {
    const fields = buildBillLineFields({
      mode: "create",
      sccOptions: [],
      projectOptions: [],
    });
    const desc = fields.find((f) => f.key === "description")!;
    expect(desc.col?.className).toBe(BILL_LINE_COL.desc.className);
    expect(desc.col?.contract).toBe(BILL_LINE_COL.desc.contract);
    expect(fields.find((f) => f.key === "amount")?.readOnly).toBe(true);
  });

  it("edit mode shows suggestion chips only while showDraftBadges is set", () => {
    const line = {
      uid: "u1",
      description: "",
      quantity: "1",
      rate: "",
      amount: "",
      markup: "",
      price: "",
      is_billable: true,
      sub_cost_code_id: "10",
      project_public_id: "p-1",
      coding_prefill_state: "prefilled" as const,
      coding_suggested_sub_cost_code_id: "10",
      coding_suggested_project_public_id: "p-1",
      coding_suggestion_confidence: 72,
    };
    const chips = (showDraftBadges: boolean) => {
      const fields = buildBillLineFields({
        mode: "edit",
        sccOptions: [],
        projectOptions: [],
        showDraftBadges,
      });
      return ["sub_cost_code_id", "project_public_id"].map((key) => {
        const node = fields.find((f) => f.key === key)!.adornment!(line, 0);
        return node == null ? "" : renderToStaticMarkup(<>{node}</>);
      });
    };
    for (const html of chips(true)) expect(html).toContain("bill-line-chip");
    expect(chips(false)).toEqual(["", ""]);
  });

  describe("line combobox result caps (U-710a)", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => root.unmount());
      document.body.removeChild(container);
    });

    it("SCC line picker shows every catalog option when sub_cost_codes exceed 50", () => {
      const codes = Array.from({ length: 60 }, (_, i) => ({
        id: i + 1,
        number: `${i + 1}.00`,
        name: `Code ${i}`,
      }));
      const line: BillLineRow = {
        uid: "u1",
        description: "",
        quantity: "1",
        rate: "",
        amount: "",
        markup: "",
        price: "",
        is_billable: true,
        sub_cost_code_id: "",
        project_public_id: "",
      };
      const fields = buildBillLineFields({
        mode: "create",
        sccOptions: sccComboboxOptions(codes),
        projectOptions: [],
      });
      const sccField = fields.find((f) => f.key === "sub_cost_code_id")!;
      act(() => {
        root.render(<>{sccField.render!(line, 0, () => {})}</>);
      });
      act(() => {
        (container.querySelector(".bo-combobox-trigger") as HTMLButtonElement)?.click();
      });
      expect(visibleRealOptionCount()).toBe(60);
      expect(document.querySelector(".bo-combobox-truncated-hint")).toBeNull();
    });

    it("Project line picker shows every project option when projects exceed 50", () => {
      const projects = Array.from({ length: 60 }, (_, i) => ({
        value: `p-${i}`,
        label: `Project ${i}`,
      }));
      const line: BillLineRow = {
        uid: "u1",
        description: "",
        quantity: "1",
        rate: "",
        amount: "",
        markup: "",
        price: "",
        is_billable: true,
        sub_cost_code_id: "",
        project_public_id: "",
      };
      const fields = buildBillLineFields({
        mode: "create",
        sccOptions: [],
        projectOptions: projects,
      });
      const projectField = fields.find((f) => f.key === "project_public_id")!;
      act(() => {
        root.render(<>{projectField.render!(line, 0, () => {})}</>);
      });
      act(() => {
        (container.querySelector(".bo-combobox-trigger") as HTMLButtonElement)?.click();
      });
      expect(visibleRealOptionCount()).toBe(60);
      expect(document.querySelector(".bo-combobox-truncated-hint")).toBeNull();
    });

    it("vendor header options still use the default 50 cap with truncation hint", () => {
      const vendors = Array.from({ length: 55 }, (_, i) => ({
        public_id: `v-${i}`,
        name: `Vendor ${i}`,
      }));
      // Through the real bill header field config, so a cap change on the vendor field is caught.
      act(() => {
        root.render(
          createElement(BillHeaderFields, {
            form: {
              vendor_public_id: "",
              payment_term_public_id: "",
              bill_date: "",
              bill_number: "",
              memo: "",
            },
            onChange: vi.fn(),
            vendorOptions: vendorComboboxOptions(vendors),
            paymentTermOptions: [],
            mode: "create",
          }),
        );
      });
      act(() => {
        typeInCombobox(container, "Vendor");
      });
      expect(visibleRealOptionCount()).toBe(50);
      expect(document.querySelector(".bo-combobox-truncated-hint")?.textContent).toMatch(
        /Keep typing to narrow 5 more/,
      );
    });
  });
});

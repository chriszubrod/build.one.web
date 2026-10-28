import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import BillHeaderFields from "./BillHeaderFields";
import { setInputValue } from "../../__testutils__/domEvents";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BillHeaderFields", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("edit mode sets due_date when bill_date changes", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "edit",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "2026-01-01",
            due_date: "2026-01-01",
            bill_number: "",
            memo: "",
            is_draft: true,
          },
          onChange,
          vendorOptions: [],
          paymentTermOptions: [],
        }),
      );
    });
    act(() => {
      setInputValue(container.querySelector('input[name="bill_date"]') as HTMLInputElement, "2026-02-01");
    });
    expect(onChange).toHaveBeenCalledWith("bill_date", "2026-02-01");
    expect(onChange).toHaveBeenCalledWith("due_date", "2026-02-01");
  });

  it("does not render a Due Date field", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "edit",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "",
            bill_number: "",
            memo: "",
          },
          onChange,
          vendorOptions: [],
          paymentTermOptions: [],
        }),
      );
    });
    expect(container.querySelector('input[name="due_date"]')).toBeNull();
    expect(container.textContent).not.toContain("Due Date");
  });

  const baseForm = {
    vendor_public_id: "v-1",
    payment_term_public_id: "pt-1",
    bill_date: "2026-01-15",
    bill_number: "B-100",
    memo: "note",
  };

  function required(name: string): boolean {
    const comboboxInput = container.querySelector(
      `[data-bo-field="${name}"] input.bo-combobox-input, #${name}.bo-combobox-input`,
    ) as HTMLInputElement | null;
    if (comboboxInput) return comboboxInput.hasAttribute("required");
    return container.querySelector(`[name="${name}"]`)?.hasAttribute("required") ?? false;
  }

  it("non-full-width header fields are direct children of detail-fields-form (origin/main DOM shape)", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "create",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "",
            bill_number: "",
            memo: "",
          },
          onChange,
          vendorOptions: [{ value: "v1", label: "V1" }],
          paymentTermOptions: [{ value: "p1", label: "Net 30" }],
        }),
      );
    });
    const form = container.querySelector(".detail-fields-form")!;
    expect(form.querySelectorAll(":scope > .form-group").length).toBe(4);
    expect(form.querySelectorAll(":scope > .full-width").length).toBe(1);

    const markup = renderToStaticMarkup(
      createElement(BillHeaderFields, {
        mode: "create",
        form: baseForm,
        onChange: () => {},
        vendorOptions: [{ value: "v-1", label: "Vendor One" }],
        paymentTermOptions: [{ value: "pt-1", label: "Net 30" }],
      }),
    );
    expect(markup).toContain('label for="vendor_public_id"');
    expect(markup).toContain('label for="bill_number"');
    expect(markup).toContain('label for="bill_date"');
    expect(markup).toContain('label for="payment_term_public_id"');
    expect(markup).toContain('name="memo"');
    expect(markup).toContain("bo-combobox");
    expect(markup).toContain('value="Vendor One"');
    expect(markup).toContain('value="B-100"');
    expect(markup).toContain('value="2026-01-15"');
    expect(markup).toContain('type="hidden" name="vendor_public_id" value="v-1"');
    expect(markup).not.toMatch(/<select id="vendor_public_id"/);
  });

  it("create mode requires vendor, bill number, and bill date", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "create",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "",
            bill_number: "",
            memo: "",
          },
          onChange,
          vendorOptions: [],
          paymentTermOptions: [],
        }),
      );
    });
    expect(required("vendor_public_id")).toBe(true);
    expect(required("bill_number")).toBe(true);
    expect(required("bill_date")).toBe(true);
    expect(required("payment_term_public_id")).toBe(false);
  });

  it("create mode requires bill number and bill date even when the form says draft", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "create",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "",
            bill_number: "",
            memo: "",
            is_draft: true,
          },
          onChange,
          vendorOptions: [],
          paymentTermOptions: [],
        }),
      );
    });
    expect(required("bill_number")).toBe(true);
    expect(required("bill_date")).toBe(true);
  });

  it("edit non-draft requires bill number and bill date but not vendor", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "edit",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "",
            bill_number: "",
            memo: "",
            is_draft: false,
          },
          onChange,
          vendorOptions: [],
          paymentTermOptions: [],
        }),
      );
    });
    expect(required("vendor_public_id")).toBe(false);
    expect(required("bill_number")).toBe(true);
    expect(required("bill_date")).toBe(true);
    expect(required("payment_term_public_id")).toBe(false);
  });

  it("edit draft does not require bill number or bill date", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "edit",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "",
            bill_number: "",
            memo: "",
            is_draft: true,
          },
          onChange,
          vendorOptions: [],
          paymentTermOptions: [],
        }),
      );
    });
    expect(required("vendor_public_id")).toBe(false);
    expect(required("bill_number")).toBe(false);
    expect(required("bill_date")).toBe(false);
    expect(required("payment_term_public_id")).toBe(false);
  });

  it("edit draft shows guessed bill date note when intake prediction has no bill_date", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "edit",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "2026-10-26",
            bill_number: "",
            memo: "",
            is_draft: true,
          },
          formForPrefill: {
            is_draft: true,
            vendor_public_id: "",
            bill_number: "",
            bill_date: "2026-10-26",
          },
          intakePrediction: {
            status: "ok",
            intake_source: "list_drop",
            vendor: null,
            bill_number: null,
            bill_date: null,
            total_amount: null,
            description: null,
            sub_cost_code: null,
            project: null,
            header_confidence: null,
            coding_confidence: null,
          },
          billCreatedDatetime: "2026-10-26 12:00:00",
          onChange,
          vendorOptions: [],
          paymentTermOptions: [],
        }),
      );
    });
    const billDateGroup = container
      .querySelector('input[name="bill_date"]')
      ?.closest(".form-group");
    expect(billDateGroup?.textContent).toContain("Not read from the PDF — set to today.");
  });

  it("edit draft hides guessed bill date note after the user edits bill date", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "edit",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "2026-10-26",
            bill_number: "",
            memo: "",
            is_draft: true,
          },
          formForPrefill: {
            is_draft: true,
            vendor_public_id: "",
            bill_number: "",
            bill_date: "2026-10-26",
          },
          intakePrediction: {
            status: "ok",
            intake_source: "list_drop",
            vendor: null,
            bill_number: null,
            bill_date: null,
            total_amount: null,
            description: null,
            sub_cost_code: null,
            project: null,
            header_confidence: null,
            coding_confidence: null,
          },
          billCreatedDatetime: "2026-10-26 12:00:00",
          onChange,
          vendorOptions: [],
          paymentTermOptions: [],
        }),
      );
    });
    act(() => {
      setInputValue(
        container.querySelector('input[name="bill_date"]') as HTMLInputElement,
        "2026-10-27",
      );
    });
    const billDateGroup = container
      .querySelector('input[name="bill_date"]')
      ?.closest(".form-group");
    expect(billDateGroup?.textContent).not.toContain("Not read from the PDF");
  });

  it("create shows unmatched vendor note from PDF read", () => {
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "create",
          form: {
            vendor_public_id: "",
            payment_term_public_id: "",
            bill_date: "",
            bill_number: "",
            memo: "",
          },
          createUnmatchedVendorExtractedName: "No Match Inc",
          onChange,
          vendorOptions: [{ value: "v1", label: "V1" }],
          paymentTermOptions: [],
        }),
      );
    });
    const vendorGroup = container
      .querySelector('[data-bo-field="vendor_public_id"]')
      ?.closest(".form-group");
    expect(vendorGroup?.textContent).toContain('PDF says "No Match Inc" — no matching vendor.');
  });

  it("create re-shows unmatched vendor note after vendor is cleared", () => {
    let form = {
      vendor_public_id: "",
      payment_term_public_id: "",
      bill_date: "",
      bill_number: "",
      memo: "",
    };
    const handleChange = (name: string, value: string) => {
      form = { ...form, [name]: value };
      act(() => {
        root.render(
          createElement(BillHeaderFields, {
            mode: "create",
            form,
            createUnmatchedVendorExtractedName: "Ghost Vendor",
            onChange: handleChange,
            vendorOptions: [{ value: "v1", label: "V1" }],
            paymentTermOptions: [],
          }),
        );
      });
    };
    act(() => {
      root.render(
        createElement(BillHeaderFields, {
          mode: "create",
          form,
          createUnmatchedVendorExtractedName: "Ghost Vendor",
          onChange: handleChange,
          vendorOptions: [{ value: "v1", label: "V1" }],
          paymentTermOptions: [],
        }),
      );
    });
    handleChange("vendor_public_id", "v1");
    const vendorGroup = () =>
      container.querySelector('[data-bo-field="vendor_public_id"]')?.closest(".form-group");
    expect(vendorGroup()?.textContent).not.toContain("PDF says");
    handleChange("vendor_public_id", "");
    expect(vendorGroup()?.textContent).toContain('PDF says "Ghost Vendor" — no matching vendor.');
  });

  it("memo field spans full width on create and edit", () => {
    for (const mode of ["create", "edit"] as const) {
      act(() => {
        root.render(
          createElement(BillHeaderFields, {
            mode,
            form: {
              vendor_public_id: "",
              payment_term_public_id: "",
              bill_date: "",
              bill_number: "",
              memo: "",
              ...(mode === "edit" ? { is_draft: true } : {}),
            },
            onChange,
            vendorOptions: [],
            paymentTermOptions: [],
          }),
        );
      });
      const memoWrap = container.querySelector('textarea[name="memo"]')?.closest(".full-width");
      expect(memoWrap).toBeTruthy();
    }
  });
});

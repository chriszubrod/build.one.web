import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
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

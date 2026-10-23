import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import PossibleDuplicateDialog from "./PossibleDuplicateDialog";
import type { PossibleDuplicateMatch } from "../pages/bills/possibleDuplicate";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const match: PossibleDuplicateMatch = {
  public_id: "bill-dup",
  bill_number: "INV-9",
  bill_date: "2026-03-15",
  total_amount: "250.00",
  status: "completed",
  vendor_name: "Wilson HVAC",
  project_names: ["HE7", "SHT"],
  created_datetime: "2026-03-15",
  reasons: ["vendor_date_amount", "same_document_text"],
};

let container: HTMLDivElement;
let root: Root;

function renderDialog(props: Partial<ComponentProps<typeof PossibleDuplicateDialog>> = {}) {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(PossibleDuplicateDialog, {
          open: true,
          matches: [match],
          hiddenCount: 2,
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
          ...props,
        }),
      ),
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("PossibleDuplicateDialog", () => {
  it("renders row details, bill link, reason chips, and hidden count", () => {
    renderDialog();
    expect(container.textContent).toContain("Wilson HVAC");
    expect(container.textContent).toContain("Mar 15, 2026");
    expect(container.textContent).toContain("$250.00");
    expect(container.textContent).toContain("Completed");
    expect(container.textContent).toContain("HE7, SHT");
    expect(container.textContent).toContain("Same vendor, date & amount");
    expect(container.textContent).toContain("Same PDF content");
    expect(container.textContent).toContain("2 more matching bills you don't have access to");
    const link = container.querySelector('a[href="/bill/bill-dup"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("labels a cross-vendor bill-number match (U-723 Rule C)", () => {
    renderDialog({ matches: [{ ...match, reasons: ["same_number_amount_date"] }] });
    expect(container.textContent).toContain("Same bill #, date & amount (another vendor)");
  });

  it("focuses Cancel by default when opened", async () => {
    renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    const cancelBtn = container.querySelector(
      ".form-actions button.btn-secondary",
    ) as HTMLButtonElement;
    expect(cancelBtn.textContent?.trim()).toBe("Cancel");
    expect(document.activeElement).toBe(cancelBtn);
  });
});

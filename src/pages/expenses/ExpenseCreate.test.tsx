import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import ExpenseCreate from "./ExpenseCreate";
import { Modules } from "../../shared/modules";
import { makeModule, makeUserWithModules } from "../../__testutils__/currentUser";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../../api/client", () => ({
  post: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () => ({
    data: { vendors: [{ public_id: "v-1", name: "Acme" }] },
    loading: false,
  }),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: makeUserWithModules([
      makeModule(Modules.EXPENSES, { can_create: true, can_read: true }),
    ]),
    isLoading: false,
  }),
}));

function headerLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".detail-fields-form label")).map((l) =>
    l.textContent?.replace(/\*/g, "").trim() ?? "",
  );
}

describe("ExpenseCreate header", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(createElement(MemoryRouter, null, createElement(ExpenseCreate)));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("renders header labels in approved order", () => {
    expect(container.querySelector(".detail-fields-form")).toBeTruthy();
    expect(headerLabels(container)).toEqual([
      "Vendor",
      "Reference Number",
      "Expense Date",
      "Total Amount",
      "Memo",
      "Is Credit",
    ]);
  });

  it("marks vendor, reference number, and expense date required on create", () => {
    expect(container.querySelector('select[name="vendor_public_id"]')?.hasAttribute("required")).toBe(
      true,
    );
    expect(container.querySelector('input[name="reference_number"]')?.hasAttribute("required")).toBe(
      true,
    );
    expect(container.querySelector('input[name="expense_date"]')?.hasAttribute("required")).toBe(true);
  });

  it("keeps the PDF receipt file input below the header block", () => {
    const header = container.querySelector(".detail-fields-form")!;
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.accept).toBe("application/pdf");
    expect(fileInput.hasAttribute("required")).toBe(true);
    expect(fileInput.closest(".detail-fields-form")).toBeNull();
    expect(
      header.compareDocumentPosition(fileInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

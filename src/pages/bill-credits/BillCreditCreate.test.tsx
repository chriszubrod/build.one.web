import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BillCreditCreate from "./BillCreditCreate";
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
      makeModule(Modules.BILL_CREDITS, { can_create: true, can_read: true }),
    ]),
    isLoading: false,
  }),
}));

function headerLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".detail-fields-form label")).map((l) =>
    l.textContent?.replace(/\*/g, "").trim() ?? "",
  );
}

describe("BillCreditCreate header", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(MemoryRouter, null, createElement(BillCreditCreate)),
        ),
      );
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
      "Credit Number",
      "Credit Date",
      "Total Amount",
      "Memo",
    ]);
  });

  it("marks vendor, credit number, and credit date required on create", () => {
    expect(container.querySelector('select[name="vendor_public_id"]')?.hasAttribute("required")).toBe(
      true,
    );
    expect(container.querySelector('input[name="credit_number"]')?.hasAttribute("required")).toBe(
      true,
    );
    expect(container.querySelector('input[name="credit_date"]')?.hasAttribute("required")).toBe(true);
  });
});

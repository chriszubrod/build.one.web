import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return { ...mod, useNavigate: () => mockNavigate };
});

// One stable object: BillView's line-item effect keys on `item` identity.
const viewItem = vi.hoisted(() => ({
  item: {
    id: 1,
    public_id: "bill-1",
    bill_number: "B-100",
    vendor_id: null,
    bill_date: "2026-02-01",
    due_date: "2026-02-01",
    total_amount: "10.00",
    memo: null,
    intake_source: null,
    intake_source_detail: null,
    status: "completed",
    is_draft: false,
    review_status: null,
    },
}));

vi.mock("../../hooks/useEntity", () => ({
  useEntityItem: () => ({ item: viewItem.item, loading: false, error: "", reload: () => {} }),
}));

vi.mock("../../hooks/useIdNameMap", () => ({ useIdNameMap: () => new Map() }));

vi.mock("../../api/client", () => ({
  getList: () => Promise.resolve({ data: [] }),
  getOne: () => Promise.reject(new Error("not used")),
}));

vi.mock("../../hooks/useViewAttachmentObjectUrl", () => ({
  useViewAttachmentObjectUrl: () => ({ objectUrl: null, loading: false, loadError: false }),
}));

vi.mock("../../components/ReviewTimeline", () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockNavigate.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mountView(entry: string | { pathname: string; state?: unknown }) {
  const { default: BillView } = await import("./BillView");
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(Routes, null, createElement(Route, { path: "/bill/:publicId", element: createElement(BillView) })),
      ),
    );
  });
}

function crumbHref(): string | null {
  const a = Array.from(container.querySelectorAll<HTMLAnchorElement>(".breadcrumb a")).find(
    (el) => el.textContent?.trim() === "Bills",
  );
  expect(a).toBeDefined();
  return a!.getAttribute("href");
}

describe("BillView returns to where the user was (U-753)", () => {
  const ORIGIN = "/bill/list?status=completed&from=2026-01-01";

  it("the Bills breadcrumb points at the origin list", async () => {
    await mountView({ pathname: "/bill/bill-1", state: { returnTo: ORIGIN } });
    expect(crumbHref()).toBe(ORIGIN);
  });

  it("Edit carries the origin to the edit page", async () => {
    await mountView({ pathname: "/bill/bill-1", state: { returnTo: ORIGIN } });
    const edit = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Edit");
    expect(edit).toBeDefined();
    await act(async () => {
      edit!.click();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit", { state: { returnTo: ORIGIN } });
  });

  it("no origin → the Draft tab", async () => {
    await mountView("/bill/bill-1");
    expect(crumbHref()).toBe("/bill/list?status=draft");
  });

  it.each(["https://evil.example", "//evil.example", "/admin"])("an unsafe returnTo (%s) → the Draft tab", async (returnTo) => {
    await mountView({ pathname: "/bill/bill-1", state: { returnTo } });
    expect(crumbHref()).toBe("/bill/list?status=draft");
  });
});

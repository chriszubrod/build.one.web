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

const apiMocks = vi.hoisted(() => ({
  getList: vi.fn(),
  getOne: vi.fn(),
  viewAttachment: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => apiMocks.getList(...args),
  getOne: (...args: unknown[]) => apiMocks.getOne(...args),
}));

vi.mock("../../hooks/useViewAttachmentObjectUrl", () => ({
  useViewAttachmentObjectUrl: (id: string | null) => apiMocks.viewAttachment(id),
}));

vi.mock("../../components/ReviewTimeline", () => ({ default: () => null }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockNavigate.mockReset();
  apiMocks.getList.mockReset();
  apiMocks.getList.mockImplementation(() => Promise.resolve({ data: [] }));
  apiMocks.getOne.mockReset();
  apiMocks.getOne.mockImplementation(() => Promise.reject(new Error("not used")));
  apiMocks.viewAttachment.mockReset();
  apiMocks.viewAttachment.mockReturnValue({ objectUrl: null, loading: false, loadError: false });
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

describe("BillView shows the shared attachment from the first line that has one (U-166a)", () => {
  const LINES = [
    { id: 11, public_id: "li-1" },
    { id: 12, public_id: "li-2" },
    { id: 13, public_id: "li-3" },
  ];

  // blia: line public_id -> attachment_id for lines that carry a link; absent lines 404.
  function wire(blia: Record<string, number>) {
    apiMocks.getList.mockImplementation((path: string) =>
      path === "/api/v1/get/bill_line_items/bill/1"
        ? Promise.resolve({ data: LINES })
        : Promise.resolve({ data: [] }),
    );
    apiMocks.getOne.mockImplementation((path: string) => {
      const m = path.match(/^\/api\/v1\/get\/bill-line-item-attachment\/by-bill-line-item\/(.+)$/);
      if (m) {
        const attId = blia[m[1]];
        return attId !== undefined
          ? Promise.resolve({ public_id: `blia-${m[1]}`, attachment_id: attId })
          : Promise.reject(new Error("Not found"));
      }
      const a = path.match(/^\/api\/v1\/get\/attachment\/id\/(\d+)$/);
      if (a) return Promise.resolve({ public_id: `att-${a[1]}` });
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });
  }

  const probedLinePaths = () =>
    apiMocks.getOne.mock.calls
      .map((c) => c[0] as string)
      .filter((p) => p.includes("/by-bill-line-item/"));

  // The attachment the page is currently asked to show (last hook call's argument).
  function shownAttachment(): string | null {
    const calls = apiMocks.viewAttachment.mock.calls;
    return calls.length > 0 ? (calls[calls.length - 1][0] as string | null) : null;
  }

  async function settle() {
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  }

  it("first line has no link but a later line does → the later line's attachment is shown", async () => {
    wire({ "li-2": 7 });
    await mountView("/bill/bill-1");
    await settle();
    expect(shownAttachment()).toBe("att-7");
  });

  it("no line has a link → nothing is shown (empty state) and every line was probed", async () => {
    wire({});
    await mountView("/bill/bill-1");
    await settle();
    expect(shownAttachment()).toBeNull();
    expect(probedLinePaths()).toHaveLength(3);
  });

  it("first line has a link → it is used and later lines are not probed", async () => {
    wire({ "li-1": 5, "li-2": 6 });
    await mountView("/bill/bill-1");
    await settle();
    expect(shownAttachment()).toBe("att-5");
    expect(probedLinePaths()).toEqual(["/api/v1/get/bill-line-item-attachment/by-bill-line-item/li-1"]);
  });

  it("a slow walk for the previous bill does not overwrite the next bill's attachment (stale response)", async () => {
    const billA = viewItem.item;
    // Bill A's only line probe hangs until we release it (it will 404 → null).
    let releaseA!: () => void;
    const aProbe = new Promise<never>((_, reject) => {
      releaseA = () => reject(new Error("Not found"));
    });
    apiMocks.getList.mockImplementation((path: string) => {
      if (path === "/api/v1/get/bill_line_items/bill/1") return Promise.resolve({ data: [{ id: 11, public_id: "a-1" }] });
      if (path === "/api/v1/get/bill_line_items/bill/2") return Promise.resolve({ data: [{ id: 21, public_id: "b-1" }] });
      return Promise.resolve({ data: [] });
    });
    apiMocks.getOne.mockImplementation((path: string) => {
      if (path.endsWith("/by-bill-line-item/a-1")) return aProbe;
      if (path.endsWith("/by-bill-line-item/b-1")) return Promise.resolve({ public_id: "blia-b", attachment_id: 9 });
      const a = path.match(/^\/api\/v1\/get\/attachment\/id\/(\d+)$/);
      if (a) return Promise.resolve({ public_id: `att-${a[1]}` });
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });
    try {
      await mountView("/bill/bill-1");
      await settle();
      // "Navigate" to bill B: re-render the SAME root so BillView is reused, with a new item
      // identity from the mocked useEntityItem. The path is ignored — MemoryRouter reads
      // initialEntries only on first mount; the effect keys on `item`, not the URL.
      viewItem.item = { ...billA, id: 2, public_id: "bill-2", bill_number: "B-200" };
      await mountView("/bill/bill-1");
      await settle();
      expect(shownAttachment()).toBe("att-9");
      // Bill A's walk now finishes with "no attachment" — it must not blank bill B's PDF.
      releaseA();
      await settle();
      expect(shownAttachment()).toBe("att-9");
    } finally {
      viewItem.item = billA;
    }
  });
});

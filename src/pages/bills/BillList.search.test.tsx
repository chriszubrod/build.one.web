/**
 * U-700 integration: BillList search uses real usePaginatedList + useDebouncedValue.
 * BillList.test.tsx mocks usePaginatedList (setSearch does not re-render), so it
 * cannot catch clear-filters vs debounce races.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockRawRequest = vi.fn();
const requestedUrls: string[] = [];

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    rawRequest: (url: string) => {
      requestedUrls.push(url);
      return mockRawRequest(url);
    },
    uploadFile: vi.fn(),
    post: vi.fn(),
  };
});

vi.mock("../../hooks/useIdNameMap", () => ({
  useIdNameMap: () => new Map<number, string>(),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function searchParamInUrl(url: string): string | null {
  const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("search");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  mockRawRequest.mockReset();
  requestedUrls.length = 0;
  sessionStorage.clear();
  mockRawRequest.mockImplementation(() =>
    Promise.resolve({ data: [], count: 0, page: 1, page_size: 50 }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  sessionStorage.clear();
  vi.useRealTimers();
});

async function mountBillList(path = "/bill/list") {
  const { default: BillList } = await import("./BillList");
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(MemoryRouter, { initialEntries: [path] }, createElement(BillList)),
      ),
    );
  });
  await flushUntil(
    () =>
      container.querySelector('input[aria-label="Search bills by vendor, bill number or memo"]') !==
      null,
  );
}

describe("BillList search wiring (U-700, real hooks)", () => {
  it("clear filters stays cleared after debounce settles (F1 regression)", async () => {
    await mountBillList();
    await flushUntil(() => requestedUrls.length >= 1);

    const search = container.querySelector(
      'input[aria-label="Search bills by vendor, bill number or memo"]',
    ) as HTMLInputElement;

    await act(async () => {
      setInputValue(search, "abc");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushUntil(() => requestedUrls.some((u) => searchParamInUrl(u) === "abc"));

    const clearBtn = container.querySelector('button[aria-label="Clear all filters"]') as HTMLButtonElement;
    const before = requestedUrls.length;
    await act(async () => {
      clearBtn.click();
    });
    expect(search.value).toBe("");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushUntil(() => requestedUrls.length >= 2);

    expect(search.value).toBe("");
    const lastUrl = requestedUrls.at(-1)!;
    expect(searchParamInUrl(lastUrl)).toBeNull();
    // The clear must never re-request the old search, even transiently.
    expect(requestedUrls.slice(before).filter((u) => searchParamInUrl(u) === "abc")).toEqual([]);
  });

  it("restored session search appears in the input on mount", async () => {
    sessionStorage.setItem("buildOne.billList.search", "saved-vendor");
    sessionStorage.setItem("buildOne.billList.page", "1");

    await mountBillList();

    const search = container.querySelector(
      'input[aria-label="Search bills by vendor, bill number or memo"]',
    ) as HTMLInputElement;
    expect(search.value).toBe("saved-vendor");
  });
});

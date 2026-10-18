import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { flushUntil } from "../../__testutils__/flush";
import BillList from "./BillList";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../hooks/usePaginatedList", () => ({
  usePaginatedList: () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    loading: false,
    error: "",
    setPage: vi.fn(),
    setSearch: vi.fn(),
    search: "",
    reload: vi.fn(),
  }),
}));

vi.mock("../../hooks/useIdNameMap", () => ({
  useIdNameMap: () => new Map<number, string>(),
}));

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe("BillList create from file", () => {
  it("navigates to create with File in router state (no temp upload)", async () => {
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(MemoryRouter, { initialEntries: ["/bill/list"] }, createElement(BillList)),
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
    });

    await flushUntil(() => container.querySelector(".drop-zone input[type='file']") !== null);
    const fileInput = container.querySelector(
      ".drop-zone input[type='file']",
    ) as HTMLInputElement;
    const file = new File(["pdf"], "drop.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });

    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const createBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Create Bill"),
    );
    expect(createBtn).toBeTruthy();
    await act(async () => {
      createBtn!.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/bill/create", {
      state: { billPdfFile: file },
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePaginatedList } from "./usePaginatedList";
import { flushUntil } from "../__testutils__/flush";
import { setInputValue } from "../__testutils__/domEvents";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockRawRequest = vi.fn();

vi.mock("../api/client", () => ({
  rawRequest: (...args: unknown[]) => mockRawRequest(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

let latestApi: ReturnType<typeof usePaginatedList<{ id: number; label: string }>> | undefined;

function ListHarness({ basePath }: { basePath: string }) {
  const api = usePaginatedList<{ id: number; label: string }>(basePath, 50);
  latestApi = api;
  return createElement("input", {
    "aria-label": "search",
    value: api.search,
    onChange: (e: { target: { value: string } }) => api.setSearch(e.target.value),
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  mockRawRequest.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("usePaginatedList — stale response guard (U-700)", () => {
  it("ignores a slow response when a newer request has already started", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockRawRequest
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() =>
        Promise.resolve({
          data: [{ id: 2, label: "second" }],
          count: 1,
          page: 1,
          page_size: 50,
        }),
      );

    latestApi = undefined;
    act(() => {
      root.render(createElement(ListHarness, { basePath: "/api/v1/get/items" }));
    });

    await flushUntil(() => mockRawRequest.mock.calls.length >= 1);

    const input = container.querySelector("input")!;
    await act(async () => {
      setInputValue(input, "b");
    });
    await flushUntil(() => mockRawRequest.mock.calls.length >= 2);

    resolveFirst({
      data: [{ id: 1, label: "stale-first" }],
      count: 1,
      page: 1,
      page_size: 50,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await flushUntil(() => latestApi!.items.some((i) => i.label === "second"));
    expect(latestApi!.items.map((i) => i.label)).toEqual(["second"]);
  });

  it("keeps loading true while a superseded in-flight request resolves and the latest is still pending", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockRawRequest
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => new Promise(() => {}));

    latestApi = undefined;
    act(() => {
      root.render(createElement(ListHarness, { basePath: "/api/v1/get/items" }));
    });

    await flushUntil(() => mockRawRequest.mock.calls.length >= 1);
    expect(latestApi!.loading).toBe(true);

    const input = container.querySelector("input")!;
    await act(async () => {
      setInputValue(input, "b");
    });
    await flushUntil(() => mockRawRequest.mock.calls.length >= 2);
    expect(latestApi!.loading).toBe(true);

    resolveFirst({
      data: [{ id: 1, label: "stale-first" }],
      count: 1,
      page: 1,
      page_size: 50,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(latestApi!.loading).toBe(true);
  });

  it("clears loading after the latest request resolves", async () => {
    let resolveSecond: (v: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolve({ data: [{ id: 1, label: "stale" }], count: 1, page: 1, page_size: 50 });
    });
    const second = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    mockRawRequest.mockImplementationOnce(() => first).mockImplementationOnce(() => second);

    latestApi = undefined;
    act(() => {
      root.render(createElement(ListHarness, { basePath: "/api/v1/get/items" }));
    });

    await flushUntil(() => mockRawRequest.mock.calls.length >= 1);

    const input = container.querySelector("input")!;
    await act(async () => {
      setInputValue(input, "b");
    });
    await flushUntil(() => mockRawRequest.mock.calls.length >= 2);
    expect(latestApi!.loading).toBe(true);

    resolveSecond({
      data: [{ id: 2, label: "second" }],
      count: 1,
      page: 1,
      page_size: 50,
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await flushUntil(() => !latestApi!.loading);
    expect(latestApi!.loading).toBe(false);
    expect(latestApi!.items.map((i) => i.label)).toEqual(["second"]);
  });

  it("clears loading after the latest request errors", async () => {
    let rejectSecond: (err: Error) => void = () => {};
    const second = new Promise((_resolve, reject) => {
      rejectSecond = reject;
    });
    mockRawRequest
      .mockImplementationOnce(() =>
        Promise.resolve({ data: [], count: 0, page: 1, page_size: 50 }),
      )
      .mockImplementationOnce(() => second);

    latestApi = undefined;
    act(() => {
      root.render(createElement(ListHarness, { basePath: "/api/v1/get/items" }));
    });

    await flushUntil(() => mockRawRequest.mock.calls.length >= 1);
    await flushUntil(() => !latestApi!.loading);

    const input = container.querySelector("input")!;
    await act(async () => {
      setInputValue(input, "x");
    });
    await flushUntil(() => mockRawRequest.mock.calls.length >= 2);
    expect(latestApi!.loading).toBe(true);

    rejectSecond(new Error("network down"));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await flushUntil(() => !latestApi!.loading);
    expect(latestApi!.loading).toBe(false);
    expect(latestApi!.error).toBe("network down");
  });
});

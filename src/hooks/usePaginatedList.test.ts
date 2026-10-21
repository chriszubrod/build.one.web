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

function ListHarness({
  basePath,
  swr = false,
}: {
  basePath: string;
  swr?: boolean;
}) {
  const api = usePaginatedList<{ id: number; label: string }>(basePath, 50, {
    staleWhileRevalidate: swr,
  });
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

  it("sets refreshing (not loading) on reload after the first successful fetch", async () => {
    mockRawRequest.mockImplementation(() =>
      Promise.resolve({ data: [{ id: 1, label: "one" }], count: 1, page: 1, page_size: 50 }),
    );

    latestApi = undefined;
    act(() => {
      root.render(createElement(ListHarness, { basePath: "/api/v1/get/items", swr: true }));
    });

    await flushUntil(() => !latestApi!.loading);
    expect(latestApi!.items.map((i) => i.label)).toEqual(["one"]);

    const hang = new Promise(() => {});
    mockRawRequest.mockImplementationOnce(() => hang);

    latestApi!.reload();
    await flushUntil(() => latestApi!.refreshing);
    expect(latestApi!.loading).toBe(false);
    expect(latestApi!.refreshing).toBe(true);
    expect(latestApi!.items.map((i) => i.label)).toEqual(["one"]);
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

describe("usePaginatedList — SWR refresh (U-705)", () => {
  it("clears refreshing after the latest reload errors while stale rows stay visible", async () => {
    mockRawRequest.mockImplementation(() =>
      Promise.resolve({ data: [{ id: 1, label: "one" }], count: 1, page: 1, page_size: 50 }),
    );

    latestApi = undefined;
    act(() => {
      root.render(createElement(ListHarness, { basePath: "/api/v1/get/items", swr: true }));
    });

    await flushUntil(() => !latestApi!.loading);
    expect(latestApi!.items.map((i) => i.label)).toEqual(["one"]);

    mockRawRequest.mockImplementationOnce(() => Promise.reject(new Error("boom")));

    latestApi!.reload();
    await flushUntil(() => latestApi!.refreshing);
    expect(latestApi!.loading).toBe(false);
    expect(latestApi!.items.map((i) => i.label)).toEqual(["one"]);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await flushUntil(() => !latestApi!.refreshing);
    expect(latestApi!.refreshing).toBe(false);
    expect(latestApi!.error).toBe("boom");
    expect(latestApi!.items.map((i) => i.label)).toEqual(["one"]);
  });

  it("keeps refreshing true when a superseded reload resolves before the latest", async () => {
    mockRawRequest.mockImplementation(() =>
      Promise.resolve({ data: [{ id: 1, label: "one" }], count: 1, page: 1, page_size: 50 }),
    );

    latestApi = undefined;
    act(() => {
      root.render(createElement(ListHarness, { basePath: "/api/v1/get/items", swr: true }));
    });

    await flushUntil(() => !latestApi!.loading);

    let resolveA: (v: unknown) => void = () => {};
    let resolveB: (v: unknown) => void = () => {};
    const hangA = new Promise((resolve) => {
      resolveA = resolve;
    });
    const hangB = new Promise((resolve) => {
      resolveB = resolve;
    });
    mockRawRequest.mockImplementationOnce(() => hangA).mockImplementationOnce(() => hangB);

    latestApi!.reload();
    await flushUntil(() => mockRawRequest.mock.calls.length >= 2);
    latestApi!.reload();
    await flushUntil(() => mockRawRequest.mock.calls.length >= 3);
    expect(latestApi!.refreshing).toBe(true);

    resolveA({
      data: [{ id: 9, label: "stale-a" }],
      count: 1,
      page: 1,
      page_size: 50,
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(latestApi!.refreshing).toBe(true);
    expect(latestApi!.items.map((i) => i.label)).toEqual(["one"]);

    resolveB({
      data: [{ id: 2, label: "fresh-b" }],
      count: 1,
      page: 1,
      page_size: 50,
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await flushUntil(() => !latestApi!.refreshing);
    expect(latestApi!.items.map((i) => i.label)).toEqual(["fresh-b"]);
  });
});

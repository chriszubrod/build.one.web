import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useDeleteDocument, type UseDeleteDocumentOptions } from "./useDeleteDocument";
import { deferred, drain, renderHook } from "./__testutils__/renderHook";
import { ApiError } from "../api/client";

const mockDel = vi.fn();
const mockToast = vi.fn();
const mockNavigate = vi.fn();

vi.mock("./useEntity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./useEntity")>();
  return {
    ...mod,
    deleteEntity: (...args: unknown[]) => mockDel(...args),
  };
});

vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

const BASE_OPTS: UseDeleteDocumentOptions = {
  deletePath: "/api/v1/delete/thing/1",
  confirmText: "Delete this thing?",
  successToast: "Thing deleted.",
  errorFallback: "Could not delete thing.",
  navigateTo: "/thing/list",
};

let queryClient: QueryClient;

function renderDeleteHook(options: UseDeleteDocumentOptions) {
  return renderHook(() => useDeleteDocument(options), {
    wrapper: ({ children }) =>
      createElement(
        MemoryRouter,
        null,
        createElement(QueryClientProvider, { client: queryClient }, children),
      ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDeleteDocument", () => {
  it("does not call delete when confirm is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const h = renderDeleteHook(BASE_OPTS);

    await act(async () => {
      await h.result.current.runDelete();
    });

    expect(mockDel).not.toHaveBeenCalled();
    expect(h.result.current.deleting).toBe(false);
    confirmSpy.mockRestore();
  });

  it("runs beforeDelete before the delete request", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const beforeDelete = vi.fn();
    const pending = deferred();

    const order: string[] = [];
    beforeDelete.mockImplementation(() => order.push("before"));
    mockDel.mockImplementation(() => {
      order.push("delete");
      return pending.promise;
    });

    const h = renderDeleteHook({ ...BASE_OPTS, beforeDelete });

    await act(async () => {
      void h.result.current.runDelete();
    });
    expect(order).toEqual(["before", "delete"]);

    await act(async () => {
      pending.resolve(undefined);
      await drain();
    });
    confirmSpy.mockRestore();
  });

  it("on success removes and invalidates queries, toasts, and navigates", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDel.mockResolvedValue(undefined);
    const removeSpy = vi.spyOn(queryClient, "removeQueries");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    queryClient.setQueryData(["item", "a"], { id: 1 });
    queryClient.setQueryData(["list", "b"], [{ id: 1 }]);

    const h = renderDeleteHook({
      ...BASE_OPTS,
      removeQueryKeys: [["item", "a"]],
      invalidateQueryKeys: [["list", "b"]],
    });

    await act(async () => {
      await h.result.current.runDelete();
    });

    expect(mockDel).toHaveBeenCalledWith(BASE_OPTS.deletePath);
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["item", "a"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["list", "b"] });
    expect(queryClient.getQueryData(["item", "a"])).toBeUndefined();
    expect(mockToast).toHaveBeenCalledWith("Thing deleted.");
    expect(mockNavigate).toHaveBeenCalledWith("/thing/list");
    confirmSpy.mockRestore();
  });

  it("on error shows server detail or fallback, resets deleting, and does not navigate", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDel.mockRejectedValue(new ApiError(403, "Forbidden by policy"));

    const h = renderDeleteHook(BASE_OPTS);

    await act(async () => {
      await h.result.current.runDelete();
    });

    expect(mockToast).toHaveBeenCalledWith("Forbidden by policy", "error");
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(h.result.current.deleting).toBe(false);

    mockDel.mockRejectedValue(new Error("network down"));
    await act(async () => {
      await h.result.current.runDelete();
    });
    expect(mockToast).toHaveBeenCalledWith("network down", "error");

    mockDel.mockRejectedValue("weird");
    await act(async () => {
      await h.result.current.runDelete();
    });
    expect(mockToast).toHaveBeenCalledWith("Could not delete thing.", "error");
    confirmSpy.mockRestore();
  });

  it("ignores a second runDelete while the first delete is in flight", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const pending = deferred();
    mockDel.mockReturnValue(pending.promise);

    const h = renderDeleteHook(BASE_OPTS);

    await act(async () => {
      void h.result.current.runDelete();
      void h.result.current.runDelete();
    });

    expect(mockDel).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(undefined);
      await drain();
    });
    confirmSpy.mockRestore();
  });
});

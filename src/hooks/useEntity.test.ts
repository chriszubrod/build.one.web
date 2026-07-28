import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateEntity, removeEntity, invalidateLookups } from "./useEntity";

describe("invalidateEntity", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.spyOn(queryClient, "removeQueries");
    vi.spyOn(queryClient, "setQueryData");
  });

  it("invalidates only the list when itemPath is omitted", async () => {
    const listPath = "/api/v1/get/vendors";

    await invalidateEntity(queryClient, { listPath });

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["list", listPath] }),
    );
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["item", expect.any(String)] }),
    );
    expect(queryClient.removeQueries).not.toHaveBeenCalled();
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["lookups"] }),
    );
  });

  it("invalidates both list and item when itemPath is given", async () => {
    const listPath = "/api/v1/get/vendors";
    const itemPath = "/api/v1/get/vendor/abc-123";

    await invalidateEntity(queryClient, { listPath, itemPath });

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["list", listPath] }),
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["item", itemPath] }),
    );
    expect(queryClient.removeQueries).not.toHaveBeenCalled();
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["lookups"] }),
    );
  });
});

describe("removeEntity", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.spyOn(queryClient, "removeQueries");
    vi.spyOn(queryClient, "setQueryData");
  });

  it("removes the item cache entry and invalidates only the list", async () => {
    const listPath = "/api/v1/get/vendors";
    const itemPath = "/api/v1/get/vendor/abc-123";

    await removeEntity(queryClient, { listPath, itemPath });

    expect(queryClient.removeQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.removeQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["item", itemPath] }),
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["list", listPath] }),
    );
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["item", itemPath] }),
    );
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["lookups"] }),
    );
  });
});

describe("invalidateLookups", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.spyOn(queryClient, "removeQueries");
    vi.spyOn(queryClient, "setQueryData");
  });

  it("calls queryClient.invalidateQueries exactly once with queryKey [\"lookups\"]", async () => {
    await invalidateLookups(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["lookups"] }),
    );
  });

  it("does not set exact:true on the filter object", async () => {
    await invalidateLookups(queryClient);

    const arg = vi.mocked(queryClient.invalidateQueries).mock.calls[0][0];
    expect(arg).not.toHaveProperty("exact", true);
  });

  it("does not call removeQueries, setQueryData, or invalidate list/item keys", async () => {
    await invalidateLookups(queryClient);

    expect(queryClient.removeQueries).not.toHaveBeenCalled();
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["list", expect.any(String)] }),
    );
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["item", expect.any(String)] }),
    );
  });

  it("invalidates all lookups-prefix cache entries but not list queries", async () => {
    const realClient = new QueryClient();

    realClient.setQueryData(["lookups", "vendors"], { vendors: [] });
    realClient.setQueryData(["lookups", "projects,sub_cost_codes"], { projects: [] });
    realClient.setQueryData(["list", "/api/v1/get/vendors"], [{ id: 1 }]);

    await invalidateLookups(realClient);

    expect(realClient.getQueryState(["lookups", "vendors"])?.isInvalidated).toBe(true);
    expect(realClient.getQueryState(["lookups", "projects,sub_cost_codes"])?.isInvalidated).toBe(
      true,
    );
    expect(realClient.getQueryState(["list", "/api/v1/get/vendors"])?.isInvalidated).toBe(false);
  });
});

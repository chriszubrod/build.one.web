import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateEntity, removeEntity } from "./useEntity";

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
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, post } from "./client";

beforeEach(() => {
  localStorage.setItem("access_token", "bearer-abc");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(
        JSON.stringify({
          detail: "Possible duplicate bill",
          error_code: "possible_duplicate",
          duplicate_matches: [],
          hidden_match_count: 0,
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("ApiError enrichment", () => {
  it("carries errorCode and parsed body from JSON error responses", async () => {
    await expect(post("/api/v1/create/bill", {})).rejects.toMatchObject({
      status: 422,
      detail: "Possible duplicate bill",
      errorCode: "possible_duplicate",
    });
    try {
      await post("/api/v1/create/bill", {});
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.body).toMatchObject({ error_code: "possible_duplicate" });
      expect(e.status).toBe(422);
      expect(e.detail).toBe("Possible duplicate bill");
    }
  });
});

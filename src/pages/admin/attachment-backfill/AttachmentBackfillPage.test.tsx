import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AttachmentBackfillPage from "./AttachmentBackfillPage";
import { ApiError } from "../../../api/client";
import type {
  AttachmentBackfillCandidate,
  AttachmentBackfillCandidateDetail,
  AttachmentBackfillFacet,
  AttachmentBackfillRun,
} from "../../../types/api";
import { flushUntil } from "../../../__testutils__/flush";
import { makeUser } from "../../../__testutils__/currentUser";
import { setSelectValue } from "../../../__testutils__/domEvents";
import { REJECT_REASONS } from "./backfillModel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = {
  listRuns: vi.fn(),
  getFacets: vi.fn(),
  getQueue: vi.fn(),
  getCandidate: vi.fn(),
  fetchCandidatePdf: vi.fn(),
  reviewCandidate: vi.fn(),
  undoCandidate: vi.fn(),
};

vi.mock("./attachmentBackfillApi", () => ({
  QUEUE_PAGE_SIZE: 50,
  listRuns: (...a: unknown[]) => api.listRuns(...a),
  getFacets: (...a: unknown[]) => api.getFacets(...a),
  getQueue: (...a: unknown[]) => api.getQueue(...a),
  getCandidate: (...a: unknown[]) => api.getCandidate(...a),
  fetchCandidatePdf: (...a: unknown[]) => api.fetchCandidatePdf(...a),
  reviewCandidate: (...a: unknown[]) => api.reviewCandidate(...a),
  undoCandidate: (...a: unknown[]) => api.undoCandidate(...a),
}));

const mockUseCurrentUser = vi.fn(() => ({ data: makeUser(true), isLoading: false }));
vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

// ── fixtures ────────────────────────────────────────────────────────────

const RUN: AttachmentBackfillRun = {
  public_id: "run-1",
  source: "box",
  status: "ready",
  created_datetime: "2026-10-29T00:00:00",
  modified_datetime: null,
  candidate_count: 9,
  pending: 9,
  approved: 0,
  rejected: 0,
  unchecked: 0,
  linked: 0,
};

function facet(
  group: AttachmentBackfillFacet["evidence_group"],
  project: string | null,
  name: string | null,
  year: number | null,
  count: number,
): AttachmentBackfillFacet {
  return {
    evidence_group: group,
    project_public_id: project,
    project_name: name,
    bill_year: year,
    review_status: "pending",
    count,
  };
}

// `flagged` comes first in the array and holds the alphabetically-first project,
// so the default only lands on clean/Alpha/2022 if the clean-first rule holds.
const FACETS: AttachmentBackfillFacet[] = [
  facet("flagged", "p-0", "Aardvark", 2021, 5),
  facet("clean", "p-2", "Beta", 2024, 1),
  facet("clean", "p-1", "Alpha", 2023, 4),
  facet("clean", "p-1", "Alpha", 2022, 2),
];

function candidate(id: string, overrides: Partial<AttachmentBackfillCandidate> = {}): AttachmentBackfillCandidate {
  return {
    public_id: id,
    row_version: `rv-queue-${id}`,
    run_public_id: "run-1",
    run_status: "ready",
    bill_public_id: `bill-${id}`,
    bill_number: `INV-${id}`,
    bill_date: "2022-03-04",
    bill_year: 2022,
    total_amount: "123.45",
    vendor_name: `Vendor ${id}`,
    project_public_id: "p-1",
    project_name: "Alpha",
    project_names: "Alpha",
    source_file_name: `${id}.pdf`,
    source_file_size: 2048,
    match_tier: "A",
    check_status: "checked",
    invoice_seen_count: 2,
    amount_seen_count: 1,
    vendor_seen: true,
    other_invoice_label_count: 0,
    statement_like: false,
    used_ocr: false,
    evidence_group: "clean",
    review_status: "pending",
    reject_reason: null,
    reviewed_by_user_public_id: null,
    reviewed_datetime: null,
    linked: false,
    ...overrides,
  };
}

function detailOf(
  row: AttachmentBackfillCandidate,
  overrides: Partial<AttachmentBackfillCandidateDetail> = {},
): AttachmentBackfillCandidateDetail {
  return {
    ...row,
    row_version: `rv-detail-${row.public_id}`,
    snippets: [
      { kind: "invoice_number", before: "Invoice No ", hit: `INV-${row.public_id}`, after: " dated" },
      { kind: "amount", before: "Total due ", hit: "123.45", after: " USD" },
    ],
    snippet_error: null,
    content_matches_check: true,
    ...overrides,
  };
}

const ROWS = [candidate("c1"), candidate("c2")];
let details: Record<string, AttachmentBackfillCandidateDetail>;

// ── harness ─────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let queryClient: QueryClient;
let root: Root | null = null;
let urlSeq = 0;
const createObjectURL = vi.fn((blob: Blob) => (blob ? `blob:test-${++urlSeq}` : ""));
const revokeObjectURL = vi.fn((url: string) => void url);

function renderPage() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: ["/attachment-backfill"] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/attachment-backfill",
              element: createElement(AttachmentBackfillPage),
            }),
            createElement(Route, {
              path: "/profile",
              element: createElement("div", { "data-testid": "profile-landed" }, "Profile"),
            }),
          ),
        ),
      ),
    );
  });
}

const q = (sel: string) => container.querySelector(sel);
const approveBtn = () => q('[data-testid="abf-approve"]') as HTMLButtonElement | null;
const progressText = () => q('[data-testid="abf-progress"]')?.textContent ?? "";
const billNumberShown = (n: string) => (q(".abf-fields")?.textContent ?? "").includes(n);

function press(key: string, target: EventTarget = document.body) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

/** Renders and waits until c1's detail + PDF are in and Approve is enabled. */
/** Fire the iframe's load event — Approve waits for the document to have rendered. */
function loadIframe() {
  const frame = q("iframe");
  expect(frame).not.toBeNull();
  act(() => {
    frame!.dispatchEvent(new Event("load"));
  });
}

async function renderReady() {
  renderPage();
  await settle(() => !!q("iframe"));
  loadIframe();
  await settle(() => !!approveBtn() && !approveBtn()!.disabled);
  expect(approveBtn()).not.toBeNull();
  expect(approveBtn()!.disabled).toBe(false);
  expect(billNumberShown("INV-c1")).toBe(true);
}

/**
 * flushUntil, repeated: the page's load chain (runs -> facets -> queue ->
 * detail + PDF -> object URL) can outlast one flushUntil's 50 ticks. Still
 * followed by a hard assertion at every call site.
 */
async function settle(check: () => boolean) {
  for (let i = 0; i < 6 && !check(); i++) await flushUntil(check);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  urlSeq = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true, writable: true });
  mockUseCurrentUser.mockReset();
  mockUseCurrentUser.mockReturnValue({ data: makeUser(true), isLoading: false });
  for (const fn of Object.values(api)) fn.mockReset();
  details = Object.fromEntries(ROWS.map((r) => [r.public_id, detailOf(r)]));
  api.listRuns.mockResolvedValue([RUN]);
  api.getFacets.mockResolvedValue(FACETS);
  api.getQueue.mockResolvedValue({ data: ROWS, count: ROWS.length, next_after: null });
  api.getCandidate.mockImplementation(async (id: string) => details[id]);
  api.fetchCandidatePdf.mockImplementation(async () => ({
    blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    matches: true,
  }));
  api.undoCandidate.mockImplementation(async (id: string) => ({
    public_id: id,
    row_version: `rv-undone-${id}`,
    review_status: "pending",
    reject_reason: null,
    reviewed_by_user_public_id: null,
    reviewed_datetime: null,
  }));
  api.reviewCandidate.mockImplementation(async (id: string, body: { decision: string; reject_reason?: string }) => {
    // The fake server now holds the decision, so a later detail GET reflects it.
    details[id] = { ...details[id], review_status: body.decision as "approved", row_version: `rv-after-${id}` };
    return {
    public_id: id,
    row_version: `rv-after-${id}`,
    review_status: body.decision,
    reject_reason: body.reject_reason ?? null,
    reviewed_by_user_public_id: "u",
    reviewed_datetime: "2026-10-30T00:00:00",
    };
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

// ── specs ───────────────────────────────────────────────────────────────

describe("AttachmentBackfillPage — gate and default batch", () => {
  it("redirects a non-admin to /profile and never calls the API", async () => {
    mockUseCurrentUser.mockReturnValue({ data: makeUser(false), isLoading: false });
    renderPage();
    await settle(() => !!q('[data-testid="profile-landed"]'));
    expect(q('[data-testid="profile-landed"]')).not.toBeNull();
    expect(api.listRuns).not.toHaveBeenCalled();
    expect(api.getQueue).not.toHaveBeenCalled();
  });

  it("opens on the clean group, its first project and that project's first year, pending", async () => {
    renderPage();
    await settle(() => api.getQueue.mock.calls.length > 0);
    expect(api.getQueue).toHaveBeenCalledTimes(1);
    expect(api.getQueue).toHaveBeenCalledWith("run-1", {
      group: "clean",
      projectPublicId: "p-1",
      year: 2022,
      reviewStatus: "pending",
      after: null,
    });
    expect((q('[data-testid="abf-group"]') as HTMLSelectElement).value).toBe("clean");
    expect((q('[data-testid="abf-project"]') as HTMLSelectElement).value).toBe("p-1");
    expect((q('[data-testid="abf-year"]') as HTMLSelectElement).value).toBe("2022");
    // Remaining counts are shown on the group options (clean = 1 + 4 + 2).
    expect(q('[data-testid="abf-group"] option[value="clean"]')!.textContent).toContain("(7)");
  });
});

describe("AttachmentBackfillPage — approve", () => {
  it("sends exactly one POST with the current row_version and advances", async () => {
    await renderReady();
    expect(progressText()).toContain("1 of 2 in this batch");
    press("a");
    await settle(() => billNumberShown("INV-c2"));
    expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
    // The detail's row_version is the freshest copy — not the queue row's.
    expect(api.reviewCandidate).toHaveBeenCalledWith("c1", { decision: "approved", row_version: "rv-detail-c1" });
    expect(billNumberShown("INV-c2")).toBe(true);
    expect(progressText()).toContain("2 of 2 in this batch");
    expect(progressText()).toContain("Approved this session: 1");
  });

  it("ignores keypresses and clicks while a request is in flight (no double submit)", async () => {
    const pending = deferred<unknown>();
    api.reviewCandidate.mockImplementationOnce(() => pending.promise);
    await renderReady();
    press("a");
    press("a");
    act(() => approveBtn()!.click());
    press("a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({
        public_id: "c1",
        row_version: "rv-after-c1",
        review_status: "approved",
        reject_reason: null,
        reviewed_by_user_public_id: "u",
        reviewed_datetime: null,
      });
    });
    await settle(() => billNumberShown("INV-c2"));
    expect(billNumberShown("INV-c2")).toBe(true);
    expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
  });

  it("does not advance or retry on 409 stale: reloads the candidate and says so", async () => {
    api.reviewCandidate.mockRejectedValueOnce(
      new ApiError(409, "Review refused: stale", { errorCode: "stale" }),
    );
    await renderReady();
    const detailCallsBefore = api.getCandidate.mock.calls.filter((c) => c[0] === "c1").length;
    details.c1 = detailOf(ROWS[0], { row_version: "rv-detail-c1-v2" });
    press("a");
    await settle(() => (q('[data-testid="abf-status"]')?.textContent ?? "").includes("reloaded"));
    expect(q('[data-testid="abf-status"]')!.textContent).toBe("Changed elsewhere — reloaded");
    expect(api.getCandidate.mock.calls.filter((c) => c[0] === "c1").length).toBe(detailCallsBefore + 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
    expect(billNumberShown("INV-c1")).toBe(true);
    // The next approve (a fresh keypress) carries the reloaded row_version.
    press("a");
    await settle(() => api.reviewCandidate.mock.calls.length === 2);
    expect(api.reviewCandidate.mock.calls[1]).toEqual([
      "c1",
      { decision: "approved", row_version: "rv-detail-c1-v2" },
    ]);
  });

  it("names other refusals in plain words", async () => {
    api.reviewCandidate.mockRejectedValueOnce(
      new ApiError(409, "Review refused: bill_claimed_elsewhere", { errorCode: "bill_claimed_elsewhere" }),
    );
    await renderReady();
    press("a");
    await settle(() => !!q('[data-testid="abf-status"]'));
    expect(q('[data-testid="abf-status"]')!.textContent).toBe("This bill is claimed by another run");
    expect(billNumberShown("INV-c1")).toBe(true);
  });
});

describe("AttachmentBackfillPage — reject", () => {
  it("R alone sends nothing; Esc closes the reason picker", async () => {
    await renderReady();
    press("r");
    expect(q('[data-testid="abf-reasons"]')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.reviewCandidate).not.toHaveBeenCalled();
    press("Escape");
    expect(q('[data-testid="abf-reasons"]')).toBeNull();
    press("1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.reviewCandidate).not.toHaveBeenCalled();
  });

  it.each(REJECT_REASONS.map((r, i) => [String(i + 1), r.value] as const))(
    "key %s sends reject_reason %s",
    async (key, reason) => {
      await renderReady();
      press("r");
      press(key);
      await settle(() => api.reviewCandidate.mock.calls.length > 0);
      expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
      expect(api.reviewCandidate).toHaveBeenCalledWith("c1", {
        decision: "rejected",
        reject_reason: reason,
        row_version: "rv-detail-c1",
      });
    },
  );

  it("pins the six reasons in key order", () => {
    expect(REJECT_REASONS.map((r) => r.value)).toEqual([
      "wrong_bill",
      "statement",
      "multiple_invoices",
      "duplicate",
      "unreadable",
      "other",
    ]);
  });
});

describe("AttachmentBackfillPage — Approve unavailable", () => {
  it.each([
    ["content_matches_check false", { content_matches_check: false, snippets: null }],
    ["snippet_error content_changed", { snippet_error: "content_changed", snippets: null }],
  ] as const)("%s: shows the notice, disables Approve, and A sends nothing", async (_label, overrides) => {
    details.c1 = detailOf(ROWS[0], overrides as Partial<AttachmentBackfillCandidateDetail>);
    renderPage();
    await settle(() => !!q('[data-testid="abf-content-changed"]') && !!q("iframe"));
    expect(q('[data-testid="abf-content-changed"]')!.textContent).toBe(
      "This file has changed in Box since it was checked",
    );
    expect(approveBtn()!.disabled).toBe(true);
    press("a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.reviewCandidate).not.toHaveBeenCalled();
    // Reject is still allowed.
    expect((q('[data-testid="abf-reject"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("bill gone: shows it, disables Approve, and A sends nothing", async () => {
    details.c1 = detailOf(ROWS[0], {
      bill_public_id: null,
      bill_number: null,
      bill_date: null,
      total_amount: null,
      vendor_name: null,
    });
    renderPage();
    await settle(() => !!q('[data-testid="abf-bill-gone"]') && !!q("iframe"));
    expect(q('[data-testid="abf-bill-gone"]')).not.toBeNull();
    expect(approveBtn()!.disabled).toBe(true);
    press("a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.reviewCandidate).not.toHaveBeenCalled();
  });

  it("shows another snippet error code neutrally", async () => {
    details.c1 = detailOf(ROWS[0], { snippet_error: "ocr_failed", snippets: null });
    await renderReady();
    expect(container.textContent).toContain("Snippets unavailable (ocr_failed)");
  });
});

describe("AttachmentBackfillPage — evidence is neutral", () => {
  it("renders each hit in <mark> and no verdict words anywhere on the page", async () => {
    await renderReady();
    const marks = [...container.querySelectorAll(".abf-snippet mark")].map((m) => m.textContent);
    expect(marks).toEqual(["INV-c1", "123.45"]);
    const counts = q('[data-testid="abf-counts"]')!.textContent!;
    expect(counts).toContain("Invoice # printed: 2");
    expect(counts).toContain("Amount printed: 1");
    expect(counts).toContain("Vendor name printed: yes");
    expect(counts).toContain("Other invoice numbers: 0");
    expect(counts).toContain("Statement layout: no");
    expect(counts).toContain("OCR used: no");
    expect(container.textContent!.length).toBeGreaterThan(200);
    expect(container.textContent).not.toMatch(/verified|match|likely|confident|suggest/i);
    // Group labels (all <option>s) included in textContent above; pin one explicitly.
    expect(container.textContent).toContain("Invoice # and amount found, no other invoice numbers");
  });
});

describe("AttachmentBackfillPage — PDF object URLs", () => {
  it("revokes the previous object URL on candidate change and the last one on unmount", async () => {
    await renderReady();
    expect((q("iframe") as HTMLIFrameElement).getAttribute("src")).toBe("blob:test-1");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    press("j");
    await settle(() => (q("iframe") as HTMLIFrameElement | null)?.getAttribute("src") === "blob:test-2");
    expect((q("iframe") as HTMLIFrameElement).getAttribute("src")).toBe("blob:test-2");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:test-2");
    act(() => {
      root!.unmount();
    });
    root = null;
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-2");
  });

  it("prefetches only the next candidate", async () => {
    api.getQueue.mockResolvedValue({
      data: [candidate("c1"), candidate("c2"), candidate("c3")],
      count: 3,
      next_after: null,
    });
    details.c3 = detailOf(candidate("c3"));
    await renderReady();
    await settle(() => api.fetchCandidatePdf.mock.calls.length >= 2);
    const pdfIds = api.fetchCandidatePdf.mock.calls.map((c) => c[0]);
    expect(pdfIds).toEqual(["c1", "c2"]);
  });
});

describe("AttachmentBackfillPage — keyboard focus", () => {
  it("ignores shortcuts while focus is in an input or a select", async () => {
    await renderReady();
    const input = document.createElement("input");
    document.body.appendChild(input);
    press("a", input);
    press("r", input);
    press("a", q('[data-testid="abf-group"]')!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.reviewCandidate).not.toHaveBeenCalled();
    expect(q('[data-testid="abf-reasons"]')).toBeNull();
    // Control: the same key from the page body does act.
    press("a");
    await settle(() => api.reviewCandidate.mock.calls.length === 1);
    expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
  });
});

// ── Pass-1 fix round 1 ──────────────────────────────────────────────────

const statusLine = () => q(".abf-status-line")?.textContent ?? "";

describe("fix 1 (C1) — a failed later page does not re-fire forever", () => {
  it("stops auto-paging after an error and offers a visible Retry", async () => {
    api.getQueue.mockImplementation(async (_run: string, p: { after?: string | null }) => {
      if (!p.after) return { data: ROWS, count: 2, next_after: "c2" };
      throw new ApiError(500, "boom");
    });
    renderPage();
    await settle(() => !!q('[data-testid="abf-queue-error"]'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const laterCalls = () => api.getQueue.mock.calls.filter((c) => (c[1] as { after?: string | null }).after).length;
    expect(laterCalls()).toBe(1);
    const err = q('[data-testid="abf-queue-error"]');
    expect(err).not.toBeNull();
    // Rows already loaded stay on screen alongside the error.
    expect(billNumberShown("INV-c1")).toBe(true);
    const retry = err!.querySelector("button") as HTMLButtonElement;
    expect(retry.textContent).toBe("Retry");
    act(() => retry.click());
    await settle(() => laterCalls() === 2);
    expect(laterCalls()).toBe(2);
    expect(api.getQueue.mock.calls.at(-1)![1]).toMatchObject({ after: "c2" });
  });
});

describe("fix 2 (C2) — a detail fetched before a local decision never overwrites it", () => {
  it("undo during an in-flight detail load: the stale detail does not revert the row", async () => {
    api.getQueue.mockResolvedValue({
      data: [candidate("c1", { review_status: "approved", row_version: "rv1" })],
      count: 1,
      next_after: null,
    });
    const held = deferred<AttachmentBackfillCandidateDetail>();
    api.getCandidate.mockImplementation(() => held.promise);
    renderPage();
    await settle(() => !!q('[data-testid="abf-undo"]') && !(q('[data-testid="abf-undo"]') as HTMLButtonElement).disabled);
    expect(statusLine()).toContain("approved");
    press("u");
    await settle(() => statusLine().includes("pending"));
    expect(api.undoCandidate).toHaveBeenCalledWith("c1", "rv1");
    expect(statusLine()).toContain("pending");
    // The detail GET read the row BEFORE the undo; it resolves only now.
    await act(async () => {
      held.resolve(detailOf(candidate("c1", { review_status: "approved" }), { row_version: "rv1" }));
    });
    await settle(() => !!q('[data-testid="abf-snippets"]'));
    expect(q('[data-testid="abf-snippets"]')).not.toBeNull();
    expect(statusLine()).toContain("pending");
    // And the next write carries the undo's row_version, not the stale detail's.
    await settle(() => !!q("iframe"));
    loadIframe();
    await settle(() => !approveBtn()!.disabled);
    press("a");
    await settle(() => api.reviewCandidate.mock.calls.length === 1);
    expect(api.reviewCandidate).toHaveBeenCalledWith("c1", { decision: "approved", row_version: "rv-undone-c1" });
  });
});

describe("fix 3 (L1) — a second press between the response and the re-render sends nothing", () => {
  it("holds the guard until the advanced candidate has rendered", async () => {
    const pending = deferred<unknown>();
    api.reviewCandidate.mockImplementationOnce(() => pending.promise);
    await renderReady();
    press("a");
    expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({
        public_id: "c1",
        row_version: "rv-after-c1",
        review_status: "approved",
        reject_reason: null,
        reviewed_by_user_public_id: "u",
        reviewed_datetime: null,
      });
      // Let the response settle (and any `finally` run) WITHOUT a React commit.
      for (let i = 0; i < 20; i++) await Promise.resolve();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    });
    await settle(() => billNumberShown("INV-c2"));
    expect(billNumberShown("INV-c2")).toBe(true);
    expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
  });
});

describe("fix 4 (L2) — pickers keep naming the batch under review", () => {
  it("holds the project and year as options (count 0) after they empty", async () => {
    api.getFacets.mockResolvedValueOnce(FACETS);
    api.getFacets.mockResolvedValue(FACETS.filter((f) => f.project_public_id !== "p-1"));
    await renderReady();
    press("a");
    await settle(() => api.getFacets.mock.calls.length >= 2 && billNumberShown("INV-c2"));
    expect(api.getFacets.mock.calls.length).toBeGreaterThanOrEqual(2);
    await settle(() => (q('[data-testid="abf-project"]')?.textContent ?? "").includes("Alpha (0)"));
    const project = q('[data-testid="abf-project"]') as HTMLSelectElement;
    const year = q('[data-testid="abf-year"]') as HTMLSelectElement;
    expect(project.value).toBe("p-1");
    expect(project.selectedOptions[0].textContent).toBe("Alpha (0)");
    expect(year.value).toBe("2022");
    expect(year.selectedOptions[0].textContent).toBe("2022 (0)");
    // The review itself did not move.
    expect(billNumberShown("INV-c2")).toBe(true);
  });
});

describe("fix 5 (L3) — any 409 reloads the candidate, never retries", () => {
  it("bill_claimed_elsewhere reloads the candidate and keeps the plain-words message", async () => {
    api.reviewCandidate.mockRejectedValueOnce(
      new ApiError(409, "Review refused: bill_claimed_elsewhere", { errorCode: "bill_claimed_elsewhere" }),
    );
    await renderReady();
    const before = api.getCandidate.mock.calls.filter((c) => c[0] === "c1").length;
    press("a");
    await settle(() => api.getCandidate.mock.calls.filter((c) => c[0] === "c1").length === before + 1);
    expect(api.getCandidate.mock.calls.filter((c) => c[0] === "c1").length).toBe(before + 1);
    await settle(() => !!q('[data-testid="abf-status"]'));
    expect(q('[data-testid="abf-status"]')!.textContent).toBe("This bill is claimed by another run");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.reviewCandidate).toHaveBeenCalledTimes(1);
  });
});

describe("fix 6 — Approve waits for the PDF to render", () => {
  it("is disabled after the bytes arrive until the CURRENT iframe fires load", async () => {
    renderPage();
    await settle(() => !!q("iframe") && !!q('[data-testid="abf-snippets"]'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(approveBtn()!.disabled).toBe(true);
    press("a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.reviewCandidate).not.toHaveBeenCalled();
    loadIframe();
    await settle(() => !approveBtn()!.disabled);
    expect(approveBtn()!.disabled).toBe(false);
    // Next candidate: the gate resets until ITS iframe loads.
    press("j");
    await settle(() => (q("iframe") as HTMLIFrameElement | null)?.getAttribute("src") === "blob:test-2");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(billNumberShown("INV-c2")).toBe(true);
    expect(approveBtn()!.disabled).toBe(true);
    loadIframe();
    await settle(() => !approveBtn()!.disabled);
    expect(approveBtn()!.disabled).toBe(false);
  });
});

describe("fix 9 — an unknown PDF header is shown neutrally and does not block", () => {
  it("shows 'PDF check: not available' and still allows Approve", async () => {
    api.fetchCandidatePdf.mockImplementation(async () => ({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      matches: null,
    }));
    await renderReady();
    expect(container.textContent).toContain("PDF check: not available");
    expect(approveBtn()!.disabled).toBe(false);
    expect(q('[data-testid="abf-content-changed"]')).toBeNull();
  });

  it("a PDF header of false is treated as changed", async () => {
    api.fetchCandidatePdf.mockImplementation(async () => ({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      matches: false,
    }));
    renderPage();
    await settle(() => !!q('[data-testid="abf-content-changed"]') && !!q("iframe"));
    loadIframe();
    expect(q('[data-testid="abf-content-changed"]')).not.toBeNull();
    expect(approveBtn()!.disabled).toBe(true);
  });
});

describe("fix 10 — undo", () => {
  it("U on an approved row sends one undo with the current row_version; row returns to pending; counts drop", async () => {
    await renderReady();
    press("a");
    await settle(() => billNumberShown("INV-c2"));
    expect(progressText()).toContain("Approved this session: 1");
    press("k");
    await settle(() => billNumberShown("INV-c1") && statusLine().includes("approved"));
    expect(statusLine()).toContain("approved");
    press("u");
    await settle(() => statusLine().includes("pending"));
    expect(api.undoCandidate).toHaveBeenCalledTimes(1);
    // The server's current row_version (the approve's), not the pre-approve one.
    expect(api.undoCandidate).toHaveBeenCalledWith("c1", "rv-after-c1");
    expect(statusLine()).toContain("pending");
    expect(progressText()).toContain("Approved this session: 0");
  });

  it("sends exactly one undo while one is in flight", async () => {
    const pending = deferred<unknown>();
    api.getQueue.mockResolvedValue({
      data: [candidate("c1", { review_status: "approved" })],
      count: 1,
      next_after: null,
    });
    details.c1 = detailOf(candidate("c1", { review_status: "approved" }));
    api.undoCandidate.mockImplementationOnce(() => pending.promise);
    renderPage();
    await settle(() => !!q('[data-testid="abf-snippets"]'));
    press("u");
    press("u");
    act(() => (q('[data-testid="abf-undo"]') as HTMLButtonElement).click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.undoCandidate).toHaveBeenCalledTimes(1);
    expect(api.undoCandidate).toHaveBeenCalledWith("c1", "rv-detail-c1");
  });

  it("U on a pending row does nothing", async () => {
    await renderReady();
    press("u");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.undoCandidate).not.toHaveBeenCalled();
    expect((q('[data-testid="abf-undo"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

// ── fix round 2 ─────────────────────────────────────────────────────────

describe("R2 — browser set to download PDFs", () => {
  afterEach(() => {
    delete (navigator as unknown as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
  });

  it("explains why Approve is unavailable and keeps it disabled", async () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: false, configurable: true });
    renderPage();
    await settle(() => !!q('[data-testid="abf-pdf-viewer-off"]') && !!q('[data-testid="abf-snippets"]'));
    expect(q('[data-testid="abf-pdf-viewer-off"]')!.textContent).toBe(
      "This browser is set to download PDFs instead of showing them — turn on the built-in PDF viewer to review.",
    );
    expect(approveBtn()!.disabled).toBe(true);
    expect(approveBtn()!.title).toBe("Built-in PDF viewer is off");
    press("a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(api.reviewCandidate).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/rendered/i);
  });

  it("shows no such notice when the viewer is on (control)", async () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: true, configurable: true });
    await renderReady();
    expect(q('[data-testid="abf-pdf-viewer-off"]')).toBeNull();
  });
});

describe("R4 — an empty evidence group invents no options", () => {
  it("shows '—' (disabled) pickers and 'Nothing in this batch'", async () => {
    await renderReady();
    const queueCallsBefore = api.getQueue.mock.calls.length;
    act(() => setSelectValue(q('[data-testid="abf-group"]') as HTMLSelectElement, "amount_only"));
    await settle(() => (container.textContent ?? "").includes("Nothing in this batch"));
    expect(container.textContent).toContain("Nothing in this batch");
    for (const id of ["abf-project", "abf-year"]) {
      const sel = q(`[data-testid="${id}"]`) as HTMLSelectElement;
      expect(sel.disabled).toBe(true);
      expect([...sel.options].map((o) => o.textContent)).toEqual(["—"]);
    }
    expect(container.textContent).not.toContain("No project (0)");
    expect(container.textContent).not.toContain("Bill gone (0)");
    expect(api.getQueue.mock.calls.length).toBe(queueCallsBefore);
  });
});

// ── Pass 2 ──────────────────────────────────────────────────────────────

describe("Pass 2 — an empty group that gains candidates", () => {
  it("adopts the group's first batch once a facets refetch shows candidates", async () => {
    await renderReady();
    act(() => setSelectValue(q('[data-testid="abf-group"]') as HTMLSelectElement, "amount_only"));
    await settle(() => !!q('[data-testid="abf-group-empty"]'));
    expect(q('[data-testid="abf-group-empty"]')!.textContent).toBe("Nothing in this batch.");
    expect((q('[data-testid="abf-project"]') as HTMLSelectElement).disabled).toBe(true);
    api.getFacets.mockResolvedValue([...FACETS, facet("amount_only", "p-9", "Zeta", 2021, 3)]);
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    const amountOnlyQueued = () =>
      api.getQueue.mock.calls.some((c) => (c[1] as { group: string }).group === "amount_only");
    await settle(amountOnlyQueued);
    expect(api.getQueue).toHaveBeenCalledWith("run-1", {
      group: "amount_only",
      projectPublicId: "p-9",
      year: 2021,
      reviewStatus: "pending",
      after: null,
    });
    const project = q('[data-testid="abf-project"]') as HTMLSelectElement;
    expect(project.disabled).toBe(false);
    expect(project.value).toBe("p-9");
    expect((q('[data-testid="abf-year"]') as HTMLSelectElement).value).toBe("2021");
    expect((q('[data-testid="abf-group"]') as HTMLSelectElement).value).toBe("amount_only");
    expect(q('[data-testid="abf-group-empty"]')).toBeNull();
  });
});

describe("Pass 2 — viewer off mounts no PDF iframe", () => {
  afterEach(() => {
    delete (navigator as unknown as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
  });

  it("shows the notice instead of an iframe", async () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: false, configurable: true });
    renderPage();
    await settle(() => !!q('[data-testid="abf-pdf-viewer-off"]') && !!q('[data-testid="abf-snippets"]'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    // Precondition: the bytes did arrive (an object URL was made) — the iframe is withheld, not just late.
    expect(api.fetchCandidatePdf).toHaveBeenCalledWith("c1");
    expect(q("iframe")).toBeNull();
    expect(q('[data-testid="abf-pdf-viewer-off"]')).not.toBeNull();
    expect(approveBtn()!.disabled).toBe(true);
  });
});

// ── b5 — the open random sample ─────────────────────────────────────────

describe("b5 — Random sample in the group picker", () => {
  function sampleFacet(
    project: string,
    name: string,
    year: number,
    status: AttachmentBackfillFacet["review_status"],
    count: number,
  ): AttachmentBackfillFacet {
    return { ...facet("sample", project, name, year, count), review_status: status };
  }
  // 5 sample members, all also counted in `clean` (FACETS); 2 already decided.
  const SAMPLE_FACETS: AttachmentBackfillFacet[] = [
    ...FACETS,
    sampleFacet("p-1", "Alpha", 2023, "pending", 3),
    sampleFacet("p-1", "Alpha", 2022, "approved", 1),
    sampleFacet("p-2", "Beta", 2024, "rejected", 1),
  ];
  const groupSelect = () => q('[data-testid="abf-group"]') as HTMLSelectElement;
  const sampleOption = () => q('[data-testid="abf-group"] option[value="sample"]');

  it("is absent when the facets carry no sample rows (control)", async () => {
    await renderReady();
    expect(groupSelect()).not.toBeNull();
    expect(sampleOption()).toBeNull();
    expect(q('[data-testid="abf-sample-progress"]')).toBeNull();
  });

  it("is offered when facets carry sample rows, with the sample's progress over every status", async () => {
    api.getFacets.mockResolvedValue(SAMPLE_FACETS);
    await renderReady();
    expect(sampleOption()).not.toBeNull();
    // Pending members only, like every other option's count.
    expect(sampleOption()!.textContent).toBe("Random sample (3)");
    expect(q('[data-testid="abf-sample-progress"]')!.textContent).toBe("Sample: 2 of 5 decided");
    // The default batch still opens on clean, never on the sample.
    expect(groupSelect().value).toBe("clean");
  });

  it("does not double-count: clean's count excludes the sample rows", async () => {
    api.getFacets.mockResolvedValue(SAMPLE_FACETS);
    await renderReady();
    expect(q('[data-testid="abf-group"] option[value="clean"]')!.textContent).toContain("(7)");
  });

  const sampleQueued = () => api.getQueue.mock.calls.some((c) => (c[1] as { group: string }).group === "sample");

  it("selecting it queries ONE flat list: group=sample with no project or year", async () => {
    api.getFacets.mockResolvedValue(SAMPLE_FACETS);
    await renderReady();
    act(() => setSelectValue(groupSelect(), "sample"));
    await settle(sampleQueued);
    const sampleCalls = api.getQueue.mock.calls.filter((c) => (c[1] as { group: string }).group === "sample");
    expect(sampleCalls).toHaveLength(1);
    // projectPublicId/year are null placeholders; getQueue omits them from the URL for `sample`
    // (pinned in attachmentBackfillApi.test.ts).
    expect(sampleCalls[0]).toEqual([
      "run-1",
      { group: "sample", projectPublicId: null, year: null, reviewStatus: "pending", after: null },
    ]);
    expect(groupSelect().value).toBe("sample");
  });

  it("disables the Project and Year pickers under the sample and says it is the whole sample", async () => {
    api.getFacets.mockResolvedValue(SAMPLE_FACETS);
    await renderReady();
    expect((q('[data-testid="abf-project"]') as HTMLSelectElement).disabled).toBe(false);
    expect(q('[data-testid="abf-sample-note"]')).toBeNull();
    act(() => setSelectValue(groupSelect(), "sample"));
    await settle(sampleQueued);
    for (const id of ["abf-project", "abf-year"]) {
      const sel = q(`[data-testid="${id}"]`) as HTMLSelectElement;
      expect(sel.disabled).toBe(true);
      expect([...sel.options].map((o) => o.textContent)).toEqual(["—"]);
    }
    expect(q('[data-testid="abf-sample-note"]')!.textContent).toBe("All 5, randomly selected");
    expect(q('[data-testid="abf-sample-progress"]')!.textContent).toBe("Sample: 2 of 5 decided");
  });

  it("switching back to an evidence group restores the normal project/year batch", async () => {
    api.getFacets.mockResolvedValue(SAMPLE_FACETS);
    await renderReady();
    act(() => setSelectValue(groupSelect(), "sample"));
    await settle(sampleQueued);
    const before = api.getQueue.mock.calls.length;
    act(() => setSelectValue(groupSelect(), "clean"));
    await settle(() => api.getQueue.mock.calls.length > before);
    expect(api.getQueue.mock.calls[api.getQueue.mock.calls.length - 1]).toEqual([
      "run-1",
      { group: "clean", projectPublicId: "p-1", year: 2022, reviewStatus: "pending", after: null },
    ]);
    const project = q('[data-testid="abf-project"]') as HTMLSelectElement;
    const year = q('[data-testid="abf-year"]') as HTMLSelectElement;
    expect(project.disabled).toBe(false);
    expect(year.disabled).toBe(false);
    expect(project.value).toBe("p-1");
    expect(year.value).toBe("2022");
    expect(q('[data-testid="abf-sample-note"]')).toBeNull();
  });

  it("with status All, the sample batch requests review_status=all", async () => {
    api.getFacets.mockResolvedValue(SAMPLE_FACETS);
    await renderReady();
    act(() => setSelectValue(q('[data-testid="abf-status-filter"]') as HTMLSelectElement, "all"));
    act(() => setSelectValue(groupSelect(), "sample"));
    const allSample = () =>
      api.getQueue.mock.calls.some(
        (c) => (c[1] as { group: string; reviewStatus: string }).group === "sample" &&
          (c[1] as { reviewStatus: string }).reviewStatus === "all",
      );
    await settle(allSample);
    expect(allSample()).toBe(true);
    expect(sampleOption()!.textContent).toBe("Random sample (5)");
  });

  const sampleCalls = () => api.getQueue.mock.calls.filter((c) => (c[1] as { group: string }).group === "sample");

  async function selectSample() {
    api.getFacets.mockResolvedValue(SAMPLE_FACETS);
    await renderReady();
    act(() => setSelectValue(groupSelect(), "sample"));
    await settle(sampleQueued);
    expect(sampleCalls()).toHaveLength(1);
    expect(q('[data-testid="abf-sample-note"]')!.textContent).toBe("All 5, randomly selected");
  }

  it("W1 — a sample closed mid-session says 'Sample closed', not 'All 0'", async () => {
    await selectSample();
    api.getFacets.mockResolvedValue(FACETS); // the sample rows are gone
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await settle(() => !q('[data-testid="abf-sample-progress"]'));
    // Propagation first: the refetched facets reached the page (progress line gone).
    expect(q('[data-testid="abf-sample-progress"]')).toBeNull();
    expect(groupSelect().value).toBe("sample");
    expect(q('[data-testid="abf-sample-note"]')!.textContent).toBe("Sample closed");
    expect(container.textContent).not.toContain("All 0");
  });

  it("W2 — a redrawn sample (new total) remounts the queue from the first page", async () => {
    await selectSample();
    api.getFacets.mockResolvedValue([...SAMPLE_FACETS, sampleFacet("p-2", "Beta", 2024, "pending", 2)]);
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await settle(() => (q('[data-testid="abf-sample-progress"]')?.textContent ?? "").includes("of 7"));
    expect(q('[data-testid="abf-sample-progress"]')!.textContent).toBe("Sample: 2 of 7 decided");
    await settle(() => sampleCalls().length > 1);
    expect(sampleCalls()).toHaveLength(2);
    expect(sampleCalls()[1][1]).toMatchObject({ group: "sample", after: null });
  });

  it("W2 control — a decision (same total) does not remount the sample queue", async () => {
    await selectSample();
    api.getFacets.mockResolvedValue(
      SAMPLE_FACETS.map((x) =>
        x.evidence_group === "sample" && x.review_status === "pending" ? { ...x, count: 2 } : x,
      ).concat(sampleFacet("p-1", "Alpha", 2023, "approved", 1)),
    );
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await settle(() => (q('[data-testid="abf-sample-progress"]')?.textContent ?? "").includes("3 of 5"));
    expect(q('[data-testid="abf-sample-progress"]')!.textContent).toBe("Sample: 3 of 5 decided");
    for (let i = 0; i < 3; i++) await flushUntil(() => sampleCalls().length > 1);
    expect(sampleCalls()).toHaveLength(1);
  });

  it("names no second reviewer anywhere on the page", async () => {
    api.getFacets.mockResolvedValue(SAMPLE_FACETS);
    await renderReady();
    expect((container.textContent ?? "").toLowerCase()).not.toMatch(/second review|reviewer/);
  });
});

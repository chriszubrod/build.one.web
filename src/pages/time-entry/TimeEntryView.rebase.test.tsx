import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TimeEntryView from "./TimeEntryView";
import { flushUntil } from "../../__testutils__/flush";
import { setTextareaValue } from "../../__testutils__/domEvents";
import type { TimeEntry, User } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENTRY_ID = "te-1";
const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPut = vi.fn();
const mockPost = vi.fn();
const mockDel = vi.fn();
const mockToast = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return { ...mod, useNavigate: () => mockNavigate };
});

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
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

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: {
      is_admin: true,
      modules: [],
      auth: { public_id: "a", username: "admin" },
      user: { id: 1, public_id: "u-1", firstname: "A", lastname: "D" },
      role: null,
      accessible_project_ids: [],
    },
    isLoading: false,
  }),
}));

function sampleUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    public_id: "u-1",
    row_version: "urv-1",
    created_datetime: null,
    modified_datetime: null,
    firstname: "Ada",
    lastname: "Lovelace",
    employee_id: null,
    vendor_id: null,
    ...overrides,
  };
}

function sampleEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 1,
    public_id: ENTRY_ID,
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    user_id: 1,
    work_date: "2026-01-15",
    note: "original note",
    current_status: "draft",
    time_logs: [],
    status_history: [],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function renderView() {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [`/time-entry/${ENTRY_ID}`] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/time-entry/:id",
              element: createElement(TimeEntryView),
            }),
          ),
        ),
      ),
    );
  });
}

async function waitForReady() {
  await flushUntil(() => container.querySelector('textarea[name="note"]') !== null);
  expect(container.querySelector('textarea[name="note"]')).not.toBeNull();
}

function headerPutBodies(): Record<string, unknown>[] {
  return mockPut.mock.calls
    .filter((c) => c[0] === `/api/v1/time-entries/${ENTRY_ID}`)
    .map((c) => c[1] as Record<string, unknown>);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockGetOne.mockImplementation((path: string) => {
    if (path === `/api/v1/time-entries/${ENTRY_ID}`) {
      return Promise.resolve(sampleEntry());
    }
    return Promise.reject(new Error("unexpected getOne: " + path));
  });
  mockGetList.mockImplementation((path: string) => {
    if (path === "/api/v1/get/users") {
      return Promise.resolve({ data: [sampleUser()], count: 1 });
    }
    if (path === "/api/v1/get/projects") {
      return Promise.resolve({ data: [], count: 0 });
    }
    return Promise.resolve({ data: [], count: 0 });
  });
  mockPut.mockImplementation((path: string, body: Record<string, unknown>) => {
    if (path === `/api/v1/time-entries/${ENTRY_ID}`) {
      return Promise.resolve(sampleEntry({
        row_version: "rv-saved",
        note: (body.note as string | null) ?? "",
        work_date: (body.work_date as string) ?? "2026-01-15",
      }));
    }
    return Promise.reject(new Error("unexpected put: " + path));
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  vi.useRealTimers();
});

describe("TimeEntryView dirty-branch base test (U-471)", () => {
  it("rebases the token when dirty and only owned fields moved — no banner", async () => {
    renderView();
    await waitForReady();

    const note = container.querySelector('textarea[name="note"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(note, "typed by me");
    });

    act(() => {
      queryClient.setQueryData(["time-entry", ENTRY_ID], sampleEntry({ row_version: "rv-2" }));
    });
    await flushUntil(() => queryClient.getQueryData<TimeEntry>(["time-entry", ENTRY_ID])?.row_version === "rv-2");

    expect(container.textContent).not.toContain("This time entry was changed in another window.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => headerPutBodies().length > 0);
    expect(headerPutBodies()[0].row_version).toBe("rv-2");
    expect(headerPutBodies()[0].note).toBe("typed by me");
  });

  it("does NOT rebase the token when dirty and a co-editor changed note — banner instead", async () => {
    renderView();
    await waitForReady();

    const note = container.querySelector('textarea[name="note"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(note, "typed by me");
    });

    act(() => {
      queryClient.setQueryData(["time-entry", ENTRY_ID], sampleEntry({
        row_version: "rv-2",
        note: "from another window",
      }));
    });
    await flushUntil(() => queryClient.getQueryData<TimeEntry>(["time-entry", ENTRY_ID])?.note === "from another window");

    await flushUntil(() => container.textContent?.includes("This time entry was changed in another window.") ?? false);
    expect(container.textContent).toContain("This time entry was changed in another window.");
    expect((container.querySelector('textarea[name="note"]') as HTMLTextAreaElement).value).toBe("typed by me");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => headerPutBodies().length > 0);
    expect(headerPutBodies()[0].row_version).toBe("rv-1");
    expect(headerPutBodies()[0].row_version).not.toBe("rv-2");
  });

  it("acceptBaseline: save, then an arrival carrying the saved values is NOT diverged", async () => {
    renderView();
    await waitForReady();

    const note = container.querySelector('textarea[name="note"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(note, "saved note");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => headerPutBodies().length > 0);

    await act(async () => {
      setTextareaValue(note, "newer local edit");
    });

    act(() => {
      queryClient.setQueryData(["time-entry", ENTRY_ID], sampleEntry({
        row_version: "rv-saved",
        note: "saved note",
      }));
    });
    await flushUntil(() => queryClient.getQueryData<TimeEntry>(["time-entry", ENTRY_ID])?.note === "saved note");

    expect(container.textContent).not.toContain("This time entry was changed in another window.");
    expect((container.querySelector('textarea[name="note"]') as HTMLTextAreaElement).value).toBe("newer local edit");
  });

  it("dirty across the PUT: recaptures baseline so a later arrival is not a spurious banner", async () => {
    /* P2-1. Type A → autosave PUTs → type B while in flight. headerDirtyRef
       stays true when the response lands, so hydrate takes the DIRTY branch.
       The post-PUT recapture is what makes this arrival match the baseline.
       Deleting TimeEntryView.tsx's `baselineRef.current = seedTimeEntryHeader(updated, …)`
       must turn this RED (permanent spurious banner). */
    type Pending = { body: Record<string, unknown>; resolve: (v: TimeEntry) => void };
    const pending: Pending[] = [];
    mockPut.mockImplementation((path: string, body: Record<string, unknown>) => {
      if (path === `/api/v1/time-entries/${ENTRY_ID}`) {
        return new Promise<TimeEntry>((resolve) => {
          pending.push({ body, resolve });
        });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    renderView();
    await waitForReady();

    const note = container.querySelector('textarea[name="note"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(note, "A");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => pending.length === 1);
    expect(pending).toHaveLength(1);
    expect(pending[0].body.note).toBe("A");

    await act(async () => {
      setTextareaValue(note, "B");
    });

    await act(async () => {
      pending[0].resolve(sampleEntry({
        row_version: "rv-saved",
        note: "A",
      }));
    });
    await flushUntil(() => queryClient.getQueryData<TimeEntry>(["time-entry", ENTRY_ID])?.row_version === "rv-saved");

    expect(container.textContent).not.toContain("This time entry was changed in another window.");
    expect((container.querySelector('textarea[name="note"]') as HTMLTextAreaElement).value).toBe("B");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => pending.length >= 2);
    expect(pending.length).toBeGreaterThanOrEqual(2);
    expect(pending[pending.length - 1].body.row_version).toBe("rv-saved");
    expect(pending[pending.length - 1].body.note).toBe("B");
  });

  it("a NON-dirty co-editor arrival re-seeds and does NOT leave diverged set", async () => {
    /* P3-1. Without `dirty &&`, a clean co-editor arrival sets `diverged`
       before the same effect re-seeds and recaptures, leaving a sticky
       banner over a form that was just correctly refreshed. */
    renderView();
    await waitForReady();
    expect((container.querySelector('textarea[name="note"]') as HTMLTextAreaElement).value).toBe("original note");

    act(() => {
      queryClient.setQueryData(["time-entry", ENTRY_ID], sampleEntry({
        row_version: "rv-2",
        note: "from another window",
      }));
    });
    await flushUntil(() => queryClient.getQueryData<TimeEntry>(["time-entry", ENTRY_ID])?.note === "from another window");
    expect((container.querySelector('textarea[name="note"]') as HTMLTextAreaElement).value).toBe("from another window");
    expect(container.textContent).not.toContain("This time entry was changed in another window.");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ProjectList from "./ProjectList";
import { projectSubtitle } from "./projectSubtitle";
import type { Project } from "../../types/api";
import { flushUntil } from "../../__testutils__/flush";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetList = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
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

function sampleProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    public_id: "project-1",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    name: "Riverside Build",
    description: null,
    status: "active",
    customer_id: null,
    customer_name: null,
    abbreviation: null,
    notes: null,
    ...overrides,
  };
}

let lastContainer: HTMLDivElement;
let lastRoot: Root | null = null;

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  lastContainer = document.createElement("div");
  document.body.appendChild(lastContainer);
  lastRoot = createRoot(lastContainer);
  act(() => {
    lastRoot!.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(ProjectList)),
      ),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetList.mockReset();
  mockGetList.mockResolvedValue({ data: [], count: 0 });
});

afterEach(() => {
  act(() => {
    lastRoot?.unmount();
  });
  lastRoot = null;
  lastContainer?.remove();
  vi.useRealTimers();
});

describe("projectSubtitle", () => {
  it("joins abbreviation and customer name with a middle dot", () => {
    expect(projectSubtitle({ abbreviation: "RVB", customer_name: "Acme Corp" })).toBe(
      "RVB · Acme Corp",
    );
  });

  it("returns only the abbreviation when there is no customer", () => {
    expect(projectSubtitle({ abbreviation: "RVB", customer_name: null })).toBe("RVB");
  });

  it("returns only the customer name when there is no abbreviation", () => {
    expect(projectSubtitle({ abbreviation: null, customer_name: "Acme Corp" })).toBe(
      "Acme Corp",
    );
  });

  it("returns undefined when both are absent", () => {
    expect(projectSubtitle({ abbreviation: null, customer_name: null })).toBeUndefined();
  });

  it("treats a missing customer_name (persisted-cache shape) as no customer", () => {
    expect(projectSubtitle({ abbreviation: "RVB" })).toBe("RVB");
  });
});

describe("ProjectList subtitles", () => {
  it("shows abbreviation · customer when present and abbreviation alone otherwise", async () => {
    mockGetList.mockResolvedValue({
      data: [
        sampleProject({
          public_id: "p1",
          name: "Riverside Build",
          abbreviation: "RVB",
          customer_name: "Acme Corp",
        }),
        sampleProject({
          public_id: "p2",
          name: "Harbor Repair",
          abbreviation: "HBR",
          customer_name: null,
        }),
      ],
      count: 2,
    });

    renderList();
    await flushUntil(() =>
      (lastContainer.textContent ?? "").includes("Riverside Build"),
    );

    const subtitles = Array.from(lastContainer.querySelectorAll(".list-row-subtitle")).map(
      (el) => el.textContent,
    );
    expect(subtitles).toEqual(["RVB · Acme Corp", "HBR"]);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BudgetEdit from "./BudgetEdit";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";
import type { Budget, BudgetLineItem, BudgetRevision } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BUDGET_ID = "bud-1";
const REV_ID = "rev-1";
const CREATE_LI_PATH = "/api/v1/create/budget-line-item";
const LINE_ITEMS_PATH = `/api/v1/get/budget-line-items/by-revision/${REV_ID}`;

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
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

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: {
      is_admin: true,
      modules: [],
      auth: { public_id: "a", username: "admin" },
      user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
      role: null,
      accessible_project_ids: [],
    },
    isLoading: false,
  }),
}));

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () => ({ data: { sub_cost_codes: [] } }),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function sampleBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    public_id: BUDGET_ID,
    row_version: "bud-rv-1",
    project_id: 1,
    status: "draft",
    notes: null,
    project_name: "Test Project",
    project_public_id: "proj-1",
    ...overrides,
  };
}

function sampleRevision(overrides: Partial<BudgetRevision> = {}): BudgetRevision {
  return {
    public_id: REV_ID,
    row_version: "rev-rv-1",
    budget_id: 1,
    revision_number: 0,
    type: "original",
    status: "draft",
    title: null,
    description: null,
    approved_by_user_id: null,
    approved_datetime: null,
    effective_date: null,
    ...overrides,
  };
}

function setupMocks() {
  const rev = sampleRevision();
  // What the server currently holds. saveAll POSTs a create and then awaits an
  // invalidate, so the refetch must observe the new row — that second read is
  // what drives the hydrate uid-reuse path exercised by the third spec.
  const serverLineItems: BudgetLineItem[] = [];

  mockGetOne.mockImplementation((path: string) => {
    if (path === `/api/v1/get/budget/${BUDGET_ID}`) {
      return Promise.resolve(sampleBudget());
    }
    if (path === `/api/v1/get/budget-revision/${REV_ID}`) {
      return Promise.resolve(rev);
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockImplementation((path: string) => {
    if (path === `/api/v1/get/budget-revisions/by-budget/${BUDGET_ID}`) {
      return Promise.resolve({ data: [rev], count: 1 });
    }
    if (path === LINE_ITEMS_PATH) {
      return Promise.resolve({
        data: serverLineItems.map((li) => ({ ...li })),
        count: serverLineItems.length,
      });
    }
    return Promise.reject(new Error(`unexpected getList: ${path}`));
  });

  mockPost.mockImplementation((path: string, body: { description: string | null }) => {
    if (path === CREATE_LI_PATH) {
      const created: BudgetLineItem = {
        public_id: "bli-1",
        row_version: "bli-rv-1",
        budget_revision_id: 1,
        sub_cost_code_id: null,
        // Echo the description back CHANGED. That makes the persisted value
        // distinguishable from the one typed locally, so a spec can prove the
        // refetch actually reached the component instead of reading back its
        // own keystrokes (U-152 rule 3: propagation before outcome).
        description: `${body.description} [persisted]`,
        quantity: null,
        rate: null,
        amount: null,
        markup: null,
        price: null,
      };
      serverLineItems.push(created);
      return Promise.resolve(created);
    }
    return Promise.reject(new Error(`unexpected post: ${path}`));
  });

  mockPut.mockRejectedValue(new Error("unexpected put"));
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function renderEdit() {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [`/budget/${BUDGET_ID}/edit`] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/budget/:publicId/edit",
              element: createElement(BudgetEdit),
            }),
          ),
        ),
      ),
    );
  });
}

function lineCards(): Element[] {
  return Array.from(container.querySelectorAll(".li-card"));
}

/** Throws on miss — for use in assertions, never as a flushUntil predicate. */
function labeledInputInCard(card: Element, label: string): HTMLInputElement {
  for (const el of card.querySelectorAll("label")) {
    if (el.textContent?.trim() === label) {
      const input = el.parentElement?.querySelector("input");
      if (!input) throw new Error(`no input under label: ${label}`);
      return input as HTMLInputElement;
    }
  }
  throw new Error(`input not found for label: ${label}`);
}

function addLineButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "+ Add Line",
  );
}

function saveButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Save",
  );
}

/** runAllTimersAsync is LOAD-BEARING here — do not "simplify" it away (it was
 *  tried; all three specs go red). BudgetEdit's queries are CHAINED, not flat:
 *  budget -> revisions -> activeRevPublicId (derived) -> revision + line items,
 *  the last two gated on `enabled`. flushUntil only calls
 *  advanceTimersByTimeAsync(0), which fires 0ms timers and never reaches a
 *  stage parked behind a longer delay, so the cascade stalls at Loading. Flatter
 *  pages (ContractLaborEdit) settle without this; this one does not.
 *
 *  The predicate must be able to answer "not yet" rather than throw, or the hard
 *  assertion after it becomes unfailable (U-152). */
async function waitForAddLineButton() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  await flushUntil(() => addLineButton() !== undefined);
  expect(addLineButton(), "page never rendered past Loading").toBeDefined();
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetList.mockReset();
  mockGetOne.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setupMocks();

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

describe("BudgetEdit (U-189)", () => {
  it("persists the correctly rounded amount and price on the create body", async () => {
    renderEdit();
    await waitForAddLineButton();

    await act(async () => {
      addLineButton()!.click();
    });

    expect(lineCards()).toHaveLength(1);
    const card = lineCards()[0];

    await act(async () => {
      setInputValue(labeledInputInCard(card, "Qty"), "1");
      setInputValue(labeledInputInCard(card, "Rate"), "1.005");
      setInputValue(labeledInputInCard(card, "Markup"), "1");
    });
    expect(labeledInputInCard(card, "Qty").value).toBe("1");
    expect(labeledInputInCard(card, "Rate").value).toBe("1.005");
    expect(labeledInputInCard(card, "Markup").value).toBe("1");

    mockPost.mockClear();

    const btn = saveButton();
    expect(btn, "Save button not rendered").toBeDefined();
    await act(async () => {
      btn!.click();
    });

    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === CREATE_LI_PATH));
    const call = mockPost.mock.calls.find((c) => c[0] === CREATE_LI_PATH);
    expect(call, "Save did not POST create budget-line-item").toBeDefined();

    const body = call![1] as { amount: number; price: number };
    expect(body.amount).toBe(1.01);
    expect(body.price).toBe(2.02);
  });

  it("persists exact decimal price 100.03 on float-lossy qty×rate×markup (U-192)", async () => {
    renderEdit();
    await waitForAddLineButton();

    await act(async () => {
      addLineButton()!.click();
    });

    const card = lineCards()[0];

    await act(async () => {
      setInputValue(labeledInputInCard(card, "Qty"), "1");
      setInputValue(labeledInputInCard(card, "Rate"), "80.02");
      setInputValue(labeledInputInCard(card, "Markup"), "0.25");
    });
    expect(labeledInputInCard(card, "Qty").value).toBe("1");
    expect(labeledInputInCard(card, "Rate").value).toBe("80.02");
    expect(labeledInputInCard(card, "Markup").value).toBe("0.25");

    // Fixture precondition: prove THESE inputs are genuinely float-lossy, so
    // the assertion below fails if the exact multiply regresses. Derived from
    // the fixture, not a literal compared to a literal.
    const floatProduct = Number("1") * Number("80.02") * (1 + Number("0.25"));
    expect(floatProduct).toBe(100.02499999999999);

    mockPost.mockClear();

    const btn = saveButton();
    expect(btn, "Save button not rendered").toBeDefined();
    await act(async () => {
      btn!.click();
    });

    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === CREATE_LI_PATH));
    const call = mockPost.mock.calls.find((c) => c[0] === CREATE_LI_PATH);
    expect(call, "Save did not POST create budget-line-item").toBeDefined();

    const body = call![1] as { amount: number; price: number };
    expect(body.amount).toBe(80.02);
    expect(body.price).toBe(100.03);
  });

  it("keeps row identity and focus on the correct surviving row after a mid-list remove", async () => {
    renderEdit();
    await waitForAddLineButton();

    await act(async () => {
      addLineButton()!.click();
      addLineButton()!.click();
      addLineButton()!.click();
    });

    const cards = lineCards();
    expect(cards.length).toBe(3);

    await act(async () => {
      setInputValue(labeledInputInCard(cards[0], "Description"), "A");
      setInputValue(labeledInputInCard(cards[1], "Description"), "B");
      setInputValue(labeledInputInCard(cards[2], "Description"), "C");
    });
    expect(labeledInputInCard(cards[0], "Description").value).toBe("A");
    expect(labeledInputInCard(cards[1], "Description").value).toBe("B");
    expect(labeledInputInCard(cards[2], "Description").value).toBe("C");

    const thirdDesc = labeledInputInCard(cards[2], "Description");
    thirdDesc.focus();

    const firstRemove = cards[0].querySelector(
      ".inline-li-remove",
    ) as HTMLButtonElement;
    expect(firstRemove).toBeTruthy();
    await act(async () => {
      firstRemove.click();
    });

    const after = lineCards();
    expect(after.length).toBe(2);

    const secondCardDesc = labeledInputInCard(after[1], "Description");
    // Node identity + activeElement carry the proof — controlled inputs would
    // still show "C" under index keys after React remounted the third row.
    expect(secondCardDesc).toBe(thirdDesc);
    expect(document.activeElement).toBe(thirdDesc);
    expect(secondCardDesc.value).toBe("C");
  });

  it("reuses the minted uid on the post-save refetch so a created row does not remount", async () => {
    renderEdit();
    await waitForAddLineButton();

    await act(async () => {
      addLineButton()!.click();
    });
    expect(lineCards()).toHaveLength(1);

    const beforeSave = labeledInputInCard(lineCards()[0], "Description");
    await act(async () => {
      setInputValue(beforeSave, "Footings");
    });
    expect(beforeSave.value).toBe("Footings");

    const btn = saveButton();
    expect(btn, "Save button not rendered").toBeDefined();
    await act(async () => {
      btn!.click();
    });

    // The row is created, then saveAll invalidates and awaits the refetch that
    // re-runs the hydrate effect. Wait for the create AND for the second read
    // of the line-items endpoint — the outcome below is meaningless until the
    // re-hydrate has actually happened.
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === CREATE_LI_PATH));
    await flushUntil(
      () => mockGetList.mock.calls.filter((c) => c[0] === LINE_ITEMS_PATH).length >= 2,
    );

    expect(lineCards()).toHaveLength(1);
    const afterSave = labeledInputInCard(lineCards()[0], "Description");
    // Propagation: the "[persisted]" suffix exists only on the server echo, so
    // reading it back proves the refetched row reached the component rather
    // than the spec re-reading its own keystrokes. Passes either way — it is a
    // precondition, not the outcome.
    expect(afterSave.value).toBe("Footings [persisted]");
    // Outcome: same DOM node across the refetch. This is what fails if hydrate
    // stops reusing the minted uid (existingUidsByPublicId) and derives
    // persistedLineItemUid(public_id) unconditionally — the key flips
    // li-uid-N -> li-pid-bli-1, React remounts the row, and focus/selection die
    // under the user mid-edit. That is the exact defect U-176 warned about.
    expect(afterSave).toBe(beforeSave);
  });
});

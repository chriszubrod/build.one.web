import { act, createElement, Fragment, type ReactElement } from "react";
import type { Root } from "react-dom/client";
import { expect, type Mock } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { entityItemKey, useEntityItem } from "../hooks/useEntity";
import { setInputValue } from "./domEvents";
import { flushUntil } from "./flush";

/**
 * Shared harness for the entity-Edit `formSeedId` guard spec (U-152).
 *
 * The guard's job (b) is: a background refetch of the SAME row must not clobber
 * an in-progress edit. Proving that requires three things the original copies
 * each got wrong, any one of which silently makes the spec vacuous:
 *   1. the edit must actually reach React state (see `setInputValue`),
 *   2. the refetch must actually reach the component (see `flushUntil`), and
 *   3. the spec must ASSERT that both happened before asserting survival.
 */

export const WITNESS_ID = "refetch-witness";

/**
 * Propagation witness: subscribes to the SAME query key through the SAME
 * production hook the page uses, and renders the row_version it receives. When
 * it shows the refreshed row_version, React has committed the fresh item to
 * `useEntityItem` consumers in this tree — so the page under test has seen it
 * too. This is what makes the spec anti-vacuous BY CONSTRUCTION: if propagation
 * ever breaks again, the spec goes RED instead of quietly passing.
 *
 * It must live inside the SAME QueryClientProvider tree as the page — a second
 * root sharing only the QueryClient could flush independently, which would
 * break the "the page saw it too" inference.
 */
export function RefetchWitness({ itemPath }: { itemPath: string }) {
  const { item } = useEntityItem<{ row_version: string }>(itemPath);
  return createElement("span", { id: WITNESS_ID }, item?.row_version ?? "");
}

export interface SameRowRefetchOptions {
  container: HTMLElement;
  root: Root;
  /** e.g. createElement(CompanyEdit) */
  component: ReactElement;
  /** e.g. "/company/:publicId/edit" */
  routePath: string;
  /** e.g. "/company/co-a/edit" */
  initialEntry: string;
  /** e.g. "/api/v1/get/company/co-a" */
  itemPath: string;
  /** the spec file's own vi.fn() standing in for api/client getOne */
  mockGetOne: Mock;
  /** e.g. "#name" — the field the user edits. The id matches the row's property
   *  name, which is how FormField renders it. */
  fieldSelector: string;
  /** the value that field holds once seeded from row A */
  seededValue: string;
  /** what the user types */
  editedValue: string;
  /** the row the server returns on refetch. Its values for the asserted fields
   *  must differ from row A's — otherwise a re-seed would be invisible and this
   *  spec vacuous. Machine-checked below, not left to the caller. */
  refreshedRow: { row_version: string };
  /** a second field the user did NOT touch; a re-seed clobbers every field, so
   *  this widens the net. Omit for single-field forms. */
  untouched?: { selector: string; expected: string };
}

/**
 * Render the Edit page, seed it from row A, type an edit, refetch the SAME row
 * with changed server values, and assert the guard did not re-seed.
 *
 * Mutation-proven: RED when the guard is replaced by an unconditional
 * `useEffect(() => { if (item) setForm(...) }, [item])` re-seed, and RED when it
 * is keyed on `row_version` instead of `public_id`. GREEN with the real guard
 * and with the older `if (item && !form)` pattern — a same-row refetch cannot
 * discriminate those two, which is the param-change spec's job.
 */
export async function assertGuardSurvivesSameRowRefetch(
  opts: SameRowRefetchOptions,
): Promise<void> {
  const {
    container, root, component, routePath, initialEntry, itemPath, mockGetOne,
    fieldSelector, seededValue, editedValue, refreshedRow, untouched,
  } = opts;

  // --- preconditions, machine-checked --------------------------------------
  // A refreshed row that happened to match what we assert survives would make
  // this spec pass regardless of the guard — the exact bug class this harness
  // exists to kill. So it is asserted, not just documented.
  const refreshed = refreshedRow as unknown as Record<string, unknown>;
  const fieldKey = fieldSelector.replace(/^#/, "");
  const refreshedFieldValue = refreshed[fieldKey];
  expect(
    refreshedFieldValue,
    `refreshedRow must carry "${fieldKey}" (matching fieldSelector "${fieldSelector}")`,
  ).toBeDefined();
  expect(
    refreshedFieldValue,
    "refreshedRow must differ from the user's edit, or a clobber is invisible",
  ).not.toBe(editedValue);
  expect(
    refreshedFieldValue,
    "refreshedRow must differ from row A, or a re-seed is invisible",
  ).not.toBe(seededValue);
  if (untouched) {
    const untouchedKey = untouched.selector.replace(/^#/, "");
    const refreshedUntouched = refreshed[untouchedKey];
    expect(
      refreshedUntouched,
      `refreshedRow must carry "${untouchedKey}" (matching untouched.selector)`,
    ).toBeDefined();
    expect(
      refreshedUntouched,
      "refreshedRow's untouched field must differ from row A",
    ).not.toBe(untouched.expected);
  }
  const refreshedRowVersion = refreshedRow.row_version;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const field = () => container.querySelector<HTMLInputElement>(fieldSelector);
  const witness = () => container.querySelector(`#${WITNESS_ID}`)?.textContent ?? "";

  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Fragment,
            null,
            createElement(RefetchWitness, { itemPath }),
            createElement(
              Routes,
              null,
              createElement(Route, { path: routePath, element: component }),
            ),
          ),
        ),
      ),
    );
  });

  // 1 — the form is seeded from row A
  await flushUntil(() => field()?.value === seededValue);
  expect(field()?.value).toBe(seededValue);

  // 2 — the user edits, through the value tracker so onChange really fires.
  //     Deliberately no assertion here: setInputValue writes the DOM value
  //     directly, so reading it back could not fail. Step 5 is authoritative —
  //     by then the component has re-rendered, so an edit that never reached
  //     React state shows up as the field reverting to `seededValue`.
  await act(async () => {
    setInputValue(field()!, editedValue);
  });
  await flushUntil(() => field()?.value === editedValue);

  // 3 — the same row changes underneath us on the server
  const callsBefore = mockGetOne.mock.calls.length;
  mockGetOne.mockImplementation((path: string) => {
    if (path === itemPath) return Promise.resolve(refreshedRow);
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: entityItemKey(itemPath) });
  });
  await flushUntil(() => witness() === refreshedRowVersion);

  // 4 — anti-vacuity: the refetch really fired AND React really committed the
  //     fresh item into this tree. Without these the survival assertion below
  //     would pass trivially against a stale render.
  expect(mockGetOne.mock.calls.length).toBeGreaterThan(callsBefore);
  expect(mockGetOne.mock.calls.at(-1)?.[0]).toBe(itemPath);
  expect(witness()).toBe(refreshedRowVersion);

  // 5 — the guard held: nothing was re-seeded.
  expect(field()?.value).toBe(editedValue);
  if (untouched) {
    expect(container.querySelector<HTMLInputElement>(untouched.selector)?.value).toBe(
      untouched.expected,
    );
  }
}

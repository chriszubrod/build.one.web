import { describe, expect, it } from "vitest";
import { budgetChip, expenseBudgetChip } from "./budgetChip";

describe("budgetChip (shared)", () => {
  it("maps fits/tight/over/unbudgeted and no_budget for bills", () => {
    expect(budgetChip("fits", "100.00")).toEqual({
      label: "Within budget",
      className: "status-badge coding-budget-fits",
    });
    expect(budgetChip("tight", "50.25")?.label).toBe("Tight: $50.25 left");
    expect(budgetChip("over", "-75.00")?.label).toBe("Over by $75.00");
    expect(budgetChip("unbudgeted", null)?.label).toBe("No budget line");
    expect(budgetChip("no_budget", null)?.label).toBe("No active budget");
  });
});

describe("expenseBudgetChip", () => {
  it("shows fits, tight, over, and unbudgeted", () => {
    expect(
      expenseBudgetChip({
        check: "fits",
        remaining: "100.00",
        project_id: 1,
      }),
    ).toEqual({
      label: "Within budget",
      className: "status-badge coding-budget-fits",
    });
    expect(
      expenseBudgetChip({
        check: "tight",
        remaining: "1234.56",
        project_id: 1,
      })?.label,
    ).toBe("Tight: $1,234.56 left");
    expect(
      expenseBudgetChip({
        check: "over",
        remaining: "-50.00",
        project_id: 1,
      })?.label,
    ).toBe("Over by $50.00");
    expect(
      expenseBudgetChip({
        check: "over",
        remaining: "-50.00",
        project_id: 1,
      })?.className,
    ).toContain("coding-budget-over");
    expect(
      expenseBudgetChip({
        check: "unbudgeted",
        remaining: null,
        project_id: 1,
      })?.label,
    ).toBe("No budget line");
  });

  it("returns null for no_budget, no_project, null, and undefined", () => {
    expect(
      expenseBudgetChip({
        check: "no_budget",
        remaining: null,
        project_id: null,
      }),
    ).toBeNull();
    expect(
      expenseBudgetChip({
        check: "no_project",
        remaining: null,
        project_id: null,
      }),
    ).toBeNull();
    expect(expenseBudgetChip(null)).toBeNull();
    expect(expenseBudgetChip(undefined)).toBeNull();
  });

  it("returns null for tight/over when remaining is missing", () => {
    expect(
      expenseBudgetChip({
        check: "tight",
        remaining: null,
        project_id: 1,
      }),
    ).toBeNull();
    expect(
      expenseBudgetChip({
        check: "over",
        remaining: "",
        project_id: 1,
      }),
    ).toBeNull();
  });
});

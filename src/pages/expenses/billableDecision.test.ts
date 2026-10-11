import { describe, it, expect } from "vitest";
import {
  effectiveBillable,
  applyLineEdits,
  billableHint,
  billablePayload,
  billableViewLabel,
  type BillableRow,
} from "./billableDecision";

function row(overrides: Partial<BillableRow> & Pick<BillableRow, "uid">): BillableRow {
  return {
    project_id: "",
    is_billable: false,
    billable_decided: false,
    ...overrides,
  };
}

describe("effectiveBillable", () => {
  it("keeps the row value when the person already decided", () => {
    expect(
      effectiveBillable(
        row({ uid: "1", is_billable: false, billable_decided: true, project_id: "10" }),
        { is_cost_plus: true },
      ),
    ).toBe(false);
  });

  it("is true on a cost-plus project when undecided", () => {
    expect(
      effectiveBillable(
        row({ uid: "1", is_billable: false, billable_decided: false, project_id: "10" }),
        { is_cost_plus: true },
      ),
    ).toBe(true);
  });

  it("is false on a flat-rate project when undecided", () => {
    expect(
      effectiveBillable(
        row({ uid: "1", is_billable: true, billable_decided: false, project_id: "10" }),
        { is_cost_plus: false },
      ),
    ).toBe(false);
  });

  it("falls back to the row value when project billing type is unknown", () => {
    expect(
      effectiveBillable(
        row({ uid: "1", is_billable: true, billable_decided: false, project_id: "10" }),
        { is_cost_plus: null },
      ),
    ).toBe(true);
    expect(
      effectiveBillable(
        row({ uid: "1", is_billable: false, billable_decided: false, project_id: "10" }),
        undefined,
      ),
    ).toBe(false);
  });
});

describe("applyLineEdits", () => {
  const costPlus = { is_cost_plus: true as const };
  const flat = { is_cost_plus: false as const };
  const projects: Record<string, { is_cost_plus: boolean }> = {
    "1": costPlus,
    "2": flat,
  };
  const projectFor = (id: string) => projects[id];

  it("marks decided when billable toggles on an unchanged project", () => {
    const prev = [row({ uid: "a", project_id: "1", is_billable: true })];
    const next = [row({ uid: "a", project_id: "1", is_billable: false })];
    const out = applyLineEdits(prev, next, projectFor);
    expect(out[0]!.billable_decided).toBe(true);
    expect(out[0]!.is_billable).toBe(false);
  });

  it("recomputes billable when project changes on an undecided row without marking decided", () => {
    const prev = [row({ uid: "a", project_id: "2", is_billable: false })];
    const next = [row({ uid: "a", project_id: "1", is_billable: false })];
    const out = applyLineEdits(prev, next, projectFor);
    expect(out[0]!.is_billable).toBe(true);
    expect(out[0]!.billable_decided).toBe(false);
  });

  it("keeps billable when project changes on a decided row", () => {
    const prev = [
      row({ uid: "a", project_id: "2", is_billable: true, billable_decided: true }),
    ];
    const next = [row({ uid: "a", project_id: "1", is_billable: true, billable_decided: true })];
    const out = applyLineEdits(prev, next, projectFor);
    expect(out[0]!.is_billable).toBe(true);
    expect(out[0]!.billable_decided).toBe(true);
  });

  it("never clears billable_decided once set", () => {
    const prev = [
      row({ uid: "a", project_id: "1", is_billable: true, billable_decided: true }),
    ];
    const next = [row({ uid: "a", project_id: "1", is_billable: true, billable_decided: false })];
    const out = applyLineEdits(prev, next, projectFor);
    expect(out[0]!.billable_decided).toBe(true);
  });

  it("applies project default for a new undecided row", () => {
    const out = applyLineEdits([], [row({ uid: "n", project_id: "2", is_billable: true })], projectFor);
    expect(out[0]!.is_billable).toBe(false);
    expect(out[0]!.billable_decided).toBe(false);
  });

  it("does not mutate prev or next arrays or their row objects", () => {
    const prev = [row({ uid: "a", project_id: "1", is_billable: true })];
    const next = [row({ uid: "a", project_id: "1", is_billable: false })];
    const prevSnap = JSON.stringify(prev);
    const nextSnap = JSON.stringify(next);
    applyLineEdits(prev, next, projectFor);
    expect(JSON.stringify(prev)).toBe(prevSnap);
    expect(JSON.stringify(next)).toBe(nextSnap);
  });
});

describe("billableHint", () => {
  it('returns "decided" when the row is stamped', () => {
    expect(billableHint(row({ uid: "1", billable_decided: true }), { is_cost_plus: true })).toBe(
      "decided",
    );
  });

  it('returns "project default" when undecided and project type is known', () => {
    expect(billableHint(row({ uid: "1" }), { is_cost_plus: false })).toBe("project default");
  });

  it("returns null when undecided and project billing type is unknown", () => {
    expect(billableHint(row({ uid: "1" }), undefined)).toBe(null);
    expect(billableHint(row({ uid: "1" }), { is_cost_plus: null })).toBe(null);
  });
});

describe("billablePayload", () => {
  it("sends value and billable_decided for a decided row", () => {
    expect(billablePayload(row({ uid: "1", is_billable: false, billable_decided: true }))).toEqual({
      is_billable: false,
      billable_decided: true,
    });
  });

  it("sends null is_billable with no flag when undecided", () => {
    const payload = billablePayload(row({ uid: "1", is_billable: true, billable_decided: false }));
    expect(payload).toEqual({ is_billable: null });
    expect("billable_decided" in payload).toBe(false);
  });
});

describe("billableViewLabel", () => {
  it("returns empty string when is_billable is null", () => {
    expect(billableViewLabel({ is_billable: null, billable_decided_at: null })).toBe("");
  });

  it("includes decided date when stamped", () => {
    expect(
      billableViewLabel({ is_billable: true, billable_decided_at: "2026-10-11T18:00:00" }),
    ).toBe("Yes · decided 2026-10-11");
  });

  it("shows Yes/No without project-default suffix when undecided", () => {
    expect(billableViewLabel({ is_billable: false, billable_decided_at: null })).toBe("No");
  });
});

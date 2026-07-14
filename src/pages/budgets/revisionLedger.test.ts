import { describe, it, expect } from "vitest";
import {
  roundToCents,
  netImpactCents,
  centsToAmount,
  buildLedger,
} from "./revisionLedger";
import type { BudgetRevision, BudgetLineItem } from "../../types/api";

function line(price: string): BudgetLineItem {
  return {
    public_id: "li",
    row_version: "v",
    budget_revision_id: 1,
    sub_cost_code_id: null,
    description: null,
    quantity: null,
    rate: null,
    amount: null,
    markup: null,
    price,
  };
}

function rev(
  publicId: string,
  revisionNumber: number,
  status: string,
  type = "change_order",
): BudgetRevision {
  return {
    public_id: publicId,
    row_version: "v",
    budget_id: 1,
    revision_number: revisionNumber,
    type,
    status,
    title: null,
    description: null,
    approved_by_user_id: null,
    approved_datetime: null,
    effective_date: null,
  };
}

describe("roundToCents", () => {
  it("parses dollar strings", () => {
    expect(roundToCents("1234.56")).toBe(123456);
    expect(roundToCents("0.1")).toBe(10);
  });

  it("treats nullish and empty as zero", () => {
    expect(roundToCents(null)).toBe(0);
    expect(roundToCents("")).toBe(0);
  });
});

describe("netImpactCents", () => {
  it("sums line prices in integer cents", () => {
    expect(
      netImpactCents([line("10.00"), line("20.00"), line("0.01")]),
    ).toBe(3001);
  });

  it("returns zero for undefined or empty", () => {
    expect(netImpactCents(undefined)).toBe(0);
    expect(netImpactCents([])).toBe(0);
  });
});

describe("centsToAmount", () => {
  it("formats positive, negative, sub-dollar, and zero amounts", () => {
    expect(centsToAmount(123456)).toBe("1234.56");
    expect(centsToAmount(-4000)).toBe("-40.00");
    expect(centsToAmount(5)).toBe("0.05");
    expect(centsToAmount(0)).toBe("0.00");
  });
});

describe("buildLedger", () => {
  it("orders unsorted revisions by revision_number", () => {
    const revisions = [
      rev("co-2", 2, "approved"),
      rev("orig", 0, "approved", "original"),
      rev("co-1", 1, "approved"),
    ];
    const ledger = buildLedger(revisions, {
      orig: [line("100.00")],
      "co-1": [line("10.00")],
      "co-2": [line("5.00")],
    });
    expect(ledger.map((e) => e.revision.public_id)).toEqual([
      "orig",
      "co-1",
      "co-2",
    ]);
  });

  it("accumulates running total only for approved revisions in order", () => {
    const revisions = [
      rev("orig", 0, "approved", "original"),
      rev("co-1", 1, "approved"),
      rev("co-2", 2, "approved"),
    ];
    const ledger = buildLedger(revisions, {
      orig: [line("1000.00")],
      "co-1": [line("100.00")],
      "co-2": [line("50.00")],
    });
    expect(ledger[0].runningTotalCents).toBe(100000);
    expect(ledger[0].runningTotalStatus).toBe("value");
    expect(ledger[1].runningTotalCents).toBe(110000);
    expect(ledger[1].runningTotalStatus).toBe("value");
    expect(ledger[2].runningTotalCents).toBe(115000);
    expect(ledger[2].runningTotalStatus).toBe("value");
  });

  it("excludes draft CO from running total and shows pending", () => {
    const revisions = [
      rev("orig", 0, "approved", "original"),
      rev("co-draft", 1, "draft"),
      rev("co-approved", 2, "approved"),
    ];
    const ledger = buildLedger(revisions, {
      orig: [line("1000.00")],
      "co-draft": [line("999.00")],
      "co-approved": [line("25.00")],
    });
    const draft = ledger.find((e) => e.revision.public_id === "co-draft")!;
    const approvedCo = ledger.find(
      (e) => e.revision.public_id === "co-approved",
    )!;
    expect(draft.runningTotalCents).toBeNull();
    expect(draft.runningTotalStatus).toBe("pending");
    expect(draft.approved).toBe(false);
    // Later approved CO must not include the draft's $999 impact.
    expect(approvedCo.runningTotalCents).toBe(102500);
    expect(approvedCo.runningTotalStatus).toBe("value");
  });

  it("marks approved revision with absent line items as unknown", () => {
    const revisions = [rev("orig", 0, "approved", "original")];
    const ledger = buildLedger(revisions, {});
    expect(ledger[0].netImpactCents).toBeNull();
    expect(ledger[0].runningTotalStatus).toBe("unknown");
    expect(ledger[0].runningTotalCents).toBeNull();
  });

  it("latches running total unknown after an approved revision with absent lines", () => {
    const revisions = [
      rev("orig", 0, "approved", "original"),
      rev("co-1", 1, "approved"),
      rev("co-2", 2, "approved"),
    ];
    const ledger = buildLedger(revisions, {
      "co-2": [line("25.00")],
    });
    const co1 = ledger.find((e) => e.revision.public_id === "co-1")!;
    const co2 = ledger.find((e) => e.revision.public_id === "co-2")!;
    expect(co1.netImpactCents).toBeNull();
    expect(co1.runningTotalStatus).toBe("unknown");
    expect(co2.netImpactCents).toBe(2500);
    expect(co2.runningTotalStatus).toBe("unknown");
    expect(co2.runningTotalCents).toBeNull();
  });

  it("treats resolved empty line items as known zero", () => {
    const revisions = [rev("co-empty", 1, "approved")];
    const ledger = buildLedger(revisions, { "co-empty": [] });
    expect(ledger[0].netImpactCents).toBe(0);
    expect(ledger[0].runningTotalStatus).toBe("value");
    expect(ledger[0].runningTotalCents).toBe(0);
  });

  it("does not let draft unknown lines poison later approved running total", () => {
    const revisions = [
      rev("orig", 0, "approved", "original"),
      rev("co-draft", 1, "draft"),
      rev("co-approved", 2, "approved"),
    ];
    const ledger = buildLedger(revisions, {
      orig: [line("1000.00")],
      "co-approved": [line("25.00")],
    });
    const draft = ledger.find((e) => e.revision.public_id === "co-draft")!;
    const approvedCo = ledger.find(
      (e) => e.revision.public_id === "co-approved",
    )!;
    expect(draft.netImpactCents).toBeNull();
    expect(draft.runningTotalStatus).toBe("pending");
    expect(approvedCo.runningTotalCents).toBe(102500);
    expect(approvedCo.runningTotalStatus).toBe("value");
  });

  it("uses integer cents to avoid float addition drift", () => {
    expect(netImpactCents([line("0.1"), line("0.2")])).toBe(30);
    expect(Number("0.1") + Number("0.2")).not.toBe(0.3);

    const multi = netImpactCents([
      line("0.1"),
      line("0.2"),
      line("0.3"),
      line("0.01"),
      line("0.02"),
    ]);
    expect(multi).toBe(63);
    expect(centsToAmount(multi)).toBe("0.63");
  });
});

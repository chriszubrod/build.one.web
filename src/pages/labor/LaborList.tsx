import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getList } from "../../api/client";
import NavHeader from "../../components/ui/NavHeader";
import EntryCard from "../../components/ui/EntryCard";
import SegmentedControl from "../../components/ui/SegmentedControl";
import type { ContractLabor } from "../../types/api";

function fmtIsoDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtMoney(s: string | null | undefined): string {
  if (s === null || s === undefined || s === "") return "$0.00";
  const n = Number(s);
  if (isNaN(n)) return "$0.00";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtHours(s: string | null | undefined): string {
  if (s === null || s === undefined || s === "") return "0.00h";
  const n = Number(s);
  if (isNaN(n)) return "0.00h";
  return `${n.toFixed(2)}h`;
}

function abbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

type LaborStatus = "pending_review" | "ready" | "billed";

const STATUS_OPTIONS: { value: LaborStatus; label: string }[] = [
  { value: "pending_review", label: "Pending" },
  { value: "ready", label: "Ready" },
  { value: "billed", label: "Billed" },
];

const SECTION_LABEL: Record<LaborStatus, string> = {
  pending_review: "Pending review",
  ready: "Ready for billing",
  billed: "Billed",
};

const EMPTY_COPY: Record<LaborStatus, string> = {
  pending_review: "Nothing to review.",
  ready: "Nothing ready for billing.",
  billed: "Nothing billed yet.",
};

export default function LaborList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LaborStatus>("pending_review");

  const laborQuery = useQuery<ContractLabor[]>({
    queryKey: ["contract-labor", "by-status", status],
    queryFn: async () =>
      (await getList<ContractLabor>(`/api/v1/contract-labor/by-status/${status}`)).data,
  });

  const sorted = useMemo<ContractLabor[]>(() => {
    return (laborQuery.data ?? []).slice().sort((a, b) => {
      const ad = a.work_date ?? "";
      const bd = b.work_date ?? "";
      if (ad !== bd) return bd.localeCompare(ad);
      return (a.employee_name ?? "").localeCompare(b.employee_name ?? "");
    });
  }, [laborQuery.data]);

  return (
    <div className="ios-page">
      <NavHeader title="Labor review" />

      <SegmentedControl<LaborStatus>
        options={STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />

      <div className="section-label-prose">{SECTION_LABEL[status]}</div>

      {laborQuery.isLoading && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          Loading…
        </div>
      )}

      {!laborQuery.isLoading && sorted.length === 0 && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          {EMPTY_COPY[status]}
        </div>
      )}

      {sorted.map((cl) => {
        const hoursNum = Number(cl.total_hours ?? 0);
        const rateNum = Number(cl.hourly_rate ?? 0);
        const amount =
          isNaN(hoursNum) || isNaN(rateNum) ? 0 : hoursNum * rateNum;
        const meta = `${fmtIsoDate(cl.work_date)} · ${fmtHours(cl.total_hours)} · Amount ${fmtMoney(String(amount))}`;
        const duration = `Price ${fmtMoney(cl.total_amount)}`;
        return (
          <EntryCard
            key={cl.public_id}
            projectAbbrev={abbrev(cl.employee_name ?? "—")}
            projectName={cl.employee_name ?? "Unknown worker"}
            meta={meta}
            duration={duration}
            onClick={() => navigate(`/labor/${cl.public_id}`)}
          />
        );
      })}
    </div>
  );
}

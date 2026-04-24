import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getList, post, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";

interface DaySummary {
  date: string;
  billed_hours: number;
  cost_before_markup: number;
  price_after_markup: number;
}

interface VendorBill {
  vendor_id: number | null;
  vendor_name: string;
  employee_name: string | null;
  line_items: unknown[];
  line_items_summary: DaySummary[];
  total_hours: number;
  total_amount: number;
  min_date: string | null;
  max_date: string | null;
}

interface GenerateResult {
  bills_created?: number;
  bills_updated?: number;
  line_items_created?: number;
  entries_billed?: number;
  pdf_urls?: string[];
  errors?: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function openVendorPdfPreview(
  vendorId: number,
  billingPeriod: string | null,
): Promise<void> {
  const token = localStorage.getItem("access_token");
  const qp = billingPeriod
    ? `?billing_period=${encodeURIComponent(billingPeriod)}`
    : "";
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(
    `${API_BASE}/api/v1/contract-labor/preview-pdf/${vendorId}${qp}`,
    { method: "GET", headers, credentials: "include" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? "Preview failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) URL.revokeObjectURL(url);
}

export default function ContractLaborBills() {
  const [searchParams] = useSearchParams();
  const billingPeriod = searchParams.get("billing_period");
  const { toast } = useToast();

  const [vendors, setVendors] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actingVendor, setActingVendor] = useState<number | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [allProgress, setAllProgress] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const qp = billingPeriod
        ? `?billing_period=${encodeURIComponent(billingPeriod)}`
        : "";
      const res = await getList<VendorBill>(
        `/api/v1/contract-labor/bills-summary${qp}`,
      );
      setVendors(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load bills.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingPeriod]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const generateForVendor = async (vendorId: number): Promise<GenerateResult> => {
    const qp = billingPeriod
      ? `?billing_period=${encodeURIComponent(billingPeriod)}`
      : "";
    return await post<GenerateResult>(
      `/api/v1/contract-labor/generate-bills/${vendorId}${qp}`,
      {},
    );
  };

  const handleGenerate = async (vendor: VendorBill) => {
    if (!vendor.vendor_id) return;
    setActingVendor(vendor.vendor_id);
    try {
      const result = await generateForVendor(vendor.vendor_id);
      toast(formatGenerateMessage(result), generateToastTone(result));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.detail : "Failed to generate bills.", "error");
    } finally {
      setActingVendor(null);
    }
  };

  const handlePreview = async (vendorId: number) => {
    try {
      await openVendorPdfPreview(vendorId, billingPeriod);
    } catch (err) {
      toast(err instanceof ApiError ? err.detail : "Preview failed.", "error");
    }
  };

  const handleGenerateAll = async () => {
    const withVendor = vendors.filter((v) => v.vendor_id !== null);
    if (withVendor.length === 0) {
      toast("No vendors with assigned entries to generate bills for.", "info");
      return;
    }
    setGeneratingAll(true);
    const totals: GenerateResult = {
      bills_created: 0,
      bills_updated: 0,
      line_items_created: 0,
      entries_billed: 0,
      pdf_urls: [],
      errors: [],
    };
    for (let i = 0; i < withVendor.length; i++) {
      const v = withVendor[i];
      setAllProgress(`Generating ${i + 1} of ${withVendor.length}: ${v.vendor_name}...`);
      try {
        const r = await generateForVendor(v.vendor_id!);
        totals.bills_created = (totals.bills_created ?? 0) + (r.bills_created ?? 0);
        totals.bills_updated = (totals.bills_updated ?? 0) + (r.bills_updated ?? 0);
        totals.line_items_created =
          (totals.line_items_created ?? 0) + (r.line_items_created ?? 0);
        totals.entries_billed = (totals.entries_billed ?? 0) + (r.entries_billed ?? 0);
        totals.pdf_urls = [...(totals.pdf_urls ?? []), ...(r.pdf_urls ?? [])];
        if (r.errors?.length) {
          totals.errors = [
            ...(totals.errors ?? []),
            ...r.errors.map((e) => `${v.vendor_name}: ${e}`),
          ];
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : "Network error";
        totals.errors = [...(totals.errors ?? []), `${v.vendor_name}: ${msg}`];
      }
    }
    setGeneratingAll(false);
    setAllProgress("");
    toast(formatGenerateMessage(totals, true), generateToastTone(totals));
    await load();
  };

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  const hasAssignedVendors = vendors.some((v) => v.vendor_id !== null);

  return (
    <div className="page">
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <h1>Generate Bills</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/contract-labor/list" className="btn btn-secondary">
            Back to List
          </Link>
          {vendors.length > 0 && hasAssignedVendors && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateAll}
              disabled={generatingAll}
            >
              {generatingAll ? allProgress || "Generating..." : "Generate All Bills"}
            </button>
          )}
        </div>
      </div>

      {vendors.length === 0 ? (
        <div className="detail-card" style={{ padding: 40, textAlign: "center" }}>
          <p>No entries are ready for billing.</p>
          <Link to="/contract-labor/list" className="btn btn-primary">
            View Entries
          </Link>
        </div>
      ) : (
        <>
          <p style={{ color: "var(--color-text-secondary)" }}>
            Review and generate bills for entries marked as "Ready". Entries are
            grouped by vendor.
          </p>

          {vendors.map((v) => {
            const key = String(v.vendor_id ?? `employee:${v.employee_name}`);
            const isExpanded = expanded.has(key);
            const canGenerate = v.vendor_id !== null;
            return (
              <div
                key={key}
                className="detail-card"
                style={{ padding: 20, marginBottom: 16 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>{v.vendor_name}</h3>
                    <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
                      {v.line_items.length} line items
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {canGenerate ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handlePreview(v.vendor_id!)}
                        >
                          Preview PDF
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleGenerate(v)}
                          disabled={actingVendor === v.vendor_id || generatingAll}
                        >
                          {actingVendor === v.vendor_id
                            ? "Generating..."
                            : "Generate Bills"}
                        </button>
                      </>
                    ) : (
                      <div style={{ textAlign: "right" }}>
                        <span
                          className="btn btn-secondary"
                          style={{ opacity: 0.5, cursor: "not-allowed" }}
                        >
                          No vendor assigned
                        </span>
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          Assign a vendor to entries first
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 16,
                    marginBottom: 12,
                  }}
                >
                  <Summary label="Total Hours" value={v.total_hours.toFixed(2)} />
                  <Summary label="Total Amount" value={fmtMoney(v.total_amount)} />
                  <Summary
                    label="Date Range"
                    value={
                      v.min_date && v.max_date
                        ? `${v.min_date} — ${v.max_date}`
                        : "—"
                    }
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggle(key)}
                >
                  {isExpanded
                    ? "Hide Line Items Summary"
                    : "Show Line Items Summary"}
                </button>

                {isExpanded && (
                  <table
                    className="data-table"
                    style={{ marginTop: 12 }}
                  >
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Billed Hours</th>
                        <th>Cost (before markup)</th>
                        <th>Price (after markup)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.line_items_summary.map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>{d.billed_hours.toFixed(2)}</td>
                          <td>{fmtMoney(d.cost_before_markup)}</td>
                          <td>{fmtMoney(d.price_after_markup)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function formatGenerateMessage(r: GenerateResult, isAll = false): string {
  const parts: string[] = [];
  if (r.bills_created) parts.push(`${r.bills_created} new`);
  if (r.bills_updated) parts.push(`${r.bills_updated} updated`);
  const billPhrase = parts.length > 0 ? `${parts.join(" and ")} bill(s)` : "0 bill(s)";
  let msg = `${isAll ? "All done. " : ""}Generated ${billPhrase} with ${r.line_items_created ?? 0} line items.`;
  if (r.entries_billed) msg += ` Marked ${r.entries_billed} entries as billed.`;
  if (r.pdf_urls && r.pdf_urls.length > 0) msg += ` ${r.pdf_urls.length} PDF(s) uploaded.`;
  if (r.errors && r.errors.length > 0) msg += ` Warnings: ${r.errors.join("; ")}`;
  return msg;
}

function generateToastTone(r: GenerateResult): "success" | "error" | "info" {
  if (r.errors && r.errors.length > 0) return "error";
  return "success";
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, del, getList, post } from "../../api/client";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import Field from "../../components/ui/Field";
import { useToast } from "../../components/Toast";
import type {
  ComplianceCoverageType,
  VendorInsurancePolicy,
} from "../../types/api";

interface PolicyManagerSheetProps {
  certificatePublicId: string;
  coiLabel: string;
  onClose: () => void;
  onChanged: () => void;
}

const COVERAGE_OPTIONS: { value: ComplianceCoverageType; label: string }[] = [
  { value: "GL", label: "GL" },
  { value: "WC", label: "WC" },
  { value: "OTHER", label: "Other" },
];

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return v;
}

function policySummary(p: VendorInsurancePolicy): string {
  const parts: string[] = [p.coverage_type];
  if (p.carrier) parts.push(p.carrier);
  if (p.policy_number) parts.push(p.policy_number);
  if (p.each_occurrence || p.aggregate) {
    const limits = [p.each_occurrence, p.aggregate].filter(Boolean).join(" / ");
    parts.push(limits);
  }
  const eff = fmtDate(p.effective_date);
  const exp = fmtDate(p.expiry_date);
  parts.push(`${eff}–${exp}`);
  return parts.join(" · ");
}

export default function PolicyManagerSheet({
  certificatePublicId,
  coiLabel,
  onClose,
  onChanged,
}: PolicyManagerSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const policiesQueryKey = ["vendor-insurance-policies", certificatePublicId] as const;

  const policiesQuery = useQuery({
    queryKey: policiesQueryKey,
    queryFn: () =>
      getList<VendorInsurancePolicy>(
        `/api/v1/get/vendor-insurance-policies/by-certificate-of-insurance/${certificatePublicId}`,
      ),
  });

  const policies = policiesQuery.data?.data ?? [];

  const [coverageType, setCoverageType] = useState<ComplianceCoverageType | "">("");
  const [carrier, setCarrier] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [eachOccurrence, setEachOccurrence] = useState("");
  const [aggregate, setAggregate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const invalidatePolicies = () => {
    void queryClient.invalidateQueries({ queryKey: policiesQueryKey });
    onChanged();
  };

  const resetForm = () => {
    setCoverageType("");
    setCarrier("");
    setPolicyNumber("");
    setEachOccurrence("");
    setAggregate("");
    setEffectiveDate("");
    setExpiryDate("");
  };

  const handleAdd = async () => {
    if (!coverageType || adding) return;
    setAdding(true);
    try {
      await post("/api/v1/create/vendor-insurance-policy", {
        certificate_of_insurance_public_id: certificatePublicId,
        coverage_type: coverageType,
        carrier: carrier || null,
        policy_number: policyNumber || null,
        each_occurrence: eachOccurrence || null,
        aggregate: aggregate || null,
        effective_date: effectiveDate || null,
        expiry_date: expiryDate || null,
      });
      toast("Policy added", "success");
      resetForm();
      invalidatePolicies();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not add policy";
      toast(msg, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (policyPublicId: string) => {
    if (deletingId) return;
    setDeletingId(policyPublicId);
    try {
      await del(`/api/v1/delete/vendor-insurance-policy/${policyPublicId}`);
      toast("Policy removed", "success");
      invalidatePolicies();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not remove policy";
      toast(msg, "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Sheet open onDismiss={onClose}>
      <SheetHeader title={`Policies — ${coiLabel}`} onCancel={onClose} />
      <div className="sheet-body">
        {policiesQuery.isLoading ? (
          <p className="vendor-compliance-muted">Loading policies…</p>
        ) : policiesQuery.isError ? (
          <p className="page-error">Failed to load policies. Try reopening.</p>
        ) : policies.length === 0 ? (
          <p className="vendor-compliance-muted">No policies yet.</p>
        ) : (
          <ul className="vendor-compliance-policy-list">
            {policies.map((p) => (
              <li key={p.public_id} className="vendor-compliance-policy-row">
                <span>{policySummary(p)}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={deletingId !== null}
                  onClick={() => void handleDelete(p.public_id)}
                >
                  {deletingId === p.public_id ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <SectionCard header="Add policy">
          <div className="field">
            <label className="field-label">Coverage type</label>
            <select
              className="form-select"
              value={coverageType}
              onChange={(e) =>
                setCoverageType(e.target.value as ComplianceCoverageType | "")
              }
            >
              <option value="">Select coverage…</option>
              {COVERAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Field label="Carrier" value={carrier} onChange={setCarrier} placeholder="Carrier" />
          <Field
            label="Policy number"
            value={policyNumber}
            onChange={setPolicyNumber}
            placeholder="Policy number"
          />
          <div className="field">
            <label className="field-label">Each occurrence</label>
            <input
              className="field-input"
              type="number"
              step="0.01"
              value={eachOccurrence}
              onChange={(e) => setEachOccurrence(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Aggregate</label>
            <input
              className="field-input"
              type="number"
              step="0.01"
              value={aggregate}
              onChange={(e) => setAggregate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Effective date</label>
            <input
              className="field-input"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Expiry date</label>
            <input
              className="field-input"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!coverageType || adding || deletingId !== null}
            onClick={() => void handleAdd()}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </SectionCard>
      </div>
    </Sheet>
  );
}

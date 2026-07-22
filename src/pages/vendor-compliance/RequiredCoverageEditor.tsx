import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, del, getList, post } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import PageHeader from "../../components/PageHeader";
import type {
  VendorType,
  VendorTypeRequiredCoverage,
  VendorTypeRequiredCoverageType,
} from "../../types/api";
import { DASHBOARD_QUERY_KEY } from "./VendorComplianceDashboard";

const RULES_QUERY_KEY = ["vendor-type-required-coverages"] as const;

const COVERAGE_OPTIONS: { value: VendorTypeRequiredCoverageType; label: string }[] = [
  { value: "GL", label: "GL" },
  { value: "WC", label: "WC" },
];

export default function RequiredCoverageEditor() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: lookups, loading: lookupsLoading } = useLookups("vendor_types");

  const rulesQuery = useQuery({
    queryKey: RULES_QUERY_KEY,
    queryFn: () => getList<VendorTypeRequiredCoverage>("/api/v1/get/vendor-type-required-coverages"),
    enabled: !!me?.is_admin,
  });

  // Lookups expose name + public_id only; create/delete rules need numeric vendor_type_id.
  const vendorTypesIdQuery = useQuery({
    queryKey: ["vendor-types", "for-required-coverages"],
    queryFn: () => getList<VendorType>("/api/v1/get/vendor-types"),
    enabled: !!me?.is_admin,
  });

  const idByPublicId = useMemo(() => {
    const map = new Map<string, number>();
    for (const vt of vendorTypesIdQuery.data?.data ?? []) {
      map.set(vt.public_id, vt.id);
    }
    return map;
  }, [vendorTypesIdQuery.data]);

  const rulesByVendorTypeId = useMemo(() => {
    const map = new Map<number, VendorTypeRequiredCoverage[]>();
    for (const rule of rulesQuery.data?.data ?? []) {
      const list = map.get(rule.vendor_type_id) ?? [];
      list.push(rule);
      map.set(rule.vendor_type_id, list);
    }
    return map;
  }, [rulesQuery.data]);

  const vendorTypeRows = useMemo(() => {
    const types = [...(lookups.vendor_types ?? [])];
    types.sort((a, b) => a.name.localeCompare(b.name));
    return types.map((vt) => ({
      publicId: vt.public_id,
      name: vt.name,
      vendorTypeId: idByPublicId.get(vt.public_id),
    }));
  }, [lookups.vendor_types, idByPublicId]);

  const [addVendorTypePublicId, setAddVendorTypePublicId] = useState("");
  const [addCoverage, setAddCoverage] = useState<VendorTypeRequiredCoverageType | "">("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const invalidateRules = () => {
    void queryClient.invalidateQueries({ queryKey: RULES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
  };

  if (meLoading || !me) {
    return <div className="page-loading">Loading…</div>;
  }

  if (!me.is_admin) {
    return (
      <div className="page vendor-compliance-page">
        <p className="page-error">Admins only</p>
        <Link to="/vendor-compliance" className="btn btn-secondary btn-sm">
          Back to Vendor Compliance
        </Link>
      </div>
    );
  }

  const loading =
    lookupsLoading || rulesQuery.isLoading || vendorTypesIdQuery.isLoading;
  const error =
    (rulesQuery.error instanceof Error ? rulesQuery.error.message : null) ??
    (vendorTypesIdQuery.error instanceof Error ? vendorTypesIdQuery.error.message : null);

  if (loading) return <div className="page-loading">Loading…</div>;
  if (error) return <div className="page-error">{error}</div>;

  const selectedVendorTypeId = addVendorTypePublicId
    ? idByPublicId.get(addVendorTypePublicId)
    : undefined;

  const duplicateAdd =
    selectedVendorTypeId != null &&
    addCoverage !== "" &&
    (rulesByVendorTypeId.get(selectedVendorTypeId) ?? []).some(
      (r) => r.coverage_type === addCoverage,
    );

  const handleAdd = async () => {
    if (
      adding ||
      !addVendorTypePublicId ||
      !addCoverage ||
      selectedVendorTypeId == null ||
      duplicateAdd
    ) {
      return;
    }
    setAdding(true);
    try {
      await post("/api/v1/create/vendor-type-required-coverage", {
        vendor_type_id: selectedVendorTypeId,
        coverage_type: addCoverage,
      });
      toast("Requirement added", "success");
      setAddCoverage("");
      invalidateRules();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Could not add requirement";
      toast(msg, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (publicId: string) => {
    if (deletingId) return;
    setDeletingId(publicId);
    try {
      await del(`/api/v1/delete/vendor-type-required-coverage/${publicId}`);
      toast("Requirement removed", "success");
      invalidateRules();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Could not remove requirement";
      toast(msg, "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page vendor-compliance-page">
      <PageHeader title="Required coverages by vendor type">
        <Link to="/vendor-compliance" className="btn btn-secondary btn-sm">
          Back
        </Link>
      </PageHeader>

      <p className="vendor-compliance-muted required-coverage-lead">
        Required GL/WC coverages drive the coverage-centric COI compliance verdict on
        the vendor compliance dashboard.
      </p>

      <table className="data-table required-coverage-table">
        <thead>
          <tr>
            <th>Vendor type</th>
            <th>Required coverages</th>
          </tr>
        </thead>
        <tbody>
          {vendorTypeRows.map((row) => {
            const rules =
              row.vendorTypeId != null
                ? (rulesByVendorTypeId.get(row.vendorTypeId) ?? [])
                : [];
            return (
              <tr key={row.publicId}>
                <td>{row.name}</td>
                <td>
                  {rules.length === 0 ? (
                    <span className="vendor-compliance-muted">none required</span>
                  ) : (
                    <ul className="required-coverage-chips">
                      {rules.map((rule) => (
                        <li key={rule.public_id}>
                          <span className="required-coverage-chip">
                            {rule.coverage_type}
                            <button
                              type="button"
                              className="required-coverage-chip-remove"
                              aria-label={`Remove ${rule.coverage_type} requirement for ${row.name}`}
                              disabled={deletingId === rule.public_id}
                              onClick={() => void handleDelete(rule.public_id)}
                            >
                              ×
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="form-card required-coverage-add">
        <h2 className="required-coverage-add-title">Add requirement</h2>
        <div className="required-coverage-add-row">
          <label className="required-coverage-add-field">
            <span className="field-label">Vendor type</span>
            <select
              className="field-input"
              value={addVendorTypePublicId}
              onChange={(e) => setAddVendorTypePublicId(e.target.value)}
            >
              <option value="">Select…</option>
              {vendorTypeRows.map((row) => (
                <option key={row.publicId} value={row.publicId}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="required-coverage-add-field">
            <span className="field-label">Coverage</span>
            <select
              className="field-input"
              value={addCoverage}
              onChange={(e) =>
                setAddCoverage(e.target.value as VendorTypeRequiredCoverageType | "")
              }
            >
              <option value="">Select…</option>
              {COVERAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={
              adding ||
              !addVendorTypePublicId ||
              !addCoverage ||
              selectedVendorTypeId == null ||
              duplicateAdd
            }
            onClick={() => void handleAdd()}
          >
            Add
          </button>
        </div>
        {duplicateAdd && (
          <p className="form-error">That coverage is already required for this type.</p>
        )}
      </div>
    </div>
  );
}

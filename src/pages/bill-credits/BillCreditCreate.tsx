import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "../../api/client";
import { invalidateEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasBillCreditPermission } from "./billCreditPermissions";
import DocumentHeaderFields from "../../components/DocumentHeaderFields";
import { billCreditHeaderFields, vendorSelectOptions } from "./billCreditHeaderFields";
import type { BillCredit } from "../../types/api";

export default function BillCreditCreate() {
  const navigate = useNavigate();
  const { data: lookups } = useLookups("vendors");
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canCreate = hasBillCreditPermission(me, "can_create");
  const [form, setForm] = useState({
    vendor_public_id: "",
    credit_date: "",
    credit_number: "",
    total_amount: "",
    memo: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const queryClient = useQueryClient();

  const onHeaderChange = (name: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [name]: value }));

  const headerFields = billCreditHeaderFields(vendorSelectOptions(lookups.vendors), "create");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await post<BillCredit>("/api/v1/create/bill-credit", {
        vendor_public_id: form.vendor_public_id,
        credit_date: form.credit_date,
        credit_number: form.credit_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_draft: true,
      });
      await invalidateEntity(queryClient, { listPath: "/api/v1/get/bill-credits" });
      navigate(`/bill-credit/${created.public_id}/edit`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  if (meLoading) return <div className="page-loading">Loading...</div>;
  if (!canCreate) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to create bill credits.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/bill-credit/list")}>
          Back to Bill Credits
        </button>
      </div>
    );
  }

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Create Bill Credit</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        <DocumentHeaderFields fields={headerFields} values={form} onChange={onHeaderChange} />

        <p className="text-muted" style={{ marginTop: 16, fontSize: 13 }}>
          Save first, then add line items on the edit page.
        </p>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating..." : "Create & Edit"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/bill-credit/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

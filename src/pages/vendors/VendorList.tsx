import { useEffect, useState } from "react";
import { getList } from "../../api/client";
import type { Vendor } from "../../types/api";

export default function VendorList() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getList<Vendor>("/api/v1/get/vendors")
      .then((res) => setVendors(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Vendors</h1>
        <span className="page-count">{vendors.length} total</span>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Abbreviation</th>
            <th>Contract Labor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.public_id}>
              <td>{v.name}</td>
              <td>{v.abbreviation ?? ""}</td>
              <td>{v.is_contract_labor ? "Yes" : "No"}</td>
              <td>{v.is_draft ? "Draft" : "Active"}</td>
            </tr>
          ))}
          {vendors.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-state">No vendors found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

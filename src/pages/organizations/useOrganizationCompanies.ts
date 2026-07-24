import { useEffect, useState } from "react";
import { useEntityList } from "../../hooks/useEntity";
import { getList } from "../../api/client";
import type { Company, Organization, OrganizationCompany } from "../../types/api";

/**
 * Companies linked to an organization, plus the company list for names.
 *
 * The org-scoped rows reset and re-fetch when `item` changes rows; a
 * cancelled flag drops late completions so row A's links can never render
 * on row B's page. GET /api/v1/get/companies is COMPANIES-gated (company
 * router) — best-effort for names via the shared cached list; a user who
 * never had COMPANIES can_read sees raw company ids instead. Names already
 * in the shared/persisted cache may keep rendering after a mid-session
 * revocation — consistent with app-wide list caching; the API is the
 * enforcement point.
 */
export function useOrganizationCompanies(item: Organization | null) {
  const [orgCompanies, setOrgCompanies] = useState<OrganizationCompany[]>([]);
  const { items: allCompanies } = useEntityList<Company>("/api/v1/get/companies");

  useEffect(() => {
    if (!item?.public_id) return;
    const orgId = item.id;
    setOrgCompanies([]);
    let cancelled = false;
    getList<OrganizationCompany>(
      `/api/v1/get/organization_companies/organization/${orgId}`,
    )
      .then((ocs) => {
        if (!cancelled) setOrgCompanies(ocs.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item?.public_id]);

  const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));

  return { orgCompanies, setOrgCompanies, allCompanies, companyMap };
}

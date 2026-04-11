import { useEffect, useState } from "react";
import { rawRequest } from "../api/client";
import type { Lookups } from "../types/api";

/**
 * Fetch lookup data for dropdowns.
 * Pass comma-separated keys: useLookups("vendors,projects,sub_cost_codes")
 */
export function useLookups(include: string) {
  const [data, setData] = useState<Lookups>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    rawRequest<{ data: Lookups }>(`/api/v1/lookups?include=${include}`)
      .then((res) => setData(res.data))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [include]);

  return { data, loading };
}

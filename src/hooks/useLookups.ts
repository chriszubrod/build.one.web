import { useQuery } from "@tanstack/react-query";
import { rawRequest } from "../api/client";
import type { Lookups } from "../types/api";

/**
 * Fetch lookup data for dropdowns.
 * Pass comma-separated keys: useLookups("vendors,projects,sub_cost_codes")
 */
export function useLookups(include: string) {
  const { data, isLoading } = useQuery<Lookups>({
    queryKey: ["lookups", include],
    queryFn: async () => {
      const res = await rawRequest<{ data: Lookups }>(
        `/api/v1/lookups?include=${include}`,
      );
      return res.data;
    },
  });

  return { data: data ?? {}, loading: isLoading };
}

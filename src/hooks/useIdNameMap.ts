import { useQuery } from "@tanstack/react-query";
import { getList, ApiError } from "../api/client";

/**
 * Fetch an entity list and build a map from internal `id` to `name` (or custom label).
 * Useful for resolving FK int IDs to display names. Shares cache with useEntityList.
 */
export function useIdNameMap<T extends { id: number }>(
  listPath: string,
  labelFn: (item: T) => string,
): Map<number, string> {
  const { data } = useQuery<{ data: T[]; count: number }, Error, Map<number, string>>({
    queryKey: ["list", listPath],
    queryFn: async () => {
      try {
        return await getList<T>(listPath);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return { data: [], count: 0 };
        }
        throw err;
      }
    },
    select: (res) => {
      const m = new Map<number, string>();
      for (const item of res.data) {
        m.set(item.id, labelFn(item));
      }
      return m;
    },
  });

  return data ?? new Map();
}

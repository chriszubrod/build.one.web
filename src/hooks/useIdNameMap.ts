import { useEffect, useState } from "react";
import { getList } from "../api/client";

const idNameListCache = new Map<string, Map<number, string>>();

export interface UseIdNameMapOptions {
  staleWhileRevalidate?: boolean;
}

/**
 * Fetch an entity list and build a map from internal `id` to `name` (or custom label).
 * Useful for resolving FK int IDs to display names.
 */
export function useIdNameMap<T extends { id: number }>(
  listPath: string,
  labelFn: (item: T) => string,
  options?: UseIdNameMapOptions,
): Map<number, string> {
  const staleWhileRevalidate = options?.staleWhileRevalidate ?? false;

  const [map, setMap] = useState<Map<number, string>>(() => {
    if (staleWhileRevalidate) {
      const hit = idNameListCache.get(listPath);
      if (hit) return new Map(hit);
    }
    return new Map();
  });

  useEffect(() => {
    if (staleWhileRevalidate) {
      const hit = idNameListCache.get(listPath);
      if (hit) setMap(new Map(hit));
    }

    getList<T>(listPath)
      .then((res) => {
        const m = new Map<number, string>();
        for (const item of res.data) {
          m.set(item.id, labelFn(item));
        }
        setMap(m);
        if (staleWhileRevalidate) idNameListCache.set(listPath, m);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listPath, staleWhileRevalidate]);

  return map;
}

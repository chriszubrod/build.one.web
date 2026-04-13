import { useEffect, useState } from "react";
import { getList } from "../api/client";

/**
 * Fetch an entity list and build a map from internal `id` to `name` (or custom label).
 * Useful for resolving FK int IDs to display names.
 */
export function useIdNameMap<T extends { id: number }>(
  listPath: string,
  labelFn: (item: T) => string,
): Map<number, string> {
  const [map, setMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    getList<T>(listPath)
      .then((res) => {
        const m = new Map<number, string>();
        for (const item of res.data) {
          m.set(item.id, labelFn(item));
        }
        setMap(m);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listPath]);

  return map;
}

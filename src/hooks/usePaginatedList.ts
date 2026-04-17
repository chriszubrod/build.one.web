import { useCallback, useEffect, useState } from "react";
import { rawRequest, ApiError } from "../api/client";

interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  page_size: number;
}

interface PaginatedCacheEntry<T> {
  items: T[];
  total: number;
}

/** In-memory SWR cache so list pages can repaint instantly after navigate-back. */
const paginatedListCache = new Map<string, PaginatedCacheEntry<unknown>>();

function paginatedListCacheKey(basePath: string, page: number, pageSize: number, search: string): string {
  return `${basePath}\0${page}\0${pageSize}\0${search.trim()}`;
}

export interface UsePaginatedListOptions {
  /** Show last fetched rows immediately, then refresh in the background (good for navigate-away / back). */
  staleWhileRevalidate?: boolean;
  /**
   * If set, `page` and `search` are read/written under `sessionStorage` so list context survives
   * `navigate("/…")` remounts (same tab).
   */
  sessionPersistenceKey?: string;
}

function readSessionInt(key: string, fallback: number): number {
  try {
    const v = sessionStorage.getItem(key);
    if (v == null || v === "") return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 1 ? n : fallback;
  } catch {
    return fallback;
  }
}

function readSessionString(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

interface UsePaginatedListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string;
  setPage: (p: number) => void;
  setSearch: (s: string) => void;
  search: string;
  reload: () => void;
  totalPages: number;
}

/**
 * Fetch a paginated list from an endpoint that supports
 * ?page=&page_size=&search= query params.
 */
export function usePaginatedList<T>(
  basePath: string,
  pageSize: number = 50,
  options?: UsePaginatedListOptions,
): UsePaginatedListResult<T> {
  const staleWhileRevalidate = options?.staleWhileRevalidate ?? false;
  const persistKey = options?.sessionPersistenceKey;

  const [page, setPageState] = useState(() =>
    persistKey ? readSessionInt(`${persistKey}.page`, 1) : 1,
  );
  const [search, setSearchRaw] = useState(() =>
    persistKey ? readSessionString(`${persistKey}.search`) : "",
  );

  const [items, setItems] = useState<T[]>(() => {
    if (!staleWhileRevalidate) return [];
    const p = persistKey ? readSessionInt(`${persistKey}.page`, 1) : 1;
    const s = persistKey ? readSessionString(`${persistKey}.search`) : "";
    const hit = paginatedListCache.get(
      paginatedListCacheKey(basePath, p, pageSize, s),
    ) as PaginatedCacheEntry<T> | undefined;
    return hit?.items ?? [];
  });
  const [total, setTotal] = useState(() => {
    if (!staleWhileRevalidate) return 0;
    const p = persistKey ? readSessionInt(`${persistKey}.page`, 1) : 1;
    const s = persistKey ? readSessionString(`${persistKey}.search`) : "";
    const hit = paginatedListCache.get(
      paginatedListCacheKey(basePath, p, pageSize, s),
    ) as PaginatedCacheEntry<T> | undefined;
    return hit?.total ?? 0;
  });
  const [loading, setLoading] = useState(() => {
    if (!staleWhileRevalidate) return true;
    const p = persistKey ? readSessionInt(`${persistKey}.page`, 1) : 1;
    const s = persistKey ? readSessionString(`${persistKey}.search`) : "";
    return !paginatedListCache.has(paginatedListCacheKey(basePath, p, pageSize, s));
  });
  const [error, setError] = useState("");

  const setPage = useCallback(
    (p: number) => {
      setPageState(p);
      if (persistKey) {
        try {
          sessionStorage.setItem(`${persistKey}.page`, String(p));
        } catch {
          /* ignore */
        }
      }
    },
    [persistKey],
  );

  const setSearch = useCallback(
    (s: string) => {
      setSearchRaw(s);
      setPageState(1);
      if (persistKey) {
        try {
          sessionStorage.setItem(`${persistKey}.search`, s);
          sessionStorage.setItem(`${persistKey}.page`, "1");
        } catch {
          /* ignore */
        }
      }
    },
    [persistKey],
  );

  const load = useCallback(
    (forceRefresh = false) => {
      const separator = basePath.includes("?") ? "&" : "?";
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (search.trim()) params.set("search", search.trim());

      const url = `${basePath}${separator}${params}`;
      const key = paginatedListCacheKey(basePath, page, pageSize, search);
      const cached =
        staleWhileRevalidate && !forceRefresh
          ? (paginatedListCache.get(key) as PaginatedCacheEntry<T> | undefined)
          : undefined;

      if (cached) {
        setItems(cached.items);
        setTotal(cached.total);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError("");

      rawRequest<PaginatedResponse<T>>(url)
        .then((res) => {
          setItems(res.data);
          setTotal(res.count);
          if (staleWhileRevalidate) {
            paginatedListCache.set(key, { items: res.data as T[], total: res.count });
          }
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            setItems([]);
            setTotal(0);
            if (staleWhileRevalidate) {
              paginatedListCache.set(key, { items: [], total: 0 });
            }
          } else {
            setError(err.message);
          }
        })
        .finally(() => setLoading(false));
    },
    [basePath, page, pageSize, search, staleWhileRevalidate],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items, total, page, pageSize, loading, error,
    setPage, setSearch, search, reload, totalPages,
  };
}

import { useCallback, useEffect, useState } from "react";
import { getList, getOne, post, put, del, ApiError } from "../api/client";

interface UseEntityListResult<T> {
  items: T[];
  loading: boolean;
  error: string;
  reload: () => void;
}

interface UseEntityItemResult<T> {
  item: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

/**
 * Fetch a list of entities.
 * @param listPath - e.g. "/api/v1/get/vendors"
 */
export function useEntityList<T>(listPath: string): UseEntityListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getList<T>(listPath)
      .then((res) => setItems(res.data))
      .catch((err) => {
        // 404 means "no records" for some endpoints — treat as empty list
        if (err instanceof ApiError && err.status === 404) {
          setItems([]);
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [listPath]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, error, reload: load };
}

/**
 * Fetch a single entity by public_id.
 * @param itemPath - e.g. "/api/v1/get/vendor/abc-123"
 */
export function useEntityItem<T>(itemPath: string): UseEntityItemResult<T> {
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getOne<T>(itemPath)
      .then((data) => setItem(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [itemPath]);

  useEffect(() => { load(); }, [load]);

  return { item, loading, error, reload: load };
}

/**
 * Create a new entity.
 * @param createPath - e.g. "/api/v1/create/vendor"
 */
export async function createEntity<T>(createPath: string, body: unknown): Promise<T> {
  return post<T>(createPath, body);
}

/**
 * Update an entity.
 * @param updatePath - e.g. "/api/v1/update/vendor/abc-123"
 */
export async function updateEntity<T>(updatePath: string, body: unknown): Promise<T> {
  return put<T>(updatePath, body);
}

/**
 * Delete an entity.
 * @param deletePath - e.g. "/api/v1/delete/vendor/abc-123"
 */
export async function deleteEntity<T>(deletePath: string): Promise<T> {
  return del<T>(deletePath);
}

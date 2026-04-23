import { useQuery } from "@tanstack/react-query";
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

function retryIgnoringClientErrors(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

/**
 * Fetch a list of entities.
 * @param listPath - e.g. "/api/v1/get/vendors"
 */
export function useEntityList<T>(listPath: string): UseEntityListResult<T> {
  const { data, isLoading, error, refetch } = useQuery<{ data: T[]; count: number }>({
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
    retry: retryIgnoringClientErrors,
  });

  return {
    items: data?.data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : "",
    reload: () => { refetch(); },
  };
}

/**
 * Fetch a single entity by public_id.
 * @param itemPath - e.g. "/api/v1/get/vendor/abc-123"
 */
export function useEntityItem<T>(itemPath: string): UseEntityItemResult<T> {
  const { data, isLoading, error, refetch } = useQuery<T>({
    queryKey: ["item", itemPath],
    queryFn: () => getOne<T>(itemPath),
    retry: retryIgnoringClientErrors,
  });

  return {
    item: data ?? null,
    loading: isLoading,
    error: error ? (error as Error).message : "",
    reload: () => { refetch(); },
  };
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

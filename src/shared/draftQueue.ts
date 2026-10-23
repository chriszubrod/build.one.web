import { getList } from "../api/client";

export interface DraftQueueConfig {
  /** Full list URL including draft filter and pagination (`page`, `page_size`). */
  listPath: string;
  itemPath: (publicId: string) => string;
  fallbackPath: string;
}

/**
 * After a draft is submitted, open the next draft in the queue (first list row
 * whose public id differs from the one just submitted). On empty or error,
 * return the fallback (typically the entity's Draft tab).
 */
export async function nextDraftPathFromList<T extends { public_id: string }>(
  config: DraftQueueConfig,
  currentPublicId?: string,
): Promise<string> {
  try {
    const res = await getList<T>(config.listPath);
    const next = res.data.find((e) => e.public_id !== currentPublicId);
    if (next) return config.itemPath(next.public_id);
  } catch {
    // Fall through — the Draft tab is the right place either way.
  }
  return config.fallbackPath;
}

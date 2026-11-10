import { getOne, ApiError } from "../../api/client";

export interface BliaLink {
  public_id: string;
  attachment_id: number | null;
}

/** U-171: null only on a definitive 404 (the line has no link); other errors propagate. */
export async function getBliaLinkForLine(lineItemPublicId: string): Promise<BliaLink | null> {
  try {
    return await getOne<BliaLink>(
      `/api/v1/get/bill-line-item-attachment/by-bill-line-item/${lineItemPublicId}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * U-166a: a bill's shared PDF may sit on ANY line. Walk the lines in display order and return
 * the public id of the attachment on the first line that has a link, or null if none does.
 * Display-only: a line whose link or attachment cannot be read is skipped. Stops (returning
 * null) as soon as `isCancelled()` is true, so a superseded walk sends no further requests.
 */
export async function firstLinkedAttachmentPublicId(
  lines: ReadonlyArray<{ public_id: string }>,
  isCancelled: () => boolean = () => false,
): Promise<string | null> {
  for (const li of lines) {
    if (isCancelled()) return null;
    try {
      const blia = await getBliaLinkForLine(li.public_id);
      if (isCancelled()) return null;
      if (!blia?.attachment_id) continue;
      const att = await getOne<{ public_id: string }>(`/api/v1/get/attachment/id/${blia.attachment_id}`);
      return isCancelled() ? null : att.public_id;
    } catch {
      // not readable — try the next line
    }
  }
  return null;
}

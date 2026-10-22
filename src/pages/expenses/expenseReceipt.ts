import { getOne, ApiError } from "../../api/client";

export interface EliaLink {
  public_id: string;
  attachment_id: number | null;
}

/** U-476: null only on a definitive 404 (the line has no link); other errors propagate. */
export async function getEliaLinkForLine(lineItemPublicId: string): Promise<EliaLink | null> {
  try {
    return await getOne<EliaLink>(
      `/api/v1/get/expense-line-item-attachment/by-expense-line-item/${lineItemPublicId}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * First-line-first receipt lookup (U-621): scan the first line's ELIA link, then
 * remaining lines in parallel, then resolve the attachment public_id.
 */
export async function findReceiptAttachmentPublicId(
  lines: { public_id: string }[],
  isCancelled?: () => boolean,
): Promise<string | null> {
  const [first, ...rest] = lines;
  if (!first) return null;
  let link = await getEliaLinkForLine(first.public_id).catch(() => null);
  if (isCancelled?.()) return null;
  if (!link?.attachment_id && rest.length > 0) {
    const links = await Promise.all(
      rest.map((li) => getEliaLinkForLine(li.public_id).catch(() => null)),
    );
    if (isCancelled?.()) return null;
    link = links.find((l) => l?.attachment_id) ?? null;
  }
  if (!link?.attachment_id) return null;
  try {
    const att = await getOne<{ public_id: string }>(`/api/v1/get/attachment/id/${link.attachment_id}`);
    if (isCancelled?.()) return null;
    return att.public_id;
  } catch {
    return null;
  }
}

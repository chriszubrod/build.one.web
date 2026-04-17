import { useEffect, useState } from "react";
import { fetchViewAttachmentBlob } from "../api/client";

/**
 * Loads /api/v1/view/attachment/{publicId} with Bearer auth and exposes a blob: URL for iframe/img.
 * Revokes the object URL on dependency change and unmount.
 */
export function useViewAttachmentObjectUrl(attachmentPublicId: string | null): {
  objectUrl: string | null;
  loading: boolean;
  loadError: boolean;
} {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!attachmentPublicId) {
      setObjectUrl(null);
      setLoading(false);
      setLoadError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setObjectUrl(null);

    fetchViewAttachmentBlob(attachmentPublicId)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setObjectUrl(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setLoading(false);
      setLoadError(false);
    };
  }, [attachmentPublicId]);

  return { objectUrl, loading, loadError };
}

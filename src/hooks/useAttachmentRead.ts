import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFile } from "../api/client";

export interface AttachmentUploadResponse {
  public_id: string;
  content_type: string | null;
}

export interface AttachmentReadBeginCallbacks<TRead> {
  onUploaded: (publicId: string) => void;
  onResult: (result: TRead | null, generation: number) => void;
  onError: () => void;
  deferredForGeneration?: (generation: number) => boolean;
}

/** Upload → read for a dropped/browsed attachment, with abort + stale-generation guards. */
export function useAttachmentRead() {
  return useAttachmentReadWithMountEpoch(0);
}

/**
 * Test seam only: bumping `mountGuardEpoch` re-runs the mount-guard effect, the way a
 * StrictMode / Fast Refresh re-run does while a read is in flight. Production code uses
 * `useAttachmentRead()`.
 */
export function useAttachmentReadWithMountEpoch(mountGuardEpoch: number) {
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const [reading, setReading] = useState(false);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (!mountedRef.current) {
          abortRef.current?.abort();
        }
      });
    };
  }, [mountGuardEpoch]);

  const currentGeneration = useCallback(() => generationRef.current, []);

  const begin = useCallback(
    <TRead>(
      file: File,
      read: (attachmentPublicId: string, signal: AbortSignal) => Promise<TRead | null>,
      callbacks: AttachmentReadBeginCallbacks<TRead>,
    ): number => {
      abort();

      const ac = new AbortController();
      abortRef.current = ac;
      const readGeneration = ++generationRef.current;
      const deferredForGeneration = callbacks.deferredForGeneration ?? (() => false);

      setReading(true);

      void (async () => {
        try {
          const attachment = await uploadFile<AttachmentUploadResponse>(
            "/api/v1/upload/attachment",
            file,
          );
          if (ac.signal.aborted) return;
          callbacks.onUploaded(attachment.public_id);

          const result = await read(attachment.public_id, ac.signal);
          if (ac.signal.aborted || generationRef.current !== readGeneration) return;

          callbacks.onResult(result, readGeneration);
        } catch {
          if (!ac.signal.aborted) {
            callbacks.onError();
          }
        } finally {
          if (abortRef.current === ac) abortRef.current = null;
          if (generationRef.current === readGeneration) {
            const stillDeferred = deferredForGeneration(readGeneration);
            setReading(stillDeferred);
          }
        }
      })();

      return readGeneration;
    },
    [abort],
  );

  return {
    begin,
    abort,
    reading,
    setReading,
    currentGeneration,
  };
}

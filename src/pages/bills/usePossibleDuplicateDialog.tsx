import { useCallback, useRef, useState } from "react";
import PossibleDuplicateDialog from "../../components/PossibleDuplicateDialog";
import {
  confirmBody,
  DuplicateDialogCancelled,
  possibleDuplicateFromError,
  type PossibleDuplicateMatch,
} from "./possibleDuplicate";

export { DuplicateDialogCancelled };

/** Prompt for duplicate confirmation; throws DuplicateDialogCancelled on Cancel. */
export function usePossibleDuplicateDialog() {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<PossibleDuplicateMatch[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const waiterRef = useRef<{
    resolve: (extra: Record<string, unknown>) => void;
    reject: (err: unknown) => void;
  } | null>(null);

  const promptIfDuplicate = useCallback(async (err: unknown): Promise<Record<string, unknown>> => {
    const dup = possibleDuplicateFromError(err);
    if (!dup) throw err;
    return new Promise((resolve, reject) => {
      waiterRef.current = { resolve, reject };
      setMatches(dup.matches);
      setHiddenCount(dup.hiddenCount);
      setOpen(true);
    });
  }, []);

  const onCancel = useCallback(() => {
    setOpen(false);
    const w = waiterRef.current;
    waiterRef.current = null;
    w?.reject(new DuplicateDialogCancelled());
  }, []);

  const onConfirm = useCallback(() => {
    const w = waiterRef.current;
    if (!w) return;
    w.resolve(confirmBody(matches));
    setOpen(false);
    waiterRef.current = null;
  }, [matches]);

  const dialog = (
    <PossibleDuplicateDialog
      open={open}
      matches={matches}
      hiddenCount={hiddenCount}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );

  return { promptIfDuplicate, dialog };
}

export async function postWithDuplicatePrompt<T = unknown>(
  postFn: (path: string, body: Record<string, unknown>) => Promise<T>,
  path: string,
  body: Record<string, unknown>,
  promptIfDuplicate: (err: unknown) => Promise<Record<string, unknown>>,
): Promise<T> {
  let confirmExtra: Record<string, unknown> = {};
  while (true) {
    try {
      return await postFn(path, { ...body, ...confirmExtra });
    } catch (err) {
      if (err instanceof DuplicateDialogCancelled) throw err;
      confirmExtra = await promptIfDuplicate(err);
    }
  }
}

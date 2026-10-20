import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { deleteEntity } from "./useEntity";
import { useToast } from "../components/Toast";

export type UseDeleteDocumentOptions = {
  deletePath: string;
  confirmText: string;
  successToast?: string;
  errorFallback: string;
  navigateTo: string;
  beforeDelete?: () => void;
  removeQueryKeys?: QueryKey[];
  invalidateQueryKeys?: QueryKey[];
  formatError?: (err: unknown, fallback: string) => string;
};

export type RunDeleteOverrides = {
  confirmText?: string;
  successToast?: string;
};

function defaultFormatError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useDeleteDocument(options: UseDeleteDocumentOptions) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const inFlightRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const runDelete = useCallback(async (overrides?: RunDeleteOverrides) => {
    const opts = optionsRef.current;
    const confirmText = overrides?.confirmText ?? opts.confirmText;
    const successToast = overrides?.successToast ?? opts.successToast;
    if (!opts.deletePath) return;
    if (inFlightRef.current) return;
    if (!window.confirm(confirmText)) return;

    opts.beforeDelete?.();
    inFlightRef.current = true;
    setDeleting(true);

    const formatError = opts.formatError ?? defaultFormatError;

    try {
      await deleteEntity(opts.deletePath);
      for (const key of opts.removeQueryKeys ?? []) {
        queryClient.removeQueries({ queryKey: key });
      }
      await Promise.all(
        (opts.invalidateQueryKeys ?? []).map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
      if (successToast) toast(successToast);
      navigate(opts.navigateTo);
    } catch (err: unknown) {
      toast(formatError(err, opts.errorFallback), "error");
      setDeleting(false);
      inFlightRef.current = false;
    }
  }, [navigate, queryClient, toast]);

  return { deleting, runDelete };
}

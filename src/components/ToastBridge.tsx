import { useEffect } from "react";
import { useToast } from "./Toast";
import { setToastBridge } from "../api/toastBridge";

/**
 * Mounts once at the top of the React tree and wires useToast() into the
 * module-level toastBridge so client.ts (and any other non-React module)
 * can fire toasts. Renders nothing.
 */
export default function ToastBridge() {
  const { toast } = useToast();
  useEffect(() => {
    setToastBridge(toast);
    return () => setToastBridge(null);
  }, [toast]);
  return null;
}

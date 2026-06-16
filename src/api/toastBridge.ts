/**
 * Tiny bridge that lets non-React modules (like client.ts) fire toasts
 * without importing the React context. App.tsx mounts <ToastBridge /> on
 * boot which calls setToastBridge with the live useToast() function;
 * client.ts then calls emitToast() to surface offline / network errors
 * without needing to know about ToastProvider.
 *
 * If no bridge is registered (very brief window during initial mount,
 * or unit tests), emitToast is a silent no-op.
 */
type ToastType = "success" | "error" | "info";
type ToastFn = (message: string, type?: ToastType) => void;

let bridge: ToastFn | null = null;

export function setToastBridge(fn: ToastFn | null) {
  bridge = fn;
}

export function emitToast(message: string, type?: ToastType) {
  bridge?.(message, type);
}

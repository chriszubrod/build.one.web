import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  startUpdateChecks,
  UPDATE_CHECK_INTERVAL_MS,
  FOCUS_CHECK_MIN_GAP_MS,
  type SwRegistrationLike,
} from "./PWAUpdatePrompt";
import PWAUpdatePrompt from "./PWAUpdatePrompt";
import { ToastProvider } from "./Toast";
import { deferred } from "../hooks/__testutils__/renderHook";

import { registerSW } from "virtual:pwa-register";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockRegisterSW = vi.mocked(registerSW);

function makeRegistration(overrides: Partial<SwRegistrationLike> = {}): SwRegistrationLike {
  return {
    update: vi.fn().mockResolvedValue({} as ServiceWorkerRegistration),
    installing: null,
    ...overrides,
  };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    writable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("startUpdateChecks", () => {
  let stopChecks: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    setNavigatorOnline(true);
    setVisibility("hidden");
    stopChecks = undefined;
  });

  afterEach(() => {
    stopChecks?.();
    stopChecks = undefined;
    vi.useRealTimers();
  });

  it("does not call update() before 30 min; once at 30 min; again at 60 min", async () => {
    const registration = makeRegistration();
    stopChecks = startUpdateChecks(registration);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1);
    });
    expect(registration.update).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(registration.update).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it("visibility visible triggers update(); second visible within 5 min does not; after 5 min does; hidden does not", async () => {
    const registration = makeRegistration();
    stopChecks = startUpdateChecks(registration);

    setVisibility("visible");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOCUS_CHECK_MIN_GAP_MS);
    });

    setVisibility("hidden");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it("skips update() when offline", async () => {
    setNavigatorOnline(false);
    const registration = makeRegistration();
    stopChecks = startUpdateChecks(registration);

    setVisibility("visible");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("skipped checks do not advance throttle — visible after offline skip still runs within 5 min", async () => {
    const registration = makeRegistration();
    stopChecks = startUpdateChecks(registration);

    setNavigatorOnline(false);
    setVisibility("visible");
    await flush();
    expect(registration.update).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    setVisibility("hidden");
    setVisibility("visible");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("skips update() when registration.installing is set", async () => {
    const registration = makeRegistration({
      installing: {} as ServiceWorker,
    });
    stopChecks = startUpdateChecks(registration);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(registration.update).not.toHaveBeenCalled();

    setVisibility("visible");
    await flush();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("does not start a second update() while one is in flight", async () => {
    const pending = deferred<ServiceWorkerRegistration>();
    const registration = makeRegistration({
      update: vi.fn(() => pending.promise),
    });
    stopChecks = startUpdateChecks(registration);

    setVisibility("visible");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOCUS_CHECK_MIN_GAP_MS);
    });
    setVisibility("visible");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({} as ServiceWorkerRegistration);
      await Promise.resolve();
    });

    setVisibility("visible");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it("catches rejected update() and later checks still run", async () => {
    const registration = makeRegistration({
      update: vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValue({} as ServiceWorkerRegistration),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    stopChecks = startUpdateChecks(registration);

    setVisibility("visible");
    await flush();
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(registration.update).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("stop() clears interval and listener — no update() after unmount", async () => {
    const registration = makeRegistration();
    stopChecks = startUpdateChecks(registration);

    stopChecks();
    stopChecks = undefined;
    setVisibility("visible");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 2);
    });
    expect(registration.update).not.toHaveBeenCalled();
  });
});

describe("PWAUpdatePrompt", () => {
  let container: HTMLDivElement;
  let root: Root;
  let registerOptions: Parameters<typeof registerSW>[0] | undefined;
  let updateSW: (reloadPage?: boolean) => Promise<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    setNavigatorOnline(true);
    setVisibility("hidden");
    registerOptions = undefined;
    updateSW = vi.fn().mockResolvedValue(undefined);

    mockRegisterSW.mockImplementation((options) => {
      registerOptions = options;
      return updateSW;
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.useRealTimers();
    mockRegisterSW.mockReset();
  });

  function renderPrompt() {
    act(() => {
      root.render(
        createElement(ToastProvider, null, createElement(PWAUpdatePrompt)),
      );
    });
  }

  it("onNeedRefresh shows the banner; Reload calls updater with true; dismiss hides it", () => {
    renderPrompt();
    expect(container.querySelector(".pwa-update-banner")).toBeNull();

    act(() => {
      registerOptions?.onNeedRefresh?.();
    });
    expect(container.querySelector(".pwa-update-banner")).not.toBeNull();
    expect(container.textContent).toContain("A new version is available.");

    act(() => {
      container.querySelector<HTMLButtonElement>(".pwa-update-banner-reload")?.click();
    });
    expect(updateSW).toHaveBeenCalledWith(true);

    act(() => {
      registerOptions?.onNeedRefresh?.();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>(".pwa-update-banner-dismiss")?.click();
    });
    expect(container.querySelector(".pwa-update-banner")).toBeNull();
  });

  it("double onRegistered does not double periodic update() calls", async () => {
    const registration = makeRegistration();
    renderPrompt();

    act(() => {
      registerOptions?.onRegistered?.(registration as ServiceWorkerRegistration);
      registerOptions?.onRegistered?.(registration as ServiceWorkerRegistration);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("unmount stops update checks", async () => {
    const registration = makeRegistration();
    renderPrompt();

    act(() => {
      registerOptions?.onRegistered?.(registration as ServiceWorkerRegistration);
    });

    act(() => {
      root.unmount();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 2);
    });
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("does not start update checks if onRegistered runs after unmount", async () => {
    const registration = makeRegistration();
    renderPrompt();

    act(() => {
      root.unmount();
    });

    act(() => {
      registerOptions?.onRegistered?.(registration as ServiceWorkerRegistration);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS + 1);
    });
    expect(registration.update).not.toHaveBeenCalled();
  });
});

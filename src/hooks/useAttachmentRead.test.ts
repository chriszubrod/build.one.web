import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement, useState } from "react";
import { uploadFile } from "../api/client";
import {
  useAttachmentRead, useAttachmentReadWithMountEpoch,
  type AttachmentReadBeginCallbacks,
} from "./useAttachmentRead";
import { renderHook, deferred, drain } from "./__testutils__/renderHook";
import { createRoot } from "react-dom/client";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, uploadFile: vi.fn() };
});

function cbs<TRead>(
  overrides: Partial<AttachmentReadBeginCallbacks<TRead>> = {},
): AttachmentReadBeginCallbacks<TRead> {
  return {
    onUploaded: vi.fn(),
    onResult: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe("useAttachmentRead", () => {
  beforeEach(() => {
    vi.mocked(uploadFile).mockReset();
    vi.mocked(uploadFile).mockResolvedValue({ public_id: "att-1", content_type: "application/pdf" });
  });

  it("second begin aborts the first and drops the first late result", async () => {
    const h = renderHook(() => useAttachmentRead());
    const readA = deferred<{ ok: boolean } | null>();
    const readB = deferred<{ ok: boolean } | null>();
    const onResultA = vi.fn();
    const onResultB = vi.fn();
    const fileA = new File(["a"], "a.pdf", { type: "application/pdf" });
    const fileB = new File(["b"], "b.pdf", { type: "application/pdf" });

    act(() => {
      h.result.current.begin(fileA, () => readA.promise, cbs({ onResult: onResultA }));
    });
    await act(async () => {
      await drain();
    });

    act(() => {
      h.result.current.begin(fileB, () => readB.promise, cbs({ onResult: onResultB }));
    });
    await act(async () => {
      await drain();
    });

    await act(async () => {
      readA.resolve({ ok: true });
      await drain();
    });
    expect(onResultA).not.toHaveBeenCalled();

    await act(async () => {
      readB.resolve({ ok: true });
      await drain();
    });
    expect(onResultB).toHaveBeenCalledWith({ ok: true }, 2);
  });

  it("abort() drops an in-flight result", async () => {
    const h = renderHook(() => useAttachmentRead());
    const read = deferred<string | null>();
    const onResult = vi.fn();
    const file = new File(["a"], "a.pdf", { type: "application/pdf" });

    act(() => {
      h.result.current.begin(file, () => read.promise, cbs({ onResult }));
    });
    await act(async () => {
      await drain();
    });

    act(() => {
      h.result.current.abort();
    });

    await act(async () => {
      read.resolve("done");
      await drain();
    });
    expect(onResult).not.toHaveBeenCalled();
  });

  it("null result path invokes onResult with null", async () => {
    const h = renderHook(() => useAttachmentRead());
    const onResult = vi.fn();
    const file = new File(["a"], "a.pdf", { type: "application/pdf" });

    act(() => {
      h.result.current.begin(file, async () => null, cbs({ onResult }));
    });
    await act(async () => {
      await drain();
    });
    expect(onResult).toHaveBeenCalledWith(null, 1);
  });

  it("thrown upload path calls onError", async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error("network"));
    const h = renderHook(() => useAttachmentRead());
    const onError = vi.fn();
    const file = new File(["a"], "a.pdf", { type: "application/pdf" });

    act(() => {
      h.result.current.begin(file, async () => null, cbs({ onError }));
    });
    await act(async () => {
      await drain();
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("uploads a pdf extension file with empty MIME type", async () => {
    const h = renderHook(() => useAttachmentRead());
    const onUploaded = vi.fn();
    const file = new File(["x"], "x.pdf", { type: "" });

    act(() => {
      h.result.current.begin(file, async () => null, cbs({ onUploaded }));
    });
    await act(async () => {
      await drain();
    });
    expect(onUploaded).toHaveBeenCalledWith("att-1");
    expect(vi.mocked(uploadFile)).toHaveBeenCalledWith("/api/v1/upload/attachment", file);
  });

  it("aborted run sets no upload error", async () => {
    const uploadDef = deferred<{ public_id: string; content_type: string | null }>();
    vi.mocked(uploadFile).mockImplementationOnce(() => uploadDef.promise);
    const h = renderHook(() => useAttachmentRead());
    const onError = vi.fn();
    const file = new File(["a"], "a.pdf", { type: "application/pdf" });

    act(() => {
      h.result.current.begin(file, async () => null, cbs({ onError }));
    });

    act(() => {
      h.result.current.abort();
    });

    await act(async () => {
      uploadDef.resolve({ public_id: "att-late", content_type: null });
      await drain();
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("StrictMode-style remount does not abort an in-flight upload; real unmount does", async () => {
    const uploadDef = deferred<{ public_id: string; content_type: string | null }>();
    vi.mocked(uploadFile).mockImplementation(() => uploadDef.promise);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const hookOut = { current: null as ReturnType<typeof useAttachmentRead> | null };
    const bumpEpochRef = { current: () => {} };

    function Probe() {
      const [epoch, setEpoch] = useState(0);
      bumpEpochRef.current = () => setEpoch(1);
      hookOut.current = useAttachmentReadWithMountEpoch(epoch);
      return null;
    }

    act(() => {
      root.render(createElement(Probe));
    });

    const file = new File(["a"], "a.pdf", { type: "application/pdf" });
    const onUploaded = vi.fn();
    const read = deferred<null>();

    act(() => {
      hookOut.current!.begin(file, () => read.promise, cbs({ onUploaded }));
    });

    act(() => {
      bumpEpochRef.current();
    });

    await act(async () => {
      uploadDef.resolve({ public_id: "att-1", content_type: "application/pdf" });
      await drain();
    });

    expect(onUploaded).toHaveBeenCalledWith("att-1");

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);

    const uploadDef2 = deferred<{ public_id: string; content_type: string | null }>();
    vi.mocked(uploadFile).mockImplementation(() => uploadDef2.promise);

    const h2 = renderHook(() => useAttachmentRead());
    const onUploaded2 = vi.fn();

    act(() => {
      h2.result.current.begin(file, async () => null, cbs({ onUploaded: onUploaded2 }));
    });

    act(() => {
      h2.unmount();
    });

    await act(async () => {
      uploadDef2.resolve({ public_id: "att-gone", content_type: null });
      await drain();
    });

    expect(onUploaded2).not.toHaveBeenCalled();
  });
});

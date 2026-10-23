import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import PdfDropZone, { isPdfFile } from "./PdfDropZone";
import { withInferredReceiptType } from "./receiptFileTypes";
import { dispatchDrop } from "../__testutils__/domEvents";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Harness = {
  container: HTMLDivElement;
  root: Root;
  zone: () => HTMLElement;
  input: () => HTMLInputElement;
  onSelect: ReturnType<typeof vi.fn>;
  cleanup: () => void;
};

let activeHarness: Harness | null = null;

afterEach(() => {
  activeHarness?.cleanup();
  activeHarness = null;
});

function renderZone(props: Partial<React.ComponentProps<typeof PdfDropZone>> = {}): Harness {
  const onSelect = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      createElement(PdfDropZone, {
        icon: "📄",
        text: "Drop the PDF here",
        onSelect,
        ...props,
      }),
    );
  });

  const harness: Harness = {
    container,
    root,
    zone: () => container.querySelector(".drop-zone") as HTMLElement,
    input: () => container.querySelector(".drop-zone input[type='file']") as HTMLInputElement,
    onSelect,
    cleanup: () => {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
  activeHarness = harness;
  return harness;
}

describe("isPdfFile", () => {
  it("accepts MIME type application/pdf", () => {
    expect(isPdfFile(new File(["x"], "a.bin", { type: "application/pdf" }))).toBe(true);
  });

  it("accepts .pdf extension when type is empty", () => {
    expect(isPdfFile(new File(["x"], "x.pdf", { type: "" }))).toBe(true);
  });
});

describe("PdfDropZone", () => {
  it("adds drop-zone-active on dragover and dragenter, clears on dragleave and drop", () => {
    const h = renderZone();
    const z = h.zone();
    expect(z.classList.contains("drop-zone-active")).toBe(false);

    act(() => {
      z.dispatchEvent(new Event("dragenter", { bubbles: true, cancelable: true }));
    });
    expect(z.classList.contains("drop-zone-active")).toBe(true);

    act(() => {
      z.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    });
    expect(z.classList.contains("drop-zone-active")).toBe(true);

    act(() => {
      z.dispatchEvent(new Event("dragleave", { bubbles: true, cancelable: true }));
    });
    expect(z.classList.contains("drop-zone-active")).toBe(false);

    act(() => {
      z.dispatchEvent(new Event("dragenter", { bubbles: true, cancelable: true }));
    });
    const pdf = new File(["p"], "a.pdf", { type: "application/pdf" });
    act(() => {
      dispatchDrop(z, [pdf]);
    });
    expect(z.classList.contains("drop-zone-active")).toBe(false);
  });

  it("drop of a PDF calls onSelect with accepted files", () => {
    const h = renderZone();
    const pdf = new File(["p"], "bill.pdf", { type: "application/pdf" });
    act(() => {
      dispatchDrop(h.zone(), [pdf]);
    });
    expect(h.onSelect).toHaveBeenCalledWith([pdf], [], "drop");
  });

  it("non-PDF goes to rejected not accepted", () => {
    const h = renderZone();
    const txt = new File(["t"], "note.txt", { type: "text/plain" });
    act(() => {
      dispatchDrop(h.zone(), [txt]);
    });
    expect(h.onSelect).toHaveBeenCalledWith([], [txt], "drop");
  });

  it("accepts .pdf name with empty type", () => {
    const h = renderZone();
    const pdf = new File(["p"], "x.pdf", { type: "" });
    act(() => {
      dispatchDrop(h.zone(), [pdf]);
    });
    expect(h.onSelect).toHaveBeenCalledWith([pdf], [], "drop");
  });

  it("single mode passes only the first file", () => {
    const h = renderZone({ multiple: false });
    const a = new File(["a"], "a.pdf", { type: "application/pdf" });
    const b = new File(["b"], "b.pdf", { type: "application/pdf" });
    act(() => {
      dispatchDrop(h.zone(), [a, b]);
    });
    expect(h.onSelect).toHaveBeenCalledWith([a], [], "drop");
  });

  it("single mode judges only the first file of a mixed drop", () => {
    const h = renderZone({ multiple: false });
    const pdf = new File(["p"], "a.pdf", { type: "application/pdf" });
    const txt = new File(["t"], "notes.txt", { type: "text/plain" });
    act(() => {
      dispatchDrop(h.zone(), [txt, pdf]);
    });
    expect(h.onSelect).toHaveBeenLastCalledWith([], [txt], "drop");
    act(() => {
      dispatchDrop(h.zone(), [pdf, txt]);
    });
    expect(h.onSelect).toHaveBeenLastCalledWith([pdf], [], "drop");
  });

  it("multiple mode passes all PDFs", () => {
    const h = renderZone({ multiple: true });
    const a = new File(["a"], "a.pdf", { type: "application/pdf" });
    const b = new File(["b"], "b.pdf", { type: "application/pdf" });
    act(() => {
      dispatchDrop(h.zone(), [a, b]);
    });
    expect(h.onSelect).toHaveBeenCalledWith([a, b], [], "drop");
  });

  it("browse input change calls onSelect and resets the input value", () => {
    const h = renderZone();
    const pdf = new File(["p"], "picked.pdf", { type: "application/pdf" });
    const fileInput = h.input();
    Object.defineProperty(fileInput, "files", { value: [pdf], configurable: true });
    act(() => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(h.onSelect).toHaveBeenCalledWith([pdf], [], "browse");
    expect(fileInput.value).toBe("");
  });

  it("disabled ignores drops", () => {
    const h = renderZone({ disabled: true });
    const pdf = new File(["p"], "a.pdf", { type: "application/pdf" });
    act(() => {
      dispatchDrop(h.zone(), [pdf]);
    });
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it("default still rejects an image", () => {
    const h = renderZone();
    const png = new File(["x"], "receipt.png", { type: "image/png" });
    act(() => {
      dispatchDrop(h.zone(), [png]);
    });
    expect(h.onSelect).toHaveBeenCalledWith([], [png], "drop");
  });

  it("allowImages accepts PNG, JPEG, HEIC, HEIF, TIFF, and PDF and rejects other types", () => {
    const h = renderZone({ allowImages: true, multiple: true });
    const pdf = new File(["p"], "a.pdf", { type: "application/pdf" });
    const png = new File(["x"], "r.png", { type: "image/png" });
    const jpg = new File(["x"], "r.jpg", { type: "image/jpeg" });
    const heic = new File(["x"], "photo.heic", { type: "image/heic" });
    const heif = new File(["x"], "photo.heif", { type: "image/heif" });
    const tiff = new File(["x"], "scan.tiff", { type: "image/tiff" });
    const heicByExt = new File(["x"], "iphone.heic", { type: "" });
    const webp = new File(["x"], "x.webp", { type: "image/webp" });
    const gif = new File(["x"], "x.gif", { type: "image/gif" });
    const txt = new File(["t"], "n.txt", { type: "text/plain" });
    act(() => {
      dispatchDrop(h.zone(), [pdf, png, jpg, heic, heif, tiff, heicByExt, webp, gif, txt]);
    });
    expect(h.onSelect).toHaveBeenCalledWith(
      [pdf, png, jpg, heic, heif, tiff, heicByExt],
      [webp, gif, txt],
      "drop",
    );
  });
});

describe("withInferredReceiptType (U-716b)", () => {
  it("types an untyped HEIC photo from its extension", () => {
    const f = new File(["x"], "IMG_0001.HEIC", { type: "" });
    expect(withInferredReceiptType(f).type).toBe("image/heic");
    expect(withInferredReceiptType(f).name).toBe("IMG_0001.HEIC");
  });
  it("leaves a typed file and an unknown extension unchanged", () => {
    const typed = new File(["x"], "r.png", { type: "image/png" });
    expect(withInferredReceiptType(typed)).toBe(typed);
    const unknown = new File(["x"], "r.bin", { type: "" });
    expect(withInferredReceiptType(unknown)).toBe(unknown);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import DocumentHeaderFields, { type DocumentHeaderFieldDef } from "./DocumentHeaderFields";
import {
  setInputValue,
  setSelectValue,
  setTextareaValue,
} from "../__testutils__/domEvents";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DocumentHeaderFields", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  function renderHarness(fields: DocumentHeaderFieldDef[], values: Record<string, string | boolean>) {
    act(() => {
      root.render(
        createElement(DocumentHeaderFields, {
          fields,
          values,
          onChange,
        }),
      );
    });
  }

  function headerLabels(): string[] {
    return Array.from(container.querySelectorAll(".detail-fields-form label")).map((l) =>
      l.textContent?.replace(/\*/g, "").trim(),
    );
  }

  it("renders fields in the given order with labels", () => {
    const fields: DocumentHeaderFieldDef[] = [
      { key: "a", label: "Alpha", type: "text" },
      { key: "b", label: "Beta", type: "text" },
    ];
    renderHarness(fields, { a: "", b: "" });
    expect(headerLabels()).toEqual(["Alpha", "Beta"]);
  });

  it("renders non-full-width fields as direct children of detail-fields-form", () => {
    const fields: DocumentHeaderFieldDef[] = [
      { key: "a", label: "Alpha", type: "text" },
      { key: "b", label: "Beta", type: "text" },
      { key: "wide", label: "Wide", type: "textarea", fullWidth: true },
    ];
    renderHarness(fields, { a: "", b: "", wide: "" });
    const form = container.querySelector(".detail-fields-form")!;
    expect(form.querySelectorAll(":scope > .form-group").length).toBe(2);
    expect(form.querySelectorAll(":scope > .full-width").length).toBe(1);
  });

  it("renders each control type and forwards onChange with (key, value)", () => {
    const fields: DocumentHeaderFieldDef[] = [
      { key: "t", label: "Text", type: "text" },
      { key: "d", label: "Day", type: "date" },
      { key: "n", label: "Num", type: "number" },
      {
        key: "s",
        label: "Pick",
        type: "select",
        options: [
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
      },
      { key: "m", label: "Memo", type: "textarea" },
      { key: "c", label: "Check", type: "checkbox" },
    ];
    renderHarness(fields, {
      t: "hi",
      d: "2026-03-01",
      n: "3",
      s: "x",
      m: "note",
      c: false,
    });

    act(() => {
      setInputValue(container.querySelector('input[name="t"]') as HTMLInputElement, "next");
    });
    expect(onChange).toHaveBeenCalledWith("t", "next");

    onChange.mockClear();
    act(() => {
      setInputValue(container.querySelector('input[name="d"]') as HTMLInputElement, "2026-04-01");
    });
    expect(onChange).toHaveBeenCalledWith("d", "2026-04-01");

    onChange.mockClear();
    act(() => {
      setInputValue(container.querySelector('input[name="n"]') as HTMLInputElement, "9");
    });
    expect(onChange).toHaveBeenCalledWith("n", "9");

    onChange.mockClear();
    act(() => {
      setSelectValue(container.querySelector('select[name="s"]') as HTMLSelectElement, "y");
    });
    expect(onChange).toHaveBeenCalledWith("s", "y");

    onChange.mockClear();
    act(() => {
      setTextareaValue(container.querySelector('textarea[name="m"]') as HTMLTextAreaElement, "long");
    });
    expect(onChange).toHaveBeenCalledWith("m", "long");

    onChange.mockClear();
    act(() => {
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
    expect(onChange).toHaveBeenCalledWith("c", true);
  });

  it("honours required, full-width, and adornment", () => {
    const fields: DocumentHeaderFieldDef[] = [
      {
        key: "req",
        label: "Required Text",
        type: "text",
        required: true,
        adornment: createElement("span", { "data-testid": "adorn" }, "badge"),
      },
      { key: "wide", label: "Wide", type: "textarea", fullWidth: true },
    ];
    renderHarness(fields, { req: "", wide: "" });

    expect(container.querySelector('input[name="req"]')?.hasAttribute("required")).toBe(true);
    expect(container.querySelector('[data-testid="adorn"]')).toBeTruthy();
    expect(container.querySelector('textarea[name="wide"]')?.closest(".full-width")).toBeTruthy();
  });
});

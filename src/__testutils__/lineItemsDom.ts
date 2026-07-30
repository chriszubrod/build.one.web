/** DOM helpers for specs that exercise InlineLineItems — selectors mirror that component's markup. */

export function inlineLineItemRows(container: HTMLElement): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll("tbody tr")).filter((tr) =>
    tr.querySelector('button[title="Remove"]'),
  ) as HTMLTableRowElement[];
}

export function inlineLineItemInput(row: HTMLTableRowElement): HTMLInputElement {
  const input = row.querySelector(".inline-li-input") as HTMLInputElement | null;
  if (!input) throw new Error("missing inline line-item input");
  return input;
}

/** Locate a row's input by its description value (logical row), not DOM index. */
export function inlineLineItemInputForValue(
  container: HTMLElement,
  value: string,
): HTMLInputElement {
  for (const row of inlineLineItemRows(container)) {
    const input = inlineLineItemInput(row);
    if (input.value === value) return input;
  }
  throw new Error(`no inline line-item input with value ${JSON.stringify(value)}`);
}

/**
 * Type into a controlled input so React's `onChange` really fires.
 *
 * Assigning `input.value = x` directly ALSO updates React's internal
 * `_valueTracker`, so React concludes "no change" and SUPPRESSES the synthetic
 * change event: the text appears in the DOM but never reaches component state.
 * A spec that types this way and then asserts on the DOM value is reading back
 * its own write — it passes no matter what the component does (U-152).
 *
 * Going through the native prototype setter resets the tracker, so React sees a
 * real change and dispatches `onChange`.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // The `value` setter is defined per element prototype and brand-checks its
  // receiver, so a textarea must go through HTMLTextAreaElement.prototype —
  // the input setter would throw on it. That is the only reason the two
  // exported wrappers below exist rather than one widened signature.
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  nativeSetter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function setInputValue(input: HTMLInputElement, value: string): void {
  setNativeValue(input, value);
}

/** Textarea counterpart of {@link setInputValue} — same tracker-reset reason. */
export function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  setNativeValue(textarea, value);
}

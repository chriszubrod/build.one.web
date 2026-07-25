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
export function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

import type { InternalFieldStore } from "../types";

/**
 * Focuses the first focusable element of a field store. The elements are
 * tried in order and the first one that actually receives focus wins, so
 * detached, disabled or hidden elements are skipped. The browser decides
 * focusability, which is read back via the element's root `activeElement`
 * so elements in a shadow root or another document are handled correctly.
 *
 * Hint: a `display: none` or `hidden` element is correctly skipped in real
 * browsers, but jsdom has no layout and focuses it anyway, so that case
 * cannot be covered by unit tests.
 *
 * @param internalFieldStore The field store to focus.
 *
 * @returns Whether an element was focused.
 */
export function focusFieldElement(
  internalFieldStore: InternalFieldStore,
): boolean {
  for (const element of internalFieldStore.elements) {
    element.focus();
    // Read focus back from the element's own root (shadow root or document)
    if (
      (element.getRootNode() as Document | ShadowRoot).activeElement ===
      element
    ) {
      return true;
    }
  }
  return false;
}

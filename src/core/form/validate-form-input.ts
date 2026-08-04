import { focusFieldElement } from "../field/focus-field-element";
import { getFieldInput } from "../field/get-field-input";
import { walkFieldStore } from "../field/walk-field-store";
import { batch, untrack } from "../framework";
import type {
  InternalFieldStore,
  InternalFormStore,
  ValidationIssue,
} from "../types";

/**
 * Configuration for validating the form input.
 */
export interface ValidateFormInputConfig {
  /**
   * Whether to focus the first field with an error.
   */
  readonly shouldFocus?: boolean | undefined;
}

/**
 * The result of validating the form input.
 */
export interface ValidationResult {
  /**
   * Whether the input passed validation.
   */
  readonly success: boolean;
  /**
   * The validated form input (the current tree input — AJV does not
   * transform).
   */
  readonly output: unknown;
}

/**
 * The message used for an issue the validator produced without one.
 */
const FALLBACK_MESSAGE = "Invalid value";

/**
 * Decodes one JSON-Pointer segment (`~1` → `/`, `~0` → `~`).
 */
function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Resolves the field store an issue routes to: walk the pointer segments
 * from the root as far as the tree can follow them and return the deepest
 * reached store. An unroutable remainder (undeclared key, index past the
 * current item count, a pointer into a value leaf's interior) lands the
 * issue on the nearest addressable ancestor — errors must surface even for
 * fields that are not currently rendered or declared exactly as pointed.
 */
function resolveIssueTarget(
  internalFormStore: InternalFormStore,
  issue: ValidationIssue,
): InternalFieldStore {
  const pointer = issue.instancePath ?? "";
  const segments = pointer === "" ? [] : pointer.slice(1).split("/");

  // A `required` issue points at the object missing the property — route to
  // the missing property's own field so the error lands where the input is
  if (
    issue.keyword === "required" &&
    typeof issue.params?.missingProperty === "string"
  ) {
    segments.push(issue.params.missingProperty);
  }

  let store: InternalFieldStore = internalFormStore;
  for (const rawSegment of segments) {
    const segment = decodePointerSegment(rawSegment);
    let child: InternalFieldStore | undefined;
    if (store.kind === "object") {
      child = Object.prototype.hasOwnProperty.call(store.children, segment)
        ? store.children[segment]
        : undefined;
    } else if (store.kind === "array" && /^\d+$/.test(segment)) {
      const index = Number(segment);
      if (index < store.items.value.length) {
        child = store.children[index];
      }
    }
    if (!child) break;
    store = child;
  }
  return store;
}

/**
 * Validates the form input using the injected validator. Runs the validator
 * against the current tree input, routes each issue's `instancePath` to its
 * field store's `errors` signal (accumulating multiple issues per field,
 * clearing every other field), and optionally focuses the first field with
 * an error. A form without a validator always validates successfully.
 *
 * @param internalFormStore The form store to validate.
 * @param config The validation configuration.
 *
 * @returns The validation result.
 */
export function validateFormInput(
  internalFormStore: InternalFormStore,
  config?: ValidateFormInputConfig,
): ValidationResult {
  internalFormStore.validators++;
  internalFormStore.isValidating.value = true;

  try {
    const output = untrack(() => getFieldInput(internalFormStore));
    const issues = internalFormStore.validator?.(output);

    // Group issues by their resolved target store
    let fieldErrors: Map<InternalFieldStore, [string, ...string[]]> | undefined;
    if (issues && issues.length > 0) {
      fieldErrors = new Map();
      untrack(() => {
        for (const issue of issues) {
          const target = resolveIssueTarget(internalFormStore, issue);
          const message = issue.message || FALLBACK_MESSAGE;
          const existing = fieldErrors!.get(target);
          if (existing) {
            existing.push(message);
          } else {
            fieldErrors!.set(target, [message]);
          }
        }
      });
    }

    let shouldFocus = config?.shouldFocus ?? false;

    // Batch error, focus and validation state updates together so reactive
    // subscribers observe a single consistent update
    batch(() => {
      // Untracked to avoid subscribing a surrounding reactive scope to the
      // form structure
      untrack(() => {
        walkFieldStore(internalFormStore, (internalFieldStore) => {
          const errors = fieldErrors?.get(internalFieldStore) ?? null;
          internalFieldStore.validationErrors.value = errors;

          // Focus the first erroring field whose element can actually
          // receive focus, so the focus is not consumed by a field without
          // a focusable element (e.g. unmounted or hidden)
          if (
            shouldFocus &&
            errors &&
            internalFieldStore.path.length > 0 &&
            focusFieldElement(internalFieldStore)
          ) {
            shouldFocus = false;
          }
        });
      });

      internalFormStore.validators--;
      internalFormStore.isValidating.value = internalFormStore.validators > 0;
    });

    return { success: !fieldErrors, output };

    // If the validator throws, still reset the validation state so the form
    // does not stay stuck validating
  } catch (error) {
    batch(() => {
      internalFormStore.validators--;
      internalFormStore.isValidating.value = internalFormStore.validators > 0;
    });
    throw error;
  }
}

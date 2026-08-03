import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../vitest/mock"),
);
vi.mock("../framework", () => frameworkMocks);

import { validateFormInput } from "../form/validate-form-input";
import { validateIfRequired } from "../form/validate-if-required";
import type { FieldElement } from "../types";
import {
  createTestStore,
  getArrayStore,
  getValueStore,
  issue,
  objectSchema,
  requiredIssue,
  staticValidator,
} from "../vitest/utils";

beforeEach(resetIdCounter);

const flatSchema = objectSchema({
  name: { type: "string" },
  age: { type: "number" },
});

const nestedSchema = objectSchema({
  borrower: objectSchema({ name: { type: "string" } }),
  rows: {
    type: "array",
    items: objectSchema({ label: { type: "string" } }),
  },
});

describe("validateFormInput", () => {
  test("should succeed without a validator and set no errors", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });

    const result = validateFormInput(store);

    expect(result.success).toBe(true);
    expect(result.output).toStrictEqual({ name: "John", age: 5 });
    expect(store.errors.value).toBeNull();
    expect(getValueStore(store, ["name"]).errors.value).toBeNull();
  });

  test("should call the validator with the current tree input", () => {
    const validator = vi.fn(() => null);
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
      validator,
    });

    validateFormInput(store);

    expect(validator).toHaveBeenCalledExactlyOnceWith({
      name: "John",
      age: 5,
    });
  });

  test("should route a root issue to the form-level errors", () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator([issue("", "Record invalid")]),
    });

    const result = validateFormInput(store);

    expect(result.success).toBe(false);
    expect(store.errors.value).toStrictEqual(["Record invalid"]);
  });

  test("should route a nested instancePath to its field store", () => {
    const store = createTestStore(nestedSchema, {
      validator: staticValidator([issue("/borrower/name", "Name required")]),
    });

    validateFormInput(store);

    expect(
      getValueStore(store, ["borrower", "name"]).errors.value,
    ).toStrictEqual(["Name required"]);
    expect(store.errors.value).toBeNull();
  });

  test("should route an array-index instancePath to the item field", () => {
    const store = createTestStore(nestedSchema, {
      initialInput: { rows: [{ label: "a" }, { label: "" }] },
      validator: staticValidator([issue("/rows/1/label", "Label required")]),
    });

    validateFormInput(store);

    expect(
      getValueStore(store, ["rows", 1, "label"]).errors.value,
    ).toStrictEqual(["Label required"]);
    expect(getValueStore(store, ["rows", 0, "label"]).errors.value).toBeNull();
  });

  test("should route a required issue to the missing property's own field", () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator([requiredIssue("", "name")]),
    });

    validateFormInput(store);

    expect(getValueStore(store, ["name"]).errors.value).toStrictEqual([
      "must have required property 'name'",
    ]);
    expect(store.errors.value).toBeNull();
  });

  test("should accumulate multiple issues on one field", () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator([
        issue("/name", "Too short"),
        issue("/name", "Must not be numeric"),
      ]),
    });

    validateFormInput(store);

    expect(getValueStore(store, ["name"]).errors.value).toStrictEqual([
      "Too short",
      "Must not be numeric",
    ]);
  });

  test("should land an undeclared instancePath on the nearest ancestor (root)", () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator([issue("/undeclared", "Ghost issue")]),
    });

    validateFormInput(store);

    expect(store.errors.value).toStrictEqual(["Ghost issue"]);
  });

  test("should land an out-of-range array index on the array field", () => {
    const store = createTestStore(nestedSchema, {
      initialInput: { rows: [{ label: "a" }] },
      validator: staticValidator([issue("/rows/9/label", "Row missing")]),
    });

    validateFormInput(store);

    expect(getArrayStore(store, ["rows"]).errors.value).toStrictEqual([
      "Row missing",
    ]);
  });

  test("should land a pointer into a value leaf's interior on the leaf", () => {
    // An items-less array-typed node stays a value leaf whose whole array
    // is the value — a pointer into it cannot go deeper than the leaf
    const store = createTestStore(
      objectSchema({ tags: { type: "array" } }),
      {
        initialInput: { tags: ["a", 7] },
        validator: staticValidator([issue("/tags/1", "Must be a string")]),
      },
    );

    validateFormInput(store);

    expect(getValueStore(store, ["tags"]).errors.value).toStrictEqual([
      "Must be a string",
    ]);
  });

  test("should fall back to a generic message when the issue has none", () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator([{ instancePath: "/name" }]),
    });

    validateFormInput(store);

    expect(getValueStore(store, ["name"]).errors.value).toStrictEqual([
      "Invalid value",
    ]);
  });

  test("should clear every stale error on success", () => {
    let failing = true;
    const store = createTestStore(flatSchema, {
      validator: () =>
        failing ? [issue("/name", "Bad"), issue("", "Root bad")] : null,
    });

    validateFormInput(store);
    expect(getValueStore(store, ["name"]).errors.value).toStrictEqual(["Bad"]);
    expect(store.errors.value).toStrictEqual(["Root bad"]);

    failing = false;
    const result = validateFormInput(store);

    expect(result.success).toBe(true);
    expect(getValueStore(store, ["name"]).errors.value).toBeNull();
    expect(store.errors.value).toBeNull();
  });

  test("should route errors to fields that have no rendered element (collapsed groups)", () => {
    // No elements are ever registered in core tests — routing must not
    // depend on a field being rendered
    const store = createTestStore(nestedSchema, {
      validator: staticValidator([issue("/borrower/name", "Hidden error")]),
    });

    validateFormInput(store);

    expect(
      getValueStore(store, ["borrower", "name"]).errors.value,
    ).toStrictEqual(["Hidden error"]);
  });

  test("should reset the validating state when the validator throws", () => {
    const store = createTestStore(flatSchema, {
      validator: () => {
        throw new Error("Validator exploded");
      },
    });

    expect(() => validateFormInput(store)).toThrow("Validator exploded");
    expect(store.validators).toBe(0);
    expect(store.isValidating.value).toBe(false);
  });

  test("should leave the validating counter at zero after a sync run", () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator(null),
    });

    validateFormInput(store);

    expect(store.validators).toBe(0);
    expect(store.isValidating.value).toBe(false);
  });

  describe("shouldFocus", () => {
    /**
     * A fake focusable element: focus() records itself as its root's
     * activeElement (core tests run without a DOM).
     */
    function focusableElement(): FieldElement & { focused: boolean } {
      const root = { activeElement: null as unknown };
      const element = {
        focused: false,
        focus() {
          root.activeElement = element;
          element.focused = true;
        },
        getRootNode: () => root,
      };
      return element as unknown as FieldElement & { focused: boolean };
    }

    test("should focus the first erroring field with a focusable element", () => {
      const store = createTestStore(flatSchema, {
        validator: staticValidator([
          issue("/name", "Bad name"),
          issue("/age", "Bad age"),
        ]),
      });
      const nameElement = focusableElement();
      const ageElement = focusableElement();
      getValueStore(store, ["name"]).elements.push(nameElement);
      getValueStore(store, ["age"]).elements.push(ageElement);

      validateFormInput(store, { shouldFocus: true });

      expect(nameElement.focused).toBe(true);
      expect(ageElement.focused).toBe(false);
    });

    test("should skip an element-less erroring field and focus the next one", () => {
      const store = createTestStore(flatSchema, {
        validator: staticValidator([
          issue("/name", "Bad name"),
          issue("/age", "Bad age"),
        ]),
      });
      const ageElement = focusableElement();
      getValueStore(store, ["age"]).elements.push(ageElement);

      validateFormInput(store, { shouldFocus: true });

      expect(ageElement.focused).toBe(true);
    });

    test("should not focus anything without the flag", () => {
      const store = createTestStore(flatSchema, {
        validator: staticValidator([issue("/name", "Bad name")]),
      });
      const nameElement = focusableElement();
      getValueStore(store, ["name"]).elements.push(nameElement);

      validateFormInput(store);

      expect(nameElement.focused).toBe(false);
    });
  });
});

describe("validateIfRequired", () => {
  function storeWithSpy(config: {
    validate?: "initial" | "touch" | "input" | "change" | "blur" | "submit";
    revalidate?: "touch" | "input" | "change" | "blur" | "submit";
  }) {
    const validator = vi.fn(() => null);
    const store = createTestStore(flatSchema, { validator, ...config });
    return { store, validator };
  }

  test("should use the revalidate mode when validate is initial", () => {
    const { store, validator } = storeWithSpy({
      validate: "initial",
      revalidate: "input",
    });

    validateIfRequired(store, store.children.name, "input");
    expect(validator).toHaveBeenCalledTimes(1);

    validateIfRequired(store, store.children.name, "blur");
    expect(validator).toHaveBeenCalledTimes(1);
  });

  test("should use the validate mode until the form is submitted", () => {
    const { store, validator } = storeWithSpy({
      validate: "submit",
      revalidate: "input",
    });

    validateIfRequired(store, store.children.name, "input");
    expect(validator).not.toHaveBeenCalled();

    validateIfRequired(store, store.children.name, "submit");
    expect(validator).toHaveBeenCalledTimes(1);
  });

  test("should switch to the revalidate mode once the form is submitted", () => {
    const { store, validator } = storeWithSpy({
      validate: "submit",
      revalidate: "input",
    });
    store.isSubmitted.value = true;

    validateIfRequired(store, store.children.name, "input");
    expect(validator).toHaveBeenCalledTimes(1);

    // The validate-mode trigger no longer applies
    validateIfRequired(store, store.children.name, "submit");
    expect(validator).toHaveBeenCalledTimes(1);
  });

  test("should switch to the revalidate mode when the triggering subtree has errors", () => {
    // A validator that keeps failing so the error state persists across runs
    const validator = vi.fn(() => [issue("/name", "Bad")]);
    const store = createTestStore(flatSchema, {
      validator,
      validate: "input",
      revalidate: "blur",
    });

    // No errors yet: validate mode applies (and the run sets the error)
    validateIfRequired(store, store.children.name, "input");
    expect(validator).toHaveBeenCalledTimes(1);
    expect(store.children.name.errors.value).toStrictEqual(["Bad"]);

    // With errors present the revalidate mode takes over
    validateIfRequired(store, store.children.name, "blur");
    expect(validator).toHaveBeenCalledTimes(2);

    validateIfRequired(store, store.children.name, "input");
    expect(validator).toHaveBeenCalledTimes(2);
  });

  test("should not validate when the mode matches neither validate nor revalidate", () => {
    const { store, validator } = storeWithSpy({
      validate: "blur",
      revalidate: "input",
    });

    validateIfRequired(store, store.children.name, "touch");
    validateIfRequired(store, store.children.name, "change");
    expect(validator).not.toHaveBeenCalled();
  });
});

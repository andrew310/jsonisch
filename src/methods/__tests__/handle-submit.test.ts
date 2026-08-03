import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../../core/vitest/mock"),
);
vi.mock("../../core/framework", () => frameworkMocks);

import {
  createTestStore,
  focusableElement,
  getValueStore,
  issue,
  objectSchema,
  staticValidator,
} from "../../core/vitest/utils";
import { handleSubmit } from "../handle-submit";
import { setInput } from "../set-input";

beforeEach(resetIdCounter);

const flatSchema = objectSchema({
  name: { type: "string" },
  age: { type: "number" },
});

describe("handleSubmit", () => {
  test("should call the handler with the validated output on success", async () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    const handler = vi.fn();

    await handleSubmit(store, handler)();

    expect(handler).toHaveBeenCalledExactlyOnceWith(
      { name: "John", age: 5 },
      undefined,
    );
  });

  test("should prevent the default browser submission", async () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    const event = { preventDefault: vi.fn() } as unknown as SubmitEvent;

    await handleSubmit(store, vi.fn())(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  test("should set isSubmitted and toggle isSubmitting around the handler", async () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    let submittingDuringHandler: boolean | undefined;
    const handler = vi.fn(() => {
      submittingDuringHandler = store.isSubmitting.value;
    });

    await handleSubmit(store, handler)();

    expect(store.isSubmitted.value).toBe(true);
    expect(submittingDuringHandler).toBe(true);
    expect(store.isSubmitting.value).toBe(false);
  });

  test("should block the handler and route errors when validation fails", async () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator([issue("/name", "Name required")]),
    });
    const handler = vi.fn();

    await handleSubmit(store, handler)();

    expect(handler).not.toHaveBeenCalled();
    expect(getValueStore(store, ["name"]).errors.value).toStrictEqual([
      "Name required",
    ]);
    expect(store.isSubmitting.value).toBe(false);
  });

  test("should focus the first erroring field when validation fails", async () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator([
        issue("/name", "Bad name"),
        issue("/age", "Bad age"),
      ]),
    });
    const nameElement = focusableElement();
    getValueStore(store, ["name"]).elements.push(nameElement);

    await handleSubmit(store, vi.fn())();

    expect(nameElement.focused).toBe(true);
  });

  test("should touch every field on submit regardless of errors", async () => {
    const store = createTestStore(flatSchema, {
      validator: staticValidator([issue("/name", "Bad name")]),
    });

    await handleSubmit(store, vi.fn())();

    // Both the erroring and the clean field become touched, so error
    // styling gated on touched cannot hide a blocking issue
    expect(getValueStore(store, ["name"]).isTouched.value).toBe(true);
    expect(getValueStore(store, ["age"]).isTouched.value).toBe(true);
  });

  test("should run submit validation once, not once per field", async () => {
    const validator = vi.fn(() => null);
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
      validator,
    });

    await handleSubmit(store, vi.fn())();

    expect(validator).toHaveBeenCalledTimes(1);
  });

  test("should clear stale field errors on re-submission", async () => {
    let failing = true;
    const store = createTestStore(flatSchema, {
      validator: () => (failing ? [issue("/name", "Name required")] : null),
    });
    const handler = vi.fn();
    const submit = handleSubmit(store, handler);

    await submit();
    expect(getValueStore(store, ["name"]).errors.value).toStrictEqual([
      "Name required",
    ]);

    failing = false;
    await submit();

    expect(getValueStore(store, ["name"]).errors.value).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("should land a handler Error message as a form-level error", async () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });

    await handleSubmit(store, () => {
      throw new Error("Save failed");
    })();

    expect(store.errors.value).toStrictEqual(["Save failed"]);
    expect(store.isSubmitting.value).toBe(false);
  });

  test("should use a generic message for a non-Error handler throw", async () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });

    await handleSubmit(store, () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "boom";
    })();

    expect(store.errors.value).toStrictEqual([
      "An unknown error has occurred.",
    ]);
  });

  test("should await an async handler", async () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    let resolved = false;
    const handler = vi.fn(async () => {
      await Promise.resolve();
      resolved = true;
    });

    await handleSubmit(store, handler)();

    expect(resolved).toBe(true);
    expect(store.isSubmitting.value).toBe(false);
  });

  test("should ignore a re-entrant submit while submitting", async () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = vi.fn(() => gate);
    const submit = handleSubmit(store, handler);

    const first = submit();
    const second = submit();
    release();
    await Promise.all([first, second]);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("should submit the current (edited) input, not the initial one", async () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    setInput(store, ["name"], "Jane");
    const handler = vi.fn();

    await handleSubmit(store, handler)();

    expect(handler).toHaveBeenCalledExactlyOnceWith(
      { name: "Jane", age: 5 },
      undefined,
    );
  });
});

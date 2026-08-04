// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getValueStore, objectSchema } from "../../core/vitest/utils";
import { insert, swap } from "../../methods/array-ops";
import { reset } from "../../methods/reset";
import { validate } from "../../methods/validate";
import type { FieldStore, FormStore } from "../types";
import { useField } from "../use-field";
import { useFieldArray } from "../use-field-array";
import { useForm } from "../use-form";

// Repo gotcha: vitest runs without globals, so React Testing Library's
// auto-cleanup never registers — clean up explicitly.
afterEach(() => {
  cleanup();
});

const flatSchema = objectSchema({
  name: { type: "string" },
  age: { type: "number" },
});

/**
 * A minimal controlled text widget over useField, exposing the form store
 * to the test through a callback.
 */
function TextField({
  form,
  path,
  testId,
}: {
  form: FormStore;
  path: (string | number)[];
  testId: string;
}): ReactElement {
  const field = useField(form, path);
  return (
    <input
      data-testid={testId}
      {...field.props}
      value={(field.input as string | undefined) ?? ""}
      onChange={(event) => field.onChange(event.target.value)}
    />
  );
}

function TestForm({
  onForm,
  children,
  validator,
}: {
  onForm: (form: FormStore) => void;
  children: (form: FormStore) => ReactElement;
  validator?: (input: unknown) => { instancePath: string; message: string }[] | null;
}): ReactElement {
  const form = useForm({
    schema: flatSchema,
    initialInput: { name: "John", age: 5 },
    validator,
  });
  onForm(form);
  return children(form);
}

function renderTextField(
  validator?: (
    input: unknown,
  ) => { instancePath: string; message: string }[] | null,
) {
  let form!: FormStore;
  const utils = render(
    <TestForm onForm={(f) => (form = f)} validator={validator}>
      {(f) => <TextField form={f} path={["name"]} testId="name" />}
    </TestForm>,
  );
  return { ...utils, form: () => form };
}

describe("useField", () => {
  it("initializes from the store's input", () => {
    const { getByTestId } = renderTextField();
    expect((getByTestId("name") as HTMLInputElement).value).toBe("John");
  });

  it("updates input and isDirty through a DOM change event", () => {
    const { getByTestId, form } = renderTextField();
    const input = getByTestId("name") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Jane" } });

    expect(input.value).toBe("Jane");
    const store = getValueStore(form().internal, ["name"]);
    expect(store.input.value).toBe("Jane");
    expect(store.isDirty.value).toBe(true);
    expect(store.isEdited.value).toBe(true);
  });

  it("marks the field touched but NOT edited on focus", () => {
    const { getByTestId, form } = renderTextField();

    fireEvent.focus(getByTestId("name"));

    const store = getValueStore(form().internal, ["name"]);
    expect(store.isTouched.value).toBe(true);
    expect(store.isEdited.value).toBe(false);
  });

  it("keeps isEdited true after reverting to the initial value", () => {
    const { getByTestId, form } = renderTextField();
    const input = getByTestId("name") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Jane" } });
    fireEvent.change(input, { target: { value: "John" } });

    const store = getValueStore(form().internal, ["name"]);
    expect(store.isDirty.value).toBe(false);
    expect(store.isEdited.value).toBe(true);
  });

  it("returns a memoized field store reference across re-renders", () => {
    const refs: FieldStore[] = [];
    function Collector({ form }: { form: FormStore }): ReactElement {
      const field = useField(form, ["name"]);
      refs.push(field);
      return (
        <input
          value={(field.input as string | undefined) ?? ""}
          onChange={(event) => field.onChange(event.target.value)}
        />
      );
    }
    let form!: FormStore;
    render(
      <TestForm onForm={(f) => (form = f)}>
        {(f) => <Collector form={f} />}
      </TestForm>,
    );

    act(() => {
      getValueStore(form.internal, ["name"]).input.value = "Jane";
    });

    expect(refs.length).toBeGreaterThan(1);
    expect(new Set(refs).size).toBe(1);
  });

  it("wires blur-mode validation through real DOM events", () => {
    const validator = vi.fn(() => null);
    function BlurForm(): ReactElement {
      const f = useForm({
        schema: flatSchema,
        initialInput: { name: "John", age: 5 },
        validator,
        validate: "blur",
      });
      return <TextField form={f} path={["name"]} testId="name" />;
    }
    const { getByTestId } = render(<BlurForm />);

    // A change does not validate in blur mode
    fireEvent.change(getByTestId("name"), { target: { value: "Jane" } });
    expect(validator).not.toHaveBeenCalled();

    fireEvent.blur(getByTestId("name"));
    expect(validator).toHaveBeenCalledTimes(1);
  });

  describe("element registration", () => {
    it("focuses the registered element on a failed validate", () => {
      const { getByTestId, form } = renderTextField(() => [
        { instancePath: "/name", message: "Bad" },
      ]);

      act(() => {
        validate(form(), { shouldFocus: true });
      });

      expect(document.activeElement).toBe(getByTestId("name"));
    });

    it("focuses the fresh element after a remount, not the stale one", () => {
      function Remountable({
        onForm,
      }: {
        onForm: (form: FormStore, remount: () => void) => void;
      }): ReactElement {
        const form = useForm({
          schema: flatSchema,
          initialInput: { name: "John", age: 5 },
          validator: () => [{ instancePath: "/name", message: "Bad" }],
        });
        const [generation, setGeneration] = useState(0);
        onForm(form, () => setGeneration((g) => g + 1));
        return (
          <TextField
            key={generation}
            form={form}
            path={["name"]}
            testId={`name-${generation}`}
          />
        );
      }
      let form!: FormStore;
      let remount!: () => void;
      const { getByTestId } = render(
        <Remountable
          onForm={(f, r) => {
            form = f;
            remount = r;
          }}
        />,
      );
      const staleElement = getByTestId("name-0");

      act(() => remount());
      const freshElement = getByTestId("name-1");
      expect(freshElement).not.toBe(staleElement);

      act(() => {
        validate(form, { shouldFocus: true });
      });

      expect(document.activeElement).toBe(freshElement);
      // The stale element is gone from the store entirely
      expect(
        getValueStore(form.internal, ["name"]).elements,
      ).toStrictEqual([freshElement]);
    });

    it("drops a detached element from the reset baseline on unmount", () => {
      function Toggle({
        onForm,
      }: {
        onForm: (form: FormStore, toggle: () => void) => void;
      }): ReactElement {
        const form = useForm({
          schema: flatSchema,
          initialInput: { name: "John", age: 5 },
        });
        const [show, setShow] = useState(true);
        onForm(form, () => setShow((s) => !s));
        return show ? (
          <TextField form={form} path={["name"]} testId="name" />
        ) : (
          <span />
        );
      }
      let form!: FormStore;
      let toggle!: () => void;
      render(
        <Toggle
          onForm={(f, t) => {
            form = f;
            toggle = t;
          }}
        />,
      );
      expect(getValueStore(form.internal, ["name"]).elements).toHaveLength(1);

      act(() => toggle());

      const store = getValueStore(form.internal, ["name"]);
      expect(store.elements).toHaveLength(0);
      expect(store.initialElements).toHaveLength(0);

      // A reset after the unmount must not resurrect the detached element
      act(() => reset(form));
      expect(store.elements).toHaveLength(0);
    });

    it("does not register duplicate elements after an array reorder", () => {
      const rowsSchema = objectSchema({
        rows: {
          type: "array",
          items: objectSchema({ label: { type: "string" } }),
        },
      });
      function Rows({
        onForm,
      }: {
        onForm: (form: FormStore) => void;
      }): ReactElement {
        const form = useForm({
          schema: rowsSchema,
          initialInput: { rows: [{ label: "a" }, { label: "b" }] },
        });
        const rows = useFieldArray(form, ["rows"]);
        onForm(form);
        return (
          <div>
            {rows.items.map((id, index) => (
              <TextField
                key={id}
                form={form}
                path={["rows", index, "label"]}
                testId={`label-${index}`}
              />
            ))}
          </div>
        );
      }
      let form!: FormStore;
      render(<Rows onForm={(f) => (form = f)} />);

      act(() => {
        swap(form, ["rows"], 0, 1);
      });

      // Each row store owns exactly one element — the reorder transferred
      // them, and the re-run ref callbacks did not duplicate them
      expect(
        getValueStore(form.internal, ["rows", 0, "label"]).elements,
      ).toHaveLength(1);
      expect(
        getValueStore(form.internal, ["rows", 1, "label"]).elements,
      ).toHaveLength(1);
    });
  });
});

describe("useFieldArray", () => {
  const rowsSchema = objectSchema({
    rows: {
      type: "array",
      items: objectSchema({ label: { type: "string" } }),
    },
  });

  function Rows({
    onForm,
  }: {
    onForm: (form: FormStore) => void;
  }): ReactElement {
    const form = useForm({
      schema: rowsSchema,
      initialInput: { rows: [{ label: "a" }, { label: "b" }] },
    });
    const rows = useFieldArray(form, ["rows"]);
    onForm(form);
    return (
      <div>
        {rows.items.map((id, index) => (
          <TextField
            key={id}
            form={form}
            path={["rows", index, "label"]}
            testId={`label-${index}`}
          />
        ))}
      </div>
    );
  }

  it("grows the rendered items on insert", () => {
    let form!: FormStore;
    const { queryByTestId } = render(<Rows onForm={(f) => (form = f)} />);
    expect(queryByTestId("label-2")).toBeNull();

    act(() => {
      insert(form, ["rows"], { initialInput: { label: "c" } });
    });

    expect((queryByTestId("label-2") as HTMLInputElement).value).toBe("c");
  });

  it("keeps item keys stable across a swap so values follow their rows", () => {
    let form!: FormStore;
    const { getByTestId } = render(<Rows onForm={(f) => (form = f)} />);
    expect((getByTestId("label-0") as HTMLInputElement).value).toBe("a");

    act(() => {
      swap(form, ["rows"], 0, 1);
    });

    expect((getByTestId("label-0") as HTMLInputElement).value).toBe("b");
    expect((getByTestId("label-1") as HTMLInputElement).value).toBe("a");
  });

  it("surfaces array-level errors reactively", () => {
    function ArrayErrors(): ReactElement {
      const form = useForm({
        schema: rowsSchema,
        initialInput: { rows: [] },
      });
      const rows = useFieldArray(form, ["rows"]);
      formRef = form;
      return <span data-testid="errors">{rows.errors?.join(",") ?? ""}</span>;
    }
    let formRef!: FormStore;
    const { getByTestId } = render(<ArrayErrors />);
    expect(getByTestId("errors").textContent).toBe("");

    act(() => {
      const store = formRef.internal.children.rows;
      store.validationErrors.value = ["Need at least one row"];
    });

    expect(getByTestId("errors").textContent).toBe("Need at least one row");
  });
});

describe("useForm", () => {
  it("validates on mount only in initial mode", () => {
    const initialValidator = vi.fn(() => null);
    const submitValidator = vi.fn(() => null);

    function InitialForm(): ReactElement {
      useForm({
        schema: flatSchema,
        validator: initialValidator,
        validate: "initial",
      });
      return <span />;
    }
    function SubmitForm(): ReactElement {
      useForm({ schema: flatSchema, validator: submitValidator });
      return <span />;
    }

    render(<InitialForm />);
    render(<SubmitForm />);

    expect(initialValidator).toHaveBeenCalledTimes(1);
    expect(submitValidator).not.toHaveBeenCalled();
  });

  it("re-renders on tracked form state and keeps a stable store reference", () => {
    const refs: FormStore[] = [];
    function Dirty(): ReactElement {
      const form = useForm({
        schema: flatSchema,
        initialInput: { name: "John", age: 5 },
      });
      refs.push(form);
      formRef = form;
      return <span data-testid="dirty">{String(form.isDirty)}</span>;
    }
    let formRef!: FormStore;
    const { getByTestId } = render(<Dirty />);
    expect(getByTestId("dirty").textContent).toBe("false");

    act(() => {
      getValueStore(formRef.internal, ["name"]).input.value = "Jane";
      getValueStore(formRef.internal, ["name"]).isDirty.value = true;
    });

    expect(getByTestId("dirty").textContent).toBe("true");
    expect(new Set(refs).size).toBe(1);
  });
});

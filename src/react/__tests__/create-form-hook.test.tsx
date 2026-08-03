// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workflowFormSchema } from "../../core/vitest/fixtures";
import { getValueStore, objectSchema } from "../../core/vitest/utils";
import { Field, Form } from "../components";
import { createFormHook } from "../create-form-hook";
import type { FormStore, WidgetProps } from "../types";
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
 * Minimal controlled widgets for the registry, each stamping its kind into
 * the DOM and rendering its errors.
 */
function widgetFor(kind: string) {
  return function Widget({ field }: WidgetProps): ReactElement {
    return (
      <div data-kind={kind} data-name={field.name}>
        <input
          data-testid={`field-${field.name}`}
          {...field.props}
          value={String((field.input as string | number | undefined) ?? "")}
          onChange={(event) => field.onChange(event.target.value)}
        />
        {field.errors ? (
          <span data-testid={`errors-${field.name}`}>
            {field.errors.join(",")}
          </span>
        ) : null}
      </div>
    );
  };
}

const { useAppForm, Form: AppForm, Field: AppField } = createFormHook({
  widgets: {
    text: widgetFor("text"),
    textarea: widgetFor("textarea"),
    number: widgetFor("number"),
    boolean: widgetFor("boolean"),
    date: widgetFor("date"),
    select: widgetFor("select"),
  },
  validate: (schema) => {
    // A hand-rolled "compiled validator": required strings must be present
    const required = Array.isArray(schema.required) ? schema.required : [];
    return (input) => {
      const record = input as Record<string, unknown>;
      const issues = required
        .filter((key) => !record[key])
        .map((key) => ({
          instancePath: "",
          keyword: "required",
          message: `must have required property '${key}'`,
          params: { missingProperty: key },
        }));
      return issues.length ? issues : null;
    };
  },
});

describe("createFormHook registry dispatch", () => {
  it("renders the whole workflow form from the schema with zero hand-written fields", () => {
    function Smoke(): ReactElement {
      const form = useAppForm({
        schema: workflowFormSchema,
        initialInput: { borrowerName: "Ada", creditScore: 700 },
      });
      return <AppForm of={form} onSubmit={vi.fn()} />;
    }
    const { container, getByTestId } = render(<Smoke />);

    // Every schema property renders through its registry widget, in order
    const kinds = [...container.querySelectorAll("[data-kind]")].map(
      (node) => `${node.getAttribute("data-name")}:${node.getAttribute("data-kind")}`,
    );
    expect(kinds).toStrictEqual([
      "borrowerName:text",
      "loanPurpose:select",
      "creditScore:number",
      "isEntity:boolean",
      "closingDate:date",
      "notes:textarea",
    ]);
    expect((getByTestId("field-borrowerName") as HTMLInputElement).value).toBe(
      "Ada",
    );
  });

  it("renders the explicit fallback for an unregistered kind", () => {
    const fallback = vi.fn(({ field }: WidgetProps) => (
      <p data-testid="fallback">{field.control}</p>
    ));
    const hook = createFormHook({
      widgets: { text: widgetFor("text") },
      fallback,
    });
    function FallbackForm(): ReactElement {
      const form = hook.useAppForm({
        schema: objectSchema({
          name: { type: "string" },
          amount: { type: "number", "x-field-type": "currency" },
        }),
      });
      return <hook.Form of={form} onSubmit={vi.fn()} />;
    }
    const { getByTestId } = render(<FallbackForm />);

    expect(getByTestId("fallback").textContent).toBe("currency");
  });

  it("renders a visible built-in placeholder without a fallback", () => {
    const hook = createFormHook({ widgets: {} });
    function NoWidgets(): ReactElement {
      const form = hook.useAppForm({
        schema: objectSchema({ name: { type: "string" } }),
      });
      return <hook.Form of={form} onSubmit={vi.fn()} />;
    }
    const { container } = render(<NoWidgets />);

    const placeholder = container.querySelector(
      '[data-slot="jsonisch-unsupported"]',
    );
    expect(placeholder?.textContent).toContain("text");
    expect(placeholder?.textContent).toContain("name");
  });

  it("never renders hidden-kind fields but keeps them in state", () => {
    function Hidden(): ReactElement {
      const form = hook.useAppForm({
        schema: objectSchema({
          name: { type: "string" },
          secret: { type: "string", "x-field-type": "hidden" },
        }),
        initialInput: { name: "a", secret: "kept" },
      });
      formRef = form;
      return <hook.Form of={form} onSubmit={vi.fn()} />;
    }
    const hook = createFormHook({ widgets: { text: widgetFor("text") } });
    let formRef!: FormStore;
    const { container } = render(<Hidden />);

    expect(container.querySelectorAll("[data-kind]")).toHaveLength(1);
    expect(getValueStore(formRef.internal, ["secret"]).input.value).toBe(
      "kept",
    );
  });

  it("compiles the validator once per form and routes its issues", async () => {
    function Invalid(): ReactElement {
      const form = useAppForm({ schema: flatSchema });
      return <AppForm of={form} onSubmit={handler} />;
    }
    const handler = vi.fn();
    const { container, getByTestId } = render(<Invalid />);

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(handler).not.toHaveBeenCalled();
    // flatSchema requires name and age; both errors landed on their fields
    expect(getByTestId("errors-name").textContent).toBe(
      "must have required property 'name'",
    );
  });

  it("supports headless mode when Field receives a render function", () => {
    function Headless(): ReactElement {
      const form = useAppForm({
        schema: flatSchema,
        initialInput: { name: "Ada", age: 1 },
      });
      return (
        <AppForm of={form} onSubmit={vi.fn()}>
          <AppField of={form} path={["name"]}>
            {(field) => (
              <output data-testid="headless">{String(field.input)}</output>
            )}
          </AppField>
        </AppForm>
      );
    }
    const { getByTestId, container } = render(<Headless />);

    expect(getByTestId("headless").textContent).toBe("Ada");
    // Children replace auto-rendering entirely
    expect(container.querySelectorAll("[data-kind]")).toHaveLength(0);
  });

  it("preserves value and meta in the store when a widget unmounts", () => {
    // visibleWhen hide/show retains value — the stated policy
    function Toggle({
      onToggle,
    }: {
      onToggle: (toggle: () => void) => void;
    }): ReactElement {
      const form = useAppForm({
        schema: flatSchema,
        initialInput: { name: "Ada", age: 1 },
      });
      const [show, setShow] = useState(true);
      onToggle(() => setShow((s) => !s));
      formRef = form;
      return (
        <AppForm of={form} onSubmit={vi.fn()}>
          {show ? <AppField of={form} path={["name"]} /> : <span />}
        </AppForm>
      );
    }
    let formRef!: FormStore;
    let toggle!: () => void;
    const { getByTestId, queryByTestId } = render(
      <Toggle onToggle={(t) => (toggle = t)} />,
    );

    fireEvent.change(getByTestId("field-name"), {
      target: { value: "Grace" },
    });
    fireEvent.focus(getByTestId("field-name"));

    act(() => toggle());
    expect(queryByTestId("field-name")).toBeNull();

    const store = getValueStore(formRef.internal, ["name"]);
    expect(store.input.value).toBe("Grace");
    expect(store.isDirty.value).toBe(true);
    expect(store.isTouched.value).toBe(true);

    // Remount reads the preserved state back
    act(() => toggle());
    expect((getByTestId("field-name") as HTMLInputElement).value).toBe(
      "Grace",
    );
  });
});

describe("headless Form and Field components", () => {
  it("renders a noValidate form and submits the validated output", async () => {
    const handler = vi.fn();
    function Plain(): ReactElement {
      const form = useForm({
        schema: flatSchema,
        initialInput: { name: "Ada", age: 1 },
      });
      return (
        <Form of={form} onSubmit={handler} data-testid="form">
          <button type="submit">Save</button>
        </Form>
      );
    }
    const { getByTestId } = render(<Plain />);
    const formElement = getByTestId("form") as HTMLFormElement;
    expect(formElement.noValidate).toBe(true);

    await act(async () => {
      fireEvent.submit(formElement);
    });

    expect(handler).toHaveBeenCalledExactlyOnceWith(
      { name: "Ada", age: 1 },
      expect.anything(),
    );
  });

  it("blocks the handler when validation fails", async () => {
    const handler = vi.fn();
    function Invalid(): ReactElement {
      const form = useForm({
        schema: flatSchema,
        validator: () => [{ instancePath: "/name", message: "Bad" }],
      });
      formRef = form;
      return <Form of={form} onSubmit={handler} data-testid="form" />;
    }
    let formRef!: FormStore;
    const { getByTestId } = render(<Invalid />);

    await act(async () => {
      fireEvent.submit(getByTestId("form"));
    });

    expect(handler).not.toHaveBeenCalled();
    expect(getValueStore(formRef.internal, ["name"]).errors.value).toStrictEqual(
      ["Bad"],
    );
  });

  it("passes the reactive field store to a Field render function", () => {
    function Headless(): ReactElement {
      const form = useForm({
        schema: flatSchema,
        initialInput: { name: "Ada", age: 1 },
      });
      formRef = form;
      return (
        <Field of={form} path={["name"]}>
          {(field) => <span data-testid="out">{String(field.input)}</span>}
        </Field>
      );
    }
    let formRef!: FormStore;
    const { getByTestId } = render(<Headless />);
    expect(getByTestId("out").textContent).toBe("Ada");

    act(() => {
      getValueStore(formRef.internal, ["name"]).input.value = "Grace";
    });

    expect(getByTestId("out").textContent).toBe("Grace");
  });
});

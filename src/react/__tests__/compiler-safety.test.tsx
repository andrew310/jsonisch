// @vitest-environment jsdom
// The LOS-567 regression class: the React Compiler (enabled for every .tsx
// file in this package's vitest pipeline — see vitest.config.ts) memoizes
// widget JSX on its props. Any reactivity model where a widget's reactive
// reads must physically re-execute every render (the v1 `useSignals` getter
// model) silently deafens under that memoization: the compiler sees a stable
// `field` prop, returns cached JSX, the elided reads drop their
// subscriptions, and the widget never updates again. These tests pin the v2
// contract: widgets are plain components over snapshot props — no signal
// hook, no `"use no memo"` directive — and stay live under the compiler.
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { CalcEngine } from "../../core/types";
import { objectSchema } from "../../core/vitest/utils";
import type { FieldStore, FormStore } from "../types";
import { useField } from "../use-field";
import { useForm } from "../use-form";

// Repo gotcha: vitest runs without globals, so React Testing Library's
// auto-cleanup never registers — clean up explicitly.
afterEach(() => {
  cleanup();
});

/**
 * A sum engine over the deps named in the expression (`a + b` shape) — the
 * minimal stand-in for `@rwa/formulas`.
 */
const sumEngine: CalcEngine = {
  parse: (formula) => ({
    ok: true,
    node: formula.split("+").map((part) => part.trim()),
  }),
  evaluate: (node, scope) =>
    (node as string[]).reduce(
      (sum, dep) => sum + (Number(scope[dep]) || 0),
      0,
    ),
  extractDependencies: (node) => node as string[],
};

const schema = objectSchema({
  purchasePrice: { type: "number" },
  rehabBudget: { type: "number" },
  totalLoanAmount: {
    type: "number",
    "x-field-type": "calculated",
    "x-formula": "purchasePrice + rehabBudget",
  },
});

/**
 * The app's widget shape (see `components/jsonisch-form/derived-widgets.tsx`):
 * a plain component over the `field` snapshot. Deliberately NO signal hook
 * and NO `"use no memo"` directive — that absence is what these tests pin.
 */
function FormulaWidget({ field }: { field: FieldStore }): ReactElement {
  const state = field.derived;
  return (
    <output data-testid={field.name}>
      {state?.error !== null && state?.error !== undefined
        ? "#ERROR"
        : String(state?.value ?? "")}
    </output>
  );
}

function NumberWidget({ field }: { field: FieldStore }): ReactElement {
  return (
    <input
      data-testid={field.name}
      value={(field.input as number | undefined) ?? ""}
      onChange={(event) => field.onChange(Number(event.target.value))}
    />
  );
}

/** The registry-dispatch shape: one component per field, `field` as a prop. */
function BoundField({
  form,
  name,
}: {
  form: FormStore;
  name: string;
}): ReactElement {
  const field = useField(form, [name]);
  const Widget = field.control === "formula" ? FormulaWidget : NumberWidget;
  return <Widget field={field} />;
}

function LoanSizingForm({
  onForm,
}: {
  onForm?: (form: FormStore) => void;
}): ReactElement {
  const form = useForm({
    schema,
    initialInput: { purchasePrice: 450000, rehabBudget: 50000 },
    calcEngine: sumEngine,
  });
  onForm?.(form);
  return (
    <div>
      <BoundField form={form} name="purchasePrice" />
      <BoundField form={form} name="rehabBudget" />
      <BoundField form={form} name="totalLoanAmount" />
    </div>
  );
}

describe("compiler safety (LOS-567 regression)", () => {
  it("a formula widget updates when a dependency changes — repeatedly", () => {
    const { getByTestId } = render(<LoanSizingForm />);
    expect(getByTestId("totalLoanAmount").textContent).toBe("500000");

    // First dep edit: the memoized-elided-reads failure already shows here
    fireEvent.change(getByTestId("purchasePrice"), {
      target: { value: "475000" },
    });
    expect(getByTestId("totalLoanAmount").textContent).toBe("525000");

    // Second edit through the OTHER dep: catches the deafen-after-first-
    // notification class (subscription consumed, never re-established)
    fireEvent.change(getByTestId("rehabBudget"), {
      target: { value: "60000" },
    });
    expect(getByTestId("totalLoanAmount").textContent).toBe("535000");

    // And again through the first dep — no one-shot decay
    fireEvent.change(getByTestId("purchasePrice"), {
      target: { value: "480000" },
    });
    expect(getByTestId("totalLoanAmount").textContent).toBe("540000");
  });

  it("an input widget echoes its own edits", () => {
    const { getByTestId } = render(<LoanSizingForm />);
    const input = getByTestId("purchasePrice") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "111000" } });
    expect(input.value).toBe("111000");

    fireEvent.change(input, { target: { value: "222000" } });
    expect(input.value).toBe("222000");
  });
});

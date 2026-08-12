// @vitest-environment jsdom
// The LOS-604 surface: plugins contribute their react field members via
// `fieldSnapshot` — the adapter itself knows no plugin's vocabulary. These
// tests pin the three load-bearing properties of that seam: contributions
// land flat on the field snapshot and stay reactive, contributed callbacks
// keep a stable identity (a fresh closure would defeat the equality gate),
// and the collision guard throws instead of silently shadowing.
import { act, cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "../../core/framework";
import { PluginKey } from "../../core/plugin/key";
import type { JsonischPlugin } from "../../core/plugin/types";
import type { CalcEngine, JsonSchema } from "../../core/types";
import { objectSchema, testPlugins } from "../../core/vitest/utils";
import type { FieldStore, FormStore } from "../types";
import { useField } from "../use-field";
import { useForm } from "../use-form";

// Repo gotcha: vitest runs without globals, so React Testing Library's
// auto-cleanup never registers — clean up explicitly.
afterEach(() => {
  cleanup();
});

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);

/** Stub engine with one formula: `double` = a * 2. */
const doubleEngine: CalcEngine = {
  parse: (formula) =>
    formula === "double"
      ? { ok: true, node: "double" }
      : { ok: false, error: `Unparseable formula: ${formula}` },
  evaluate: (_node, scope) => num(scope.a) * 2,
  extractDependencies: () => ["a"],
};

const estimateSchema = objectSchema({
  a: { type: "number" },
  fee: { type: "number", "x-field-type": "computed", "x-formula": "double" },
});

const hybridSchema = objectSchema({
  cost: {
    type: "string",
    "x-field-type": "hybrid",
    "x-hybrid-default-denominator": "loanAmount",
  },
});

function Harness({
  schema,
  initialInput,
  engine,
  plugins,
  path,
  onField,
}: {
  schema: JsonSchema;
  initialInput: Record<string, unknown>;
  engine?: CalcEngine;
  plugins?: JsonischPlugin<unknown>[];
  path: string[];
  onField: (field: FieldStore, form: FormStore) => void;
}): ReactElement {
  const form = useForm({
    schema,
    initialInput,
    plugins: plugins ?? testPlugins(engine),
  });
  const field = useField(form, path);
  onField(field, form);
  return (
    <input
      data-testid="field"
      {...field.props}
      value={(field.input as string | number | undefined) ?? ""}
      onChange={(event) => field.onChange(event.target.value)}
    />
  );
}

describe("plugin fieldSnapshot contributions", () => {
  it("surfaces the envelopes + derivation members on an estimate field", () => {
    let field!: FieldStore;
    render(
      <Harness
        schema={estimateSchema}
        initialInput={{ a: 10 }}
        engine={doubleEngine}
        path={["fee"]}
        onField={(f) => (field = f)}
      />,
    );

    expect(field.mode).toBe("estimate");
    expect(typeof field.setMode).toBe("function");
    expect(field.derived).toEqual({ value: 20, error: null });
    expect(field.formulaValue).toEqual({ value: 20, error: null });
    // The envelopes plugin contributes nothing hybrid-family here
    expect(field.entryMode).toBeUndefined();
    expect(field.percentBasis).toBeUndefined();
  });

  it("flips mode through the contributed setMode and re-snapshots", () => {
    let field!: FieldStore;
    render(
      <Harness
        schema={estimateSchema}
        initialInput={{ a: 10 }}
        engine={doubleEngine}
        path={["fee"]}
        onField={(f) => (field = f)}
      />,
    );

    const before = field;
    act(() => before.setMode("formula"));

    expect(field.mode).toBe("formula");
    expect(field).not.toBe(before);
  });

  it("surfaces hybrid entry state and setters on an amount-or-percent field", () => {
    let field!: FieldStore;
    render(
      <Harness
        schema={hybridSchema}
        initialInput={{}}
        path={["cost"]}
        onField={(f) => (field = f)}
      />,
    );

    expect(field.entryMode).toBe("amount");
    expect(field.percentBasis).toBe("loanAmount");

    act(() => field.setEntryMode("percent"));
    expect(field.entryMode).toBe("percent");

    act(() => field.setPercentBasis("purchasePrice"));
    expect(field.percentBasis).toBe("purchasePrice");

    // Source-family members are absent on a hybrid field
    expect(field.mode).toBeUndefined();
    expect(field.derived).toBeUndefined();
  });

  it("keeps contributed callback identities stable across snapshots", () => {
    const fields: FieldStore[] = [];
    render(
      <Harness
        schema={hybridSchema}
        initialInput={{}}
        path={["cost"]}
        onField={(f) => fields.push(f)}
      />,
    );

    const first = fields.at(-1)!;
    act(() => first.setEntryMode("percent"));
    const second = fields.at(-1)!;

    // New snapshot identity (the value changed) — same callbacks
    expect(second).not.toBe(first);
    expect(second.entryMode).toBe("percent");
    expect(second.setEntryMode).toBe(first.setEntryMode);
    expect(second.setPercentBasis).toBe(first.setPercentBasis);
  });

  it("re-renders when a signal read inside a custom fieldSnapshot changes", () => {
    const flag = createSignal("off");
    const key = new PluginKey<null>("test-flag");
    const flagPlugin: JsonischPlugin<null> = {
      name: "test-flag",
      key,
      build: () => null,
      fieldSnapshot: () => ({ testFlag: flag.value }),
    };

    const fields: FieldStore[] = [];
    render(
      <Harness
        schema={objectSchema({ name: { type: "string" } })}
        initialInput={{ name: "x" }}
        plugins={[flagPlugin]}
        path={["name"]}
        onField={(f) => fields.push(f)}
      />,
    );

    expect(
      (fields.at(-1) as FieldStore & { testFlag?: string }).testFlag,
    ).toBe("off");

    act(() => {
      flag.value = "on";
    });
    expect(
      (fields.at(-1) as FieldStore & { testFlag?: string }).testFlag,
    ).toBe("on");
  });

  it("throws when a plugin claims a core snapshot member", () => {
    const key = new PluginKey<null>("test-clobber");
    const clobber: JsonischPlugin<null> = {
      name: "test-clobber",
      key,
      build: () => null,
      fieldSnapshot: () => ({ input: "shadowed" }),
    };

    // The guard fires inside the initial tracked read, i.e. during render
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <Harness
          schema={objectSchema({ name: { type: "string" } })}
          initialInput={{}}
          plugins={[clobber]}
          path={["name"]}
          onField={() => {}}
        />,
      ),
    ).toThrow(/"test-clobber".*"input".*core field member/);
    silence.mockRestore();
  });

  it("throws when two plugins contribute the same key", () => {
    const one: JsonischPlugin<null> = {
      name: "test-one",
      key: new PluginKey("test-one"),
      build: () => null,
      fieldSnapshot: () => ({ shared: 1 }),
    };
    const two: JsonischPlugin<null> = {
      name: "test-two",
      key: new PluginKey("test-two"),
      build: () => null,
      fieldSnapshot: () => ({ shared: 2 }),
    };

    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <Harness
          schema={objectSchema({ name: { type: "string" } })}
          initialInput={{}}
          plugins={[one, two]}
          path={["name"]}
          onField={() => {}}
        />,
      ),
    ).toThrow(/"test-one" and "test-two" both contribute.*"shared"/);
    silence.mockRestore();
  });
});

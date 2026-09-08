import { describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";

import { createFormStore } from "../../../core/form/create-form-store";
import { setInput } from "../../../methods/set-input";
import { setOffFormValues } from "../../../methods/set-off-form-values";
import { envelopes } from "../../envelopes/plugin";
import type { CalcEngine, JsonSchema } from "../../../core/types";
import { checks, checksKey, replaceCheckInstances } from "../plugin";
import { formulaCheck, UNEVALUABLE_MESSAGE_ID } from "../formula";
import type { Finding } from "../types";

interface StubNode {
  deps: string[];
  pathRefs?: Array<{ collection: string; field: string }>;
  fn: Mock<(scope: Record<string, unknown>) => unknown>;
}

function stub(
  deps: string[],
  fn: (scope: Record<string, unknown>) => unknown,
  pathRefs?: Array<{ collection: string; field: string }>,
): StubNode {
  return { deps, pathRefs, fn: vi.fn(fn) };
}

function makeEngine(exprs: Record<string, StubNode>): CalcEngine {
  return {
    parse: (formula) => {
      if (formula === "" || !formula.trim()) {
        return { ok: false, error: "Empty formula" };
      }
      return Object.prototype.hasOwnProperty.call(exprs, formula)
        ? { ok: true, node: exprs[formula] }
        : { ok: false, error: `Unparseable formula: ${formula}` };
    },
    evaluate: (node, scope) => (node as StubNode).fn(scope),
    extractDependencies: (node) => (node as StubNode).deps,
    extractPathRefs: (node) => (node as StubNode).pathRefs ?? [],
  };
}

const schema: JsonSchema = {
  type: "object",
  properties: {
    borrowerName: { type: "string" },
    ltv: { type: "number" },
    assets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          aiv: { type: "number" },
        },
      },
    },
  },
};

function findingsOf(form: ReturnType<typeof createFormStore>): readonly Finding[] {
  return checksKey.getState(form)!.findings.value;
}

describe("checks plugin", () => {
  test("severity 'off' is never constructed", () => {
    const create = vi.fn(() => ({ evaluate() {} }));
    const form = createFormStore({
      schema,
      plugins: [
        envelopes(),
        checks({
          definitions: {
            formula: {
              meta: { name: "formula", messages: {} },
              create,
            },
          },
          instances: [
            {
              id: "quiet",
              check: "formula",
              severity: "off",
              options: { formula: "1" },
            },
          ],
        }),
      ],
    });
    expect(create).not.toHaveBeenCalled();
    expect(findingsOf(form)).toEqual([]);
  });

  test("a wrong-typed option throws naming the row, never skips silently", () => {
    const engine = makeEngine({});
    expect(() =>
      createFormStore({
        schema,
        plugins: [
          envelopes(),
          checks({
            definitions: { formula: formulaCheck(engine) },
            instances: [
              {
                id: "row-abc",
                check: "formula",
                severity: "error",
                options: { formula: 12 as unknown as string },
              },
            ],
          }),
        ],
      }),
    ).toThrow(/row-abc/);
  });

  test("unknown definition throws naming the instance", () => {
    expect(() =>
      createFormStore({
        schema,
        plugins: [
          envelopes(),
          checks({
            definitions: {},
            instances: [
              { id: "row-x", check: "nope", severity: "warning", options: {} },
            ],
          }),
        ],
      }),
    ).toThrow(/row-x/);
  });

  test("a false formula emits a finding at the configured severity", () => {
    const engine = makeEngine({
      "ltv < 0.8": stub(["ltv"], (scope) => (scope.ltv as number) < 0.8),
    });
    const form = createFormStore({
      schema,
      initialInput: { ltv: 0.95 },
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "ltv-cap",
              check: "formula",
              severity: "warning",
              options: {
                formula: "ltv < 0.8",
                message: "LTV too high",
                name: "LTV cap",
                targetFieldKeys: ["ltv"],
              },
            },
          ],
        }),
      ],
    });
    const findings = findingsOf(form);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "ltv-cap",
      checkId: "formula",
      severity: "warning",
      message: "LTV too high",
      path: ["ltv"],
    });
    expect(checksKey.getState(form)!.hasBlockingFinding.value).toBe(false);
  });

  test("error-severity findings set hasBlockingFinding", () => {
    const engine = makeEngine({
      false: stub([], () => false),
    });
    const form = createFormStore({
      schema,
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "must",
              check: "formula",
              severity: "error",
              options: { formula: "false", message: "nope" },
            },
          ],
        }),
      ],
    });
    expect(checksKey.getState(form)!.hasBlockingFinding.value).toBe(true);
  });

  test("indeterminate (null/undefined) passes", () => {
    const engine = makeEngine({
      "ltv < 0.8": stub(["ltv"], () => null),
    });
    const form = createFormStore({
      schema,
      initialInput: { ltv: undefined },
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "ltv-cap",
              check: "formula",
              severity: "error",
              options: { formula: "ltv < 0.8", message: "LTV too high" },
            },
          ],
        }),
      ],
    });
    expect(findingsOf(form)).toEqual([]);
    expect(checksKey.getState(form)!.hasBlockingFinding.value).toBe(false);
  });

  test("a throwing evaluate degrades to one finding at the configured severity", () => {
    const engine = makeEngine({
      boom: stub(["ltv"], () => {
        throw new Error("division by zero");
      }),
    });
    const form = createFormStore({
      schema,
      initialInput: { ltv: 1 },
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "boom",
              check: "formula",
              severity: "info",
              options: { formula: "boom", message: "never shown" },
            },
          ],
        }),
      ],
    });
    const findings = findingsOf(form);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
    expect(findings[0]?.messageId).toBe(UNEVALUABLE_MESSAGE_ID);
    expect(findings[0]?.message).toMatch(/division by zero/i);
    expect(checksKey.getState(form)!.hasBlockingFinding.value).toBe(false);
  });

  test("off-stage reads fall through to offFormValues", () => {
    const engine = makeEngine({
      "ltv < 0.8": stub(["ltv"], (scope) => (scope.ltv as number) < 0.8),
    });
    const form = createFormStore({
      schema: {
        type: "object",
        properties: { borrowerName: { type: "string" } },
      },
      offFormValues: { ltv: 0.95 },
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "ltv-cap",
              check: "formula",
              severity: "error",
              options: {
                formula: "ltv < 0.8",
                message: "LTV too high",
                targetFieldKeys: ["ltv"],
              },
            },
          ],
        }),
      ],
    });
    expect(findingsOf(form)[0]?.message).toBe("LTV too high");
  });

  test("typing an unrelated field does not re-run a check", () => {
    const node = stub(["ltv"], (scope) => (scope.ltv as number) < 0.8);
    const engine = makeEngine({ "ltv < 0.8": node });
    const form = createFormStore({
      schema,
      initialInput: { ltv: 0.5, borrowerName: "" },
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "ltv-cap",
              check: "formula",
              severity: "error",
              options: { formula: "ltv < 0.8", message: "LTV too high" },
            },
          ],
        }),
      ],
    });
    findingsOf(form);
    node.fn.mockClear();
    setInput(form, ["borrowerName"], "Ada");
    findingsOf(form);
    expect(node.fn).not.toHaveBeenCalled();
    setInput(form, ["ltv"], 0.9);
    findingsOf(form);
    expect(node.fn).toHaveBeenCalled();
  });

  test("setOffFormValues retriggers a check that reads the shelf", () => {
    const node = stub(["ltv"], (scope) => (scope.ltv as number) < 0.8);
    const engine = makeEngine({ "ltv < 0.8": node });
    const form = createFormStore({
      schema: {
        type: "object",
        properties: { borrowerName: { type: "string" } },
      },
      offFormValues: { ltv: 0.5 },
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "ltv-cap",
              check: "formula",
              severity: "error",
              options: { formula: "ltv < 0.8", message: "LTV too high" },
            },
          ],
        }),
      ],
    });
    expect(findingsOf(form)).toEqual([]);
    setOffFormValues(form, { ltv: 0.95 });
    expect(findingsOf(form)).toHaveLength(1);
  });

  test("blank formula does not throw; findings include unevaluable", () => {
    const engine = makeEngine({});
    let form: ReturnType<typeof createFormStore>;
    expect(() => {
      form = createFormStore({
        schema,
        plugins: [
          envelopes(),
          checks({
            definitions: { formula: formulaCheck(engine) },
            instances: [
              {
                id: "blank",
                check: "formula",
                severity: "error",
                options: { formula: "", message: "never", name: "Blank" },
              },
            ],
          }),
        ],
      });
    }).not.toThrow();
    const findings = findingsOf(form!);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.messageId).toBe(UNEVALUABLE_MESSAGE_ID);
    expect(findings[0]?.message).toMatch(/Empty formula/i);
  });

  test("loan[fundingDate] resolves the root record, not rows()", () => {
    const node = stub(
      ["loan"],
      (scope) => {
        const loan = scope.loan as { fundingDate?: string } | undefined;
        return loan?.fundingDate != null;
      },
      [{ collection: "loan", field: "fundingDate" }],
    );
    const engine = makeEngine({ "loan[fundingDate] != null": node });
    const form = createFormStore({
      schema: {
        type: "object",
        properties: { borrowerName: { type: "string" } },
      },
      offFormValues: { loan: { fundingDate: "2026-01-01" } },
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "funded",
              check: "formula",
              severity: "error",
              options: {
                formula: "loan[fundingDate] != null",
                message: "needs funding date",
              },
            },
          ],
        }),
      ],
    });
    const findings = findingsOf(form);
    expect(findings).toEqual([]);
    expect(node.fn).toHaveBeenCalled();
    const scope = node.fn.mock.calls[0]![0];
    expect(scope.loan).toEqual({ fundingDate: "2026-01-01" });
    expect(Array.isArray(scope.loan)).toBe(false);
  });

  test("replaceCheckInstances swaps live instances without recreating the store", () => {
    const engine = makeEngine({
      false: stub([], () => false),
    });
    const form = createFormStore({
      schema,
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [],
        }),
      ],
    });
    expect(findingsOf(form)).toEqual([]);
    replaceCheckInstances(form, {
      definitions: { formula: formulaCheck(engine) },
      instances: [
        {
          id: "must",
          check: "formula",
          severity: "error",
          options: { formula: "false", message: "blocked" },
        },
      ],
    });
    const findings = findingsOf(form);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toBe("blocked");
    expect(checksKey.getState(form)!.hasBlockingFinding.value).toBe(true);
  });

  test("parse failure keeps target paths and the engine error", () => {
    const engine = makeEngine({});
    const form = createFormStore({
      schema,
      plugins: [
        envelopes(),
        checks({
          definitions: { formula: formulaCheck(engine) },
          instances: [
            {
              id: "bad",
              check: "formula",
              severity: "error",
              options: {
                formula: "FOO(1)",
                message: "never shown",
                targetFieldKeys: ["ltv"],
              },
            },
          ],
        }),
      ],
    });
    const findings = findingsOf(form);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toEqual(["ltv"]);
    expect(findings[0]?.messageId).toBe(UNEVALUABLE_MESSAGE_ID);
    expect(findings[0]?.message).toMatch(/Unparseable formula: FOO\(1\)/);
  });
});

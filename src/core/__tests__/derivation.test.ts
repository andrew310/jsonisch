import { describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";

import { applyBaseline } from "../../methods/apply-baseline";
import { insert } from "../../methods/array-ops";
import { getDirtyPaths } from "../../methods/get-dirty-paths";
import { setErrors } from "../../methods/errors";
import { setInput } from "../../methods/set-input";
import { setOffFormValues } from "../../methods/set-off-form-values";
import { resolveScopeValueAt } from "../derivation/resolve-scope-value";
import { getFieldBool } from "../field/get-field-bool";
import { batch } from "../framework";
import { createFormStore } from "../form/create-form-store";
import { validateFormInput } from "../form/validate-form-input";
import { getValueStore, objectSchema } from "../vitest/utils";
import type { CalcEngine, JsonSchema } from "../types";

/**
 * Stub calc engine: each `x-formula` string keys into a registry of nodes
 * carrying their declared deps and a spyable eval function — the tests
 * exercise the derivation layer's wiring, not expression parsing (the
 * interop suite runs the real `@rwa/formulas` engine).
 *
 * NOTE: this suite runs on the REAL signal implementation (no framework
 * mock) — recompute counting and invalidation are the subject under test.
 */
interface StubNode {
  deps: string[];
  fn: Mock<(scope: Record<string, unknown>) => unknown>;
  pathRefs?: Array<{ collection: string; field: string }>;
}

function stub(
  deps: string[],
  fn: (scope: Record<string, unknown>) => unknown,
  pathRefs?: Array<{ collection: string; field: string }>,
): StubNode {
  return { deps, fn: vi.fn(fn), pathRefs };
}

function makeEngine(exprs: Record<string, StubNode>): CalcEngine {
  return {
    parse: (formula) =>
      Object.prototype.hasOwnProperty.call(exprs, formula)
        ? { ok: true, node: exprs[formula] }
        : { ok: false, error: `Unparseable formula: ${formula}` },
    evaluate: (node, scope) => (node as StubNode).fn(scope),
    extractDependencies: (node) => (node as StubNode).deps,
    extractPathRefs: (node) => (node as StubNode).pathRefs ?? [],
  };
}

function formulaField(formula: string, extra?: JsonSchema): JsonSchema {
  return { type: "number", "x-field-type": "calculated", "x-formula": formula, ...extra };
}

function estimateField(formula: string): JsonSchema {
  return {
    type: "number",
    "x-field-type": "computed",
    "x-formula": formula,
  };
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);

describe("derivation", () => {
  describe("computed formula fields", () => {
    test("should compute a formula field from its deps' inputs", () => {
      const exprs = { sum: stub(["a", "b"], (s) => num(s.a) + num(s.b)) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          b: { type: "number" },
          total: formulaField("sum"),
        }),
        initialInput: { a: 2, b: 3 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["total"]).derived?.value).toStrictEqual({
        value: 5,
        error: null,
      });
    });

    test("should recompute when a dep's input changes and stay cached otherwise", () => {
      const exprs = { sum: stub(["a", "b"], (s) => num(s.a) + num(s.b)) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          b: { type: "number" },
          unrelated: { type: "string" },
          total: formulaField("sum"),
        }),
        initialInput: { a: 2, b: 3, unrelated: "x" },
        calcEngine: makeEngine(exprs),
      });
      const total = getValueStore(store, ["total"]);
      expect(total.derived!.value.value).toBe(5);
      expect(total.derived!.value.value).toBe(5);
      expect(exprs.sum.fn).toHaveBeenCalledTimes(1);

      // An unrelated edit must not invalidate the computed
      setInput(store, ["unrelated"], "y");
      expect(total.derived!.value.value).toBe(5);
      expect(exprs.sum.fn).toHaveBeenCalledTimes(1);

      setInput(store, ["a"], 10);
      expect(total.derived!.value.value).toBe(13);
      expect(exprs.sum.fn).toHaveBeenCalledTimes(2);
    });

    test("should evaluate a batch of dep writes once on the next read", () => {
      const exprs = { sum: stub(["a", "b"], (s) => num(s.a) + num(s.b)) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          b: { type: "number" },
          total: formulaField("sum"),
        }),
        initialInput: { a: 1, b: 1 },
        calcEngine: makeEngine(exprs),
      });
      const total = getValueStore(store, ["total"]);
      expect(total.derived!.value.value).toBe(2);
      batch(() => {
        setInput(store, ["a"], 10);
        setInput(store, ["b"], 20);
      });
      expect(total.derived!.value.value).toBe(30);
      expect(exprs.sum.fn).toHaveBeenCalledTimes(2);
    });

    test("should chain formulas through derived signals in dependency order", () => {
      const exprs = {
        double: stub(["a"], (s) => num(s.a) * 2),
        plusOne: stub(["b"], (s) => num(s.b) + 1),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          b: formulaField("double"),
          c: formulaField("plusOne"),
        }),
        initialInput: { a: 5 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["c"]).derived!.value.value).toBe(11);

      setInput(store, ["a"], 10);
      expect(getValueStore(store, ["c"]).derived!.value.value).toBe(21);
      expect(getValueStore(store, ["b"]).derived!.value.value).toBe(20);
    });

    test("should chain through the FRESH derived value, not a stale stored input", () => {
      // A persisted formula output decoded into the form (b: 999) must never
      // feed a downstream formula — the derived signal is always fresh
      const exprs = {
        double: stub(["a"], (s) => num(s.a) * 2),
        plusOne: stub(["b"], (s) => num(s.b) + 1),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          b: formulaField("double"),
          c: formulaField("plusOne"),
        }),
        initialInput: { a: 5, b: 999 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["c"]).derived!.value.value).toBe(11);
    });
  });

  describe("scope resolution (the single path)", () => {
    test("should let the form value win over offFormValues", () => {
      const exprs = { echo: stub(["a"], (s) => s.a) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          out: formulaField("echo"),
        }),
        initialInput: { a: 7 },
        offFormValues: { a: 100 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(7);
    });

    test("should let an explicit null form value win over offFormValues", () => {
      const exprs = { echo: stub(["a"], (s) => s.a) };
      const store = createFormStore({
        schema: objectSchema(
          {
            a: { type: ["number", "null"] },
            out: formulaField("echo"),
          },
          [],
        ),
        initialInput: { a: 42 },
        offFormValues: { a: 100 },
        calcEngine: makeEngine(exprs),
      });
      setInput(store, ["a"], null);
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(null);
    });

    test("should fill only undefined form values from offFormValues", () => {
      const exprs = { echo: stub(["a"], (s) => s.a) };
      const store = createFormStore({
        schema: objectSchema(
          {
            a: { type: "number" },
            out: formulaField("echo"),
          },
          [],
        ),
        offFormValues: { a: 100 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(100);
    });

    test("should resolve a schema-absent (soft-deleted) dep from offFormValues", () => {
      const exprs = { echo: stub(["ghost"], (s) => s.ghost) };
      const store = createFormStore({
        schema: objectSchema({ out: formulaField("echo") }),
        offFormValues: { ghost: 55 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(55);
    });

    test("should pass undefined for a dep that resolves nowhere", () => {
      const exprs = { echo: stub(["nowhere"], (s) => s.nowhere) };
      const store = createFormStore({
        schema: objectSchema({ out: formulaField("echo") }),
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(undefined);
    });
  });

  describe("collection overlay", () => {
    const rowSchema: JsonSchema = {
      type: "object",
      properties: { id: { type: "string" }, v: { type: "number" } },
      required: ["id"],
    };

    test("should merge canonical rows with live form rows (live wins, canonical fills)", () => {
      const exprs = {
        rollup: stub(
          ["items"],
          (s) =>
            (s.items as Array<Record<string, unknown>>).reduce(
              (acc, row) => acc + num(row.v ?? row.hidden),
              0,
            ),
          [{ collection: "items", field: "v" }],
        ),
      };
      const store = createFormStore({
        schema: objectSchema({
          items: { type: "array", items: rowSchema },
          total: formulaField("rollup"),
        }),
        initialInput: { items: [{ id: "r1", v: 1 }, { id: "r2", v: 2 }] },
        // Canonical rows carry server-only columns and a row (r3) the live
        // form no longer holds — membership must come from the live side
        offFormValues: {
          items: [
            { id: "r1", v: 100, serverOnly: true },
            { id: "r3", v: 1000 },
          ],
        },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["total"]).derived!.value.value).toBe(3);
      const scope = exprs.rollup.fn.mock.calls[0][0] as Record<string, unknown>;
      // Canonical enriched the live row with the server-only column
      expect(scope.items).toStrictEqual([
        { id: "r1", v: 1, serverOnly: true },
        { id: "r2", v: 2 },
      ]);
    });

    test("should recompute a rollup when a live row's field changes", () => {
      const exprs = {
        rollup: stub(
          ["items"],
          (s) =>
            (s.items as Array<Record<string, unknown>>).reduce(
              (acc, row) => acc + num(row.v),
              0,
            ),
          [{ collection: "items", field: "v" }],
        ),
      };
      const store = createFormStore({
        schema: objectSchema({
          items: { type: "array", items: rowSchema },
          total: formulaField("rollup"),
        }),
        initialInput: { items: [{ id: "r1", v: 1 }, { id: "r2", v: 2 }] },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["total"]).derived!.value.value).toBe(3);
      setInput(store, ["items", 1, "v"], 40);
      expect(getValueStore(store, ["total"]).derived!.value.value).toBe(41);
    });

    test("should use canonical rows directly when the form has no collection field", () => {
      const exprs = {
        rollup: stub(
          ["assets"],
          (s) =>
            (s.assets as Array<Record<string, unknown>>).reduce(
              (acc, row) => acc + num(row.aiv),
              0,
            ),
          [{ collection: "assets", field: "aiv" }],
        ),
      };
      const store = createFormStore({
        schema: objectSchema({ total: formulaField("rollup") }),
        offFormValues: { assets: [{ id: "a1", aiv: 500 }, { id: "a2", aiv: 250 }] },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["total"]).derived!.value.value).toBe(750);
    });
  });

  describe("settable offFormValues", () => {
    test("should re-resolve dependents when offFormValues is set", () => {
      const exprs = { echo: stub(["base"], (s) => s.base) };
      const store = createFormStore({
        schema: objectSchema({ out: formulaField("echo") }),
        offFormValues: { base: 1 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(1);
      setOffFormValues(store, { base: 2 });
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(2);
      expect(exprs.echo.fn).toHaveBeenCalledTimes(2);
    });

    test("should re-resolve each dependent exactly once per write", () => {
      const exprs = {
        echoA: stub(["base"], (s) => s.base),
        echoB: stub(["base"], (s) => num(s.base) * 2),
      };
      const store = createFormStore({
        schema: objectSchema({
          outA: formulaField("echoA"),
          outB: formulaField("echoB"),
        }),
        offFormValues: { base: 1 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["outA"]).derived!.value.value).toBe(1);
      expect(getValueStore(store, ["outB"]).derived!.value.value).toBe(2);
      setOffFormValues(store, { base: 10 });
      expect(getValueStore(store, ["outA"]).derived!.value.value).toBe(10);
      expect(getValueStore(store, ["outB"]).derived!.value.value).toBe(20);
      expect(exprs.echoA.fn).toHaveBeenCalledTimes(2);
      expect(exprs.echoB.fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("applyBaseline reconcile", () => {
    test("should recompute once when values and offFormValues rebase in one batch", () => {
      const exprs = {
        sum: stub(["a", "external"], (s) => num(s.a) + num(s.external)),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          total: formulaField("sum"),
        }),
        initialInput: { a: 1 },
        offFormValues: { external: 10 },
        calcEngine: makeEngine(exprs),
      });
      const total = getValueStore(store, ["total"]);
      expect(total.derived!.value.value).toBe(11);
      expect(exprs.sum.fn).toHaveBeenCalledTimes(1);

      applyBaseline(
        store,
        { data: { a: 2 } },
        { offFormValues: { external: 20 } },
      );

      // Both the dep rebase and the off-form refresh land in ONE batch — a
      // consistent snapshot, one evaluation on the next read
      expect(total.derived!.value.value).toBe(22);
      expect(exprs.sum.fn).toHaveBeenCalledTimes(2);
    });

    test("should recompute a rollup once against rebased rows and canon", () => {
      const rowSchema: JsonSchema = {
        type: "object",
        properties: { id: { type: "string" }, v: { type: "number" } },
        required: ["id"],
      };
      const exprs = {
        rollup: stub(
          ["items"],
          (s) =>
            (s.items as Array<Record<string, unknown>>).reduce(
              (acc, row) => acc + num(row.v),
              0,
            ),
          [{ collection: "items", field: "v" }],
        ),
      };
      const store = createFormStore({
        schema: objectSchema({
          items: { type: "array", items: rowSchema },
          total: formulaField("rollup"),
        }),
        initialInput: { items: [{ id: "r1", v: 1 }, { id: "r2", v: 2 }] },
        calcEngine: makeEngine(exprs),
      });
      const total = getValueStore(store, ["total"]);
      expect(total.derived!.value.value).toBe(3);
      expect(exprs.rollup.fn).toHaveBeenCalledTimes(1);

      applyBaseline(store, {
        data: { items: [{ id: "r1", v: 100 }, { id: "r2", v: 200 }] },
      });

      expect(total.derived!.value.value).toBe(300);
      expect(exprs.rollup.fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("calc errors", () => {
    test("should land an evaluation throw in the field's errors without poisoning siblings", () => {
      const exprs = {
        boom: stub(["a"], (s) => {
          if (num(s.a) < 0) throw new Error("#ERROR: negative input");
          return num(s.a);
        }),
        fine: stub(["b"], (s) => num(s.b) + 1),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          b: { type: "number" },
          bad: formulaField("boom"),
          good: formulaField("fine"),
        }),
        initialInput: { a: -1, b: 1 },
        calcEngine: makeEngine(exprs),
      });
      const bad = getValueStore(store, ["bad"]);
      expect(bad.derived!.value).toStrictEqual({
        value: undefined,
        error: "#ERROR: negative input",
      });
      expect(bad.errors.value).toStrictEqual(["#ERROR: negative input"]);
      expect(getValueStore(store, ["good"]).derived!.value.value).toBe(2);
      expect(getValueStore(store, ["good"]).errors.value).toBe(null);
    });

    test("should recover when the inputs become valid again", () => {
      const exprs = {
        boom: stub(["a"], (s) => {
          if (num(s.a) < 0) throw new Error("#ERROR: negative input");
          return num(s.a);
        }),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          bad: formulaField("boom"),
        }),
        initialInput: { a: -1 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["bad"]).errors.value).toStrictEqual([
        "#ERROR: negative input",
      ]);
      setInput(store, ["a"], 5);
      expect(getValueStore(store, ["bad"]).errors.value).toBe(null);
      expect(getValueStore(store, ["bad"]).derived!.value.value).toBe(5);
    });

    test("should flag a parse failure without breaking other formulas", () => {
      const exprs = { fine: stub(["a"], (s) => num(s.a) + 1) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          broken: formulaField("not-registered"),
          good: formulaField("fine"),
        }),
        initialInput: { a: 1 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["broken"]).derived!.value).toStrictEqual({
        value: undefined,
        error: "Unparseable formula: not-registered",
      });
      expect(getValueStore(store, ["good"]).derived!.value.value).toBe(2);
    });

    test("should propagate an erroring formula dep to its dependents and recover", () => {
      const exprs = {
        boom: stub(["a"], (s) => {
          if (num(s.a) < 0) throw new Error("#ERROR: broken");
          return num(s.a);
        }),
        echo: stub(["bad"], (s) => s.bad),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          bad: formulaField("boom"),
          out: formulaField("echo"),
        }),
        initialInput: { a: -1 },
        // The last persisted output of `bad` must NOT stand in for the
        // erroring live computation: a broken chain shows errors, never a
        // stale-but-plausible number
        offFormValues: { bad: 33 },
        calcEngine: makeEngine(exprs),
      });
      const out = getValueStore(store, ["out"]);
      expect(out.derived!.value).toStrictEqual({
        value: undefined,
        error: 'Upstream formula error: "bad"',
      });
      expect(out.errors.value).toStrictEqual(['Upstream formula error: "bad"']);

      // The upstream recovers: the whole chain clears
      setInput(store, ["a"], 5);
      expect(out.derived!.value).toStrictEqual({ value: 5, error: null });
      expect(out.errors.value).toBe(null);
    });

    test("should keep calc and validation errors coexisting without clobbering", () => {
      const exprs = {
        boom: stub([], () => {
          throw new Error("#ERROR: broken");
        }),
      };
      let issues: Array<{ instancePath: string; message: string }> | null = [
        { instancePath: "/bad", message: "Required" },
      ];
      const store = createFormStore({
        schema: objectSchema({ bad: formulaField("boom") }),
        validator: () => issues,
        calcEngine: makeEngine(exprs),
      });
      const bad = getValueStore(store, ["bad"]);

      // Validation routes an issue onto the field: both sources surface
      validateFormInput(store);
      expect(bad.errors.value).toStrictEqual(["Required", "#ERROR: broken"]);

      // The validation issue resolves: the calc error remains
      issues = null;
      validateFormInput(store);
      expect(bad.errors.value).toStrictEqual(["#ERROR: broken"]);

      // setErrors composes the same way
      setErrors(store, ["Custom"], ["bad"]);
      expect(bad.errors.value).toStrictEqual(["Custom", "#ERROR: broken"]);
      setErrors(store, null, ["bad"]);
      expect(bad.errors.value).toStrictEqual(["#ERROR: broken"]);
    });

    test("should not count calc errors toward validity", () => {
      // A broken formula is an admin problem: it renders as #ERROR but must
      // never block the form user (react isValid reads validationErrors)
      const exprs = {
        boom: stub([], () => {
          throw new Error("#ERROR: broken");
        }),
      };
      const store = createFormStore({
        schema: objectSchema({ bad: formulaField("boom") }),
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["bad"]).errors.value).toStrictEqual([
        "#ERROR: broken",
      ]);
      expect(getFieldBool(store, "errors")).toBe(true);
      expect(getFieldBool(store, "validationErrors")).toBe(false);
    });
  });

  describe("cycle break", () => {
    test("should break a two-field cycle deterministically and flag the cut field", () => {
      const exprs = {
        fromB: stub(["b"], (s) => num(s.b) + 1),
        fromA: stub(["a"], (s) => num(s.a) + 1),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: formulaField("fromB"),
          b: formulaField("fromA"),
        }),
        offFormValues: { a: 10 },
        calcEngine: makeEngine(exprs),
      });
      // DFS in property order visits a → b; b's edge back to a is cut, so b
      // resolves a through the fallback path (offFormValues) and carries the
      // error; a reads b's derived, and b's number descends from the cut
      // edge, so the error propagates — a whole cycle errors loudly rather
      // than showing suspect values on half of it
      const a = getValueStore(store, ["a"]);
      const b = getValueStore(store, ["b"]);
      expect(b.derived!.value).toStrictEqual({
        value: 11,
        error: 'Circular reference: "b" reads "a"',
      });
      expect(b.errors.value).toStrictEqual(['Circular reference: "b" reads "a"']);
      expect(a.derived!.value).toStrictEqual({
        value: undefined,
        error: 'Upstream formula error: "b"',
      });
      expect(a.errors.value).toStrictEqual(['Upstream formula error: "b"']);
    });

    test("should break a self-reference and flag it", () => {
      const exprs = { selfRef: stub(["a"], (s) => num(s.a) + 1) };
      const store = createFormStore({
        schema: objectSchema({ a: formulaField("selfRef") }),
        initialInput: { a: 5 },
        calcEngine: makeEngine(exprs),
      });
      const a = getValueStore(store, ["a"]);
      // The cut self-edge resolves from the field's own stored input
      expect(a.derived!.value).toStrictEqual({
        value: 6,
        error: 'Circular reference: "a" reads "a"',
      });
    });
  });

  describe("estimate mode", () => {
    test("should pin to estimate when the field starts with a value", () => {
      const exprs = { sum: stub(["a"], (s) => num(s.a) * 2) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          fee: estimateField("sum"),
        }),
        initialInput: { a: 10, fee: 1234 },
        calcEngine: makeEngine(exprs),
      });
      const fee = getValueStore(store, ["fee"]);
      expect(fee.mode?.value).toBe("estimate");
      expect(fee.derived!.value).toStrictEqual({ value: 1234, error: null });

      // A pinned field reads no deps — dep edits must not recompute it
      setInput(store, ["a"], 50);
      expect(fee.derived!.value.value).toBe(1234);
      expect(exprs.sum.fn).not.toHaveBeenCalled();
    });

    test("should open empty as a typeable estimate whose output falls through to the formula", () => {
      // Companion-less default is estimate (manual-first, LOS-461) — but an
      // EMPTY estimate does not pin: dependents read the formula until a
      // real estimate is typed (the LOS-515 silent-takeover rule)
      const exprs = { sum: stub(["a"], (s) => num(s.a) * 2) };
      const store = createFormStore({
        schema: objectSchema(
          {
            a: { type: "number" },
            fee: estimateField("sum"),
          },
          ["a"],
        ),
        initialInput: { a: 10 },
        calcEngine: makeEngine(exprs),
      });
      const fee = getValueStore(store, ["fee"]);
      expect(fee.mode?.value).toBe("estimate");
      expect(fee.derived!.value).toStrictEqual({ value: 20, error: null });

      // Typing a real estimate pins; clearing it un-pins again
      setInput(store, ["fee"], 7);
      expect(fee.derived!.value).toStrictEqual({ value: 7, error: null });
      setInput(store, ["fee"], "");
      expect(fee.derived!.value).toStrictEqual({ value: 20, error: null });
    });

    test("should recompute when flipped to formula and hold again when flipped back", () => {
      const exprs = { sum: stub(["a"], (s) => num(s.a) * 2) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          fee: estimateField("sum"),
        }),
        initialInput: { a: 10, fee: 1234 },
        calcEngine: makeEngine(exprs),
      });
      const fee = getValueStore(store, ["fee"]);
      fee.mode!.value = "formula";
      expect(fee.derived!.value.value).toBe(20);
      fee.mode!.value = "estimate";
      expect(fee.derived!.value.value).toBe(1234);
    });
  });

  describe("rollup classification", () => {
    test("should flag a formula referencing a collection and only that", () => {
      const exprs = {
        rollup: stub(["assets"], () => 0, [{ collection: "assets", field: "aiv" }]),
        plain: stub(["a"], (s) => s.a),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          total: formulaField("rollup"),
          out: formulaField("plain"),
          broken: formulaField("not-registered"),
        }),
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["total"]).isRollup).toBe(true);
      expect(getValueStore(store, ["out"]).isRollup).toBe(false);
      expect(getValueStore(store, ["broken"]).isRollup).toBe(false);
    });
  });

  describe("outputs excluded from dirty by construction", () => {
    test("should dirty the edited dep, never the derived output", () => {
      const exprs = { sum: stub(["a"], (s) => num(s.a) + 1) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          total: formulaField("sum"),
        }),
        initialInput: { a: 1 },
        calcEngine: makeEngine(exprs),
      });
      setInput(store, ["a"], 2);
      expect(getValueStore(store, ["total"]).derived!.value.value).toBe(3);
      expect(getDirtyPaths(store)).toStrictEqual([["a"]]);
      expect(getValueStore(store, ["total"]).isDirty.value).toBe(false);
    });
  });

  describe("x-server-maintained fields (LOS-567 PR B)", () => {
    test("should pass the stored input through instead of deriving", () => {
      // maturityDate's shape: a formula documents intent, but the server
      // (the modifications trio) authors the persisted value, and the
      // formula's deps aren't in form scope. The widget must show the
      // stored value, never a client re-derivation.
      const exprs = { wrong: stub(["a"], () => 999) };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          maturityDate: formulaField("wrong", { "x-server-maintained": true }),
        }),
        initialInput: { a: 1, maturityDate: "2027-06-01" },
        calcEngine: makeEngine(exprs),
      });
      const field = getValueStore(store, ["maturityDate"]);
      expect(field.derived?.value).toStrictEqual({
        value: "2027-06-01",
        error: null,
      });
      expect(field.isRollup).toBe(false);
      expect(exprs.wrong.fn).not.toHaveBeenCalled();
    });

    test("a dependent formula reads the stored value, and a baseline rebase flows through", () => {
      const exprs = {
        wrong: stub(["a"], () => 999),
        plusOne: stub(["m"], (s) => num(s.m) + 1),
      };
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          m: formulaField("wrong", { "x-server-maintained": true }),
          out: formulaField("plusOne"),
        }),
        initialInput: { a: 1, m: 10 },
        calcEngine: makeEngine(exprs),
      });
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(11);
      // Fresh server record (e.g. after an extension shifted the column):
      // the passthrough derived signal follows the rebased input.
      applyBaseline(store, { data: { a: 1, m: 22 } });
      expect(getValueStore(store, ["m"]).derived!.value.value).toBe(22);
      expect(getValueStore(store, ["out"]).derived!.value.value).toBe(23);
    });
  });

  describe("without a calc engine", () => {
    test("should walk formula fields as plain value leaves", () => {
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          total: formulaField("sum"),
        }),
        initialInput: { a: 1, total: 9 },
      });
      const total = getValueStore(store, ["total"]);
      expect(total.derived).toBe(undefined);
      expect(total.mode).toBe(undefined);
      expect(total.input.value).toBe(9);
    });

    test("should walk a row's formula fields as plain value leaves too", () => {
      const store = createFormStore({
        schema: objectSchema({
          rows: {
            type: "array",
            items: objectSchema({ perRow: formulaField("sum") }),
          },
        }),
        initialInput: { rows: [{ perRow: 7 }] },
      });
      const perRow = getValueStore(store, ["rows", 0, "perRow"]);
      expect(perRow.derived).toBe(undefined);
      expect(perRow.input.value).toBe(7);
    });
  });

  describe("row-scoped derivation (LOS-596)", () => {
    // A row's scope is its own record: live siblings win, the canonical row
    // fills, the parent handle rides under `loan`.
    const rowSchema = (extra?: Record<string, JsonSchema>): JsonSchema =>
      objectSchema({
        assets: {
          type: "array",
          items: objectSchema({
            id: { type: "string" },
            landValue: { type: "number" },
            buildingValue: { type: "number" },
            rowTotal: formulaField("rowSum"),
            ...extra,
          }),
        },
      });

    function rowExprs() {
      return {
        rowSum: stub(
          ["landValue", "buildingValue"],
          (s) => num(s.landValue) + num(s.buildingValue),
        ),
      };
    }

    test("should derive a formula inside an array item from its own row", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          assets: [
            { id: "a1", landValue: 100, buildingValue: 50 },
            { id: "a2", landValue: 7, buildingValue: 3 },
          ],
        },
        calcEngine: makeEngine(rowExprs()),
      });
      expect(
        getValueStore(store, ["assets", 0, "rowTotal"]).derived!.value,
      ).toStrictEqual({ value: 150, error: null });
      // Each row computes from ITS OWN siblings — never row 0's
      expect(
        getValueStore(store, ["assets", 1, "rowTotal"]).derived!.value.value,
      ).toBe(10);
    });

    test("should recompute a row when a sibling in the SAME row is edited", () => {
      const exprs = rowExprs();
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          assets: [
            { id: "a1", landValue: 100, buildingValue: 50 },
            { id: "a2", landValue: 7, buildingValue: 3 },
          ],
        },
        calcEngine: makeEngine(exprs),
      });
      const first = getValueStore(store, ["assets", 0, "rowTotal"]);
      const second = getValueStore(store, ["assets", 1, "rowTotal"]);
      expect(first.derived!.value.value).toBe(150);
      expect(second.derived!.value.value).toBe(10);

      setInput(store, ["assets", 0, "landValue"], 900);
      expect(first.derived!.value.value).toBe(950);
      // …and the neighbour row stays put (its computed was never invalidated)
      const calls = exprs.rowSum.fn.mock.calls.length;
      expect(second.derived!.value.value).toBe(10);
      expect(exprs.rowSum.fn.mock.calls.length).toBe(calls);
    });

    test("should fill unedited fields from the canonical row, matched by id", () => {
      const store = createFormStore({
        // The write model holds only `landValue`; `buildingValue` is a core
        // column the form never carries
        schema: objectSchema({
          assets: {
            type: "array",
            items: objectSchema({
              id: { type: "string" },
              landValue: { type: "number" },
              rowTotal: formulaField("rowSum"),
            }),
          },
        }),
        initialInput: { assets: [{ id: "a2" }, { id: "a1", landValue: 100 }] },
        offFormValues: {
          assets: [
            { id: "a1", landValue: 1, buildingValue: 50 },
            { id: "a2", landValue: 5, buildingValue: 9 },
          ],
        },
        calcEngine: makeEngine(rowExprs()),
      });
      // Row order is NOT identity: `a1` sits at index 1 in the form and at
      // index 0 in the canonical rows
      expect(
        getValueStore(store, ["assets", 1, "rowTotal"]).derived!.value.value,
      ).toBe(150);
      // An unedited row resolves entirely from its canonical record
      expect(
        getValueStore(store, ["assets", 0, "rowTotal"]).derived!.value.value,
      ).toBe(14);
    });

    test("should resolve the parent record handle under `loan`", () => {
      const exprs = {
        share: stub(
          ["landValue", "loan"],
          (s) =>
            num(s.landValue) /
            num((s.loan as Record<string, unknown> | undefined)?.commitment),
        ),
      };
      const store = createFormStore({
        schema: objectSchema({
          assets: {
            type: "array",
            items: objectSchema({
              id: { type: "string" },
              landValue: { type: "number" },
              share: formulaField("share"),
            }),
          },
        }),
        initialInput: { assets: [{ id: "a1", landValue: 250 }] },
        offFormValues: { loan: { commitment: 1000 } },
        calcEngine: makeEngine(exprs),
      });
      const share = getValueStore(store, ["assets", 0, "share"]);
      expect(share.derived!.value.value).toBe(0.25);

      // A fresher parent record re-resolves the row
      setOffFormValues(store, { loan: { commitment: 500 } });
      expect(share.derived!.value.value).toBe(0.5);
    });

    test("should NOT see root-level document fields in row scope", () => {
      const exprs = { pick: stub(["note"], (s) => s.note ?? "unresolved") };
      const store = createFormStore({
        schema: objectSchema({
          note: { type: "string" },
          assets: {
            type: "array",
            items: objectSchema({
              id: { type: "string" },
              echo: formulaField("pick"),
            }),
          },
        }),
        initialInput: { note: "document", assets: [{ id: "a1" }] },
        calcEngine: makeEngine(exprs),
      });
      // The server evaluates a row against its own record — a row formula
      // that reached into the document would compute a different number here
      expect(
        getValueStore(store, ["assets", 0, "echo"]).derived!.value.value,
      ).toBe("unresolved");
    });

    test("should propagate an erroring row formula to its row dependents", () => {
      const exprs = {
        boom: stub([], () => {
          throw new Error("Division by zero");
        }),
        plusOne: stub(["broken"], (s) => num(s.broken) + 1),
      };
      const store = createFormStore({
        schema: objectSchema({
          assets: {
            type: "array",
            items: objectSchema({
              id: { type: "string" },
              broken: formulaField("boom"),
              dependent: formulaField("plusOne"),
            }),
          },
        }),
        initialInput: { assets: [{ id: "a1" }, { id: "a2" }] },
        offFormValues: { assets: [{ id: "a2", broken: 41 }] },
        calcEngine: makeEngine(exprs),
      });
      const broken = getValueStore(store, ["assets", 0, "broken"]);
      const dependent = getValueStore(store, ["assets", 0, "dependent"]);
      expect(broken.derived!.value).toStrictEqual({
        value: undefined,
        error: "Division by zero",
      });
      expect(broken.errors.value).toStrictEqual(["Division by zero"]);
      // The dependent must never fall back to the canonical stored value
      expect(dependent.derived!.value).toStrictEqual({
        value: undefined,
        error: 'Upstream formula error: "broken"',
      });
      // …and the neighbour row is untouched — errors never cross rows
      expect(
        getValueStore(store, ["assets", 1, "broken"]).derived!.value.error,
      ).toBe("Division by zero");
    });

    test("should break a cycle inside a row deterministically", () => {
      const exprs = {
        readsB: stub(["b"], (s) => num(s.b) + 1),
        readsA: stub(["a"], (s) => num(s.a) + 1),
      };
      const store = createFormStore({
        schema: objectSchema({
          rows: {
            type: "array",
            items: objectSchema({
              id: { type: "string" },
              a: formulaField("readsB"),
              b: formulaField("readsA"),
            }),
          },
        }),
        initialInput: { rows: [{ id: "r1", a: 5, b: 10 }] },
        calcEngine: makeEngine(exprs),
      });
      const a = getValueStore(store, ["rows", 0, "a"]);
      const b = getValueStore(store, ["rows", 0, "b"]);
      // Identical to the root-level break: DFS in property order cuts b's
      // edge back to a, so b resolves a through its stored input (5) and
      // carries the error, and a — whose number descends from the cut edge
      // — errors too
      expect(b.derived!.value).toStrictEqual({
        value: 6,
        error: 'Circular reference: "b" reads "a"',
      });
      expect(a.derived!.value).toStrictEqual({
        value: undefined,
        error: 'Upstream formula error: "b"',
      });
    });

    test("resolveScopeValueAt should read a dep in the scope of its path", () => {
      const store = createFormStore({
        schema: objectSchema({
          landValue: { type: "number" },
          assets: {
            type: "array",
            items: objectSchema({
              id: { type: "string" },
              landValue: { type: "number" },
              buildingValue: { type: "number" },
              rowTotal: formulaField("rowSum"),
            }),
          },
        }),
        initialInput: {
          landValue: 5,
          assets: [{ id: "a1", landValue: 100, buildingValue: 50 }],
        },
        offFormValues: {
          loan: { commitment: 1000 },
          assets: [{ id: "a1", liens: 7 }],
        },
        calcEngine: makeEngine(rowExprs()),
      });
      // Root path → the document scope
      expect(resolveScopeValueAt(store, ["landValue"], "landValue")).toBe(5);
      // Row path → the row's own value, the canonical row's fill, the
      // parent handle, and a row formula through its derived signal
      const rowPath = ["assets", 0, "rowTotal"];
      expect(resolveScopeValueAt(store, rowPath, "landValue")).toBe(100);
      expect(resolveScopeValueAt(store, rowPath, "liens")).toBe(7);
      expect(resolveScopeValueAt(store, rowPath, "loan")).toStrictEqual({
        commitment: 1000,
      });
      expect(resolveScopeValueAt(store, rowPath, "rowTotal")).toBe(150);
      // A document field the row does not hold is NOT in row scope
      expect(resolveScopeValueAt(store, rowPath, "note")).toBe(undefined);
    });

    test("should derive a row created AFTER store init", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: { assets: [{ id: "a1", landValue: 1, buildingValue: 1 }] },
        calcEngine: makeEngine(rowExprs()),
      });
      // A whole-array write (the relation widgets' growth path)
      setInput(store, ["assets"], [
        { id: "a1", landValue: 1, buildingValue: 1 },
        { id: "a2", landValue: 20, buildingValue: 5 },
      ]);
      expect(
        getValueStore(store, ["assets", 1, "rowTotal"]).derived!.value.value,
      ).toBe(25);

      // …and an insert
      insert(store, ["assets"], {
        at: 2,
        initialInput: { id: "a3", landValue: 100, buildingValue: 200 },
      });
      expect(
        getValueStore(store, ["assets", 2, "rowTotal"]).derived!.value.value,
      ).toBe(300);
    });
  });
});

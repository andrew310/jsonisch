import { describe, expect, test } from "vitest";

import { applyBaseline } from "../../methods/apply-baseline";
import { insert, move } from "../../methods/array-ops";
import { getDirtyInput } from "../../methods/get-dirty-input";
import { pickDirty } from "../../methods/pick-dirty";
import { reset } from "../../methods/reset";
import { setEntryMode, setPercentBasis } from "../../methods/set-entry";
import { setInput } from "../../methods/set-input";
import { setMode } from "../../methods/set-mode";
import { decodeCompanions } from "../codec/decode-companions";
import { encodeDirty } from "../codec/encode-dirty";
import { createFormStore } from "../form/create-form-store";
import { getValueStore, objectSchema } from "../vitest/utils";
import type { CalcEngine, JsonSchema } from "../types";

/**
 * Minimal stub engine: `x-formula` strings key into scope-reading eval
 * functions (same pattern as the derivation suite; this suite tests the
 * meta channel's wiring around derivation, not derivation itself).
 */
function makeEngine(
  exprs: Record<
    string,
    { deps: string[]; fn: (scope: Record<string, unknown>) => unknown }
  >,
): CalcEngine {
  return {
    parse: (formula) =>
      Object.prototype.hasOwnProperty.call(exprs, formula)
        ? { ok: true, node: exprs[formula] }
        : { ok: false, error: `Unparseable formula: ${formula}` },
    evaluate: (node, scope) =>
      (node as { fn: (scope: Record<string, unknown>) => unknown }).fn(scope),
    extractDependencies: (node) => (node as { deps: string[] }).deps,
  };
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);

function estimateField(formula: string): JsonSchema {
  return { type: "number", "x-field-type": "computed", "x-formula": formula };
}

function hybridField(extra?: JsonSchema): JsonSchema {
  return { type: "string", "x-field-type": "hybrid", ...extra };
}

const doubleA = () => ({
  double: { deps: ["a"], fn: (s: Record<string, unknown>) => num(s.a) * 2 },
});

describe("meta channel", () => {
  describe("Source companion decode", () => {
    test("should reopen in formula mode from a calculated companion even though a value is persisted", () => {
      // The v1c provisional gap: an accepted formula persists its
      // materialized result — value presence must not read as an estimate
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 999 },
        companions: { feeSource: { mode: "calculated", manualValue: "999" } },
        calcEngine: makeEngine(doubleA()),
      });
      const fee = getValueStore(store, ["fee"]);
      expect(fee.mode?.value).toBe("formula");
      expect(fee.derived!.value).toStrictEqual({ value: 20, error: null });
    });

    test("should reopen in estimate mode from a manual companion", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 1234 },
        companions: { feeSource: { mode: "manual", manualValue: "1234" } },
        calcEngine: makeEngine(doubleA()),
      });
      const fee = getValueStore(store, ["fee"]);
      expect(fee.mode?.value).toBe("estimate");
      expect(fee.derived!.value).toStrictEqual({ value: 1234, error: null });
    });

    test("should treat a companion without a mode as manual (janska default)", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10 },
        companions: { feeSource: { manualValue: "5" } },
        calcEngine: makeEngine(doubleA()),
      });
      expect(getValueStore(store, ["fee"]).mode?.value).toBe("estimate");
    });

    test("should default to estimate mode without a companion (manual-first)", () => {
      // janska parity (LOS-461): a companion-less field is always typeable;
      // the empty-estimate fall-through in derivation keeps dependents on
      // the formula until a real estimate lands
      const engine = makeEngine(doubleA());
      const withValue = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 7 },
        calcEngine: engine,
      });
      expect(getValueStore(withValue, ["fee"]).mode?.value).toBe("estimate");

      const empty = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10 },
        calcEngine: engine,
      });
      expect(getValueStore(empty, ["fee"]).mode?.value).toBe("estimate");
    });

    test("should create the mode signal even without a calc engine", () => {
      const store = createFormStore({
        schema: objectSchema({ fee: estimateField("double") }),
        initialInput: { fee: 7 },
        companions: { feeSource: { mode: "calculated" } },
      });
      const fee = getValueStore(store, ["fee"]);
      expect(fee.mode?.value).toBe("formula");
      expect(fee.derived).toBe(undefined);
    });
  });

  describe("Hybrid companion decode", () => {
    test("should decode entry mode and percent basis from the companion", () => {
      const store = createFormStore({
        schema: objectSchema({
          fee: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
        }),
        initialInput: { fee: "5000" },
        companions: { feeHybrid: { mode: "bps", denominator: "totalCommitment" } },
      });
      const meta = getValueStore(store, ["fee"]).meta;
      expect(meta?.family).toBe("hybrid");
      if (meta?.family !== "hybrid") return;
      expect(meta.entryMode.value).toBe("percent");
      expect(meta.percentBasis.value).toBe("totalCommitment");
    });

    test("should default to amount mode and the schema's default basis without a companion", () => {
      const store = createFormStore({
        schema: objectSchema({
          fee: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
        }),
      });
      const meta = getValueStore(store, ["fee"]).meta;
      if (meta?.family !== "hybrid") throw new Error("expected hybrid meta");
      expect(meta.entryMode.value).toBe("amount");
      expect(meta.percentBasis.value).toBe("purchasePrice");
      expect(meta.isDirty.value).toBe(false);
    });
  });

  describe("decodeCompanions boundary", () => {
    test("should read companions of declared estimate/hybrid bases from the data bag", () => {
      const schema = objectSchema({
        price: { type: "number" },
        fee: estimateField("double"),
        points: hybridField(),
      });
      expect(
        decodeCompanions(schema, {
          id: "x",
          data: {
            fee: 5,
            feeSource: { mode: "manual", manualValue: "5" },
            pointsHybrid: { mode: "bps", denominator: "price" },
            priceSource: { mode: "manual" },
            straySource: { mode: "manual" },
          },
        }),
      ).toStrictEqual({
        feeSource: { mode: "manual", manualValue: "5" },
        pointsHybrid: { mode: "bps", denominator: "price" },
      });
    });

    test("should return undefined for a nullish record or one without companions", () => {
      const schema = objectSchema({ fee: estimateField("double") });
      expect(decodeCompanions(schema, null)).toBe(undefined);
      expect(decodeCompanions(schema, { data: { fee: 5 } })).toBe(undefined);
    });
  });

  describe("companion encode into the dirty payload", () => {
    test("should emit the Source companion next to an edited estimate value", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 1234 },
        companions: { feeSource: { mode: "manual", manualValue: "1234" } },
        calcEngine: makeEngine(doubleA()),
      });
      setInput(store, ["fee"], "1500");
      expect(getDirtyInput(store)).toStrictEqual({
        fee: "1500",
        feeSource: { mode: "manual", manualValue: "1500" },
      });
    });

    test("should carry a decoded lastFlippedAt through a value-only edit", () => {
      const store = createFormStore({
        schema: objectSchema({ fee: estimateField("double") }),
        initialInput: { fee: 1 },
        companions: {
          feeSource: { mode: "manual", manualValue: "1", lastFlippedAt: "2026-08-01T00:00:00.000Z" },
        },
      });
      setInput(store, ["fee"], "2");
      expect(getDirtyInput(store)).toStrictEqual({
        fee: "2",
        feeSource: {
          mode: "manual",
          manualValue: "2",
          lastFlippedAt: "2026-08-01T00:00:00.000Z",
        },
      });
    });

    test("should produce a companion-only payload for a flip with no other edit", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 1234 },
        companions: { feeSource: { mode: "manual", manualValue: "1234" } },
        calcEngine: makeEngine(doubleA()),
      });
      expect(getDirtyInput(store)).toBe(undefined);

      setMode(store, ["fee"], "formula", { now: "2026-08-04T12:00:00.000Z" });
      // The carried manual value is the DECODED one — janska's companion
      // mirrors keystrokes, never the loaded column value
      expect(getDirtyInput(store)).toStrictEqual({
        feeSource: {
          mode: "calculated",
          manualValue: "1234",
          lastFlippedAt: "2026-08-04T12:00:00.000Z",
        },
      });
    });

    test("should emit the Hybrid companion on entry-state changes only", () => {
      const store = createFormStore({
        schema: objectSchema({
          points: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
        }),
        initialInput: { points: "5000" },
      });
      // A value edit alone never dirties the companion
      setInput(store, ["points"], "6000");
      expect(getDirtyInput(store)).toStrictEqual({ points: "6000" });

      setEntryMode(store, ["points"], "percent");
      setPercentBasis(store, ["points"], "totalCommitment");
      expect(getDirtyInput(store)).toStrictEqual({
        points: "6000",
        pointsHybrid: { mode: "bps", denominator: "totalCommitment" },
      });
    });

    test("should append companions in pickDirty even though the supplied value lacks them", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 1234 },
        companions: { feeSource: { mode: "manual", manualValue: "1234" } },
        calcEngine: makeEngine(doubleA()),
      });
      setMode(store, ["fee"], "formula", { now: "T1" });
      expect(pickDirty(store, { a: 10, fee: 1234 })).toStrictEqual({
        feeSource: { mode: "calculated", manualValue: "1234", lastFlippedAt: "T1" },
      });
    });

    test("should route a manual-pinned estimate value into data and its companion aside", () => {
      const schema = objectSchema({ a: { type: "number" }, fee: estimateField("double") });
      expect(
        encodeDirty(schema, {
          fee: "1500",
          feeSource: { mode: "manual", manualValue: "1500" },
        }),
      ).toStrictEqual({
        columns: {},
        data: { fee: "1500" },
        companions: { feeSource: { mode: "manual", manualValue: "1500" } },
      });
    });

    test("should skip a formula-accepted estimate value but keep its companion", () => {
      const schema = objectSchema({ a: { type: "number" }, fee: estimateField("double") });
      expect(
        encodeDirty(schema, {
          fee: 1234,
          feeSource: { mode: "calculated", manualValue: "1234", lastFlippedAt: "T1" },
        }),
      ).toStrictEqual({
        columns: {},
        data: {},
        companions: {
          feeSource: { mode: "calculated", manualValue: "1234", lastFlippedAt: "T1" },
        },
      });
    });
  });

  describe("setMode", () => {
    test("estimate→formula should recompute and preserve the manual value in the companion", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 1234 },
        companions: { feeSource: { mode: "manual", manualValue: "1234" } },
        calcEngine: makeEngine(doubleA()),
      });
      const fee = getValueStore(store, ["fee"]);
      setMode(store, ["fee"], "formula", { now: "T1" });

      expect(fee.derived!.value).toStrictEqual({ value: 20, error: null });
      // The derived value is never written into the input
      expect(fee.input.value).toBe(1234);
      expect(fee.isDirty.value).toBe(false);
      expect(fee.meta?.isDirty.value).toBe(true);
    });

    test("formula→estimate should seed the manual value from the last formula result", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 999 },
        companions: { feeSource: { mode: "calculated" } },
        calcEngine: makeEngine(doubleA()),
      });
      const fee = getValueStore(store, ["fee"]);
      setMode(store, ["fee"], "estimate", { now: "T1" });

      expect(fee.mode?.value).toBe("estimate");
      // Seeded like a real edit: value dirty, payload carries both sides
      expect(fee.input.value).toBe(20);
      expect(fee.isDirty.value).toBe(true);
      expect(getDirtyInput(store)).toStrictEqual({
        fee: 20,
        feeSource: { mode: "manual", manualValue: 20, lastFlippedAt: "T1" },
      });
    });

    test("formula→estimate with an erroring formula should not seed", () => {
      const store = createFormStore({
        schema: objectSchema({ fee: estimateField("broken") }),
        initialInput: { fee: 999 },
        companions: { feeSource: { mode: "calculated" } },
        calcEngine: makeEngine(doubleA()),
      });
      const fee = getValueStore(store, ["fee"]);
      setMode(store, ["fee"], "estimate", { now: "T1" });
      expect(fee.input.value).toBe(999);
      expect(fee.isDirty.value).toBe(false);
    });

    test("should be a no-op for the current mode and throw on a non-estimate field", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 1234 },
        companions: { feeSource: { mode: "manual" } },
        calcEngine: makeEngine(doubleA()),
      });
      setMode(store, ["fee"], "estimate", { now: "T1" });
      expect(getValueStore(store, ["fee"]).meta?.isDirty.value).toBe(false);
      expect(getDirtyInput(store)).toBe(undefined);

      expect(() => setMode(store, ["a"], "formula")).toThrow(/estimate field/);
    });

    test("the candidate keeps computing while pinned (the nudge's read)", () => {
      const store = createFormStore({
        schema: objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        initialInput: { a: 10, fee: 1234 },
        companions: { feeSource: { mode: "manual", manualValue: "1234" } },
        calcEngine: makeEngine(doubleA()),
      });
      const fee = getValueStore(store, ["fee"]);
      setInput(store, ["a"], 50);
      expect(fee.derived!.value.value).toBe(1234);
      expect(fee.formulaValue!.value).toStrictEqual({ value: 100, error: null });
    });
  });

  describe("row companions", () => {
    /**
     * A row's companions are FLAT SIBLING KEYS inside the row object
     * (`{ fee: 5, feeSource: {…} }`) — the same convention as the root, one
     * scope down. The row object IS the companion bag.
     */
    const rowSchema = (extra: Record<string, JsonSchema> = {}) =>
      objectSchema({
        a: { type: "number" },
        rows: {
          type: "array",
          items: objectSchema({
            id: { type: "string" },
            a: { type: "number" },
            fee: estimateField("double"),
            ...extra,
          }),
        },
      });

    test("should seed a row estimate's mode from the row's own companion", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          a: 1,
          rows: [
            {
              id: "r1",
              a: 10,
              fee: 999,
              feeSource: { mode: "calculated", manualValue: "999" },
            },
            { id: "r2", a: 3, fee: 7, feeSource: { mode: "manual", manualValue: "7" } },
          ],
        },
        calcEngine: makeEngine(doubleA()),
      });

      const calculated = getValueStore(store, ["rows", 0, "fee"]);
      expect(calculated.mode?.value).toBe("formula");
      // Meta was built BEFORE the row's derivation graph, so the pin holds
      expect(calculated.derived!.value).toStrictEqual({ value: 20, error: null });

      const manual = getValueStore(store, ["rows", 1, "fee"]);
      expect(manual.mode?.value).toBe("estimate");
      expect(manual.derived!.value).toStrictEqual({ value: 7, error: null });
    });

    test("should default a companion-less row field to estimate, like root", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: { a: 1, rows: [{ id: "r1", a: 10, fee: 5 }, { id: "r2", a: 4 }] },
        calcEngine: makeEngine(doubleA()),
      });
      expect(getValueStore(store, ["rows", 0, "fee"]).mode?.value).toBe("estimate");
      // An EMPTY estimate still falls through to the formula (LOS-515)
      const empty = getValueStore(store, ["rows", 1, "fee"]);
      expect(empty.mode?.value).toBe("estimate");
      expect(empty.derived!.value).toStrictEqual({ value: 8, error: null });
    });

    test("should decode a row amount-or-percent field's entry state", () => {
      const store = createFormStore({
        schema: objectSchema({
          rows: {
            type: "array",
            items: objectSchema({
              id: { type: "string" },
              points: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
            }),
          },
        }),
        initialInput: {
          rows: [
            {
              id: "r1",
              points: "5000",
              pointsHybrid: { mode: "bps", denominator: "rowBudget" },
            },
          ],
        },
      });
      const meta = getValueStore(store, ["rows", 0, "points"]).meta;
      if (meta?.family !== "hybrid") throw new Error("expected hybrid meta");
      expect(meta.entryMode.value).toBe("percent");
      expect(meta.percentBasis.value).toBe("rowBudget");
    });

    test("setMode should flip a row field and seed from its ROW's formula result", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          a: 1,
          rows: [{ id: "r1", a: 10, fee: 999, feeSource: { mode: "calculated" } }],
        },
        calcEngine: makeEngine(doubleA()),
      });
      const fee = getValueStore(store, ["rows", 0, "fee"]);

      setMode(store, ["rows", 0, "fee"], "estimate", { now: "T1" });
      expect(fee.mode?.value).toBe("estimate");
      // Seeded from the ROW's own `a` (10), not the document's (1)
      expect(fee.input.value).toBe(20);
      expect(fee.isDirty.value).toBe(true);

      setMode(store, ["rows", 0, "fee"], "formula", { now: "T2" });
      expect(fee.mode?.value).toBe("formula");
      // The estimate typed this session is preserved as the manual value
      expect(fee.meta?.family === "source" && fee.meta.manualValue.value).toBe(20);
    });

    test("setMode should still throw for a row field with no meta channel", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: { a: 1, rows: [{ id: "r1", a: 10 }] },
        calcEngine: makeEngine(doubleA()),
      });
      expect(() => setMode(store, ["rows", 0, "a"], "formula")).toThrow(
        /estimate field/,
      );
    });

    test("should serialize a row companion INSIDE its own row object", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: 1234, feeSource: { mode: "manual", manualValue: "1234" } },
            { id: "r2", a: 3, fee: 6, feeSource: { mode: "manual", manualValue: "6" } },
          ],
        },
        calcEngine: makeEngine(doubleA()),
      });
      expect(getDirtyInput(store)).toBe(undefined);

      setMode(store, ["rows", 0, "fee"], "formula", { now: "T1" });

      // The array is atomic — the whole array rides, but only the flipped
      // row carries a companion (the server merges row `data` per key, so
      // an untouched row must not restate meta it did not change)
      expect(getDirtyInput(store)).toStrictEqual({
        rows: [
          {
            id: "r1",
            a: 10,
            fee: 1234,
            feeSource: {
              mode: "calculated",
              manualValue: "1234",
              lastFlippedAt: "T1",
            },
          },
          { id: "r2", a: 3, fee: 6 },
        ],
      });
      // A row-only mode flip must enable Save
      expect(store.aggregates.isDirty.value).toBe(true);
    });

    test("should append row companions in pickDirty even though the value lacks them", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          a: 1,
          rows: [{ id: "r1", a: 10, fee: 1234, feeSource: { mode: "manual" } }],
        },
        calcEngine: makeEngine(doubleA()),
      });
      setMode(store, ["rows", 0, "fee"], "formula", { now: "T1" });
      expect(
        pickDirty(store, { a: 1, rows: [{ id: "r1", a: 10, fee: 1234 }] }),
      ).toStrictEqual({
        rows: [
          {
            id: "r1",
            a: 10,
            fee: 1234,
            feeSource: { mode: "calculated", manualValue: null, lastFlippedAt: "T1" },
          },
        ],
      });
    });

    test("an estimate value edit inside a row should carry its companion", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          a: 1,
          rows: [{ id: "r1", a: 10, fee: 1234, feeSource: { mode: "manual", manualValue: "1234" } }],
        },
        calcEngine: makeEngine(doubleA()),
      });
      setInput(store, ["rows", 0, "fee"], "1500");
      expect(getDirtyInput(store)).toStrictEqual({
        rows: [
          {
            id: "r1",
            a: 10,
            fee: "1500",
            feeSource: { mode: "manual", manualValue: "1500" },
          },
        ],
      });
    });

    test("reset should restore a row's mode to its decode baseline", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          a: 1,
          rows: [{ id: "r1", a: 10, fee: 1234, feeSource: { mode: "manual", manualValue: "1234" } }],
        },
        calcEngine: makeEngine(doubleA()),
      });
      setMode(store, ["rows", 0, "fee"], "formula", { now: "T1" });
      expect(store.aggregates.isDirty.value).toBe(true);

      reset(store);

      const fee = getValueStore(store, ["rows", 0, "fee"]);
      expect(fee.mode?.value).toBe("estimate");
      expect(fee.meta?.isDirty.value).toBe(false);
      expect(getDirtyInput(store)).toBe(undefined);
    });

    test("applyBaseline should adopt a clean row's fresh companion and keep a flipped one", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: 1, feeSource: { mode: "manual" } },
            { id: "r2", a: 20, fee: 2, feeSource: { mode: "manual" } },
          ],
        },
        calcEngine: makeEngine(doubleA()),
      });
      // Row 2 has an in-session flip; row 1 is clean
      setMode(store, ["rows", 1, "fee"], "formula", { now: "T1" });

      applyBaseline(store, {
        data: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: 5, feeSource: { mode: "calculated" } },
            { id: "r2", a: 20, fee: 2, feeSource: { mode: "manual" } },
          ],
        },
      });

      // Clean row adopts the server's mode
      expect(getValueStore(store, ["rows", 0, "fee"]).mode?.value).toBe("formula");
      // Flipped row keeps the user's in-flight flip
      const flipped = getValueStore(store, ["rows", 1, "fee"]);
      expect(flipped.mode?.value).toBe("formula");
      expect(flipped.meta?.isDirty.value).toBe(true);

      // A later reset returns to the NEW baseline
      reset(store);
      expect(getValueStore(store, ["rows", 0, "fee"]).mode?.value).toBe("formula");
      expect(getValueStore(store, ["rows", 1, "fee"]).mode?.value).toBe("estimate");
    });

    test("a row inserted after store init should get its meta channel", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: { a: 1, rows: [] },
        calcEngine: makeEngine(doubleA()),
      });
      insert(store, ["rows"], {
        initialInput: { id: "r2", a: 4, fee: 9, feeSource: { mode: "calculated" } },
      });
      const fee = getValueStore(store, ["rows", 0, "fee"]);
      expect(fee.mode?.value).toBe("formula");
      expect(fee.derived!.value).toStrictEqual({ value: 8, error: null });
      expect(() => setMode(store, ["rows", 0, "fee"], "estimate", { now: "T1" })).not.toThrow();
      expect(fee.mode?.value).toBe("estimate");
    });

    test("a moved row should take its mode with it", () => {
      const store = createFormStore({
        schema: rowSchema(),
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: 1, feeSource: { mode: "calculated" } },
            { id: "r2", a: 20, fee: 2, feeSource: { mode: "manual" } },
          ],
        },
        calcEngine: makeEngine(doubleA()),
      });
      move(store, ["rows"], 0, 1);
      expect(getValueStore(store, ["rows", 0, "fee"]).mode?.value).toBe("estimate");
      expect(getValueStore(store, ["rows", 1, "fee"]).mode?.value).toBe("formula");
    });
  });

  describe("reset", () => {
    test("should restore mode, entry state and flip timestamp to the decode baseline", () => {
      const store = createFormStore({
        schema: objectSchema({
          a: { type: "number" },
          fee: estimateField("double"),
          points: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
        }),
        initialInput: { a: 10, fee: 1234, points: "5000" },
        companions: { feeSource: { mode: "manual", manualValue: "1234" } },
        calcEngine: makeEngine(doubleA()),
      });
      setMode(store, ["fee"], "formula", { now: "T1" });
      setEntryMode(store, ["points"], "percent");
      setPercentBasis(store, ["points"], "totalCommitment");

      reset(store);

      const fee = getValueStore(store, ["fee"]);
      const points = getValueStore(store, ["points"]).meta;
      if (points?.family !== "hybrid") throw new Error("expected hybrid meta");
      expect(fee.mode?.value).toBe("estimate");
      expect(fee.meta?.isDirty.value).toBe(false);
      expect(points.entryMode.value).toBe("amount");
      expect(points.percentBasis.value).toBe("purchasePrice");
      expect(getDirtyInput(store)).toBe(undefined);
    });
  });
});

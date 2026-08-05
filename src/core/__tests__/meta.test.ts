import { describe, expect, test } from "vitest";

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

import {
  evaluateFormula,
  extractDependencies,
  extractPathRefs,
  parseFormula,
} from "@rwa/formulas";
import { describe, expect, test } from "vitest";

import { setInput } from "../../methods/set-input";
import { setOffFormValues } from "../../methods/set-off-form-values";
import { createFormStore } from "../form/create-form-store";
import { getValueStore, objectSchema } from "../vitest/utils";
import type { CalcEngine, JsonSchema } from "../types";

/**
 * The whole point of `CalcEngine`'s shape: the real `@rwa/formulas` exports
 * pass through without an adapter layer. If this object stops compiling,
 * the interface drifted from the engine — fix the interface.
 */
const engine: CalcEngine = {
  parse: parseFormula,
  evaluate: evaluateFormula,
  extractDependencies,
  extractPathRefs,
};

function formulaField(formula: string): JsonSchema {
  return { type: "number", "x-field-type": "calculated", "x-formula": formula };
}

describe("derivation with the real @rwa/formulas engine", () => {
  test("should compute and chain plain arithmetic formulas", () => {
    const store = createFormStore({
      schema: objectSchema({
        hardBudget: { type: "number" },
        softBudget: { type: "number" },
        totalBudget: formulaField("hardBudget + softBudget"),
        contingency: formulaField("totalBudget * 0.1"),
      }),
      initialInput: { hardBudget: 100_000, softBudget: 50_000 },
      calcEngine: engine,
    });
    expect(getValueStore(store, ["totalBudget"]).derived!.value.value).toBe(150_000);
    expect(getValueStore(store, ["contingency"]).derived!.value.value).toBe(15_000);

    setInput(store, ["hardBudget"], 200_000);
    expect(getValueStore(store, ["contingency"]).derived!.value.value).toBe(25_000);
  });

  test("should materialize a SUM rollup over canonical collection rows and flag it", () => {
    const store = createFormStore({
      schema: objectSchema({
        totalAiv: formulaField("SUM(assets[aiv])"),
      }),
      offFormValues: {
        assets: [
          { id: "a1", aiv: 600_000 },
          { id: "a2", aiv: 400_000 },
        ],
      },
      calcEngine: engine,
    });
    const totalAiv = getValueStore(store, ["totalAiv"]);
    expect(totalAiv.derived!.value.value).toBe(1_000_000);
    expect(totalAiv.isRollup).toBe(true);

    // PR #459's LOS-514 behavior: fresher canonical rows re-resolve the rollup
    setOffFormValues(store, { assets: [{ id: "a1", aiv: 750_000 }] });
    expect(totalAiv.derived!.value.value).toBe(750_000);
  });

  test("should resolve a scalar record handle (loan[…]) from offFormValues", () => {
    // PR #459's LOS-463 shape: an asset-side formula reading the parent loan
    // through the eval-scope-only `loan` bag
    const store = createFormStore({
      schema: objectSchema({
        total_loan_amount: { type: "number" },
        allocatedPercent: formulaField(
          "total_loan_amount / loan[total_commitment]",
        ),
      }),
      initialInput: { total_loan_amount: 500_000 },
      offFormValues: { loan: { total_commitment: 600_000 } },
      calcEngine: engine,
    });
    const allocated = getValueStore(store, ["allocatedPercent"]);
    expect(allocated.derived!.value.value).toBeCloseTo(0.8333, 4);
  });

  test("should contain a real evaluation error to the field and recover", () => {
    // A collection path-ref in scalar position is the engine's classic
    // throwing authoring error (the LOS-464 crash) — it must land in the
    // field's errors, not take down the form
    const store = createFormStore({
      schema: objectSchema({
        base: { type: "number" },
        bad: formulaField("ROUND(assets[aiv], 0)"),
        good: formulaField("base * 2"),
      }),
      initialInput: { base: 10 },
      offFormValues: { assets: [{ id: "a1", aiv: 100 }] },
      calcEngine: engine,
    });
    const bad = getValueStore(store, ["bad"]);
    expect(bad.derived!.value.value).toBe(undefined);
    expect(bad.errors.value?.length).toBe(1);
    expect(getValueStore(store, ["good"]).derived!.value.value).toBe(20);
  });

  test("should derive a per-row formula against its row + the loan handle", () => {
    // The shape a relation/asset tray renders (LOS-596): the row formula is
    // the SAME machinery as a root one, only its scope differs
    const store = createFormStore({
      schema: objectSchema({
        assets: {
          type: "array",
          items: objectSchema({
            id: { type: "string" },
            estimatedAiv: { type: "number" },
            allocatedPercent: formulaField("estimatedAiv / loan[commitment]"),
            netValue: formulaField("estimatedAiv - liens"),
          }),
        },
      }),
      initialInput: { assets: [{ id: "a1", estimatedAiv: 300_000 }] },
      offFormValues: {
        loan: { commitment: 1_200_000 },
        // `liens` is a core column the write model never carries — it
        // resolves from the canonical row
        assets: [{ id: "a1", estimatedAiv: 1, liens: 50_000 }],
      },
      calcEngine: engine,
    });
    expect(
      getValueStore(store, ["assets", 0, "allocatedPercent"]).derived!.value
        .value,
    ).toBeCloseTo(0.25, 4);
    expect(
      getValueStore(store, ["assets", 0, "netValue"]).derived!.value.value,
    ).toBe(250_000);

    // A live edit in the row wins over the canonical value
    setInput(store, ["assets", 0, "estimatedAiv"], 600_000);
    expect(
      getValueStore(store, ["assets", 0, "allocatedPercent"]).derived!.value
        .value,
    ).toBeCloseTo(0.5, 4);
    expect(
      getValueStore(store, ["assets", 0, "netValue"]).derived!.value.value,
    ).toBe(550_000);
  });

  test("should flag an unparseable formula", () => {
    const store = createFormStore({
      schema: objectSchema({
        bad: formulaField("1 +"),
      }),
      calcEngine: engine,
    });
    const bad = getValueStore(store, ["bad"]);
    expect(bad.derived!.value.value).toBe(undefined);
    expect(bad.errors.value?.length).toBe(1);
  });
});
